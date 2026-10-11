"""Collect Cargo.lock-pinned librsvg sources/notices; never compile or install.

Only fixed public crates.io sources are accepted. The aggregate network response
body budget is 100 MiB by default, including unsuccessful archive downloads.
The source archives remain in the excluded third_party/native-source cache.
"""
from __future__ import annotations

import argparse
import concurrent.futures
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import tarfile
import threading
import tomllib
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "third_party/native"
CACHE = ROOT / "third_party/native-source"
RSVG = CACHE / "components/rsvg-librsvg-2.63.2.tar.xz"
RSVG_SHA = "852b18e1a00b8605528825a27dc7748bff2a5dd254028f59dc22a34ea57e81b6"
LOCK_SHA = "e79e2a2735a0b5b151bb4133becd3008223fabedd34a8b787a872edab9854941"
REGISTRY = "registry+https://github.com/rust-lang/crates.io-index"
MAX_NETWORK = 100 * 1024 * 1024
MAX_ARCHIVE = 25 * 1024 * 1024
MAX_NOTICE = 512 * 1024
MAX_NOTICES = 8 * 1024 * 1024


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_relative(name: str) -> PurePosixPath:
    relative = PurePosixPath(name)
    if relative.is_absolute() or ".." in relative.parts or "\\" in name or ":" in name:
        raise ValueError("Unsafe source archive path")
    return relative


def write(relative: str, data: bytes) -> dict:
    safe_relative(relative)
    target = OUT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {"file": target.relative_to(ROOT).as_posix(), "bytes": len(data), "sha256": sha(data)}


class Budget:
    """Reservations count simultaneous reads before any bytes are consumed."""
    def __init__(self, limit: int):
        if not 0 < limit <= MAX_NETWORK:
            raise ValueError("Network budget must be positive and at most 100 MiB")
        self.limit = limit
        self.used = 0
        self.notices = 0
        self.lock = threading.Lock()

    def reserve(self, desired: int) -> int:
        with self.lock:
            amount = min(desired, self.limit - self.used)
            if amount <= 0:
                raise ValueError("Aggregate 100 MiB-or-lower network budget exhausted")
            self.used += amount
            return amount

    def refund(self, amount: int) -> None:
        with self.lock:
            self.used -= amount

    def retain_notice(self, size: int) -> bool:
        with self.lock:
            if size > MAX_NOTICE or self.notices + size > MAX_NOTICES:
                return False
            self.notices += size
            return True


