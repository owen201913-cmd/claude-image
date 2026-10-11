import { readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const roots = ['src', 'tests', 'scripts', '.github', 'third_party'];
const documents = ['README.md', 'README.en.md', 'PRIVACY.md', 'SECURITY.md', 'LICENSE', 'CHANGELOG.md',
  'CONTRIBUTING.md', 'package.json', 'manifest.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
  'tsconfig.json', 'tsconfig.ui.json', 'vitest.config.ts', '.gitignore', '.gitattributes', '.npmrc'];
for (const item of await readdir(path.join(root, 'docs'), { withFileTypes: true })) {
  if (item.isFile() && item.name.endsWith('.md')) documents.push(`docs/${item.name}`);
}
const findings = [];
const homes = [homedir(), homedir().replaceAll('\\', '/'), homedir().replaceAll('\\', '\\\\')].map(s => s.toLowerCase());
const secrets = [/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/g, /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\bAKIA[A-Z0-9]{16}\b/g];
let files = 0;
async function inspect(relative) {
  const absolute = path.join(root, relative);
  const info = await lstat(absolute);
  if (info.isSymbolicLink()) { findings.push({file: relative, kind: 'symlink'}); return; }
  if (info.isDirectory()) {
    for (const item of await readdir(absolute, {withFileTypes: true})) {
      if (item.isSymbolicLink()) { findings.push({file: relative, kind: 'symlink'}); continue; }
      if (['native-source', 'archive', '__pycache__'].includes(item.name)) continue;
      if (item.isDirectory() || relative.startsWith('third_party') || /\.(?:ts|mjs|js|py|md|json|html|txt|yml|yaml)$/.test(item.name)) await inspect(path.join(relative, item.name));
    }
    return;
  }
  const text = await readFile(absolute, 'utf8'); files++;
  if (homes.some(home => text.toLowerCase().includes(home))) findings.push({file: relative, kind: 'machine-home-path'});
  for (const pattern of secrets) { pattern.lastIndex = 0; if(pattern.test(text)) findings.push({file: relative, kind: 'credential-pattern'}); }
}
for (const name of [...roots, ...documents]) {
  try { await inspect(name); } catch(error) { if(error.code !== 'ENOENT') throw error; findings.push({file:name,kind:'missing-required-file'}); }
}
if(metadata.version !== manifest.version) findings.push({file:'manifest.json',kind:'version-mismatch'});
if(metadata.license !== 'MIT' || !(await readFile(path.join(root,'LICENSE'),'utf8')).startsWith('MIT License')) findings.push({file:'LICENSE',kind:'project-license-mismatch'});
const report = {status: findings.length ? 'FAIL' : 'PASS', version: metadata.version,
  checked_at: new Date().toISOString(), files_scanned: files, findings,
  scope:'Allowlisted first-party source/docs, private-key/token patterns and developer home paths. No third-party binary or universal-secret guarantee.',
  live_submissions:0, published:false};
await writeFile(path.join(root,'docs','release-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(findings.length) process.exitCode = 1;
