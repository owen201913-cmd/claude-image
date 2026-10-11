/** Select and verify native distribution materials. No downloads or builds. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestName = 'third_party/native/distribution-manifest.json';
const excludedRecipe = 'third_party/native/recipes/build-win64-mxe';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async filename => JSON.parse(await readFile(filename, 'utf8'));
function safeRelative(relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':') || relative.startsWith('/') || relative.split('/').some(p => !p || p === '..' || p === '.')) throw new Error('Unsafe distribution path');
  return relative;
}
export function allowNativeMaterialPath(relative) {
  safeRelative(relative);
  return !(relative === 'third_party/native-source' || relative.startsWith('third_party/native-source/') ||
    relative === excludedRecipe || relative.startsWith(excludedRecipe + '/') || relative.split('/').includes('.gitignore'));
}
async function filesIn(directory, relative = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) throw new Error('Distribution material contains a symbolic link');
    if (entry.isDirectory()) result.push(...await filesIn(path.join(directory, entry.name), name));
    else if (entry.isFile()) result.push(name);
    else throw new Error('Unexpected material type');
  }
  return result;
}
async function checkedFile(root, relative, expected) {
  safeRelative(relative);
  const bytes = await readFile(path.join(root, relative));
  if (expected && digest(bytes) !== expected) throw new Error(`Material checksum mismatch: ${relative}`);
  return { file: relative, bytes: bytes.length, sha256: digest(bytes) };
}

/** Writes only the project's own source-access index and distribution manifest. */
export async function buildNativeManifest(root = defaultRoot) {
  const materials = await json(path.join(root, 'third_party/native/materials.json'));
  const cache = await json(path.join(root, 'third_party/native/source-cache-allowlist.json'));
  const rust = await json(path.join(root, 'third_party/native/provenance/librsvg-crates.json'));
  const sharp = await json(path.join(root, 'third_party/native/provenance/sharp-provenance.json'));
  const supplement = await json(path.join(root, 'third_party/native/notice-supplements.json'));
  assert.equal(materials.source_archives_checksum_matched, 28);
  assert.equal(rust.locked_external_count, 357);
  assert.equal(rust.source_archives_checksum_matched, 357);
  assert.equal(sharp.cplusplus_sources.length, 5);
  assert.equal(supplement.status, 'SUPPLEMENTAL_NOTICE_INPUTS_COMPLETE');
  assert.equal(supplement.packages.length, 13);
  for (const item of [supplement.standard_mit, ...supplement.packages.flatMap(item => item.retained)]) {
    const checked = await checkedFile(root, item.file, item.sha256);
    assert.equal(checked.bytes, item.bytes);
  }
  const sources = [], external = [];
  for (const entry of cache.files) {
    assert(entry.file.startsWith('third_party/native-source/'));
    if (entry.file.startsWith('third_party/native-source/build-win64-mxe-')) {
      external.push({ url: entry.url, bytes: entry.bytes, sha256: entry.sha256,
        purpose: 'Required upstream build recipes/patches; exact fixed archive, referenced rather than redistributed because no independent repository license was confirmed',
        local_cache_redistributable: false });
    } else if (entry.file.endsWith('/vips-dev-x64-web-8.18.7-static.zip') || entry.file.endsWith('/archives/sharp-win32-x64-0.35.5.tgz')) {
      // Verification binaries are not needed in a source-only companion archive.
      continue;
    } else {
      const checked = await checkedFile(root, entry.file, entry.sha256);
      assert.equal(checked.bytes, entry.bytes);
      sources.push(entry);
    }
  }
  assert.equal(external.length, 1);
  const externalCheck = await json(path.join(root, 'third_party/native/source-access-verification.json'));
  assert.equal(externalCheck.status, 'PASS_FIXED_UPSTREAM_BUILD_SOURCE_ACCESS');
  assert.equal(externalCheck.url, external[0].url);
  assert.equal(externalCheck.sha256, external[0].sha256);
  const index = { schema_version: 1, external_source_access_checked_at: externalCheck.checked_at, status: 'CHECKSUM_VERIFIED_SOURCE_INPUTS_SELECTED',
    source_archive_selection: sources, external_required_build_sources: external,
    external_build_source_access_evidence: { checked_at: externalCheck.checked_at, sha256: externalCheck.sha256 },
    license_basis: 'Unmodified upstream source archives retain their component licenses; source/build/provenance inputs are selected separately from runtime verification binaries. Excluded build-win64-mxe code is provided by an exact upstream server route, not copied into this distribution.',
    source_archives: { versioned_components: 28, cargo_lock_registry_entries: 357, cargo_scope: 'Includes development/other-target entries; not a claim that all entries are linked' },
    application_source: { required: true, route: 'The matching application source archive must accompany the binary distribution set; its hash is verified separately by the release gate.', public_url: null },
    source_access_conditions: 'Distributors must give clear directions next to binary downloads and ensure ongoing equivalent source access. An external URL can fail later; a hash and a past access test do not create a retention promise.',
    no_written_source_offer_or_publication_performed: true };
  await writeFile(path.join(root, 'third_party/native/source-access.json'), JSON.stringify(index, null, 2) + '\n');
  const records = [];
  for (const suffix of (await filesIn(path.join(root, 'third_party/native'))).sort()) {
    const relative = 'third_party/native/' + suffix;
    if (relative === manifestName || !allowNativeMaterialPath(relative)) continue;
    records.push(await checkedFile(root, relative));
  }
  for (const required of ['README.md', 'SOURCE_ACCESS.md', 'REPLACEMENT.md', 'distribution-policy.json', 'source-access.json', 'notice-supplements.json', 'licenses/GPL-3.0.txt', 'licenses/LGPL-3.0.txt', 'licenses/LGPL-2.1-libvips.txt']) {
    assert(records.some(item => item.file === 'third_party/native/' + required), `Required native document absent: ${required}`);
  }
  const result = { schema_version: 1, external_source_access_checked_at: externalCheck.checked_at, status: 'REVIEWED_NATIVE_MATERIAL_SELECTION',
    files: records, file_count: records.length, bytes: records.reduce((sum, item) => sum + item.bytes, 0),
    excluded_prefixes: [excludedRecipe + '/', 'third_party/native-source/'], omitted_nonessential_names: ['.gitignore'],
    source_access_index: 'third_party/native/source-access.json',
    source_companion_selection_count: sources.length, external_build_source_count: external.length,
    checks_not_automatic_release_requirements: ['bit-identical native rebuild', 'full Sigstore verification'],
    scope: 'Byte-checked material selection only; public-host availability and exact application source asset are separate release gates; not legal certification' };
  await writeFile(path.join(root, manifestName), JSON.stringify(result, null, 2) + '\n');
  return result;
}

