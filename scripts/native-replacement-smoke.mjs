/** Isolated Windows native assembly/recombination smoke. No build or download.
 *
 * Uses only the installed locked Sharp package and the checksum-verified official
 * libvips ZIP already in native-source. Does not modify either source, an MCPB,
 * or an installed extension. A successful assembly seam is not a rebuilt-library
 * or complete LGPL compliance certification.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '..');
const require = createRequire(import.meta.url);
const hash = value => createHash('sha256').update(value).digest('hex');
const zipRelative = 'third_party/native-source/vips-dev-x64-web-8.18.7-static.zip';
const zipSha = 'a736af61d3b46499760efa606e469cb14e060445b1f6fd36a1fa2e75009e1197';
const expected = {
  'libvips-42.dll': '06dab07cc386748513337a31672b1d5269fbc770a14ff403080575665bf0813f',
  'libvips-cpp-8.18.7.dll': '25001dbd05305a0a29119ab49933622c70b4a20ea12ef1d5d20ca40181db53bf',
};
const alternateSha = 'c9af1e56c17a4c8883a986c19818c72087aa730f6edb889faf69a13547b3dfaa';

function packageRoot(entry, wanted) {
  let current = path.dirname(entry);
  for (;;) {
    const manifest = path.join(current, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === wanted) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`Package root absent: ${wanted}`);
    current = parent;
  }
}

// A bounded reader for one known, SHA-pinned, non-ZIP64 release member. Never
// extracts archive paths; the caller chooses the isolated destination filename.
function zipMember(zip, wanted) {
  let end = -1;
  for (let offset = zip.length - 22; offset >= Math.max(0, zip.length - 65_557); offset--) {
    if (zip.readUInt32LE(offset) === 0x06054b50 && offset + 22 + zip.readUInt16LE(offset + 20) === zip.length) { end = offset; break; }
  }
  assert(end >= 0, 'ZIP end record absent');
  const count = zip.readUInt16LE(end + 10);
  assert(count > 0 && count < 10_000);
  let offset = zip.readUInt32LE(end + 16);
  let result;
  for (let index = 0; index < count; index++) {
    assert(offset + 46 <= end && zip.readUInt32LE(offset) === 0x02014b50, 'Invalid ZIP directory');
    const flags = zip.readUInt16LE(offset + 8), method = zip.readUInt16LE(offset + 10);
    const compressed = zip.readUInt32LE(offset + 20), size = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28), extra = zip.readUInt16LE(offset + 30), comment = zip.readUInt16LE(offset + 32);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name === wanted) {
      assert(!result && !(flags & 1) && size <= 25 * 1024 * 1024, 'Unexpected ZIP member');
      const local = zip.readUInt32LE(offset + 42);
      assert(local + 30 < offset && zip.readUInt32LE(local) === 0x04034b50);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      assert(start + compressed <= offset);
      const bytes = zip.subarray(start, start + compressed);
      result = method === 0 ? Buffer.from(bytes) : method === 8 ? inflateRawSync(bytes, { maxOutputLength: size + 1 }) : undefined;
      assert(result && result.length === size, 'Unsupported/incomplete ZIP member');
    }
    offset += 46 + nameLength + extra + comment;
  }
  assert(result, 'Known release member absent');
  return result;
}

// Read import/export names as evidence of the Windows C++ ABI difference. This
// parser does not execute the image or make an ABI-compatible rebuild claim.
function peSymbols(bytes) {
  const pe = bytes.readUInt32LE(0x3c);
  assert(bytes.toString('ascii', pe, pe + 4) === 'PE\0\0');
  const sectionsCount = bytes.readUInt16LE(pe + 6), optionalSize = bytes.readUInt16LE(pe + 20), optional = pe + 24;
  assert(bytes.readUInt16LE(optional) === 0x20b && sectionsCount < 128, 'Expected AMD64 PE32+');
  const sections = [];
  for (let i = 0; i < sectionsCount; i++) {
    const base = optional + optionalSize + 40 * i;
    sections.push({ rva: bytes.readUInt32LE(base + 12), size: Math.max(bytes.readUInt32LE(base + 8), bytes.readUInt32LE(base + 16)), raw: bytes.readUInt32LE(base + 20) });
  }
  function at(rva, size = 1) {
    const section = sections.find(item => rva >= item.rva && rva + size <= item.rva + item.size);
    const offset = section ? section.raw + rva - section.rva : rva;
    assert(offset >= 0 && offset + size <= bytes.length, 'PE RVA out of file');
    return offset;
  }
  function string(rva) {
    const offset = at(rva), end = bytes.indexOf(0, offset);
    assert(end >= offset && end - offset < 4096);
    return bytes.toString('ascii', offset, end);
  }
  const imports = [];
  const importRva = bytes.readUInt32LE(optional + 112 + 8);
  if (importRva) for (let i = 0; i < 128; i++) {
    const offset = at(importRva + i * 20, 20);
    if (!bytes.readUInt32LE(offset + 12)) break;
    const dll = string(bytes.readUInt32LE(offset + 12));
    const table = bytes.readUInt32LE(offset) || bytes.readUInt32LE(offset + 16), names = [];
    for (let j = 0; j < 100_000; j++) {
      const thunk = bytes.readBigUInt64LE(at(table + j * 8, 8));
      if (!thunk) break;
      if (thunk >> 63n) names.push(`#ordinal-${thunk & 0xffffn}`);
      else names.push(string(Number(thunk) + 2));
    }
    imports.push({ dll, names });
  }
  const exports = [];
  const exportRva = bytes.readUInt32LE(optional + 112);
  if (exportRva) {
    const offset = at(exportRva, 40), count = bytes.readUInt32LE(offset + 24), table = bytes.readUInt32LE(offset + 32);
    assert(count < 100_000);
    for (let i = 0; i < count; i++) exports.push(string(bytes.readUInt32LE(at(table + i * 4, 4))));
  }
  return { imports, exports };
}

async function child(assembly) {
  const isolated = path.resolve(assembly);
  assert(path.dirname(isolated) === path.resolve(os.tmpdir()) && path.basename(isolated).startsWith('ngini-native-replacement-'));
  let sharp;
  try { sharp = (await import(pathToFileURL(path.join(isolated, 'node_modules/sharp/dist/index.mjs')).href)).default; }
  catch (error) {
    process.stdout.write(JSON.stringify({ status: 'LOAD_FAILED', code: error.code ?? null,
      message: String(error.message).replaceAll(isolated, '<isolated-assembly>').slice(0, 2000) }));
    return;
  }
  const { validateImage } = await import(pathToFileURL(path.join(isolated, 'dist/images/validate.js')).href);
  const width = 32, height = 24, channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * channels;
    raw[at] = 40 + x * 4; raw[at + 1] = 45 + y * 5; raw[at + 2] = 65 + x + y;
  }
  const results = [];
  for (const format of ['png', 'jpeg', 'webp']) {
    const encoder = sharp(raw, { raw: { width, height, channels } });
    const encoded = await (format === 'png' ? encoder.png() : format === 'jpeg' ? encoder.jpeg({ quality: 100, chromaSubsampling: '4:4:4' }) : encoder.webp({ lossless: true })).toBuffer();
    const before = hash(encoded);
    const verified = await validateImage(encoded);
    assert.equal(verified.mime, format === 'jpeg' ? 'image/jpeg' : `image/${format}`);
    assert.equal(verified.width, width); assert.equal(verified.height, height); assert.equal(verified.sha256, before);
    assert.equal(hash(encoded), before, 'Production validation changed encoded bytes');
    const decoded = await sharp(encoded).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(decoded.info.channels, channels); assert.equal(decoded.data.length, raw.length);
    const error = decoded.data.reduce((sum, byte, index) => sum + Math.abs(byte - raw[index]), 0) / raw.length;
    assert(format === 'jpeg' ? error < 2 : error === 0, 'Raster roundtrip differs unexpectedly');
    results.push({ format, status: 'PASS', bytes: encoded.length, sha256: before, width, height, mean_absolute_pixel_error: error, production_validator: 'PASS' });
  }
  await assert.rejects(() => validateImage(Buffer.from('HTML or invalid raster')));
  const loaded = process.report.getReport().sharedObjects.filter(item => /(?:libvips|sharp-win32)/i.test(item))
    .map(item => item.replaceAll(isolated, '<isolated-assembly>'));
  process.stdout.write(JSON.stringify({ status: 'PASS', node: process.version, platform: process.platform, arch: process.arch,
    vips: sharp.versions.vips, sharp: sharp.versions.sharp, decode: results, invalid_image_rejected: true, loaded_native_modules: loaded }));
}

async function main() {
  assert.equal(process.platform, 'win32', 'This smoke is specific to the packaged Windows x64 assembly');
  assert.equal(process.arch, 'x64');
  const outputArg = process.argv.indexOf('--out');
  const output = path.resolve(root, outputArg < 0 ? 'docs/native-distribution-smoke.json' : process.argv[outputArg + 1]);
  assert(path.dirname(output) === path.join(root, 'docs') && /^native-distribution-[\w.-]+\.json$/.test(path.basename(output)), 'Output must be a new docs/native-distribution-*.json');
  assert(!existsSync(output), 'Refusing to overwrite prior evidence');
  const sharpRoot = packageRoot(require.resolve('sharp'), 'sharp');
  const nativeEntry = createRequire(path.join(sharpRoot, 'package.json')).resolve('@img/sharp-win32-x64/sharp.node');
  const nativeRoot = packageRoot(nativeEntry, '@img/sharp-win32-x64');
  const before = {};
  for (const name of Object.keys(expected)) {
    before[name] = hash(await readFile(path.join(nativeRoot, 'lib', name)));
    assert.equal(before[name], expected[name], 'Unverified local DLL; not used');
  }
  const zip = await readFile(path.join(root, zipRelative));
  assert.equal(hash(zip), zipSha, 'Unverified official ZIP; no test started');
  const alternate = zipMember(zip, 'vips-dev-8.18/bin/libvips-cpp-42.dll');
  assert.equal(hash(alternate), alternateSha);
  // The package's sharp.node export resolves to index.cjs, which forwards to
  // this actual PE image. Inspecting the wrapper would not inspect the native ABI.
  const nodeBytes = await readFile(path.join(nativeRoot, 'lib/sharp-win32-x64-0.35.5.node'));
  const provenance = JSON.parse(await readFile(path.join(root, 'third_party/native/provenance/sharp-provenance.json'), 'utf8'));
  assert.equal(hash(nodeBytes), provenance.native_files.find(item => item.filename === 'sharp-win32-x64-0.35.5.node').sha256);
  const nodePe = peSymbols(nodeBytes), originalPe = peSymbols(await readFile(path.join(nativeRoot, 'lib/libvips-cpp-8.18.7.dll'))), alternatePe = peSymbols(alternate);
  const needed = nodePe.imports.find(item => item.dll.toLowerCase() === 'libvips-cpp-8.18.7.dll');
  assert(needed && needed.names.length > 0, 'C++ DLL import not observed');
  const missingOriginal = needed.names.filter(name => !originalPe.exports.includes(name));
  const missingAlternate = needed.names.filter(name => !alternatePe.exports.includes(name));
  assert.equal(missingOriginal.length, 0, 'Original C++ DLL misses required imports');
  const assembly = await mkdtemp(path.join(os.tmpdir(), 'ngini-native-replacement-'));
  const nativeTarget = path.join(assembly, 'node_modules/@img/sharp-win32-x64');
  const cppTarget = path.join(nativeTarget, 'lib/libvips-cpp-8.18.7.dll');
  const mainTarget = path.join(nativeTarget, 'lib/libvips-42.dll');
  const started = new Date().toISOString();
  const cases = [];
  function run(name, expectedStatus) {
    const value = JSON.parse(execFileSync(process.execPath, [script, '--child', assembly], { cwd: assembly, timeout: 30_000, maxBuffer: 1024 * 1024, encoding: 'utf8', windowsHide: true }));
    assert.equal(value.status, expectedStatus, `${name}: unexpected loader result`);
    cases.push({ name, expectation: expectedStatus, ...value });
  }
  try {
    await mkdir(path.join(assembly, 'node_modules/@img'), { recursive: true });
    await cp(sharpRoot, path.join(assembly, 'node_modules/sharp'), { recursive: true, dereference: true });
    const sharpRequire = createRequire(path.join(sharpRoot, 'package.json'));
    for (const name of ['@img/colour', 'detect-libc', 'semver']) {
      await cp(packageRoot(sharpRequire.resolve(name), name), path.join(assembly, 'node_modules', name), { recursive: true, dereference: true });
    }
    await cp(nativeRoot, nativeTarget, { recursive: true, dereference: true });
    for (const relative of ['dist/images/validate.js', 'dist/shared/errors.js']) {
      const target = path.join(assembly, relative);
      await mkdir(path.dirname(target), { recursive: true }); await cp(path.join(root, relative), target);
    }
    await writeFile(path.join(assembly, 'package.json'), JSON.stringify({ type: 'module' }));
    run('isolated official assembly: full PNG/JPEG/WebP decode and unchanged original bytes', 'PASS');
    await rm(cppTarget);
    run('missing C++ DLL: loader must fail instead of silently using another package', 'LOAD_FAILED');
    await cp(path.join(nativeRoot, 'lib/libvips-cpp-8.18.7.dll'), cppTarget);
    await rm(mainTarget);
    run('missing main DLL: loader must fail instead of silently using another package', 'LOAD_FAILED');
    await cp(path.join(nativeRoot, 'lib/libvips-42.dll'), mainTarget);
    await writeFile(cppTarget, alternate);
    run('official same-version MinGW C++ DLL renamed to expected filename: incompatible ABI probe', missingAlternate.length ? 'LOAD_FAILED' : 'PASS');
    await cp(path.join(nativeRoot, 'lib/libvips-cpp-8.18.7.dll'), cppTarget);
    run('documented assembly seam: restore matching MSVC bridge then full decode', 'PASS');
  } finally {
    assert(path.dirname(path.resolve(assembly)) === path.resolve(os.tmpdir()) && path.basename(assembly).startsWith('ngini-native-replacement-'));
    await rm(assembly, { recursive: true, force: true });
  }
  for (const name of Object.keys(before)) assert.equal(hash(await readFile(path.join(nativeRoot, 'lib', name))), before[name], 'Source DLL changed');
  const report = { started_at: started, checked_at: new Date().toISOString(), status: 'PASS_ASSEMBLY_SEAM_NOT_NATIVE_REBUILD',
    scope: 'Isolated copy only; missing-library negative controls, official alternate C++ ABI comparison and production PNG/JPEG/WebP validation. No installed extension/source/package changes, compiler, downloads, browser or image-generation requests.',
    command: `node scripts/native-replacement-smoke.mjs --out ${path.relative(root, output).replaceAll('\\', '/')}`,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    verified_inputs: { official_zip: zipRelative, official_zip_sha256: zipSha, local_native_dll_sha256: before, alternate_cpp_sha256: alternateSha,
      copied_production_validator_sha256: hash(await readFile(path.join(root, 'dist/images/validate.js'))), native_node_sha256: hash(nodeBytes) },
    pe_abi_evidence: { imported_cpp_filename: needed.dll, required_named_cpp_exports: needed.names.length,
      packaged_cpp_missing_named_exports: missingOriginal.length, alternate_cpp_missing_named_exports: missingAlternate.length,
      missing_alternate_examples: missingAlternate.slice(0, 8), packaged_cpp_export_examples: originalPe.exports.slice(0, 5), alternate_cpp_export_examples: alternatePe.exports.slice(0, 5) },
    cases, originals_unchanged: true, temporary_copy_removed: true,
    meaningful_scope: 'Removing either DLL prevents loading, restoring the documented assembly permits real decoding, and a different verified upstream C++ DLL is tested rather than treating same-hash copying as proof of modified-library compatibility.',
    modified_interface_compatible_library_rebuild_and_load: 'NOT_RUN', native_compile: 'NOT_RUN', bit_identical_rebuild: 'NOT_RUN',
    legal_certification: 'NOT_PERFORMED', user_extension_replacement: 'NOT_RUN' };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ status: report.status, cases: cases.map(item => ({ name: item.name, result: item.status })),
    missing_alternate_cpp_exports: missingAlternate.length, evidence: path.relative(root, output).replaceAll('\\', '/') }) + '\n');
}

if (process.argv[2] === '--child') await child(process.argv[3]);
else await main();
