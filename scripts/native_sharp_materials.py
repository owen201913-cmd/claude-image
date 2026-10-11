"""Retain fixed Sharp build/source and npm integrity provenance, without builds."""
from __future__ import annotations

import base64
from datetime import datetime, timezone
import hashlib
import json
import subprocess
import tarfile
import urllib.parse

SHARP_COMMIT = "51a990faa26ade5586a4934ac9673c98d8893326"
LIBVIPS_COMMIT = "ebb95f8add54eee8bed840e3fb587e4cbec857d7"
VIPS_SOURCE_SHA = "5baaead3b0bb20ffdb9e9ff09aa9fda08620923df77b63b436654cb5e0b3bf94"


def collect(download, archive_files, write, root, cache, native) -> dict:
    retained = []
    cache_inputs = []
    def get(url, relative, public_relative=None):
        data = download(url, cache / "sharp-provenance" / relative)
        cache_inputs.append({"file": f"third_party/native-source/sharp-provenance/{relative}", "url": url,
                             "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        if public_relative:
            retained.append(write(public_relative, data))
        return data
    keys_relative = "metadata/npm-registry-keys.json"
    get("https://registry.npmjs.org/-/npm/v1/keys", keys_relative, "provenance/sharp/npm-registry-keys.json")
    packages, files = [], {}
    for name, version, label in [
        ("@img/sharp-win32-x64", "0.35.5", "sharp-win32-x64-0.35.5"),
        ("sharp", "0.35.5", "sharp-source-0.35.5"),
        ("@img/sharp-libvips-dev", "1.3.4", "sharp-libvips-dev-1.3.4"),
        ("@img/sharp-libvips-win32-x64", "1.3.4", "sharp-libvips-win32-x64-1.3.4"),
    ]:
        metadata_relative = f"metadata/{label}.json"
        metadata = json.loads(get(f"https://registry.npmjs.org/{name.replace('/', '%2f')}/{version}", metadata_relative,
                                  f"provenance/sharp/{label}-registry.json"))
        if metadata["name"] != name or metadata["version"] != version:
            raise ValueError("Registry package name/version mismatch")
        url = urllib.parse.urlsplit(metadata["dist"]["tarball"])
        if url.scheme != "https" or url.netloc != "registry.npmjs.org":
            raise ValueError("Unreviewed npm tarball origin")
        archive_relative = f"archives/{label}.tgz"
        data = get(metadata["dist"]["tarball"], archive_relative)
        algorithm, encoded = metadata["dist"]["integrity"].split("-", 1)
        if algorithm != "sha512" or hashlib.sha512(data).digest() != base64.b64decode(encoded, validate=True):
            raise ValueError("npm source/binary archive SRI mismatch")
        files[label] = archive_files(data)
        command = ["node", str(root / "scripts/verify-native-registry.mjs"),
                   str(cache / "sharp-provenance" / metadata_relative),
                   str(cache / "sharp-provenance" / keys_relative), str(cache / "sharp-provenance" / archive_relative)]
        if name == "@img/sharp-win32-x64":
            attest_url = metadata["dist"]["attestations"]["url"]
            if not attest_url.startswith("https://registry.npmjs.org/-/npm/v1/attestations/"):
                raise ValueError("Unreviewed npm attestation origin")
            relative = "metadata/sharp-win32-x64-attestations.json"
            get(attest_url, relative, "provenance/sharp/advertised-attestations.json")
            command.append(str(cache / "sharp-provenance" / relative))
        verification = json.loads(subprocess.run(command, check=True, capture_output=True, text=True, encoding="utf-8").stdout)
        packages.append({"name": name, "version": version, "git_head": metadata.get("gitHead"),
                         "archive_url": metadata["dist"]["tarball"], "archive_integrity": metadata["dist"]["integrity"],
                         "archive_sha256": hashlib.sha256(data).hexdigest(), "archive_bytes": len(data),
                         "archive_cache": f"third_party/native-source/sharp-provenance/{archive_relative}",
                         "sri_verified": True, **verification})
        for path, content in files[label].items():
            if path in ("LICENSE", "COPYING", "NOTICE", "package.json"):
                retained.append(write(f"provenance/sharp/{label}/{path}", content))
    for repository, commit, paths in [
        ("sharp", SHARP_COMMIT, ["package.json", ".github/workflows/ci.yml", "src/binding.gyp", "lib/libvips.mjs", "npm/from-local-build.js", "install/build.js", "LICENSE"]),
        ("sharp-libvips", LIBVIPS_COMMIT, ["build/win.sh", "versions.properties", "npm/dev/package.json"]),
    ]:
        for path in paths:
            get(f"https://raw.githubusercontent.com/lovell/{repository}/{commit}/{path}", f"{repository}/{path}", f"recipes/{repository}/{path}")
    vips_data = (cache / "components/vips-vips-8.18.7.tar.xz").read_bytes()
    if hashlib.sha256(vips_data).hexdigest() != VIPS_SOURCE_SHA:
        raise ValueError("libvips source archive SHA-256 mismatch")
    vips_files = archive_files(vips_data)
    dev = files["sharp-libvips-dev-1.3.4"]
    cpp = []
    for name in ["VConnection.cpp", "VError.cpp", "VImage.cpp", "VInterpolate.cpp", "VRegion.cpp"]:
        path = "cplusplus/" + name
        if dev[path] != vips_files[path]:
            raise ValueError("Sharp development C++ source differs from libvips release")
        item = write("provenance/sharp/" + path, dev[path])
        retained.append(item)
        cpp.append({**item, "matches_libvips_8_18_7_source": True})
    headers = [{"entry": path, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()} for path, data in dev.items() if path.startswith("include/")]
    retained.append(write("provenance/sharp/dev-headers.json", (json.dumps(headers, indent=2) + "\n").encode()))
    win_dev = files["sharp-libvips-win32-x64-1.3.4"]
    imports = [{"entry": path, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()} for path, data in win_dev.items() if path.endswith((".lib", ".h"))]
    retained.append(write("provenance/sharp/windows-build-import-headers.json", (json.dumps(imports, indent=2) + "\n").encode()))
    native_files = []
    with tarfile.open(cache / "sharp-provenance/archives/sharp-win32-x64-0.35.5.tgz", mode="r:*") as archive:
        for name in ["libvips-42.dll", "libvips-cpp-8.18.7.dll", "sharp-win32-x64-0.35.5.node"]:
            member = archive.getmember("package/lib/" + name)
            if not member.isfile() or member.size > 25 * 1024 * 1024:
                raise ValueError("Unexpected native binary archive entry")
            data = archive.extractfile(member).read()
            if data != (native / "lib" / name).read_bytes():
                raise ValueError("Packaged native dependency differs from SRI/signature verified npm archive")
            native_files.append({"filename": name, "sha256": hashlib.sha256(data).hexdigest(), "matches_installed_dependency": True})
    report = {"checked_at": datetime.now(timezone.utc).isoformat(),
              "status": "NPM_SRI_AND_REGISTRY_ECDSA_VERIFIED_CPP_SOURCE_PATH_RECONCILED",
              "scope": "Original npm archive and build-source provenance; no native build, replacement, legal certification or publication",
              "sharp_tag": "v0.35.5", "sharp_commit": SHARP_COMMIT, "sharp_libvips_commit": LIBVIPS_COMMIT,
              "packages": packages, "native_files": native_files, "cplusplus_sources": cpp,
              "development_header_count": len(headers), "windows_development_import_headers": imports,
              "cpp_bridge_explanation": "Sharp binding.gyp deliberately builds a Windows MSVC C++ shared library from five upstream libvips C++ sources for std library ABI compatibility. sharp-libvips build/win.sh removes the ZIP C++ DLL. Different ZIP C++ bytes are expected and do not prove unknown source.",
              "workflow": {"url": f"https://github.com/lovell/sharp/blob/{SHARP_COMMIT}/.github/workflows/ci.yml",
                           "observed_windows_x64_runner": "windows-2022", "observed_node_version_selector": "^22",
                           "exact_original_msvc_toolset_and_runner_image_verified": False},
              "retained_materials": retained, "cache_inputs": cache_inputs, "source_archives_excluded_from_mcpb": True,
              "sigstore_certificate_and_transparency_log_verification": "NOT_RUN",
              "independent_native_rebuild_or_replacement_relink_test": "NOT_RUN",
              "remaining": ["Registry ECDSA verification is separate from full Sigstore certificate/transparency verification; the latter was not performed.",
                            "Original CI toolset/runner image details and a byte-identical rebuild are not established by source identity.",
                            "No maintained public corresponding-source download route or release was created."]}
    write("provenance/sharp-provenance.json", (json.dumps(report, indent=2) + "\n").encode("utf-8"))
    return report
