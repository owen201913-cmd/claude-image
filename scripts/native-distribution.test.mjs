import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { allowNativeMaterialPath, copyNativeMaterials, evaluateNativeRelease, verifyStagedNativeMaterials } from './native-distribution.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const temporary = async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ngini-native-selection-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
};
async function fixture(t) {
  const directory = await temporary(t);
  await mkdir(path.join(directory, 'third_party/native'), { recursive: true });
  const bytes = Buffer.from('Unmodified upstream notice test fixture\n');
  await writeFile(path.join(directory, 'third_party/native/NOTICE'), bytes);
  await writeFile(path.join(directory, 'third_party/native/distribution-manifest.json'), JSON.stringify({
    file_count: 1, files: [{ file: 'third_party/native/NOTICE', sha256: hash(bytes), bytes: bytes.length }]
  }));
  await writeFile(path.join(directory, 'third_party/native/source-access.json'), '{}\n');
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  return directory;
}

test('selector excludes only unlicensed recipes/private sources and rejects traversal', () => {
  assert.equal(allowNativeMaterialPath('third_party/native/recipes/build-win64-mxe'), false);
  assert.equal(allowNativeMaterialPath('third_party/native/recipes/build-win64-mxe/build/vips.mk'), false);
  assert.equal(allowNativeMaterialPath('third_party/native-source/component.tar.gz'), false);
  assert.equal(allowNativeMaterialPath('third_party/native/licenses/GPL-3.0.txt'), true);
  assert.equal(allowNativeMaterialPath('third_party/native/recipes/mxe/LICENSE.md'), true);
  for (const unsafe of ['', '../private', '/absolute', 'C:/private', 'foo\\private', 'foo//bar', 'foo/./bar']) {
    assert.throws(() => allowNativeMaterialPath(unsafe), /Unsafe/);
  }
});

test('actual reviewed native manifest stages exactly with no recipe subtree/cache', async t => {
  const stage = await temporary(t);
  const result = await copyNativeMaterials(stage, root);
  const manifest = JSON.parse(await readFile(path.join(root, 'third_party/native/distribution-manifest.json'), 'utf8'));
  assert.equal(result.status, 'PASS_NATIVE_STAGING_SELECTION');
  assert.equal(result.files, manifest.file_count + 1);
  assert.equal(manifest.source_companion_selection_count, 405);
  assert.equal(result.public_distribution_approved, false);
  assert(manifest.files.every(item => !item.file.startsWith('third_party/native/recipes/build-win64-mxe/')));
});

test('staging rejects changed license bytes', async t => {
  const source = await fixture(t), stage = await temporary(t);
  await copyNativeMaterials(stage, source);
  await writeFile(path.join(stage, 'third_party/native/NOTICE'), 'tampered');
  await assert.rejects(() => verifyStagedNativeMaterials(stage, source), /checksum mismatch/);
});

test('staging rejects missing and unlisted material', async t => {
  const source = await fixture(t), stage = await temporary(t);
  await copyNativeMaterials(stage, source);
  await rm(path.join(stage, 'third_party/native/NOTICE'));
  await assert.rejects(() => verifyStagedNativeMaterials(stage, source), /Missing or unlisted/);
  await copyNativeMaterials(stage, source);
  await writeFile(path.join(stage, 'third_party/native/unreviewed'), 'extra');
  await assert.rejects(() => verifyStagedNativeMaterials(stage, source), /Missing or unlisted/);
});

test('staging rejects private cache even outside native material subtree', async t => {
  const source = await fixture(t), stage = await temporary(t);
  await copyNativeMaterials(stage, source);
  await mkdir(path.join(stage, 'third_party/native-source'));
  await assert.rejects(() => verifyStagedNativeMaterials(stage, source), /Private native-source cache/);
});

test('release gate reports both missing source assets without public success', async t => {
  const source = await fixture(t);
  const result = await evaluateNativeRelease({ root: source });
  assert.equal(result.status, 'BLOCKED_NATIVE_RELEASE_INPUTS');
  assert.deepEqual(result.blockers, ['MATCHING_APPLICATION_SOURCE_ASSET_REQUIRED', 'MATCHING_NATIVE_SOURCE_ASSET_REQUIRED']);
  assert.equal(result.public_binary_release_ready, false);
});

test('release gate rejects mismatched version and changed asset hash', async t => {
  const source = await fixture(t);
  await mkdir(path.join(source, 'release'));
  await writeFile(path.join(source, 'release/fixture-1.0.0-source.zip'), 'hash gate fixture, not a produced source archive');
  await assert.rejects(() => evaluateNativeRelease({ root: source, applicationSourcePath: 'release/fixture-0.9.0-source.zip', applicationSourceSha256: '0'.repeat(64) }), /version mismatch/);
  await assert.rejects(() => evaluateNativeRelease({ root: source, applicationSourcePath: 'release/fixture-1.0.0-source.zip', applicationSourceSha256: '0'.repeat(64) }), /checksum mismatch/);
});

test('matching local asset hashes do not imply public access or publication', async t => {
  const source = await fixture(t);
  await mkdir(path.join(source, 'release'));
  const bytes = Buffer.from('asset-hash gate fixture; ZIP contents are checked by their dedicated packagers');
  for (const name of ['source', 'native-source']) await writeFile(path.join(source, `release/fixture-1.0.0-${name}.zip`), bytes);
  const inputs = { root: source, applicationSourcePath: 'release/fixture-1.0.0-source.zip', applicationSourceSha256: hash(bytes), nativeSourcePath: 'release/fixture-1.0.0-native-source.zip', nativeSourceSha256: hash(bytes) };
  const result = await evaluateNativeRelease(inputs);
  assert.equal(result.local_distribution_set_ready, true);
  assert.equal(result.public_source_access_verified, false);
  assert.equal(result.public_binary_release_ready, false);
  await writeFile(path.join(source, 'unverified-public.json'), JSON.stringify({ status: 'PASS', binary_url: 'https://example.invalid/binary' }));
  await assert.rejects(() => evaluateNativeRelease({ ...inputs, publicAccessReceipt: 'unverified-public.json' }), /does not match/);
  await writeFile(path.join(source, 'unstaged-public.json'), JSON.stringify({
    status: 'PASS_PUBLIC_SOURCE_ACCESS', application_source_sha256: hash(bytes), native_source_sha256: hash(bytes),
    binary_url: 'https://example.invalid/binary', application_source_url: 'https://example.invalid/source',
    native_source_url: 'https://example.invalid/native-source', checked_at: '2026-10-09T00:00:00Z',
    method: 'HTTPS_GET_ASSET_SHA256_MATCH', native_source_manifest_sha256: hash(await readFile(path.join(source, 'third_party/native/source-access.json')))
  }));
  await assert.rejects(() => evaluateNativeRelease({ ...inputs, publicAccessReceipt: 'unstaged-public.json' }), /does not match/);
});
