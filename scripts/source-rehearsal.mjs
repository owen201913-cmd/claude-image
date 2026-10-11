import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// An isolated project rehearsal, not a clean Windows or Claude installation test.
// No source files, installed extensions, normal browser profiles, or global settings are changed.
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
  if (!['--pnpm-cli', '--source-zip'].includes(args[index]) || !args[index + 1]) {
    throw new Error('Usage: node scripts/source-rehearsal.mjs --pnpm-cli <pnpm.mjs> [--source-zip <frozen-source.zip>]');
  }
  if (options.has(args[index])) throw new Error('Duplicate option');
  options.set(args[index], args[index + 1]);
}
if (process.platform !== 'win32') throw new Error('This rehearsal targets the Windows candidate only');
if (!options.has('--pnpm-cli')) throw new Error('Provide the existing trusted pnpm CLI with --pnpm-cli');
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const archive = path.resolve(root, options.get('--source-zip') || `release/${metadata.name}-${metadata.version}-source.zip`);
const pnpmCli = path.resolve(options.get('--pnpm-cli'));
await stat(pnpmCli);
const archiveBytes = await readFile(archive);
const archiveHash = createHash('sha256').update(archiveBytes).digest('hex');
const expectedHash = (await readFile(`${archive}.sha256`, 'utf8')).trim().split(/\s+/)[0];
if (!/^[a-f0-9]{64}$/.test(expectedHash) || archiveHash !== expectedHash) throw new Error('Source archive SHA-256 does not match its sidecar');
const runId = `source-rehearsal-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
// Keep nested pnpm/native-license paths short without changing the machine's long-path settings.
const run = path.join(root, '.runtime', `sr-${randomUUID().slice(0, 8)}`);
const project = path.join(run, 'source', metadata.name);
const store = path.join(run, 'pnpm-store');
const home = path.join(run, 'home');
const logs = path.join(run, 'logs');
const data = path.join(run, 'tool-data');
const localAppData = path.join(home, 'AppData', 'Local');
for (const directory of [run, logs, store, home, localAppData, path.join(home, 'AppData', 'Roaming'), path.join(run, 'temp'), data]) {
  await mkdir(directory, { recursive: true });
}
const userConfig = path.join(run, 'empty-user.npmrc');
const globalConfig = path.join(run, 'empty-global.npmrc');
await writeFile(userConfig, '');
await writeFile(globalConfig, '');
const windows = process.env.SystemRoot || process.env.WINDIR;
if (!windows) throw new Error('Windows SystemRoot is unavailable');
const powershell = path.join(windows, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const childEnv = {};
for (const name of ['SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS']) {
  if (process.env[name]) childEnv[name] = process.env[name];
}
Object.assign(childEnv, {
  PATH: [path.dirname(process.execPath), path.join(windows, 'System32'), path.dirname(powershell)].join(path.delimiter),
  CI: 'true', USERPROFILE: home, HOME: home, APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: localAppData,
  TEMP: path.join(run, 'temp'), TMP: path.join(run, 'temp'), PNPM_HOME: path.join(run, 'pnpm-home'),
  XDG_CONFIG_HOME: path.join(home, 'config'), XDG_DATA_HOME: path.join(home, 'data'), XDG_CACHE_HOME: path.join(home, 'cache'),
  NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig, NPM_CONFIG_CACHE: path.join(run, 'npm-cache'),
  NGINI_FIXTURE_MODE: '1', NGINI_DATA_DIR: data, NGINI_OUTPUT_DIR: path.join(data, 'outputs'),
  NGINI_CSP_BROWSER_TEST: '0', NGINI_SESSION_BROWSER_TEST: '0',
});
const report = {
  status: 'RUNNING', started_at: new Date().toISOString(), scope: 'Fresh project and pnpm store from a frozen source archive; NOT a clean OS or Claude Desktop test',
  source: { version: metadata.version, archive: path.basename(archive), bytes: archiveBytes.length, sha256: archiveHash },
  isolation: { runtime_directory: path.relative(root, run).split(path.sep).join('/'), fresh_dependency_store: true, existing_node_modules_copied: false,
    existing_build_copied: false, empty_user_and_global_npm_config: true, child_environment_allowlisted: true,
    browser_tests_disabled: true, tool_data_isolated: true, global_changes: false },
  assumptions: { platform: process.platform, architecture: process.arch, node: process.version, pnpm: null,
    node_and_pnpm_preinstalled: true, archive_extractor: 'Windows PowerShell + .NET System.IO.Compression',
    network: 'Ordinary npm registry dependency downloads only; lockfile integrity verification remains enabled',
    approved_dependency_build_scripts: ['esbuild'] },
  not_run: ['Clean Windows installation', 'Node/pnpm installation on a clean OS', 'Claude installation, restart, update, uninstall',
    'Actual Claude App preview/download', 'Installed Edge/headless browser tests', 'Ngini network or generation', 'Native dependency rebuild from source'],
  live_submissions: 0, steps: [],
};
const reportPath = path.join(root, 'docs', `${runId}.json`);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const relativeRun = value => path.relative(run, value).split(path.sep).join('/');
async function checkpoint() { await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`); }

