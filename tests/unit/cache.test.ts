import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageStore, MAX_TRANSPORT_PREVIEW_BYTES, PREVIEW_CACHE_POLICY } from '../../src/images/image-store.js';
import { cleanupDownloadCache, createDownloadTemporary, DOWNLOAD_CACHE_POLICY } from '../../src/jobs/download-cache.js';
import { RequestStore } from '../../src/jobs/request-store.js';

const roots: string[] = [];
const deadPid = 2147483647;
async function folder(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ngini-cache-offline-'));
  roots.push(directory);
  return directory;
}
afterEach(async () => {
  const temporary = await realpath(tmpdir());
  for (const directory of roots.splice(0)) {
    const resolved = await realpath(directory);
    const relative = path.relative(temporary, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep) || !relative.startsWith('ngini-cache-offline-')) {
      throw new Error('Unsafe cache fixture cleanup');
    }
    await rm(resolved, { recursive: true, force: true });
  }
});
async function png(): Promise<Buffer> {
  return sharp({ create: { width: 96, height: 64, channels: 3, background: '#de9d42' } }).png().toBuffer();
}
async function staleDownload(root: string, age: number, bytes = Buffer.from('partial download')) {
  const temporary = await createDownloadTemporary(root);
  const directory = path.dirname(temporary.filename);
  await writeFile(temporary.filename, bytes);
  const ownerFile = path.join(directory, '.ngini-download-owner.json');
  const owner = JSON.parse(await readFile(ownerFile, 'utf8')) as Record<string, unknown>;
  await writeFile(ownerFile, JSON.stringify({ ...owner, pid: deadPid, created_at: new Date(Date.now() - age).toISOString() }));
  return { temporary, directory, ownerFile };
}

