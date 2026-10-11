"""Verify a sealed source ZIP against its frozen, manifest-checked export.

Working-tree bytes are deliberately not the comparison source: the export
normalizes first-party text to LF and also contains PUBLIC_SOURCE_MANIFEST.json.
This command never extracts, publishes, downloads, or runs the bridge.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import zipfile


MANIFEST_NAME = 'PUBLIC_SOURCE_MANIFEST.json'
PRIVATE_NAMES = {'.runtime', '.git', '.pnpm', '.env', 'browser-profile',
                 'node_modules', 'dist', 'release', 'native-source', '__pycache__',
                 'outputs', 'logs', 'tmp', 'debug', 'coverage', 'test-results',
                 'playwright-report'}
SECRET_PATTERNS = [re.compile(pattern) for pattern in (
    r'\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b',
    r'\bgh[pousr]_[A-Za-z0-9]{30,}\b',
    r'\bAKIA[A-Z0-9]{16}\b',
    r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
)]
VERSION_PATTERN = r'\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?'


def strict_json(data):
    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('Duplicate JSON key')
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=unique_keys)


def safe_relative(name):
    if (not isinstance(name, str) or not name or '\\' in name or ':' in name
            or '\0' in name or any(part in ('', '.', '..') for part in name.split('/'))):
        raise ValueError('Unsafe source-relative path')
    parts = name.split('/')
    if (any(part.casefold() in PRIVATE_NAMES or re.match(r'^\.env(?:[._-]|$)', part, re.I)
            or part.endswith((' ', '.')) for part in parts)
            or name.casefold().startswith('docs/archive/')
            or name.casefold().startswith('third_party/native/recipes/build-win64-mxe/')
            or name.casefold().endswith(('.log', '.har'))):
        raise ValueError('Private/generated source path')
    return name


def checked_path(base, relative, directory=False):
    """Do not follow a link/junction at any component beneath the project root."""
    current = base
    components = [None, *relative.split('/')]
    for index, part in enumerate(components):
        if part is not None:
            current = current / part
        info = current.lstat()
        reparse = getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0)
        if stat.S_ISLNK(info.st_mode) or reparse:
            raise ValueError('Source path contains a link or reparse point')
        if index < len(components) - 1 or directory:
            if not stat.S_ISDIR(info.st_mode):
                raise ValueError('Source parent is not a regular directory')
        elif not stat.S_ISREG(info.st_mode):
            raise ValueError('Source input is not a regular file')
    return current


def scan_contents(name, data):
    text = data.decode('utf-8', errors='replace')
    home = str(Path.home())
    homes = {home, home.replace('\\', '/'), home.replace('\\', '\\\\')}
    if any(value.casefold() in text.casefold() for value in homes):
        raise ValueError('Developer home path in source: ' + name)
    if any(pattern.search(text) for pattern in SECRET_PATTERNS):
        raise ValueError('Credential pattern in source: ' + name)


def frozen_inventory(root, export, version):
    manifest_path = checked_path(root, export.relative_to(root).as_posix() + '/' + MANIFEST_NAME)
    manifest_data = manifest_path.read_bytes()
    manifest = strict_json(manifest_data)
    if (not isinstance(manifest, dict) or manifest.get('schema_version') != 1
            or manifest.get('version') != version
            or manifest.get('artifact_kind') != 'source-only-development'
            or manifest.get('published') is not False
            or not isinstance(manifest.get('files'), list) or not manifest['files']):
        raise ValueError('Unexpected frozen source manifest')
    data = {MANIFEST_NAME: manifest_data}
    folded = {MANIFEST_NAME.casefold()}
    for entry in manifest['files']:
        if not isinstance(entry, dict):
            raise ValueError('Invalid manifest entry')
        name = safe_relative(entry.get('name'))
        if (name.casefold() in folded or type(entry.get('bytes')) is not int
                or entry['bytes'] < 0 or not isinstance(entry.get('sha256'), str)
                or not re.fullmatch(r'[a-f0-9]{64}', entry['sha256'])):
            raise ValueError('Invalid or duplicate manifest entry')
        folded.add(name.casefold())
        file = checked_path(root, export.relative_to(root).as_posix() + '/' + name)
        contents = file.read_bytes()
        if len(contents) != entry['bytes'] or hashlib.sha256(contents).hexdigest() != entry['sha256']:
            raise ValueError('Frozen export differs from manifest: ' + name)
        data[name] = contents
    actual = set()
    for directory, children, files in os.walk(export, followlinks=False):
        base = Path(directory)
        # archive-github.py deliberately excludes a repository initialized on
        # top of the export, but never follows a linked .git directory.
        for name in children + files:
            relative = (base / name).relative_to(root).as_posix()
            checked_path(root, relative, directory=name in children)
        if base == export and '.git' in children:
            children.remove('.git')
        for name in files:
            actual.add((base / name).relative_to(export).as_posix())
    if actual != set(data):
        raise ValueError('Frozen export inventory has missing or unexpected files')
    for name, contents in data.items():
        scan_contents(name, contents)
    return data, manifest_data


def verify(root, version=None):
    # The mutable package only selects an artifact by default. All compared
    # content and reported package identity come from the frozen export.
    selection = strict_json((root / 'package.json').read_bytes())
    name = selection.get('name')
    version = version if version is not None else selection.get('version')
    if not isinstance(name, str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name):
        raise ValueError('Unsafe package name')
    if not isinstance(version, str) or not re.fullmatch(VERSION_PATTERN, version):
        raise ValueError('Unsafe version')
    archive = checked_path(root, f'release/{name}-{version}-source.zip')
    sidecar = checked_path(root, f'release/{name}-{version}-source.zip.sha256')
    checksum = sidecar.read_text(encoding='utf-8').strip().split()
    if len(checksum) != 2 or not re.fullmatch(r'[a-f0-9]{64}', checksum[0]) or checksum[1] != archive.name:
        raise ValueError('Invalid source checksum sidecar')
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if digest != checksum[0]:
        raise ValueError('Source checksum mismatch')
    export = checked_path(root, f'release/github-ready-{version}', directory=True)
    expected, manifest_data = frozen_inventory(root, export, version)
    frozen_package = strict_json(expected['package.json'])
    if frozen_package.get('name') != name or frozen_package.get('version') != version:
        raise ValueError('Frozen package identity differs from the selected source artifact')
    prefix = name + '/'
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        folded = set()
        actual = set()
        for entry in entries:
            if not entry.filename.startswith(prefix):
                raise ValueError('Unexpected source archive prefix')
            relative = safe_relative(entry.filename[len(prefix):])
            kind = stat.S_IFMT(entry.external_attr >> 16)
            if (entry.is_dir() or kind not in (0, stat.S_IFREG)
                    or entry.flag_bits & 1 or relative.casefold() in folded):
                raise ValueError('Duplicate, encrypted, linked, or non-file source entry')
            folded.add(relative.casefold())
            actual.add(relative)
            if relative not in expected or entry.file_size != len(expected[relative]):
                raise ValueError('Unexpected source archive inventory or file size')
        if actual != set(expected):
            raise ValueError('Source archive inventory does not match the frozen export')
        for entry in entries:
            relative = entry.filename[len(prefix):]
            contents = bundle.read(entry)  # Readback validates each member CRC.
            if contents != expected[relative]:
                raise ValueError('Archived bytes differ from frozen export: ' + relative)
            scan_contents(relative, contents)
    return {
        'status': 'PASS', 'version': version,
        'checked_at': datetime.now(timezone.utc).isoformat(),
        'scope': 'ZIP CRC, safe paths, no links/private runtime files, exact frozen export/manifest inventory and bytes, credential-pattern and developer-home scan; not a complete secret or license review',
        'comparison_source': export.relative_to(root).as_posix(),
        'source_manifest_sha256': hashlib.sha256(manifest_data).hexdigest(),
        'filename': archive.name, 'sha256': digest, 'bytes': archive.stat().st_size,
        'files': len(expected), 'license': frozen_package.get('license'),
        'published': False, 'live_submissions': 0,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', help='Verify a sealed version after the working-tree version changes')
    parser.add_argument('--no-report', action='store_true', help='Print only; never create or overwrite an inspection report')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    report = verify(root, args.version)
    if not args.no_report:
        label = report['version'].removeprefix('0.1.0-').replace('.', '')
        destination = root / 'docs' / f'source-inspection-{label}.json'
        # Existing evidence is sealed, even when a later recheck has the same result.
        with destination.open('x', encoding='utf-8', newline='\n') as output:
            output.write(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()