class CratesOnly(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        target = urllib.parse.urlsplit(newurl)
        if target.scheme != "https" or target.netloc != "static.crates.io":
            raise ValueError("Unreviewed crate redirect rejected")
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def fetch_archive(item: dict, budget: Budget, offline: bool) -> tuple[bytes, bool]:
    cache = CACHE / "librsvg-crates" / f"{item['name']}-{item['version']}.crate"
    if cache.exists():
        data = cache.read_bytes()
        if sha(data) != item["checksum"]:
            raise ValueError("Existing crate cache checksum mismatch; not overwritten")
        return data, True
    if offline:
        raise ValueError("Crate not cached (offline mode)")
    with budget.lock:
        if budget.used >= budget.limit:
            raise ValueError("Aggregate network budget exhausted before request")
    request = urllib.request.Request(item["download_url"], headers={"User-Agent": "Ngini-native-source-review"})
    opener = urllib.request.build_opener(CratesOnly())
    parts, size = [], 0
    with opener.open(request, timeout=35) as response:
        if response.status != 200:
            raise ValueError("Unexpected crate HTTP status")
        content_length = response.headers.get("Content-Length")
        expected_size = int(content_length) if content_length is not None else None
        if expected_size is not None and expected_size > MAX_ARCHIVE:
            raise ValueError("Single crate archive exceeds 25 MiB")
        while expected_size is None or size < expected_size:
            desired = min(64 * 1024, MAX_ARCHIVE - size)
            if expected_size is not None:
                desired = min(desired, expected_size - size)
            if desired <= 0:
                raise ValueError("Single crate archive exceeded bounded size")
            amount = budget.reserve(desired)
            try:
                part = response.read(amount)
            except Exception:
                # Conservatively keep the reservation charged on failed reads.
                raise
            budget.refund(amount - len(part))
            if not part:
                break
            size += len(part)
            parts.append(part)
        if expected_size is not None and size != expected_size:
            raise ValueError("Incomplete crate response")
    data = b"".join(parts)
    if sha(data) != item["checksum"]:
        raise ValueError("Downloaded crate SHA-256 differs from Cargo.lock")
    cache.parent.mkdir(parents=True, exist_ok=True)
    temporary = cache.with_suffix(".crate.part")
    with temporary.open("xb") as stream:
        stream.write(data)
    temporary.replace(cache)
    return data, False


def notices(item: dict, data: bytes, budget: Budget) -> dict:
    prefix = f"{item['name']}-{item['version']}"
    files: dict[str, bytes] = {}
    skipped = []
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as archive:
        for member in archive:
            if not member.isfile():
                continue
            path = safe_relative(member.name)
            if len(path.parts) < 2 or path.parts[0] != prefix:
                raise ValueError("Crate archive has an unexpected root")
            relative = PurePosixPath(*path.parts[1:]).as_posix()
            name = path.name
            relevant = (relative == "Cargo.toml" or re.match(r"^(?:COPYING|COPYRIGHT|LICEN[CS]E|NOTICE|PATENTS)(?:[._-].*)?$", name, re.I))
            if relevant:
                if member.size > MAX_NOTICE:
                    skipped.append({"entry": relative, "reason": "notice_size_bound"})
                else:
                    stream = archive.extractfile(member)
                    if stream is not None:
                        files[relative] = stream.read(MAX_NOTICE + 1)
    manifest = tomllib.loads(files.pop("Cargo.toml").decode("utf-8"))
    package = manifest["package"]
    license_file = package.get("license-file")
    if license_file:
        requested = safe_relative(license_file).as_posix()
        if requested not in files:
            with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as archive:
                try:
                    member = archive.getmember(prefix + "/" + requested)
                    if member.isfile() and member.size <= MAX_NOTICE:
                        files[requested] = archive.extractfile(member).read(MAX_NOTICE + 1)
                    else:
                        skipped.append({"entry": requested, "reason": "license_file_size_or_type"})
                except KeyError:
                    skipped.append({"entry": requested, "reason": "declared_license_file_absent"})
    retained = []
    for relative, content in sorted(files.items()):
        if budget.retain_notice(len(content)):
            retained.append(write(f"component-notices/librsvg-crates/{prefix}/{relative}", content))
        else:
            skipped.append({"entry": relative, "reason": "aggregate_8_MiB_notice_bound"})
    return {"package_license_expression": package.get("license"), "package_license_file": license_file,
            "package_authors": package.get("authors", []), "package_repository": package.get("repository"),
            "retained_license_notice_files": retained, "notice_files_not_retained": skipped,
            "license_review": "MANIFEST_DECLARATION_AND_ORIGINAL_NOTICES_RETAINED_NOT_LEGAL_CERTIFICATION"}


def collect(max_bytes: int = MAX_NETWORK, offline: bool = False) -> dict:
    started = datetime.now(timezone.utc).isoformat()
    data = RSVG.read_bytes()
    if sha(data) != RSVG_SHA:
        raise ValueError("Librsvg release source SHA-256 mismatch")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as archive:
        lock = archive.extractfile("librsvg-2.63.2/Cargo.lock").read()
        cargo = archive.extractfile("librsvg-2.63.2/Cargo.toml").read()
    if sha(lock) != LOCK_SHA:
        raise ValueError("Librsvg Cargo.lock changed")
    records = [write("provenance/librsvg/Cargo.lock", lock), write("provenance/librsvg/Cargo.toml", cargo)]
    items = []
    for package in tomllib.loads(lock.decode("utf-8"))["package"]:
        if not package.get("source"):
            continue
        if (package["source"] != REGISTRY or not re.fullmatch(r"[A-Za-z0-9_-]+", package["name"])
                or not re.fullmatch(r"[A-Za-z0-9_.+-]+", package["version"])
                or not re.fullmatch(r"[0-9a-f]{64}", package.get("checksum", ""))):
            raise ValueError("Unsupported Cargo.lock source/name/checksum; no guessing")
        item = {key: package[key] for key in ("name", "version", "source", "checksum")}
        item["download_url"] = f"https://static.crates.io/crates/{item['name']}/{item['name']}-{item['version']}.crate"
        items.append(item)
    budget = Budget(max_bytes)
    def one(item: dict) -> dict:
        try:
            archive, cached = fetch_archive(item, budget, offline)
            return {**item, "status": "SOURCE_ARCHIVE_SHA256_MATCH", "bytes": len(archive),
                    "sha256": sha(archive), "already_cached": cached,
                    "cache_file": f"third_party/native-source/librsvg-crates/{item['name']}-{item['version']}.crate",
                    **notices(item, archive, budget)}
        except Exception as error:
            return {**item, "status": "SOURCE_FETCH_OR_NOTICE_BLOCKED", "error": type(error).__name__ + ": " + str(error)[:180]}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(one, items))
    matched = [item for item in results if item["status"] == "SOURCE_ARCHIVE_SHA256_MATCH"]
    report = {"started_at": started, "checked_at": datetime.now(timezone.utc).isoformat(),
              "status": "ALL_LOCKED_CRATE_ARCHIVES_MATCH" if len(matched) == len(items) else "INCOMPLETE_NO_BUDGET_INCREASE",
              "scope": "Librsvg 2.63.2 complete Cargo.lock registry sources including dev/other-target entries; not all are proven linked into Windows DLL",
              "librsvg_source_sha256": RSVG_SHA, "cargo_lock_sha256": LOCK_SHA, "locked_external_count": len(items),
              "source_archives_checksum_matched": len(matched), "source_archive_total_bytes": sum(item["bytes"] for item in matched),
              "new_downloaded_bytes": budget.used, "aggregate_network_budget_bytes": max_bytes,
              "offline": offline, "retained_notice_bytes": budget.notices, "retained_materials": records, "crates": results,
              "archive_download_route": "Official crates.io static source archive path; archive SHA-256 must equal Cargo.lock",
              "reproduce": "python scripts/native_rust_materials.py --max-bytes 104857600",
              "source_archives_excluded_from_mcpb": True, "cargo_vendor_or_native_build": "NOT_RUN",
              "remaining": ["Original release target feature/dependency selection and Rust toolchain source completeness are not proven by retaining all lock entries.",
                            "License declarations/notices require distribution review; no full legal or attribution certification is claimed.",
                            "A maintained public corresponding-source delivery route has not been published."]}
    write("provenance/librsvg-crates.json", (json.dumps(report, indent=2) + "\n").encode("utf-8"))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-bytes", type=int, default=MAX_NETWORK)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    report = collect(args.max_bytes, args.offline)
    print(json.dumps({key: report[key] for key in ("status", "locked_external_count", "source_archives_checksum_matched", "source_archive_total_bytes", "new_downloaded_bytes", "aggregate_network_budget_bytes", "retained_notice_bytes")}))
    blocked = [item for item in report["crates"] if item["status"] != "SOURCE_ARCHIVE_SHA256_MATCH"]
    if blocked:
        print(json.dumps(blocked, indent=2))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
