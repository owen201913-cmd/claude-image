"""Inspect and extract only this project's generated candidate for isolated smoke QA."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import shutil
import sys
import tempfile
import uuid
import zipfile

root = Path(__file__).resolve().parents[1]
candidate = json.loads((root / 'release/latest-candidate.json').read_text(encoding='utf-8'))
archive = root / 'release' / candidate['filename']
if archive.parent.resolve() != (root / 'release').resolve():
    raise RuntimeError('Candidate path escaped release directory')
stage = root / 'release' / candidate['stageDirectory']
if stage.parent.resolve() != (root / 'release').resolve():
    raise RuntimeError('Candidate staging path escaped release directory')
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
if digest != candidate['sha256']:
    raise RuntimeError('Candidate checksum mismatch')
if sys.argv[1:] not in ([], ['--outside-tree']):
    raise ValueError('Usage: python scripts/verify-candidate.py [--outside-tree]')
outside_tree = sys.argv[1:] == ['--outside-tree']
isolation_base = Path(tempfile.mkdtemp(prefix='claude-image-bundle-check-')) if outside_tree else None
destination = isolation_base / 'extension' if outside_tree else root / '.runtime' / ('candidate-' + str(uuid.uuid4()))
private_names = {'.runtime', '.git', '.pnpm', '.env', 'browser-profile'}
machine_prefixes = [str(Path.home()).encode(), str(Path.home()).replace('\\', '/').encode()]
with zipfile.ZipFile(archive) as bundle:
    entries = bundle.infolist()
    fingerprints = []
    folded_names = set()
    for entry in entries:
        path = PurePosixPath(entry.filename)
        if path.is_absolute() or '..' in path.parts or '\\' in entry.filename or ':' in entry.filename:
            raise RuntimeError('Unsafe archive path: ' + entry.filename)
        if any(part.lower() in private_names or part.lower().startswith('.env') for part in path.parts) or path.name.lower().endswith(('.log', '.har')):
            raise RuntimeError('Private runtime data in archive: ' + entry.filename)
        if stat.S_ISLNK(entry.external_attr >> 16):
            raise RuntimeError('Symbolic link in archive')
        if entry.filename.lower() in folded_names:
            raise RuntimeError('Duplicate archive path')
        folded_names.add(entry.filename.lower())
        if entry.is_dir():
            continue
        content = bundle.read(entry)  # CRC/readback covers dependencies and notices too.
        if content != (stage / entry.filename).read_bytes():
            raise RuntimeError('Archive bytes differ from staged input: ' + entry.filename)
        fingerprints.append({'file': entry.filename, 'bytes': len(content),
                             'sha256': hashlib.sha256(content).hexdigest()})
        if entry.filename.startswith(('dist/', 'docs/')) or path.name in {
            'manifest.json', 'README.md', 'README.en.md', 'PRIVACY.md', 'SECURITY.md', 'CHANGELOG.md'
        }:
            if any(prefix in content for prefix in machine_prefixes):
                raise RuntimeError('Developer home path in own candidate content')
    names = {entry.filename for entry in entries}
    if not any(name.startswith('node_modules/@img/sharp-win32-x64/lib/') and name.endswith('.node') for name in names):
        raise RuntimeError('Windows image decoder missing')
    manifest = json.loads(bundle.read('manifest.json'))
    if manifest['server']['entry_point'] != 'dist/bootstrap.js' or manifest['server']['mcp_config']['args'] != ['${__dirname}/dist/bootstrap.js']:
        raise RuntimeError('Candidate does not use the guarded bootstrap entry')
    if any(name not in names for name in ('dist/bootstrap.js', 'dist/shared/platform-guard.js', 'dist/server.js', 'dist/ui/image-card.html')):
        raise RuntimeError('Compiled server/card missing')
    for prefix in ('dist/', 'third_party/native/'):
        staged = {item.relative_to(stage).as_posix() for item in (stage / prefix).rglob('*')
                  if item.is_file() and not (prefix == 'dist/' and item.name.endswith('.d.ts'))}
        archived = {name for name in names if name.startswith(prefix) and not name.endswith('/')}
        if archived != staged:
            raise RuntimeError('Required runtime/native materials omitted by MCPB packaging: ' + prefix)
    ui_digest = hashlib.sha256(bundle.read('dist/ui/image-card.html')).hexdigest()
    ui_report = json.loads((root / 'docs/card-csp-smoke.json').read_text(encoding='utf-8'))
    if ui_report.get('test_status') != 'PASS' or ui_digest != ui_report.get('html_sha256'):
        raise RuntimeError('Candidate card differs from the strict-CSP tested artifact')
    # The project and Claude extension roots can already be long on Windows.
    # Use the local extended-length path form without changing system settings.
    extract_destination = str(destination.resolve())
    if os.name == 'nt':
        extract_destination = '\\\\?\\' + extract_destination
    bundle.extractall(extract_destination)
result = {
    'status': 'PASS', 'scope': 'archive integrity and allowlist only; not Claude Desktop acceptance',
    'sha256': digest, 'entries': len(entries), 'bytes': archive.stat().st_size,
    'ui_html_sha256': ui_digest,
    'archive_files_readback_matched': len(fingerprints),
    'extracted_directory': 'OUTSIDE_PROJECT_TEMP' if outside_tree else destination.relative_to(root).as_posix(), 'live_submissions': 0,
}
inventory_path = root / '.runtime' / ('candidate-inventory-' + candidate['version'] + '.json')
inventory_path.write_text(json.dumps({'candidate_sha256': digest, 'version': candidate['version'],
                                     'files': fingerprints}, indent=2) + '\n', encoding='utf-8')
result['inventory_file'] = inventory_path.relative_to(root).as_posix()
if outside_tree:
    asset_copy = isolation_base / archive.name
    shutil.copyfile(archive, asset_copy)
    if hashlib.sha256(asset_copy.read_bytes()).hexdigest() != digest:
        raise RuntimeError('Isolated asset copy checksum differs')
    ancestor_modules = [parent / 'node_modules' for parent in destination.parents if (parent / 'node_modules').exists()]
    if ancestor_modules:
        raise RuntimeError('Isolated destination has an ancestor node_modules directory')
    location_path = root / '.runtime' / ('candidate-location-' + candidate['version'] + '.json')
    location_path.write_text(json.dumps({'version': candidate['version'], 'candidate_sha256': digest,
        'asset': str(asset_copy), 'bundle': str(destination), 'base': str(isolation_base),
        'files': len(fingerprints), 'ancestor_node_modules': len(ancestor_modules)}, indent=2) + '\n', encoding='utf-8')
    result['private_location_file'] = location_path.relative_to(root).as_posix()
(root / 'docs/candidate-inspection.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
