// Export only reviewed source. This command never publishes or runs the bridge.
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestName = 'PUBLIC_SOURCE_MANIFEST.json';
const roots = ['src', 'tests', 'scripts', '.github', 'third_party/native'];
const excludedSubtrees = ['third_party/native/recipes/build-win64-mxe'];
const rootFiles = ['README.md', 'README.en.md', 'PRIVACY.md', 'SECURITY.md',
  'CHANGELOG.md', 'CONTRIBUTING.md', 'LICENSE', 'package.json', 'manifest.json',
  'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'tsconfig.ui.json',
  'vitest.config.ts', '.gitignore', '.gitattributes', '.npmrc', 'third_party/npm-packages.json',
  'companion-instructions/ngini-image-replies.txt'];
const sourceExtensions = new Set(['.ts', '.mjs', '.js', '.py', '.json', '.html', '.md',
  '.txt', '.yml', '.yaml', '.sh', '.mk', '.patch', '.svg']);
const excluded = new Set(['.git', '.runtime', 'node_modules', 'dist', 'release',
  'native-source', '__pycache__', 'browser-profile', 'outputs', 'logs', 'tmp',
  'debug', 'coverage', 'test-results', 'playwright-report']);
const secretPatterns = [/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, /\bAKIA[A-Z0-9]{16}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
const sha256 = data => createHash('sha256').update(data).digest('hex');

function safeRelative(relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') ||
      relative.includes(':') || relative.includes('\0') || path.posix.isAbsolute(relative) ||
      relative.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Unsafe source-relative path');
  }
  const parts = relative.split('/');
  if (parts.some(part => excluded.has(part) || /^\.env(?:[._-]|$)/i.test(part)) ||
      relative.startsWith('docs/archive/')) throw new Error('Private/generated path in source export');
  return relative;
}

function checkedTarget(input) {
  const target = path.resolve(root, input);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative) ||
      !['release', '.runtime'].includes(relative.split(path.sep)[0]) ||
      relative.split(path.sep).length < 2) {
    throw new Error('Export target must be a child of this project release or .runtime directory');
  }
  return target;
}

async function assertNoLinks(target) {
  const relative = path.relative(root, target);
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Export path contains a symbolic link');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

async function sourceInventory() {
  const names = new Set(rootFiles);
  async function walk(relative) {
    // This upstream snapshot has no confirmed standalone license. Preserve its
    // URL/hash and collector, but omit the copied recipes from the source export.
    if (excludedSubtrees.some(prefix => relative === prefix || relative.startsWith(`${prefix}/`))) return;
    const info = await lstat(path.join(root, relative));
    if (info.isSymbolicLink()) throw new Error('Source export refuses symbolic links');
    if (info.isDirectory()) {
      for (const item of await readdir(path.join(root, relative), { withFileTypes: true })) {
        if (excluded.has(item.name)) continue;
        if (item.isSymbolicLink()) throw new Error('Source export refuses symbolic links');
        if (relative === 'docs' && (item.isDirectory() || path.extname(item.name) !== '.md')) continue;
        const next = `${relative}/${item.name}`;
        if (item.isDirectory() || relative.startsWith('third_party/native') ||
            sourceExtensions.has(path.extname(item.name))) await walk(next);
      }
    } else if (info.isFile()) names.add(safeRelative(relative));
    else throw new Error('Unexpected non-file source input');
  }
  for (const relative of roots) await walk(relative);
  await walk('docs');
  const homes = [homedir(), homedir().replaceAll('\\', '/'), homedir().replaceAll('\\', '\\\\')]
    .map(value => value.toLowerCase());
  const result = [];
  for (const name of [...names].sort()) {
    safeRelative(name);
    const file = path.join(root, name);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error('Required source input is not a regular file');
    }
    let data = await readFile(file);
    const text = data.toString('utf8');
    if (homes.some(home => text.toLowerCase().includes(home)) ||
        secretPatterns.some(pattern => pattern.test(text))) {
      throw new Error(`Private path or credential pattern found in ${name}`);
    }
    // First-party text matches the Git attributes. Upstream checksummed bytes stay exact.
    if (!name.startsWith('third_party/')) data = Buffer.from(text.replaceAll('\r\n', '\n'));
    result.push({ name, data, bytes: data.length, sha256: sha256(data) });
  }
  return result;
}

async function verify(target) {
  await assertNoLinks(target);
  const manifestData = await readFile(path.join(target, manifestName));
  const manifest = JSON.parse(manifestData.toString('utf8'));
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.files) ||
      !manifest.files.length || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(manifest.version) ||
      manifest.artifact_kind !== 'source-only-development' || manifest.published !== false) {
    throw new Error('Unexpected public source manifest');
  }
  const expected = new Set([manifestName]);
  const caseInsensitive = new Set([manifestName.toLowerCase()]);
  for (const entry of manifest.files) {
    safeRelative(entry.name);
    if (caseInsensitive.has(entry.name.toLowerCase()) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 ||
        !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid source manifest entry');
    expected.add(entry.name);
    caseInsensitive.add(entry.name.toLowerCase());
    const file = path.join(target, entry.name);
    await assertNoLinks(file);
    const info = await lstat(file);
    if (!info.isFile()) throw new Error('Source manifest target is not a regular file');
    const data = await readFile(file);
    if (data.length !== entry.bytes || sha256(data) !== entry.sha256) {
      throw new Error(`Export bytes changed: ${entry.name}`);
    }
  }
  async function inspect(directory, relative = '') {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (!relative && item.name === '.git' && item.isDirectory()) continue;
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (item.isSymbolicLink()) throw new Error('Export contains a symbolic link');
      if (item.isDirectory()) await inspect(path.join(directory, item.name), name);
      else if (!expected.has(name)) throw new Error(`Unexpected export file: ${name}`);
    }
  }
  await inspect(target);
  return { status: 'PASS', version: manifest.version, files: manifest.files.length,
    directory: path.relative(root, target).replaceAll(path.sep, '/'),
    manifest_sha256: sha256(manifestData), live_submissions: 0, published: false,
    scope: 'Clean source export hashes and exact file inventory; not a complete secret/license review' };
}

const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(metadata.version)) throw new Error('Unsafe version');
const args = process.argv.slice(2);
let target;
if (args[0] === '--verify' && args.length === 2) {
  target = checkedTarget(args[1]);
} else if (args.length === 0 || (args[0] === '--out' && args.length === 2)) {
  target = checkedTarget(args[1] ?? `release/github-ready-${metadata.version}`);
  await assertNoLinks(target);
  try { await lstat(target); throw new Error('Refusing to overwrite an existing source export'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const files = await sourceInventory();
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.pending-${randomUUID()}`;
  await mkdir(temporary);
  for (const file of files) {
    await mkdir(path.dirname(path.join(temporary, file.name)), { recursive: true });
    await writeFile(path.join(temporary, file.name), file.data, { flag: 'wx' });
  }
  await writeFile(path.join(temporary, manifestName), JSON.stringify({
    schema_version: 1, version: metadata.version, artifact_kind: 'source-only-development',
    published: false, excluded_upstream_subtrees: excludedSubtrees,
    files: files.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
  }, null, 2) + '\n', { flag: 'wx' });
  await verify(temporary);
  await rename(temporary, target);
} else throw new Error('Usage: node scripts/export-github.mjs [--out relative-directory | --verify relative-directory]');
console.log(JSON.stringify(await verify(target)));
