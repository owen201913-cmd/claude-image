"""Collect exact upstream native-license/source evidence; never build or publish.

Network mode downloads fixed repositories and checksum-pinned component archives.
Source archives stay under third_party/native-source and must accompany a future
distribution separately when required; their availability is not legal approval.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import io
import json
import pathlib
import re
import tarfile
import urllib.request
import zipfile
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "third_party" / "native"
CACHE = ROOT / "third_party" / "native-source"
BUILD_SHA = "ef19ca09af2453d127453d677c849ccb37cf5694"
MXE_SHA = "c36160b231e66e1cbe032ed54aef7617e8b259da"
MXE_REF = "llvm-mingw-20260924"
VIPS_ZIP_NAME = "vips-dev-x64-web-8.18.7-static.zip"
VIPS_ZIP_URL = "https://github.com/libvips/build-win64-mxe/releases/download/v8.18.7/" + VIPS_ZIP_NAME
VIPS_ZIP_SHA256 = "a736af61d3b46499760efa606e469cb14e060445b1f6fd36a1fa2e75009e1197"
SHARP = ROOT / "node_modules/.pnpm/@img+sharp-win32-x64@0.35.5/node_modules/@img/sharp-win32-x64"
ALIASES = dict(archive="libarchive", exif="libexif", ffi="libffi", heif="libheif",
               imagequant="libimagequant", png="libpng", rsvg="librsvg", uhdr="uhdr",
               vips="vips", webp="libwebp", xml2="libxml2")
MAX_DOWNLOAD = 128 * 1024 * 1024


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download(url: str, target: pathlib.Path, expected: str | None = None) -> bytes:
    if target.exists():
        data = target.read_bytes()
        if expected and digest(data) != expected:
            raise ValueError(f"Cached checksum mismatch: {target.name}")
        return data
    request = urllib.request.Request(url, headers={"User-Agent": "Ngini-Image-Bridge-native-review"})
    parts, size = [], 0
    with urllib.request.urlopen(request, timeout=35) as response:
        while part := response.read(256 * 1024):
            size += len(part)
            if size > MAX_DOWNLOAD:
                raise ValueError("Upstream download exceeds review bound")
            parts.append(part)
    data = b"".join(parts)
    if expected and digest(data) != expected:
        raise ValueError(f"Source checksum mismatch: {target.name}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return data


def official_vips_zip(cache: pathlib.Path = CACHE) -> bytes:
    """Cold source checkouts fetch their own pinned ZIP; no .runtime prerequisite."""
    return download(VIPS_ZIP_URL, cache / VIPS_ZIP_NAME, VIPS_ZIP_SHA256)


def archive_files(data: bytes) -> dict[str, bytes]:
    files = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as archive:
        for member in archive:
            if not member.isfile() or member.size > 8 * 1024 * 1024:
                continue
            relative = pathlib.PurePosixPath(member.name)
            if relative.is_absolute() or ".." in relative.parts or len(relative.parts) < 2:
                continue
            file = archive.extractfile(member)
            if file:
                files[str(pathlib.PurePosixPath(*relative.parts[1:]))] = file.read()
    return files


def write(relative: str, data: bytes) -> dict:
    target = OUT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {"file": str(target.relative_to(ROOT)).replace("\\", "/"), "bytes": len(data), "sha256": digest(data)}


def source_cache_allowlist(report: dict) -> dict:
    """Select only checksum-reviewed public source/build/provenance cache files."""
    approved = {}
    def add(relative: str, expected: str, url: str, kind: str):
        target = (ROOT / relative).resolve()
        if not target.is_relative_to(CACHE.resolve()):
            raise ValueError("Source bundle path escaped dedicated cache")
        data = target.read_bytes()
        if digest(data) != expected:
            raise ValueError("Source bundle input hash mismatch: " + relative)
        approved[relative] = {"file": relative, "bytes": len(data), "sha256": expected, "url": url, "kind": kind}
    add("third_party/native-source/" + VIPS_ZIP_NAME, VIPS_ZIP_SHA256, VIPS_ZIP_URL, "official_binary_release_for_verification")
    for record in report["repositories"]:
        label = "build-win64-mxe" if record["repository"] == "libvips/build-win64-mxe" else "mxe"
        add(f"third_party/native-source/{label}-{record['commit']}.tar.gz", record["archive_sha256"], record["url"], "fixed_build_recipe_repository")
    for item in report["components"]:
        if item["status"] == "SOURCE_ARCHIVE_SHA256_MATCH":
            add(f"third_party/native-source/components/{item['component']}-{item['filename']}", item["sha256"], item["fetched_from"], "component_source_archive")
    sharp_path = OUT / "provenance/sharp-provenance.json"
    if sharp_path.exists():
        sharp = json.loads(sharp_path.read_text(encoding="utf-8"))
        for item in sharp.get("cache_inputs", []):
            add(item["file"], item["sha256"], item["url"], "sharp_source_build_or_registry_provenance")
    rust_path = OUT / "provenance/librsvg-crates.json"
    if rust_path.exists():
        rust = json.loads(rust_path.read_text(encoding="utf-8"))
        for item in rust["crates"]:
            if item["status"] == "SOURCE_ARCHIVE_SHA256_MATCH":
                add(item["cache_file"], item["checksum"], item["download_url"], "cargo_lock_registry_source_archive")
    result = {"checked_at": datetime.now(timezone.utc).isoformat(), "status": "ALL_ALLOWLISTED_FILES_SHA256_MATCH",
              "scope": "Explicit public-source/build/provenance inputs for a separate source archive; not a public release or complete source-obligation certification",
              "allowed_root": "third_party/native-source/", "files": sorted(approved.values(), key=lambda item: item["file"]),
              "file_count": len(approved), "total_bytes": sum(item["bytes"] for item in approved.values()),
              "excluded": [".runtime/", "browser profiles", "generated/downloaded images", "request records", "logs", "other unlisted cache files"],
              "note": "Include third_party/native/ materials/notices and the three Python collector scripts plus verify-native-registry.mjs alongside these cache files for provenance/reproduction. Official binary archives retained here are verification/build inputs, not substitutes for sources."}
    write("source-cache-allowlist.json", (json.dumps(result, indent=2) + "\n").encode("utf-8"))
    return result


def assignments(text: str, package: str) -> dict[str, str]:
    values = {}
    for line in text.splitlines():
        match = re.match(r"^(?:\$\(PKG\)|" + re.escape(package) + r")_([A-Z0-9_]+)\s*:?=\s*(.*)$", line)
        if match:
            values[match[1]] = match[2].split(" #", 1)[0].strip()
    return values


def expand(value: str, package: str, version: str, filename: str = "") -> str:
    substitutions = {
        "$(PKG)": package, "$($(PKG)_VERSION)": version, f"$({package}_VERSION)": version,
        "$($(PKG)_FILE)": filename, f"$({package}_FILE)": filename,
        "$(call SHORT_PKG_VERSION,$(PKG))": ".".join(version.split(".")[:2]),
        f"$(call SHORT_PKG_VERSION,{package})": ".".join(version.split(".")[:2]),
        "$(SOURCEFORGE_MIRROR)": "downloads.sourceforge.net",
        "$(word 1,$(subst ., ,$($(PKG)_VERSION)))": version.split(".")[0],
        "$(subst a,,$($(PKG)_VERSION))": version.replace("a", ""),
        "$(shell echo '$($(PKG)_VERSION)' | cut -d . -f 1,2,3)": version,
    }
    for key in sorted(substitutions, key=len, reverse=True):
        value = value.replace(key, substitutions[key])
    return value


def source_spec(component: str, version: str, build: dict, mxe: dict) -> dict:
    package = ALIASES.get(component, component)
    base = "src/" + package + ".mk"
    paths = [("mxe", base)] if base in mxe else []
    custom = "build/" + package + ".mk"
    if custom in build:
        paths.append(("build-win64-mxe", custom))
    # The build script selects these plugin layers for the distributed web/static variant.
    if component in ("mozjpeg", "zlib-ng", "proxy-libintl"):
        custom = "build/plugins/" + component + "/" + component + ".mk"
        paths.append(("build-win64-mxe", custom))
    values = {}
    for repo, p in paths:
        values.update(assignments((mxe if repo == "mxe" else build)[p].decode(), package))
    for p in ["build/overrides.mk", "build/plugins/web-deps/overrides.mk",
              "build/plugins/mozjpeg/overrides.mk", "build/plugins/zlib-ng/overrides.mk",
              "build/plugins/proxy-libintl/overrides.mk"]:
        if p in build:
            specific = assignments(build[p].decode(), package)
            if specific:
                values.update(specific)
                paths.append(("build-win64-mxe", p))
    actual_version = values.get("VERSION")
    if actual_version != version:
        raise ValueError(f"Recipe version {actual_version} does not match binary {version}")
    filename = expand(values.get("FILE", ""), package, version)
    urls = []
    if "GH_CONF" in values:
        conf = values["GH_CONF"].split(",")
        repo, mode = conf[0].rsplit("/", 1)
        prefix = conf[1] if len(conf) > 1 else ""
        suffix = conf[2] if len(conf) > 2 else ""
        extension = conf[5] if len(conf) > 5 and conf[5] else ".tar.gz"
        filename = filename or f"{package}-{version}{extension}"
        ref = prefix + version + suffix
        if mode == "tags":
            urls.append(f"https://github.com/{repo}/archive/{ref}.tar.gz")
        elif mode == "releases":
            urls.append(f"https://github.com/{repo}/releases/download/{ref}/{filename}")
    for key in ["URL", "URL_2"]:
        if key in values:
            url = expand(values[key], package, version, filename)
            if "$" not in url:
                urls.insert(0, url)
    source_commit = None
    if component == "mozjpeg":
        # This branch-based MXE helper pins a short commit VERSION and retains
        # the full upstream tarball URL as a recipe comment. Never fetch master.
        recipe = build["build/plugins/mozjpeg/mozjpeg.mk"].decode()
        match = re.search(r"https://github.com/mozilla/mozjpeg/tarball/([a-f0-9]{40})", recipe)
        if match:
            source_commit = match.group(1)
            urls = ["https://github.com/mozilla/mozjpeg/tarball/" + source_commit]
    return {"component": component, "upstream_name": package, "version": version,
            "recipe_sources": [{"repository": repo, "path": p} for repo, p in paths],
            "filename": filename, "source_urls": list(dict.fromkeys(urls)), "expected_sha256": values.get("CHECKSUM"),
            **({"source_commit": source_commit} if source_commit else {})}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch-sources", action="store_true", help="Cache checksum-pinned component archives privately")
    parser.add_argument("--fetch-sharp-provenance", action="store_true", help="Verify npm SRI/registry ECDSA and retain fixed Sharp C++ build inputs (requires Node.js)")
    parser.add_argument("--fetch-rust-sources", action="store_true", help="Fetch librsvg Cargo.lock archives with an aggregate 100 MiB maximum")
    parser.add_argument("--rust-max-bytes", type=int, default=100 * 1024 * 1024, help="Lower the crate network budget; never above 100 MiB")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    records = []
    archives = {}
    repos = [ ("build-win64-mxe", "libvips/build-win64-mxe", BUILD_SHA), ("mxe", "kleisauke/mxe", MXE_SHA) ]
    for label, repo, commit in repos:
        url = f"https://codeload.github.com/{repo}/tar.gz/{commit}"
        data = download(url, CACHE / f"{label}-{commit}.tar.gz")
        archives[label] = archive_files(data)
        records.append({"repository": repo, "commit": commit, "url": url, "archive_sha256": digest(data), "archive_bytes": len(data)})
    build, mxe = archives["build-win64-mxe"], archives["mxe"]
    versions = json.loads((SHARP / "versions.json").read_text())
    retained = [write("upstream/sharp-win32-x64-README.md", (SHARP / "README.md").read_bytes()),
                write("upstream/sharp-win32-x64-LICENSE.txt", (SHARP / "LICENSE").read_bytes()),
                write("upstream/sharp-win32-x64-versions.json", (SHARP / "versions.json").read_bytes())]
    with zipfile.ZipFile(io.BytesIO(official_vips_zip())) as archive:
        dll = archive.read("vips-dev-8.18/bin/libvips-42.dll")
        installed_dll = (SHARP / "lib/libvips-42.dll").read_bytes()
        if dll != installed_dll:
            raise ValueError("Official libvips release DLL does not match the packaged native dependency")
        official_cpp = archive.read("vips-dev-8.18/bin/libvips-cpp-42.dll")
        packaged_cpp = (SHARP / "lib/libvips-cpp-8.18.7.dll").read_bytes()
        retained += [write("licenses/LGPL-2.1-libvips.txt", archive.read("vips-dev-8.18/LICENSE")),
                     write("upstream/libvips-README.md", archive.read("vips-dev-8.18/README.md"))]
    for label, files in archives.items():
        for p, content in files.items():
            if label == "build-win64-mxe" and (p.startswith(("build/", "container/", "packaging/")) or p in ("README.md", "build.sh")):
                retained.append(write("recipes/build-win64-mxe/" + p, content))
        if label == "mxe":
            retained.append(write("recipes/mxe/LICENSE.md", files["LICENSE.md"]))
            retained.append(write("recipes/mxe/Makefile", files["Makefile"]))
    for label, url in [
        ("GPL-3.0.txt", "https://www.gnu.org/licenses/gpl-3.0.txt"),
        ("LGPL-3.0.txt", "https://www.gnu.org/licenses/lgpl-3.0.txt"),
    ]:
        data = download(url, OUT / "licenses" / label)
        retained.append({"file": "third_party/native/licenses/" + label, "url": url, "bytes": len(data), "sha256": digest(data)})
    specs = []
    for component, version in versions.items():
        try:
            spec = source_spec(component, version, build, mxe)
            spec["status"] = "RECIPE_IDENTIFIED_SOURCE_NOT_FETCHED"
            for entry in spec["recipe_sources"]:
                if entry["repository"] == "mxe":
                    p = entry["path"]
                    retained.append(write("recipes/mxe/" + p, mxe[p]))
                    for patch, content in mxe.items():
                        if patch.startswith("src/" + spec["upstream_name"] + "-") and patch.endswith(".patch"):
                            retained.append(write("recipes/mxe/" + patch, content))
        except Exception as error:
            spec = {"component": component, "version": version, "status": "RECIPE_REVIEW_REQUIRED", "reason": str(error)}
        specs.append(spec)
    def fetch(spec: dict) -> dict:
        if "source_urls" not in spec:
            return spec
        errors = []
        for url in spec["source_urls"]:
            try:
                data = download(url, CACHE / "components" / f"{spec['component']}-{spec['filename']}", spec["expected_sha256"])
                spec.update(status="SOURCE_ARCHIVE_SHA256_MATCH", fetched_from=url, bytes=len(data), sha256=digest(data))
                license_files = []
                for p, content in archive_files(data).items():
                    name = pathlib.PurePosixPath(p).name
                    if re.match(r"^(?:COPYING|COPYRIGHT|LICEN[CS]E|NOTICE|PATENTS)(?:[._-].*)?$", name, re.I) or name in ["FTL.TXT", "GPLv2.TXT", "README.ijg"]:
                        license_files.append(write("component-notices/" + spec["component"] + "/" + p, content))
                spec["retained_license_notice_files"] = license_files
                return spec
            except Exception as error:
                errors.append({"url": url, "error": type(error).__name__ + ": " + str(error)[:180]})
        spec.update(status="SOURCE_FETCH_BLOCKED", errors=errors)
        return spec
    if args.fetch_sources:
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            specs = list(pool.map(fetch, specs))
    sharp_report_path = OUT / "provenance/sharp-provenance.json"
    rust_report_path = OUT / "provenance/librsvg-crates.json"
    if args.fetch_sharp_provenance:
        from native_sharp_materials import collect as collect_sharp
        collect_sharp(download, archive_files, write, ROOT, CACHE, SHARP)
    if args.fetch_rust_sources:
        from native_rust_materials import collect as collect_rust
        collect_rust(args.rust_max_bytes)
    sharp_provenance = json.loads(sharp_report_path.read_text(encoding="utf-8")) if sharp_report_path.exists() else None
    rust_sources = json.loads(rust_report_path.read_text(encoding="utf-8")) if rust_report_path.exists() else None
    glib = {"status": "SOURCE_NOT_CHECKED"}
    glib_source = CACHE / "components/glib-glib-2.90.0.tar.xz"
    if glib_source.exists():
        glib_bytes = glib_source.read_bytes()
        if digest(glib_bytes) != "17d15cac2af80a33271127408e0abc2748eb297c595c2a26409e81e14e7d1b8f":
            raise ValueError("GLib source archive SHA-256 mismatch")
        glib_files = archive_files(glib_bytes)
        gvdb = [write("provenance/glib/" + p, data) for p, data in glib_files.items() if p.startswith("subprojects/gvdb/")]
        wraps = [write("provenance/glib/" + p, data) for p, data in glib_files.items() if p.startswith("subprojects/") and p.endswith(".wrap")]
        retained += gvdb + wraps
        glib = {"status": "GVDB_SOURCE_ALREADY_INCLUDED_IN_HASH_MATCHED_GLIB_ARCHIVE", "source_sha256": digest(glib_bytes),
                "gvdb_retained_source_and_license_count": len(gvdb), "retained_wraps": len(wraps),
                "gvdb_wrap_revision": "2b42fc75f09dbe1cd1057580b5782b08f2dcb400",
                "pcre2_required_by_reviewed_windows_recipe": False,
                "evidence": ["recipes/build-win64-mxe/build/overrides.mk:151,201,709-723", "recipes/build-win64-mxe/build/patches/glib-2-without-gregex.patch"],
                "scope": "GLib release archive includes GVDB; the reviewed Windows patch removes PCRE2/GRegex. Wrap presence alone is not evidence of missing/required source."}
    for p, data in mxe.items():
        if p.startswith("plugins/llvm-mingw/") and pathlib.PurePosixPath(p).name in ("rust.mk", "cargo-c.mk", "llvm-mingw.mk", "settings.mk"):
            retained.append(write("recipes/mxe/" + p, data))
    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(), "status": "MATERIALS_COLLECTED_REVIEW_INCOMPLETE",
        "scope": "Fixed upstream snapshots and binary/source/license evidence; no native rebuild, legal certification, publication or generation",
        "native_package": "@img/sharp-win32-x64@0.35.5", "project_license": "MIT (third-party licenses remain separate)",
        "libvips_binary_sha256": digest(dll), "official_release_dll_matches_packaged_dependency": True,
        "cpp_bridge": {"official_release_sha256": digest(official_cpp), "packaged_sha256": digest(packaged_cpp),
                       "byte_identical": official_cpp == packaged_cpp,
                       "scope": sharp_provenance["cpp_bridge_explanation"] if sharp_provenance else "The matching libvips-42.dll alone does not establish the separate C++ bridge's source/build provenance.",
                       "npm_source_build_provenance_status": sharp_provenance["status"] if sharp_provenance else "NOT_COLLECTED",
                       "provenance_file": "third_party/native/provenance/sharp-provenance.json" if sharp_provenance else None,
                       "native_rebuild_or_relink": "NOT_RUN"},
        "repositories": records, "mxe_branch_observation": {"branch": MXE_REF, "observed_commit": MXE_SHA,
        "original_release_container_digest_verified": False, "warning": "Upstream build references a branch and latest container; observed current commit is pinned for review, not proven original CI container provenance."},
        "retained_materials": retained, "components": specs,
        "source_archives_checksum_matched": sum(s["status"] == "SOURCE_ARCHIVE_SHA256_MATCH" for s in specs),
        "glib_transitive_inputs": glib,
        "librsvg_locked_registry_sources": {"report": "third_party/native/provenance/librsvg-crates.json",
             "status": rust_sources["status"], "locked_external_count": rust_sources["locked_external_count"],
             "source_archives_checksum_matched": rust_sources["source_archives_checksum_matched"],
             "source_archive_total_bytes": rust_sources["source_archive_total_bytes"],
             "scope": rust_sources["scope"]} if rust_sources else {"status": "NOT_COLLECTED"},
        "sharp_sigstore_certificate_and_transparency_log_verification": "NOT_RUN",
        "native_source_archives_excluded_from_mcpb": True,
        "remaining_review": ["The original target feature/dependency selection, complete toolchain sources, exact release-container/runner image and MSVC version are not proven by collecting release sources and all Cargo.lock entries. See supplementary reports for precisely verified source counts.",
            "Sharp npm archive SRI/registry ECDSA and the five C++ source inputs are separately verified when its provenance report is present; full Sigstore certificate/transparency verification remains NOT_RUN.",
            "No Windows native rebuild or replacement/relink test was performed.",
            "Before binary public distribution, provide the required corresponding-source materials through an actual maintained release/download route; cached private files and upstream links alone are not asserted sufficient.",
            "Reconcile component notices and license choices, and verify the final candidate includes the native notices. Build-recipe redistribution licensing needs review where an upstream file lacks explicit terms."]}
    (OUT / "materials.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    source_cache_allowlist(report)
    print(json.dumps({"status": report["status"], "components": len(specs), "sources_matching": report["source_archives_checksum_matched"],
                      "remaining": [{"component": s["component"], "status": s["status"], "reason": s.get("reason"), "errors": s.get("errors")} for s in specs if s["status"] != "SOURCE_ARCHIVE_SHA256_MATCH"]}, indent=2))


if __name__ == "__main__":
    main()
