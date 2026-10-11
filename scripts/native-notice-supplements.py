"""Retain original notice inputs omitted by the filename-only Rust collector.

Fixed official HTTPS sources only, <=2 MiB aggregate. Never compile/install.
Four old MIT crates contain a declaration and authors but no standalone notice:
keep that fact visible; a standard MIT text is not an invented copyright notice.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tarfile
import tomllib
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "third_party/native"
LIMIT = 2 * 1024 * 1024
used = 0

# Commits from crate .cargo_vcs_info.json, except difflib: its root source and
# version manifest are compared byte-for-byte below. winapi uses the upstream
# commit declaring both target crate versions 0.4.0; source headers also match.
REMOTE = {
    "anes-0.1.6": ("zrzka/anes-rs", "378ac7461ecac29fde9e10df7b08359d1315a9ad", "anes/", ["LICENSE-APACHE", "LICENSE-MIT"]),
    "defmt-parser-1.0.0": ("knurling-rs/defmt", "4a8cdb44891ed57b8ff5a023b6bec7137c48708f", "parser/", ["LICENSE-APACHE", "LICENSE-MIT"]),
    "difflib-0.4.0": ("DimaKudosh/difflib", "f035fb8e656f27119e23eca9d5b996df14f3885e", "", ["LICENSE"]),
    "mutants-0.0.4": ("sourcefrog/cargo-mutants", "14011d08c42a7cd368698fe28f77eb4cd0b65bf0", "mutants_attrs/", ["LICENSE"]),
    "winapi-i686-pc-windows-gnu-0.4.0": ("retep998/winapi-rs", "9497609ef44cc9bcd16cd2411c0ee6ccaf5483aa", "i686/", ["LICENSE-APACHE", "LICENSE-MIT"]),
    "winapi-x86_64-pc-windows-gnu-0.4.0": ("retep998/winapi-rs", "9497609ef44cc9bcd16cd2411c0ee6ccaf5483aa", "x86_64/", ["LICENSE-APACHE", "LICENSE-MIT"]),
}
OLD_MIT = {"block-0.1.6", "malloc_buf-0.0.6", "objc-foundation-0.1.1", "objc_id-0.1.1"}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def get(url):
    global used
    if not url.startswith(("https://raw.githubusercontent.com/", "https://codeload.github.com/")):
        raise ValueError("Unreviewed host")
    request = urllib.request.Request(url, headers={"User-Agent": "ngini-native-notices"})
    with urllib.request.urlopen(request, timeout=25) as response:
        if not response.url.startswith(("https://raw.githubusercontent.com/", "https://codeload.github.com/")):
            raise ValueError("Unreviewed redirect")
        data = response.read(min(512 * 1024, LIMIT - used) + 1)
    used += len(data)
    if used > LIMIT or len(data) > 512 * 1024:
        raise ValueError("Small-source network budget exhausted")
    return data

def retain(relative, data, **provenance):
    target = OUT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {"file": target.relative_to(ROOT).as_posix(), "bytes": len(data), "sha256": sha(data), **provenance}

def collect():
    report = json.loads((OUT / "provenance/librsvg-crates.json").read_text("utf-8"))
    missing = [item for item in report["crates"] if not item["retained_license_notice_files"]]
    assert len(missing) == 13
    packages = []
    standard_mit = get("https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/MIT.txt")
    mit = retain("notice-supplements/STANDARD-MIT-TEMPLATE.txt", standard_mit,
                 url="https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/MIT.txt",
                 scope="SPDX standard text/template, not an upstream copyright attribution")
    for item in missing:
        key = item["name"] + "-" + item["version"]
        blob = (ROOT / item["cache_file"]).read_bytes()
        assert sha(blob) == item["checksum"]
        with tarfile.open(ROOT / item["cache_file"]) as archive:
            prefix = key + "/"
            files = {member.name[len(prefix):]: archive.extractfile(member).read()
                     for member in archive.getmembers()
                     if member.isfile() and member.name.startswith(prefix) and member.size <= 512 * 1024}
        retained = []
        for name in ["Cargo.toml", "Cargo.toml.orig", ".cargo_vcs_info.json", "README.md", "AUTHORS"]:
            if name in files:
                retained.append(retain("notice-supplements/" + key + "/" + name, files[name],
                                       archive=item["cache_file"], archive_member=prefix + name))
        source_name = "lib.rs" if item["name"] == "selectors" else "src/lib.rs"
        if source_name in files:
            retained.append(retain("notice-supplements/" + key + "/" + source_name, files[source_name],
                                   archive=item["cache_file"], archive_member=prefix + source_name))
        basis = "Original Cargo license/authors declaration and exact source/README notice inputs"
        if key in REMOTE:
            repo, commit, subdir, notices = REMOTE[key]
            urlbase = "https://raw.githubusercontent.com/" + repo + "/" + commit + "/"
            source = get(urlbase + subdir + "src/lib.rs")
            assert source == files["src/lib.rs"], "Pinned upstream source does not match crate: " + key
            if key == "difflib-0.4.0":
                assert get(urlbase + "Cargo.toml") == files["Cargo.toml.orig"]
            if item["name"].startswith("winapi-"):
                metadata = tomllib.loads(get(urlbase + subdir + "Cargo.toml").decode("utf-8"))
                assert metadata["package"]["version"] == item["version"]
            if ".cargo_vcs_info.json" in files:
                vcs = json.loads(files[".cargo_vcs_info.json"])
                assert vcs["git"]["sha1"] == commit
            for name in notices:
                data = get(urlbase + name)
                retained.append(retain("notice-supplements/" + key + "/" + Path(name).name, data,
                                       url=urlbase + name, pinned_source_match_sha256=sha(source)))
            basis = "Fixed upstream full license text, with crate source byte match and VCS commit when available"
        elif key in OLD_MIT:
            basis = ("Original MIT declaration and Steven Sheldon author metadata retained. No standalone license/copyright "
                     "notice exists in the crate or reviewed exact-version upstream tag; standard MIT template supplied separately, "
                     "without asserting a new upstream copyright year or holder notice.")
        elif item["name"] == "r-efi":
            assert b"Permission is hereby granted" in files["AUTHORS"]
            basis = "Original AUTHORS contains the MIT permission terms and author attribution; MIT option selected"
        elif item["name"] == "selectors":
            assert b"Mozilla Public" in files["lib.rs"]
            basis = "Original MPL-2.0 source header and authors retained; full MPL text already retained with cssparser"
        else:
            raise ValueError("Unreviewed supplemental crate")
        packages.append({"name": item["name"], "version": item["version"],
                         "declared_license": item["package_license_expression"],
                         "authors": item["package_authors"], "basis": basis,
                         "source_archive_sha256": item["checksum"], "retained": retained,
                         "standard_mit_text": mit["file"] if key in OLD_MIT else None})
    result = {"checked_at": datetime.now(timezone.utc).isoformat(),
              "status": "SUPPLEMENTAL_NOTICE_INPUTS_COMPLETE", "packages": packages,
              "standard_mit": mit, "network_bytes": used, "network_budget_bytes": LIMIT,
              "scope": "Closes filename-collector omissions using original declarations/notices; not proof that all 357 crates link into this DLL or legal certification"}
    (OUT / "notice-supplements.json").write_text(json.dumps(result, indent=2) + "\n", "utf-8")
    print(json.dumps({"status": result["status"], "packages": len(packages), "network_bytes": used}))

if __name__ == "__main__":
    collect()
