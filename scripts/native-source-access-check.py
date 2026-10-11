"""Bounded access test of the exact external build source; no source mirroring."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
URL = "https://codeload.github.com/libvips/build-win64-mxe/tar.gz/ef19ca09af2453d127453d677c849ccb37cf5694"
SHA = "f52864572e6df6e549016369fdb2705aa195a837bd7bc8c52e45f42b59ef97a7"

def check():
    request = urllib.request.Request(URL, headers={"User-Agent": "ngini-native-source-access"})
    with urllib.request.urlopen(request, timeout=25) as response:
        if response.url != URL or response.status != 200:
            raise ValueError("Unexpected external build-source response")
        data = response.read(128 * 1024 + 1)
    if len(data) > 128 * 1024 or hashlib.sha256(data).hexdigest() != SHA:
        raise ValueError("Fixed build-source checksum mismatch or size exceeded")
    report = {"status": "PASS_FIXED_UPSTREAM_BUILD_SOURCE_ACCESS",
              "checked_at": datetime.now(timezone.utc).isoformat(),
              "method": "HTTPS GET exact fixed archive; SHA-256 compared with reviewed cache",
              "url": URL, "bytes": len(data), "sha256": SHA,
              "network_budget_bytes": 128 * 1024, "redistributed": False,
              "scope": "Access observation only; not an independent recipe license grant, native build, future retention promise or public release"}
    (ROOT / "third_party/native/source-access-verification.json").write_text(json.dumps(report, indent=2) + "\n", "utf-8")
    print(json.dumps(report))

if __name__ == "__main__":
    check()