async function command(name, executable, commandArgs, { cwd = project, timeoutMs = 120000, env = {} } = {}) {
  const started = Date.now();
  const logFile = path.join(logs, `${name}.log`);
  const output = createWriteStream(logFile, { flags: 'wx' });
  console.log(JSON.stringify({ step: name, status: 'RUNNING' }));
  const child = spawn(executable, commandArgs, { cwd, env: { ...childEnv, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.pipe(output, { end: false });
  child.stderr.pipe(output, { end: false });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    // Only this command's process tree is stopped; no other tools or applications are targeted.
    const killer = spawn(path.join(windows, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'],
      { env: childEnv, stdio: 'ignore', windowsHide: true });
    killer.on('error', () => child.kill());
  }, timeoutMs);
  const outcome = await new Promise(resolve => {
    child.once('error', error => resolve({ exit_code: null, spawn_error: error.code || 'SPAWN_FAILED' }));
    child.once('close', (code, signal) => resolve({ exit_code: code, signal }));
  });
  clearTimeout(timer);
  await new Promise(resolve => output.end(resolve));
  const step = { name, status: outcome.exit_code === 0 && !timedOut ? 'PASS' : 'FAIL', ...outcome,
    timed_out: timedOut, timeout_ms: timeoutMs, elapsed_ms: Date.now() - started, log: relativeRun(logFile) };
  report.steps.push(step);
  await checkpoint();
  console.log(JSON.stringify(step));
  if (step.status !== 'PASS') throw new Error(`${name} failed; inspect its private runtime log`);
  return await readFile(logFile, 'utf8');
}

// Extraction validates every path before writing. Reject links, duplicate names and private/runtime data.
const extractScript = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archivePath = $env:NGINI_REHEARSAL_ARCHIVE
$destination = [IO.Path]::GetFullPath($env:NGINI_REHEARSAL_DESTINATION)
$prefix = $env:NGINI_REHEARSAL_PREFIX
$zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $total = 0L
  if ($zip.Entries.Count -gt 10000) { throw 'Archive has too many entries' }
  foreach ($entry in $zip.Entries) {
    $name = $entry.FullName
    if ($name.Contains('\') -or $name.StartsWith('/') -or $name.Contains(':')) { throw 'Invalid archive path' }
    $parts = $name.Split('/')
    if ($parts -contains '..' -or $parts -contains '.' -or $parts -contains '.runtime' -or $parts -contains 'browser-profile' -or $parts -contains 'native-source') { throw 'Private or escaping archive path' }
    if ($prefix -and -not $name.StartsWith($prefix + '/', [StringComparison]::Ordinal)) { throw 'Unexpected source archive root' }
    if (-not $seen.Add($name)) { throw 'Duplicate archive path' }
    if ((($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960) { throw 'Archive symlink is not allowed' }
    $target = [IO.Path]::GetFullPath([IO.Path]::Combine($destination, $name.Replace('/', [IO.Path]::DirectorySeparatorChar)))
    if (-not $target.StartsWith($destination + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive destination escaped' }
    $total += $entry.Length
    if ($total -gt 157286400) { throw 'Archive uncompressed size exceeds rehearsal limit' }
  }
  foreach ($entry in $zip.Entries) {
    $target = [IO.Path]::Combine($destination, $entry.FullName.Replace('/', [IO.Path]::DirectorySeparatorChar))
    $longTarget = '\\?\' + $target
    if ($entry.FullName.EndsWith('/')) { [IO.Directory]::CreateDirectory($longTarget) | Out-Null; continue }
    [IO.Directory]::CreateDirectory('\\?\' + [IO.Path]::GetDirectoryName($target)) | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $longTarget, $false)
  }
  [Console]::WriteLine('{"entries":' + $zip.Entries.Count + ',"uncompressed_bytes":' + $total + '}')
} finally { $zip.Dispose() }
`;
async function extract(name, archiveFile, destination, prefix = '') {
  await mkdir(destination, { recursive: true });
  const text = await command(name, powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(extractScript, 'utf16le').toString('base64')],
    { cwd: run, timeoutMs: 60000, env: { NGINI_REHEARSAL_ARCHIVE: archiveFile, NGINI_REHEARSAL_DESTINATION: destination, NGINI_REHEARSAL_PREFIX: prefix } });
  const summary = text.split(/\r?\n/).find(line => line.startsWith('{"entries":'));
  if (!summary) throw new Error('Archive extraction did not return its summary');
  return JSON.parse(summary);
}
async function runtimeInventory(directory) {
  const entries = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Unexpected runtime link');
      if (entry.isDirectory()) await walk(file);
      else if (/\.(?:js|html)$/.test(entry.name)) entries.push({ path: path.relative(directory, file).split(path.sep).join('/'), sha256: sha(await readFile(file)) });
    }
  }
  await walk(directory);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

try {
  report.extraction = await extract('extract-source', archive, path.join(run, 'source'), metadata.name);
  const copiedMetadata = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
  if (copiedMetadata.version !== metadata.version) throw new Error('Frozen source and current version differ');
  for (const key of ['preinstall', 'install', 'postinstall', 'prepare']) {
    if (copiedMetadata.scripts?.[key]) throw new Error('Unreviewed project install lifecycle script');
  }
  const workspace = await readFile(path.join(project, 'pnpm-workspace.yaml'), 'utf8');
  const builds = workspace.match(/^allowBuilds:\s*\r?\n((?:[ \t]+[^\r\n]+\r?\n?)*)/m)?.[1];
  if (!builds || builds.trim().replace(/\s+/g, ' ') !== 'esbuild: true') throw new Error('Dependency build allowlist must contain only esbuild');
  const lockPath = path.join(project, 'pnpm-lock.yaml');
  const lockBefore = sha(await readFile(lockPath));
  report.assumptions.pnpm = (await command('pnpm-version', process.execPath, [pnpmCli, '--version'], { timeoutMs: 15000 })).trim();
  if (copiedMetadata.packageManager !== `pnpm@${report.assumptions.pnpm}`) throw new Error('Existing pnpm does not match the pinned packageManager');
  await command('frozen-install', process.execPath, [pnpmCli, 'install', '--frozen-lockfile', '--store-dir', store], { timeoutMs: 240000 });
  report.lockfile = { before_sha256: lockBefore, after_sha256: sha(await readFile(lockPath)) };
  if (report.lockfile.before_sha256 !== report.lockfile.after_sha256) throw new Error('Frozen install changed the lockfile');
  await command('build', process.execPath, [pnpmCli, 'run', 'build']);
  const testFile = path.join(run, 'vitest-results.json');
  await command('offline-tests', process.execPath, [pnpmCli, 'exec', 'vitest', 'run', '--reporter=json', '--outputFile', testFile], { timeoutMs: 180000 });
  const tests = JSON.parse(await readFile(testFile, 'utf8'));
  report.tests = { success: tests.success, total: tests.numTotalTests, passed: tests.numPassedTests, failed: tests.numFailedTests,
    pending: tests.numPendingTests, files: tests.testResults.length,
    skipped_cases: tests.testResults.flatMap(file => file.assertionResults.filter(item => item.status === 'pending' || item.status === 'skipped').map(item => item.fullName)) };
  if (!tests.success || tests.numFailedTests) throw new Error('Offline test results contain a failure');
  await command('source-fixture-stdio', process.execPath, [pnpmCli, 'run', 'test:protocol']);
  report.source_protocol = JSON.parse(await readFile(path.join(project, 'docs', 'protocol-smoke.json'), 'utf8'));
  await command('source-release-audit', process.execPath, [pnpmCli, 'run', 'verify:release']);
  report.release_audit = JSON.parse(await readFile(path.join(project, 'docs', 'release-audit.json'), 'utf8'));
  await command('package-candidate', process.execPath, [pnpmCli, 'run', 'package'], { timeoutMs: 120000 });
  report.candidate = JSON.parse(await readFile(path.join(project, 'release', 'latest-candidate.json'), 'utf8'));
  const candidateDirectory = path.join(run, 'candidate');
  report.candidate_extraction = await extract('extract-candidate', path.join(project, 'release', report.candidate.filename), candidateDirectory);
  await command('candidate-fixture-stdio', process.execPath, [path.join(project, 'scripts', 'protocol-smoke.mjs'), path.join(candidateDirectory, 'dist', 'bootstrap.js')]);
  report.candidate_protocol = JSON.parse(await readFile(path.join(project, 'docs', 'candidate-protocol-smoke.json'), 'utf8'));
  const reference = path.join(root, 'release', `${metadata.name}-${metadata.version}-win32.mcpb`);
  const referenceDirectory = path.join(run, 'frozen-candidate');
  report.reference_extraction = await extract('extract-frozen-candidate', reference, referenceDirectory);
  const rebuiltFiles = await runtimeInventory(path.join(candidateDirectory, 'dist'));
  const frozenFiles = await runtimeInventory(path.join(referenceDirectory, 'dist'));
  report.runtime_match = { status: JSON.stringify(rebuiltFiles) === JSON.stringify(frozenFiles) ? 'PASS' : 'FAIL',
    rebuilt_files: rebuiltFiles.length, frozen_files: frozenFiles.length, inventory_sha256: sha(JSON.stringify(rebuiltFiles)),
    reference_archive: path.basename(reference), reference_sha256: sha(await readFile(reference)),
    scope: 'All own runtime JavaScript and HTML paths and bytes; archive ZIP bytes and dependency inventory are separate' };
  if (report.runtime_match.status !== 'PASS') throw new Error('Rebuilt runtime differs from the frozen candidate');
  for (const evidence of [report.source_protocol, report.candidate_protocol, report.release_audit]) {
    if (evidence.status !== 'PASS' || evidence.live_submissions !== 0) throw new Error('Required isolated evidence did not pass without live submissions');
  }
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  // Raw child output is private under .runtime; the shareable report contains no absolute local paths.
  report.failure = { message: String(error.message).replace(/[A-Za-z]:[\\/][^\r\n]*/g, '[local path]') };
  process.exitCode = 1;
} finally {
  report.finished_at = new Date().toISOString();
  report.elapsed_ms = Date.parse(report.finished_at) - Date.parse(report.started_at);
  await checkpoint();
  console.log(JSON.stringify({ status: report.status, report: `docs/${path.basename(reportPath)}`, elapsed_ms: report.elapsed_ms, live_submissions: 0 }));
}
