import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error Build tooling is native ESM JavaScript, not part of the runtime TypeScript build.
import { RUNTIME_ARTIFACTS, copyRuntimeArtifacts, inspectStagedCandidate } from '../../scripts/runtime-artifacts.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ngini-package-test-'));
  for (const file of RUNTIME_ARTIFACTS) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), 'reviewed build bytes');
  }
  await writeFile(path.join(root, 'dist/server.d.ts'), 'declaration only');
  const stage = path.join(root, 'stage');
  await mkdir(stage);
  return { root, stage };
}

describe('Runtime package boundary', () => {
  it('copies the explicit compiled set and omits declarations', async () => {
    const { root, stage } = await fixture();
    const copied = await copyRuntimeArtifacts(root, stage);
    expect(copied).toEqual(RUNTIME_ARTIFACTS);
    expect(await readFile(path.join(stage, 'dist/bootstrap.js'), 'utf8')).toBe('reviewed build bytes');
    expect(await readdir(path.join(stage, 'dist'))).not.toContain('server.d.ts');
  });

  it.each(['.env.local', 'diagnostic.har', 'debug.log', 'stale-runtime.js'])('rejects an unreviewed build artifact %s', async name => {
    const { root, stage } = await fixture();
    await writeFile(path.join(root, 'dist', name), 'unexpected private build bytes');
    await expect(copyRuntimeArtifacts(root, stage)).rejects.toThrow('Unexpected runtime artifact');
    expect(await readdir(stage)).toEqual([]);
  });

  it('rejects private path names in the actual staged dependency tree', async () => {
    const { stage } = await fixture();
    const dependency = path.join(stage, 'node_modules/example');
    await mkdir(dependency, { recursive: true });
    await writeFile(path.join(dependency, '.env.local'), 'private setting');
    await expect(inspectStagedCandidate(stage)).rejects.toThrow('Private/development path');
  });

  it('checks actual compiled bytes for finite credential patterns', async () => {
    const { stage } = await fixture();
    await mkdir(path.join(stage, 'dist'), { recursive: true });
    await writeFile(path.join(stage, 'dist/server.js'), ['sk', 'a'.repeat(32)].join('-'));
    await expect(inspectStagedCandidate(stage)).rejects.toThrow('Credential pattern');
  });
});
