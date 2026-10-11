import { cp, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNativeManifest, copyNativeMaterials, verifyStagedNativeMaterials } from './native-distribution.mjs';
import { inspectRuntimeArtifacts, copyRuntimeArtifacts, inspectStagedCandidate } from './runtime-artifacts.mjs';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const requireRoot = createRequire(path.join(root, 'package.json'));
const sourcePackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
if (sourcePackage.version !== manifest.version) throw new Error('Manifest/package versions differ');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This candidate packages Windows x64 native dependencies only');
await inspectRuntimeArtifacts(root);
const release = path.join(root, 'release');
await mkdir(release, { recursive: true });
const output = path.join(release, `${sourcePackage.name}-${sourcePackage.version}-win32.mcpb`);
for (const existing of [output, `${output}.sha256`]) {
  try {
    await stat(existing);
    throw new Error('Candidate version already exists; use a new version instead of replacing release evidence');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
await buildNativeManifest(root);
const stage = path.join(release, `stage-${manifest.version}-${randomUUID().slice(0, 8)}`);
await mkdir(stage);
const copied = new Map();
const topLevel = new Map();
const licenses = new Map();

function safeDestination(destination) {
  const relative = path.relative(stage, path.resolve(destination));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Staging path escaped');
  return destination;
}

async function resolvePackage(name, from) {
  if (!/^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name)) throw new Error('Invalid dependency name');
  const localRequire = createRequire(path.join(from, 'package.json'));
  for (const directory of localRequire.resolve.paths(name) || []) {
    try {
      const packageRoot = await realpath(path.join(directory, name));
      const metadata = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
      if (metadata.name === name) return { directory: packageRoot, metadata };
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
  }
  return undefined;
}

async function copyDependency(name, resolved, parentDestination, ancestors = new Map()) {
  const key = `${name}@${resolved.metadata.version}`;
  if (ancestors.get(name) === resolved.metadata.version) return;
  const rootVersion = topLevel.get(name);
  if (rootVersion === resolved.metadata.version && copied.has(path.join(stage, 'node_modules', name))) return;
  if (!rootVersion) topLevel.set(name, resolved.metadata.version);
  const destination = safeDestination(path.join(
    rootVersion && rootVersion !== resolved.metadata.version ? parentDestination : stage,
    'node_modules', name,
  ));
  if (copied.get(destination) === key) return;
  if (copied.has(destination)) throw new Error(`Dependency version conflict at ${name}`);
  copied.set(destination, key);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(resolved.directory, destination, {
    recursive: true, dereference: true,
    filter: (file) => !path.relative(resolved.directory, file).split(path.sep).includes('node_modules'),
  });
  const licenseValue = resolved.metadata.license;
  licenses.set(key, {
    name, version: resolved.metadata.version,
    license: typeof licenseValue === 'string' ? licenseValue : JSON.stringify(licenseValue || 'UNKNOWN'),
  });
  const nextAncestors = new Map(ancestors);
  nextAncestors.set(name, resolved.metadata.version);
  const dependencies = {
    ...resolved.metadata.peerDependencies,
    ...resolved.metadata.dependencies,
    ...resolved.metadata.optionalDependencies,
  };
  for (const dependency of Object.keys(dependencies)) {
    const optional = Boolean(resolved.metadata.optionalDependencies?.[dependency] ||
      resolved.metadata.peerDependenciesMeta?.[dependency]?.optional);
    const child = await resolvePackage(dependency, resolved.directory);
    if (!child) {
      if (optional) continue;
      throw new Error(`Missing installed runtime dependency ${key}: ${dependency}`);
    }
    await copyDependency(dependency, child, destination, nextAncestors);
  }
}

// Declare root versions first so dependencies cannot replace the pinned roots.
const roots = [];
for (const name of Object.keys(sourcePackage.dependencies || {})) {
  const resolved = await resolvePackage(name, root);
  if (!resolved) throw new Error(`Missing runtime dependency: ${name}`);
  topLevel.set(name, resolved.metadata.version);
  roots.push({ name, resolved });
}

// Copy from an explicit allowlist. Profiles, outputs, sources, tests and logs never enter staging.
for (const file of ['manifest.json', 'README.md', 'README.en.md', 'PRIVACY.md', 'SECURITY.md', 'CHANGELOG.md', 'CONTRIBUTING.md',
  'companion-instructions/ngini-image-replies.txt']) {
  const destination = safeDestination(path.join(stage, file));
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, file), destination, { dereference: true });
}
try { await cp(path.join(root, 'LICENSE'), safeDestination(path.join(stage, 'LICENSE'))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
try { await cp(path.join(root, 'third_party'), safeDestination(path.join(stage, 'third_party')), {
  recursive: true, dereference: true,
  filter: file => !['native-source', 'native'].includes(path.relative(path.join(root, 'third_party'), file).split(path.sep)[0]),
}); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await copyNativeMaterials(stage, root);
await copyRuntimeArtifacts(root, stage);
await mkdir(path.join(stage, 'docs'));
for (const file of ['feasibility.md', 'compatibility.md', 'testing.md', 'architecture.md', 'release-checklist.md',
  'contributing.md', 'github-preparation.md', 'native-distribution-review.md', 'release-candidate.md', 'source-rehearsal.md',
  'github-install-audit-rc4.md', 'rc5-audit-resolution.md', 'rc6-audit-resolution.md', 'acceptance-rc6.md',
  'rc6-host-supplement-20261010.md', 'rc7-audit-resolution.md', 'acceptance-rc7.md',
  'rc7-host-supplement-20261010.md', 'rc8-audit-resolution.md', 'acceptance-rc8.md',
  'rc8-host-supplement-20261010.md', 'image-only-host-boundary-rc8.md',
  'acceptance-rc9.md', 'rc9-card-result-boundary.md',
  'acceptance-rc10.md', 'rc10-card-result-boundary.md',
  'acceptance-rc11.md', 'host-result-compatibility.md',
  'image-only-setup.md', 'response-instructions-trial.md', 'acceptance-rc12.md',
  'acceptance-0.1.0.md', 'native-qa-waiver-20261012.md', 'release-0.1.0.md']) {
  await cp(path.join(root, 'docs', file), safeDestination(path.join(stage, 'docs', file)));
}
try { await cp(path.join(root, 'docs', 'third-party-notices.md'), safeDestination(path.join(stage, 'docs', 'third-party-notices.md'))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(path.join(stage, 'package.json'), `${JSON.stringify({
  name: sourcePackage.name, version: sourcePackage.version, private: true, type: 'module',
  license: sourcePackage.license || 'UNLICENSED', engines: sourcePackage.engines,
  dependencies: sourcePackage.dependencies,
}, null, 2)}\n`);
for (const entry of roots) await copyDependency(entry.name, entry.resolved, stage);
await writeFile(path.join(stage, 'THIRD_PARTY_NOTICES.json'), `${JSON.stringify({
  candidateLicense: sourcePackage.license || 'UNLICENSED',
  note: 'Package license files are retained. UNKNOWN entries require review before public release.',
  packages: [...licenses.values()].sort((a, b) => a.name.localeCompare(b.name)),
}, null, 2)}\n`);

const stagingAudit = await inspectStagedCandidate(stage);
await verifyStagedNativeMaterials(stage, root);
const cliPackage = await resolvePackage('@anthropic-ai/mcpb', root);
if (!cliPackage) throw new Error('Install pinned @anthropic-ai/mcpb as a development dependency to validate and pack');
const bin = typeof cliPackage.metadata.bin === 'string' ? cliPackage.metadata.bin : cliPackage.metadata.bin?.mcpb;
if (!bin) throw new Error('MCPB CLI entry missing');
const cli = path.resolve(cliPackage.directory, bin);
for (const args of [['validate', path.join(stage, 'manifest.json')], ['pack', stage, output]]) {
  const processResult = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  if (processResult.stdout) process.stderr.write(processResult.stdout);
  if (processResult.stderr) process.stderr.write(processResult.stderr);
  if (processResult.error) throw processResult.error;
  if (processResult.status !== 0) throw new Error(`MCPB ${args[0]} failed`);
}
const hash = createHash('sha256').update(await readFile(output)).digest('hex');
await writeFile(`${output}.sha256`, `${hash}  ${path.basename(output)}\n`);
await writeFile(path.join(release, 'latest-candidate.json'), `${JSON.stringify({
  version: sourcePackage.version, filename: path.basename(output), bytes: (await stat(output)).size,
  sha256: hash, stageDirectory: path.basename(stage), packages: licenses.size,
  stagingAudit,
  status: sourcePackage.version.includes('-') ? 'RELEASE_CANDIDATE_ACCEPTANCE_IN_PROGRESS'
    : 'LOCAL_RELEASE_READY_WITH_DOCUMENTED_LIMITATIONS',
}, null, 2)}\n`);
process.stderr.write(`Packaged ${path.basename(output)}; SHA-256 ${hash}\n`);
