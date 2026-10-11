"""Archive a verified clean source export; never publish or run the bridge."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import re
import sys
import uuid
import zipfile

root = Path(__file__).resolve().parent.parent
metadata = json.loads((root / "package.json").read_text(encoding="utf-8"))
version = metadata["version"]
if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?", version):
    raise ValueError("Unsafe version")
args = sys.argv[1:]
application_source = bool(args and args[0] == "--application-source")
if application_source:
    args = args[1:]
if len(args) > 1:
    raise ValueError("Usage: python scripts/archive-github.py [--application-source] [clean-export-directory]")
source = root / (args[0] if args else f"release/github-ready-{version}")
relative_source = source.absolute().relative_to(root)
if len(relative_source.parts) < 2 or relative_source.parts[0] not in ("release", ".runtime"):
    raise ValueError("Source export must be inside this project's release or .runtime")
current = root
for part in relative_source.parts:
    if part in (".", ".."):
        raise ValueError("Unsafe source export path")
    current = current / part
    if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
        raise ValueError("Source export path contains a link")
source = source.resolve()
source.relative_to(root)
manifest_name = "PUBLIC_SOURCE_MANIFEST.json"
manifest_data = (source / manifest_name).read_bytes()
manifest = json.loads(manifest_data)
if (manifest.get("schema_version") != 1 or manifest.get("version") != version
        or manifest.get("artifact_kind") != "source-only-development"
        or manifest.get("published") is not False or not manifest.get("files")):
    raise ValueError("Unexpected clean source manifest")
data = {manifest_name: manifest_data}
folded = {manifest_name.lower()}
for entry in manifest["files"]:
    name = entry["name"]
    if (not isinstance(name, str) or not name or "\\" in name or ":" in name or "\0" in name
            or PurePosixPath(name).is_absolute() or any(p in ("", ".", "..") for p in name.split("/"))
            or name.lower() in folded):
        raise ValueError("Unsafe or duplicate manifest path")
    folded.add(name.lower())
    current = source
    for part in name.split("/"):
        current = current / part
        if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
            raise ValueError("Source file path contains a link")
    raw = current.read_bytes()
    if len(raw) != entry["bytes"] or hashlib.sha256(raw).hexdigest() != entry["sha256"]:
        raise ValueError("Source export changed since manifest creation")
    data[name] = raw
actual = set()
for directory, children, files in os.walk(source, followlinks=False):
    base = Path(directory)
    if base == source and ".git" in children:
        children.remove(".git")
    for name in children + files:
        item = base / name
        if item.is_symlink() or (hasattr(item, "is_junction") and item.is_junction()):
            raise ValueError("Unexpected link in export")
    for name in files:
        actual.add((base / name).relative_to(source).as_posix())
if actual != set(data):
    raise ValueError("Unexpected or missing source export files")

suffix = "source" if application_source else "github-source"
output = root / "release" / f"ngini-image-bridge-{version}-{suffix}.zip"
sidecar = Path(str(output) + ".sha256")
if output.exists() or sidecar.exists():
    raise FileExistsError("Refusing to overwrite a sealed GitHub source archive")
output.parent.mkdir(exist_ok=True)
temporary = output.with_name(output.name + f".pending-{uuid.uuid4()}")
prefix = "ngini-image-bridge/"
with zipfile.ZipFile(temporary, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, raw in sorted(data.items()):
        info = zipfile.ZipInfo(prefix + name, date_time=(1980, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, raw, compresslevel=9)
with zipfile.ZipFile(temporary) as archive:
    expected = {prefix + name for name in data}
    if len(archive.namelist()) != len(expected) or set(archive.namelist()) != expected or archive.testzip():
        raise ValueError("Archive inventory or CRC verification failed")
    for name, raw in data.items():
        if archive.read(prefix + name) != raw:
            raise ValueError("Archive readback differs from source export")
archive_bytes = temporary.read_bytes()
digest = hashlib.sha256(archive_bytes).hexdigest()
temporary.rename(output)
with sidecar.open("x", encoding="utf-8", newline="\n") as handle:
    handle.write(f"{digest}  {output.name}\n")
print(json.dumps({"status": "PASS", "artifact": output.name, "version": version,
                  "bytes": len(archive_bytes), "files": len(data), "sha256": digest,
                  "live_submissions": 0, "published": False}))
