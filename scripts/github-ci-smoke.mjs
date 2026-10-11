import assert from 'node:assert/strict';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Local metadata/tool preflight only: no build, browser, network or generation.
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--pnpm-cli'),
  'Usage: node scripts/github-ci-smoke.mjs [--pnpm-cli <absolute existing .mjs/.js path>]');
let pnpmCli;
if (args.length === 2) {
  const candidate = args[1];
  assert.ok(candidate && !/[\0\r\n]/.test(candidate) && path.isAbsolute(candidate)
    && /\.(?:mjs|js)$/i.test(candidate), '--pnpm-cli must be an absolute .mjs or .js file path');
  pnpmCli = realpathSync(candidate);
  assert.ok(statSync(pnpmCli).isFile() && /\.(?:mjs|js)$/i.test(pnpmCli),
    '--pnpm-cli must resolve to an existing .mjs or .js file');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const workflow = readFileSync(path.join(root, '.github/workflows/offline.yml'), 'utf8');
const version = workflow.match(/^\s+node-version: '([0-9]+\.[0-9]+\.[0-9]+)'\s*$/m)?.[1];
assert.ok(version, 'CI must pin an exact Node version');
assert.equal(process.versions.node, version, 'Local Node differs from the CI version');
assert.equal(process.platform, 'win32', 'This preflight covers the Windows target only');
assert.equal(process.arch, 'x64', 'This preflight covers the x64 target only');
const manager = metadata.packageManager?.match(/^pnpm@([0-9]+\.[0-9]+\.[0-9]+)$/)?.[1];
assert.ok(manager, 'packageManager must pin an exact pnpm version');
assert.ok(workflow.includes(`npm install --global pnpm@${manager} --ignore-scripts --no-audit --no-fund`),
  'CI must install the matching pnpm without lifecycle scripts');
const actual = spawnSync(pnpmCli ? process.execPath : 'cmd.exe',
  pnpmCli ? [pnpmCli, '--version'] : ['/d', '/s', '/c', 'pnpm --version'], {
  cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10_000,
});
assert.ifError(actual.error);
assert.equal(actual.status, 0, 'pnpm --version failed');
assert.equal(actual.stdout.trim(), manager, 'Installed pnpm differs from packageManager');
for (const [name, pinned] of Object.entries({ ...metadata.dependencies, ...metadata.devDependencies })) {
  assert.match(pinned, /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/, `Dependency must be exact: ${name}`);
}
const pins = [...workflow.matchAll(/^\s+uses: ([A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)@([a-f0-9]{40})(?:\s+#.*)?$/gm)];
assert.equal(pins.length, 2, 'Expected exactly the two reviewed actions');
assert.equal((workflow.match(/^\s+uses:/gm) ?? []).length, pins.length, 'An action lacks a full SHA pin');
assert.deepEqual(pins.map(pin => pin[1]), ['actions/checkout', 'actions/setup-node']);
assert.match(workflow, /^\s+persist-credentials: false\s*$/m);
assert.match(workflow, /^\s+contents: read\s*$/m);
assert.match(workflow, /^\s+runs-on: windows-2025\s*$/m);
assert.match(workflow, /pnpm exec vitest run tests\/unit tests\/integration/);
assert.ok(!/pull_request_target|secrets\.|write-all|contents:\s*write|pnpm run package|tests\/live/.test(workflow),
  'CI must not gain privileged triggers, secrets, publishing or live tests');
for (const flag of ['SESSION', 'CSP', 'DOM']) {
  assert.ok(workflow.includes(`NGINI_${flag}_BROWSER_TEST: '1'`), `Missing controlled ${flag} browser coverage`);
}
console.log(JSON.stringify({
  status: 'PASS', scope: 'Local Windows CI metadata and tool preflight, not a GitHub run',
  node: process.versions.node, pnpm: manager, reviewed_sha_pins: pins.length,
  pnpm_source: pnpmCli ? 'explicit_cli' : 'path_command',
  live_submissions: 0, browser_launched: false,
}));