export async function copyNativeMaterials(stageRoot, root = defaultRoot) {
  const manifest = await json(path.join(root, manifestName));
  for (const item of [...manifest.files, { file: manifestName }]) {
    assert(allowNativeMaterialPath(item.file));
    const checked = await checkedFile(root, item.file, item.sha256);
    if (item.bytes !== undefined) assert.equal(checked.bytes, item.bytes);
    const destination = path.join(stageRoot, safeRelative(item.file));
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(root, item.file), destination, { dereference: false });
  }
  return verifyStagedNativeMaterials(stageRoot, root);
}

/** Root packager calls after staging and before MCPB pack. Rejects additions too. */
export async function verifyStagedNativeMaterials(stageRoot, root = defaultRoot) {
  try {
    await lstat(path.join(stageRoot, 'third_party/native-source'));
    throw new Error('Private native-source cache entered binary staging');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert(!(await lstat(path.join(stageRoot, 'third_party/native'))).isSymbolicLink(), 'Native staging directory is a symbolic link');
  const manifest = await json(path.join(root, manifestName));
  const expected = new Map(manifest.files.map(item => [item.file, item]));
  expected.set(manifestName, await checkedFile(root, manifestName));
  const actual = (await filesIn(path.join(stageRoot, 'third_party/native'))).map(name => 'third_party/native/' + name);
  assert.equal(actual.length, expected.size, 'Missing or unlisted native material');
  for (const name of actual) {
    assert(allowNativeMaterialPath(name), 'Unreviewed recipe/private cache entered binary staging');
    const item = expected.get(name);
    assert(item, `Unlisted native material: ${name}`);
    const checked = await checkedFile(stageRoot, name, item.sha256);
    assert.equal(checked.bytes, item.bytes);
  }
  return { status: 'PASS_NATIVE_STAGING_SELECTION', files: actual.length,
    excluded_recipe_subtree_present: false, public_distribution_approved: false };
}

/** The adjacent application source asset is required; no fake public URL. */
export async function evaluateNativeRelease({ root = defaultRoot, stageRoot, applicationSourcePath, applicationSourceSha256, nativeSourcePath, nativeSourceSha256, publicAccessReceipt } = {}) {
  const staging = stageRoot ? await verifyStagedNativeMaterials(stageRoot, root) : null;
  const materials = await json(path.join(root, manifestName));
  const blockers = [];
  let application = null;
  let nativeSource = null;
  if (!applicationSourcePath || !applicationSourceSha256) blockers.push('MATCHING_APPLICATION_SOURCE_ASSET_REQUIRED');
  else {
    const metadata = await json(path.join(root, 'package.json'));
    const actualPath = path.resolve(root, applicationSourcePath);
    assert.equal(path.dirname(actualPath), path.join(root, 'release'), 'Application source must be a release asset');
    assert.equal(path.basename(actualPath), `${metadata.name}-${metadata.version}-source.zip`, 'Application source version mismatch');
    const bytes = await readFile(actualPath);
    assert.equal(digest(bytes), applicationSourceSha256, 'Application source asset checksum mismatch');
    application = { filename: path.basename(actualPath), bytes: bytes.length, sha256: digest(bytes) };
  }
  if (!nativeSourcePath || !nativeSourceSha256) blockers.push('MATCHING_NATIVE_SOURCE_ASSET_REQUIRED');
  else {
    const metadata = await json(path.join(root, 'package.json'));
    const actualPath = path.resolve(root, nativeSourcePath);
    assert.equal(path.dirname(actualPath), path.join(root, 'release'), 'Native source must be a release asset');
    assert.equal(path.basename(actualPath), `${metadata.name}-${metadata.version}-native-source.zip`, 'Native source version mismatch');
    const bytes = await readFile(actualPath);
    assert.equal(digest(bytes), nativeSourceSha256, 'Native source asset checksum mismatch');
    nativeSource = { filename: path.basename(actualPath), bytes: bytes.length, sha256: digest(bytes) };
  }
  const prepared = blockers.length === 0;
  let publicVerified = false;
  if (publicAccessReceipt) {
    const receipt = await json(path.resolve(root, publicAccessReceipt));
    const https = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } };
    publicVerified = staging && receipt.status === 'PASS_PUBLIC_SOURCE_ACCESS' && application && nativeSource &&
      receipt.application_source_sha256 === application.sha256 && receipt.native_source_sha256 === nativeSource.sha256 &&
      https(receipt.binary_url) && https(receipt.application_source_url) && https(receipt.native_source_url) &&
      typeof receipt.checked_at === 'string' && !Number.isNaN(Date.parse(receipt.checked_at)) &&
      receipt.method === 'HTTPS_GET_ASSET_SHA256_MATCH' &&
      receipt.native_source_manifest_sha256 === digest(await readFile(path.join(root, 'third_party/native/source-access.json')));
    assert(publicVerified, 'Public-access receipt does not match actual release inputs');
  }
  return { status: prepared ? 'READY_LOCAL_DISTRIBUTION_SET_PUBLIC_ACCESS_SEPARATE' : 'BLOCKED_NATIVE_RELEASE_INPUTS',
    staging, application_source: application, native_source: nativeSource, native_manifest_files: materials.file_count,
    blockers, local_distribution_set_ready: prepared, public_source_access_verified: Boolean(publicVerified),
    public_binary_release_ready: prepared && Boolean(publicVerified),
    not_hard_gates: { bit_identical_rebuild: 'NOT_RUN_NOT_REQUIRED_FOR_THIS_GATE', full_sigstore: 'NOT_RUN_NOT_REQUIRED_FOR_THIS_GATE' },
    scope: 'Mechanical source/notices/asset gate; publisher remains responsible for applicable source availability and licensing conditions. No publication or legal guarantee.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--prepare')) {
    const result = await buildNativeManifest();
    process.stdout.write(JSON.stringify({ status: result.status, files: result.file_count, source_inputs: result.source_companion_selection_count }) + '\n');
  } else {
    const stageAt = process.argv.indexOf('--stage');
    if (stageAt < 0) throw new Error('Use --prepare or --stage <staging-directory>');
    const stage = path.resolve(process.argv[stageAt + 1]);
    process.stdout.write(JSON.stringify(await verifyStagedNativeMaterials(stage)) + '\n');
  }
}
