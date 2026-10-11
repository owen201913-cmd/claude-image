"""Restore only reviewed cache inputs from a SHA-checked source companion ZIP.

Does not overwrite code/notices, install dependencies or fetch anything.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile

def restore(root, archive_path, expected_sha):
    archive_path = Path(archive_path)
    with archive_path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    if digest != expected_sha:
        raise ValueError('Native source companion SHA-256 mismatch')
    metadata = json.loads((root / 'package.json').read_text('utf-8'))
    selection = json.loads((root / 'third_party/native/source-access.json').read_text('utf-8'))
    cache = root / 'third_party/native-source'
    if cache.is_symlink():
        raise ValueError('Cache root cannot be a symbolic link')
    cache.mkdir(exist_ok=True)
    restored = reused = 0
    with zipfile.ZipFile(archive_path) as bundle:
        names = bundle.namelist()
        if len(names) != len(set(names)):
            raise ValueError('Duplicate ZIP entries')
        for entry in selection['source_archive_selection']:
            relative = PurePosixPath(entry['file'])
            if not entry['file'].startswith('third_party/native-source/') or relative.is_absolute() or '..' in relative.parts or '\\' in entry['file'] or ':' in entry['file']:
                raise ValueError('Unsafe cache input')
            name = metadata['name'] + '/' + str(relative)
            info = bundle.getinfo(name)
            if info.file_size != entry['bytes'] or info.file_size > 128 * 1024 * 1024 or (info.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Invalid source ZIP input')
            data = bundle.read(info)
            if hashlib.sha256(data).hexdigest() != entry['sha256']:
                raise ValueError('Source input checksum mismatch')
            target = root.joinpath(*relative.parts)
            if target.is_symlink() or not target.resolve().is_relative_to(cache.resolve()):
                raise ValueError('Source cache path escaped')
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                if target.read_bytes() != data:
                    raise ValueError('Refusing to overwrite changed source input')
                reused += 1
            else:
                with target.open('xb') as stream:
                    stream.write(data)
                restored += 1
    return {'status': 'PASS_NATIVE_SOURCE_CACHE_RESTORE', 'restored': restored,
            'reused': reused, 'verified': restored + reused, 'network_bytes': 0,
            'code_or_notice_files_overwritten': False}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--sha256', required=True)
    options = parser.parse_args()
    print(json.dumps(restore(Path(__file__).resolve().parents[1], options.archive, options.sha256)))
