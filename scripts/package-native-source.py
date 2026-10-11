"""Freeze verified upstream native inputs separately from the installable MCPB."""
import hashlib
import json
import os
import sys
from pathlib import Path, PurePosixPath
import uuid
import zipfile

root = Path(__file__).resolve().parents[1]
metadata = json.loads((root / 'package.json').read_text(encoding='utf-8'))
selection = json.loads((root / 'third_party/native/source-access.json').read_text(encoding='utf-8'))
manifest_path = root / 'third_party/native/distribution-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
if selection['status'] != 'CHECKSUM_VERIFIED_SOURCE_INPUTS_SELECTED' or manifest['status'] != 'REVIEWED_NATIVE_MATERIAL_SELECTION':
    raise RuntimeError('Run the reviewed native-distribution selector before packaging')
allowlist = selection['source_archive_selection']
cache_root = (root / 'third_party/native-source').resolve()
files = {}
for entry in allowlist:
    name = PurePosixPath(entry['file'])
    if name.is_absolute() or '..' in name.parts or '\\' in entry['file'] or ':' in entry['file'] or not entry['file'].startswith('third_party/native-source/'):
        raise RuntimeError('Unsafe source allowlist path')
    if name.name.startswith('build-win64-mxe-') or name.name == 'vips-dev-x64-web-8.18.7-static.zip' or name.name == 'sharp-win32-x64-0.35.5.tgz':
        raise RuntimeError('Excluded recipe repository or verification binary entered source selection')
    source = root.joinpath(*name.parts)
    if source.is_symlink() or not source.resolve().is_relative_to(cache_root):
        raise RuntimeError('Source allowlist escaped the dedicated cache')
    contents = source.read_bytes()
    digest = hashlib.sha256(contents).hexdigest()
    if len(contents) != entry['bytes'] or digest != entry['sha256'] or str(name) in files:
        raise RuntimeError('Duplicate or changed upstream source input')
    files[str(name)] = {'path': source, 'sha256': digest, 'bytes': len(contents)}

small_inputs = []
for entry in manifest['files']:
    name = entry['file']
    if not name.startswith('third_party/native/') or name.startswith('third_party/native/recipes/build-win64-mxe/') or '..' in PurePosixPath(name).parts or '\\' in name or ':' in name:
        raise RuntimeError('Unreviewed native material selection')
    source = root.joinpath(*PurePosixPath(name).parts)
    contents = source.read_bytes()
    if len(contents) != entry['bytes'] or hashlib.sha256(contents).hexdigest() != entry['sha256']:
        raise RuntimeError('Selected native material changed; rerun selector')
    small_inputs.append(source)
small_inputs += [manifest_path] + [root / 'scripts' / name for name in (
    'native-materials.py', 'native_rust_materials.py', 'native_sharp_materials.py',
    'verify-native-registry.mjs', 'native-notice-supplements.py', 'native-source-access-check.py',
    'native-distribution.mjs', 'native-replacement-smoke.mjs', 'restore-native-source.py', 'package-native-source.py')]
for source in small_inputs:
    if source.is_dir():
        continue
    if source.is_symlink() or not source.resolve().is_relative_to(root) or not source.is_file():
        raise RuntimeError('Unexpected native recipe or notice input')
    contents = source.read_bytes()
    files[source.relative_to(root).as_posix()] = {
        'path': source, 'sha256': hashlib.sha256(contents).hexdigest(), 'bytes': len(contents)}

if '--verify-inputs-only' in sys.argv[1:]:
    print(json.dumps({'status': 'PASS_SELECTED_NATIVE_SOURCE_INPUTS',
                      'verified_cache_files': len(allowlist), 'files': len(files),
                      'excluded_recipe_tarball': True, 'excluded_recipe_subtree': True,
                      'archive_created': False, 'published': False, 'live_submissions': 0}))
    sys.exit(0)

release = root / 'release'
release.mkdir(exist_ok=True)
destination = release / f"{metadata['name']}-{metadata['version']}-native-source.zip"
hash_file = Path(str(destination) + '.sha256')
if destination.exists() or hash_file.exists():
    raise RuntimeError('Refusing to overwrite a frozen source archive')
temporary = release / f'.native-source-{uuid.uuid4()}.tmp'
try:
    with zipfile.ZipFile(temporary, 'x', zipfile.ZIP_DEFLATED, compresslevel=1) as bundle:
        for name, item in sorted(files.items()):
            # Upstream compressed archives are kept verbatim rather than recompressed.
            compression = zipfile.ZIP_STORED if name.startswith('third_party/native-source/') else zipfile.ZIP_DEFLATED
            bundle.write(item['path'], f"{metadata['name']}/{name}", compress_type=compression)
    with zipfile.ZipFile(temporary) as bundle:
        if bundle.testzip() is not None or len(bundle.infolist()) != len(files):
            raise RuntimeError('Native source ZIP integrity failure')
        for name, item in files.items():
            contents = bundle.read(f"{metadata['name']}/{name}")
            if len(contents) != item['bytes'] or hashlib.sha256(contents).hexdigest() != item['sha256']:
                raise RuntimeError('Archived native input differs from its verified source')
    digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
    os.replace(temporary, destination)
    hash_file.write_text(f'{digest}  {destination.name}\n', encoding='utf-8')
finally:
    temporary.unlink(missing_ok=True)
report = {'status': 'PASS', 'version': metadata['version'], 'filename': destination.name,
          'sha256': digest, 'bytes': destination.stat().st_size, 'files': len(files),
          'verified_cache_files': len(allowlist), 'published': False,
          'excluded_unlicensed_recipe_repository': True,
          'external_required_build_source': selection['external_required_build_sources'],
          'scope': 'Selected verified upstream source inputs and notices; excludes unlicensed recipe repository and verification binaries. Required external build source is linked; not a native rebuild or legal certification',
          'live_submissions': 0}
label = metadata['version'].removeprefix('0.1.0-').replace('.', '')
(root / 'docs' / f'native-source-inspection-{label}.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
