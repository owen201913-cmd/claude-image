import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('restore_native', Path(__file__).with_name('restore-native-source.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RestoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='ngini-native-restore-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'third_party/native').mkdir(parents=True)
        (self.root / 'package.json').write_text('{"name":"fixture"}', 'utf-8')
        self.data = b'original source archive fixture'
        self.entry = {'file': 'third_party/native-source/components/example.tar.gz', 'bytes': len(self.data), 'sha256': hashlib.sha256(self.data).hexdigest()}
        self.index()
        self.archive = self.root / 'companion.zip'
        with zipfile.ZipFile(self.archive, 'w') as bundle:
            bundle.writestr('fixture/' + self.entry['file'], self.data)
            bundle.writestr('fixture/src/must-not-overwrite.ts', 'outside cache')
        self.sha = hashlib.sha256(self.archive.read_bytes()).hexdigest()

    def index(self):
        (self.root / 'third_party/native/source-access.json').write_text(json.dumps({'source_archive_selection': [self.entry]}), 'utf-8')

    def test_restore_and_reuse_only_selected_cache_bytes(self):
        result = module.restore(self.root, self.archive, self.sha)
        self.assertEqual(result['restored'], 1)
        self.assertEqual((self.root / self.entry['file']).read_bytes(), self.data)
        self.assertFalse((self.root / 'src').exists())
        self.assertEqual(module.restore(self.root, self.archive, self.sha)['reused'], 1)

    def test_wrong_whole_archive_hash_writes_nothing(self):
        with self.assertRaisesRegex(ValueError, 'companion SHA-256'):
            module.restore(self.root, self.archive, '0' * 64)
        self.assertFalse((self.root / 'third_party/native-source').exists())

    def test_wrong_selected_hash_rejected(self):
        self.entry['sha256'] = '0' * 64
        self.index()
        with self.assertRaisesRegex(ValueError, 'input checksum'):
            module.restore(self.root, self.archive, self.sha)
        self.assertFalse((self.root / self.entry['file']).exists())

    def test_traversal_rejected(self):
        self.entry['file'] = 'third_party/native-source/../../private'
        self.index()
        with self.assertRaisesRegex(ValueError, 'Unsafe cache'):
            module.restore(self.root, self.archive, self.sha)

    def test_changed_cache_is_not_overwritten(self):
        target = self.root / self.entry['file']
        target.parent.mkdir(parents=True)
        target.write_bytes(b'user modification')
        with self.assertRaisesRegex(ValueError, 'overwrite changed'):
            module.restore(self.root, self.archive, self.sha)
        self.assertEqual(target.read_bytes(), b'user modification')

if __name__ == '__main__':
    unittest.main()