describe('bounded preview cache; zero provider/browser calls', () => {
  it('evicts only old manifest-associated previews and regenerates from the unchanged SHA-verified original', async () => {
    expect(PREVIEW_CACHE_POLICY).toEqual({ max_bytes: 32 * 1024 * 1024, max_age_ms: 30 * 24 * 60 * 60 * 1000 });
    const root = await folder();
    const store = new ImageStore(root);
    const original = await png();
    const saved = await store.save(original, 'cache-owned');
    const metadataPath = path.join(root, '.ngini-metadata', `${saved.image_id}.json`);
    const manifest = await readFile(metadataPath);
    const unknown = path.join(root, `ngini-${randomUUID()}.preview.png`);
    const arbitrary = path.join(root, 'family-photo.png');
    await writeFile(unknown, original); await writeFile(arbitrary, original);
    const stale = new Date(Date.now() - PREVIEW_CACHE_POLICY.max_age_ms - 1000);
    await utimes(saved.preview_path, stale, stale); await utimes(unknown, stale, stale);
    const result = await store.cleanupPreviewCache();
    expect(result.removed).toBe(1);
    await expect(readFile(saved.preview_path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(saved.original_path)).toEqual(original);
    expect(await readFile(metadataPath)).toEqual(manifest);
    expect(await readFile(unknown)).toEqual(original);
    expect(await readFile(arbitrary)).toEqual(original);
    const preview = await store.readPreview(saved.image_id);
    expect(preview.length).toBeLessThanOrEqual(MAX_TRANSPORT_PREVIEW_BYTES);
    expect((await sharp(preview).metadata()).format).toBe('png');
    expect(await readFile(saved.preview_path)).toEqual(preview);
    expect(createHash('sha256').update(await readFile(saved.original_path)).digest('hex')).toBe(saved.sha256);
  });

  it('prunes oldest eligible previews to the requested byte budget, preserving all originals', async () => {
    const store = new ImageStore(await folder());
    const first = await store.save(await png(), 'cache-first');
    const second = await store.save(await png(), 'cache-second');
    const oldest = new Date(Date.now() - 60_000);
    await utimes(first.preview_path, oldest, oldest);
    const secondSize = (await readFile(second.preview_path)).length;
    const result = await store.cleanupPreviewCache({ max_bytes: secondSize });
    expect(result.removed).toBe(1);
    expect(result.retained_bytes).toBe(secondSize);
    await expect(readFile(first.preview_path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await store.readOriginal(first.image_id)).metadata.sha256).toBe(first.sha256);
    expect((await store.readOriginal(second.image_id)).metadata.sha256).toBe(second.sha256);
  });

  it('preserves unowned, hard-linked, or unverified preview paths', async () => {
    const root = await folder();
    const store = new ImageStore(root);
    const owned = await store.save(await png(), 'cache-link');
    const linkedOriginal = path.join(root, 'user-link.png');
    await rename(owned.preview_path, path.join(root, 'held-preview.png'));
    await link(owned.original_path, owned.preview_path);
    await link(owned.original_path, linkedOriginal);
    const corrupt = await store.save(await png(), 'cache-invalid-record');
    const manifestPath = path.join(root, '.ngini-metadata', `${corrupt.image_id}.json`);
    await writeFile(manifestPath, '{invalid');
    const originalNames = await readdir(root);
    const result = await store.cleanupPreviewCache({ max_bytes: 0 });
    expect(result.removed).toBe(0);
    expect(await readdir(root)).toEqual(originalNames);
    expect(await readFile(linkedOriginal)).toEqual(await png());
  });

  it('does not rebuild an evicted preview from an altered original', async () => {
    const store = new ImageStore(await folder());
    const saved = await store.save(await png(), 'cache-mutated-original');
    await store.cleanupPreviewCache({ max_bytes: 0 });
    const changed = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#111111' } }).png().toBuffer();
    await writeFile(saved.original_path, changed);
    await expect(store.readPreview(saved.image_id)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    await expect(readFile(saved.preview_path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(saved.original_path)).toEqual(changed);
  });

  it('refuses to clean through an output junction', async () => {
    const root = await folder();
    const target = path.join(root, 'target');
    const store = new ImageStore(target);
    const saved = await store.save(await png(), 'cache-junction');
    const alias = path.join(root, 'alias');
    await symlink(target, alias, 'junction');
    expect((await new ImageStore(alias).cleanupPreviewCache({ max_bytes: 0 })).removed).toBe(0);
    expect(await readFile(saved.preview_path)).toEqual(await store.readPreview(saved.image_id));
  });
});

describe('owned crash download cleanup; no recursive/runtime/user deletion', () => {
  it('creates exclusive owner-marked downloads and removes only its own ordinary files on normal completion', async () => {
    expect(DOWNLOAD_CACHE_POLICY).toEqual({ max_bytes: 64 * 1024 * 1024, max_age_ms: 24 * 60 * 60 * 1000 });
    const root = await folder();
    const temporary = await createDownloadTemporary(root);
    expect(path.basename(path.dirname(temporary.filename))).toMatch(/^ngini-download-[a-f0-9-]+$/);
    await writeFile(temporary.filename, await png());
    expect(await readdir(path.dirname(temporary.filename))).toEqual(['.ngini-download-owner.json', 'image.download']);
    await temporary.remove();
    expect(await readdir(root)).toEqual([]);
  });

  it('removes an old dead-owned crash directory while preserving recent, live, unknown and legacy files', async () => {
    const root = await folder();
    const stale = await staleDownload(root, DOWNLOAD_CACHE_POLICY.max_age_ms + 1000);
    const recent = await staleDownload(root, 1000);
    const alive = await createDownloadTemporary(root);
    await writeFile(alive.filename, 'active download');
    const legacy = path.join(root, `${randomUUID()}.download`);
    await writeFile(legacy, 'unproven legacy data');
    const foreign = path.join(root, `ngini-download-${randomUUID()}`);
    await mkdir(foreign); await writeFile(path.join(foreign, 'private.txt'), 'do not delete');
    const result = await cleanupDownloadCache(root);
    expect(result.removed).toBe(1);
    await expect(readdir(stale.directory)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(recent.temporary.filename, 'utf8')).toBe('partial download');
    expect(await readFile(alive.filename, 'utf8')).toBe('active download');
    expect(await readFile(legacy, 'utf8')).toBe('unproven legacy data');
    expect(await readFile(path.join(foreign, 'private.txt'), 'utf8')).toBe('do not delete');
  });

  it('enforces the eligible byte budget even before age expiry and leaves alive owners untouched', async () => {
    const root = await folder();
    const first = await staleDownload(root, 5000, Buffer.alloc(300));
    const second = await staleDownload(root, 1000, Buffer.alloc(200));
    const secondOwner = await readFile(second.ownerFile);
    const alive = await createDownloadTemporary(root);
    await writeFile(alive.filename, Buffer.alloc(4096));
    const result = await cleanupDownloadCache(root, { max_bytes: secondOwner.length + 200 });
    expect(result.removed).toBe(1);
    await expect(readdir(first.directory)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(second.temporary.filename)).toHaveLength(200);
    expect(await readFile(alive.filename)).toHaveLength(4096);
  });

  it('preserves directories with unknown children, hard links, invalid owners or junctions', async () => {
    const root = await folder();
    const unknown = await staleDownload(root, DOWNLOAD_CACHE_POLICY.max_age_ms + 1000);
    await writeFile(path.join(unknown.directory, 'user.txt'), 'preserve');
    const linked = await staleDownload(root, DOWNLOAD_CACHE_POLICY.max_age_ms + 1000);
    const external = path.join(root, 'user-original.png');
    await rename(linked.temporary.filename, external);
    await link(external, linked.temporary.filename);
    const invalid = await staleDownload(root, DOWNLOAD_CACHE_POLICY.max_age_ms + 1000);
    await writeFile(invalid.ownerFile, '{}');
    const junction = path.join(root, `ngini-download-${randomUUID()}`);
    await symlink(unknown.directory, junction, 'junction');
    const names = await readdir(root);
    expect((await cleanupDownloadCache(root, { max_bytes: 0 })).removed).toBe(0);
    expect(await readdir(root)).toEqual(names);
    expect(await readFile(external, 'utf8')).toBe('partial download');
    expect(await readFile(path.join(unknown.directory, 'user.txt'), 'utf8')).toBe('preserve');
  });

  it('rejects a temporary-root junction and preserves a replaced owner during direct disposal', async () => {
    const root = await folder();
    const real = path.join(root, 'real'); await mkdir(real);
    const alias = path.join(root, 'alias'); await symlink(real, alias, 'junction');
    await expect(createDownloadTemporary(alias)).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    expect((await cleanupDownloadCache(alias, { max_bytes: 0 })).removed).toBe(0);
    const temporary = await createDownloadTemporary(real);
    const marker = path.join(path.dirname(temporary.filename), '.ngini-download-owner.json');
    await writeFile(temporary.filename, 'keep');
    const changed = JSON.parse(await readFile(marker, 'utf8')) as Record<string, unknown>;
    await writeFile(marker, JSON.stringify({ ...changed, pid: deadPid }));
    await expect(temporary.remove()).rejects.toThrow();
    expect(await readFile(temporary.filename, 'utf8')).toBe('keep');
  });

  it('idle maintenance skips active, unknown-submission and human-verification requests', async () => {
    const root = await folder();
    const store = await RequestStore.open(path.join(root, 'requests'));
    let calls = 0;
    await store.begin('active-cache', 'cat');
    expect(await store.whenIdleMaintenance(async () => { calls++; })).toBe(false);
    await store.transition('active-cache', 'failed', { error: { code: 'SUBMISSION_UNKNOWN', message: 'uncertain' } });
    expect(await store.whenIdleMaintenance(async () => { calls++; })).toBe(false);
    await store.cancel('active-cache');
    await store.begin('human-cache', 'cat');
    await store.transition('human-cache', 'failed', { error: { code: 'HUMAN_VERIFICATION_REQUIRED', message: 'manual' } });
    expect(await store.whenIdleMaintenance(async () => { calls++; })).toBe(false);
    await store.cancel('human-cache');
    expect(await store.whenIdleMaintenance(async () => { calls++; })).toBe(true);
    expect(calls).toBe(1);
  });
});
