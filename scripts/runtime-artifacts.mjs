import { cp, lstat, mkdir, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

// Review this list whenever a runtime module is added. Never copy the whole build directory.
export const RUNTIME_ARTIFACTS = Object.freeze([
  'dist/bootstrap.js', 'dist/server.js', 'dist/agent-instructions.js',
  'dist/browser/ngini-adapter.js', 'dist/browser/ngini-dom.js',
  'dist/browser/ngini-port.js', 'dist/browser/ngini-system-state.js',
  'dist/browser/result-tracker.js', 'dist/browser/session.js', 'dist/browser/submission-prompt.js',
  'dist/images/image-store.js', 'dist/images/validate.js',
  'dist/jobs/profile-lock.js', 'dist/jobs/request-store.js', 'dist/jobs/runner.js',
  'dist/jobs/download-cache.js',
  'dist/jobs/state-machine.js', 'dist/shared/config.js', 'dist/shared/errors.js',
  'dist/shared/model-tools.js', 'dist/shared/platform-guard.js',
  'dist/ui/card-contract.js', 'dist/ui/card-polling.js', 'dist/ui/delivery-status.js',
  'dist/ui/image-card.html', 'dist/ui/image-card.js', 'dist/ui/schema-config.js',
  'dist/ui/tool-delivery.js',
]);

export async function inspectRuntimeArtifacts(root) {
  const expected = new Set(RUNTIME_ARTIFACTS);
  const declarations = new Set(RUNTIME_ARTIFACTS.filter(file => file.endsWith('.js'))
    .map(file => file.slice(0, -3) + '.d.ts'));
  const found = new Set();
  async function walk(relative) {
    const absolute = path.join(root, relative);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error('Runtime build contains a symbolic link');
    if (info.isDirectory()) {
      for (const entry of await readdir(absolute)) await walk(`${relative}/${entry}`);
    } else if (info.isFile()) {
      if (!expected.has(relative) && !declarations.has(relative)) {
        throw new Error(`Unexpected runtime artifact: ${relative}`);
      }
      if (expected.has(relative)) found.add(relative);
    } else throw new Error('Runtime build contains a non-file entry');
  }
  await walk('dist');
  for (const file of expected) if (!found.has(file)) throw new Error(`Missing runtime artifact: ${file}`);
  return [...RUNTIME_ARTIFACTS];
}

export async function copyRuntimeArtifacts(root, stage) {
  const files = await inspectRuntimeArtifacts(root);
  for (const relative of files) {
    const destination = path.join(stage, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(root, relative), destination, { dereference: false, errorOnExist: true, force: false });
  }
  return files;
}

/** Check the actual staged bytes as well as the reviewed source tree. */
export async function inspectStagedCandidate(stage) {
  const denied = new Set(['browser-profile', '.runtime', '.git', '.pnpm', '.npmrc', 'cookies', 'history', 'login data']);
  const homes = [homedir(), homedir().replaceAll('\\', '/'), homedir().replaceAll('\\', '\\\\')]
    .map(value => value.toLowerCase());
  const secretPatterns = [/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/, /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bAKIA[A-Z0-9]{16}\b/];
  let checkedFiles = 0;
  let checkedOwnText = 0;
  async function inspect(relative) {
    const absolute = path.join(stage, relative);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error('Staging contains a symbolic link');
    const name = path.basename(relative).toLowerCase();
    if (denied.has(name) || name.startsWith('.env') || /\.(?:log|har)$/i.test(name)) {
      throw new Error(`Private/development path entered staging: ${relative}`);
    }
    if (info.isDirectory()) {
      for (const entry of await readdir(absolute)) await inspect(relative ? `${relative}/${entry}` : entry);
      return;
    }
    if (!info.isFile()) throw new Error('Staging contains a non-file entry');
    checkedFiles++;
    if (!relative.startsWith('node_modules/') && !relative.startsWith('third_party/') &&
        /\.(?:js|html|json|md|txt)$/i.test(name)) {
      const text = await readFile(absolute, 'utf8');
      checkedOwnText++;
      if (homes.some(home => text.toLowerCase().includes(home))) throw new Error('Developer home path in staged own content');
      if (secretPatterns.some(pattern => pattern.test(text))) throw new Error('Credential pattern in staged own content');
    }
  }
  await inspect('');
  return { checkedFiles, checkedOwnText, scope: 'All staged path names and own staged text; finite patterns, not universal secret detection.' };
}
