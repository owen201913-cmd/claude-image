import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, open, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageStore, MAX_TRANSPORT_PREVIEW_BYTES, ORIGINAL_CHUNK_BYTES, readBoundedImageFile } from '../../src/images/image-store.js';
import { validateImage } from '../../src/images/validate.js';

const cleanup: string[] = [];
async function folder(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ngini-images-test-'));
  cleanup.push(directory);
  return directory;
}
afterEach(async () => { await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

async function fixture(format: 'png' | 'jpeg' | 'webp', width = 64, height = 48): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#8d61bc' } }).toFormat(format).toBuffer();
}

describe('real image container and raster validation', () => {
  it.each(['png', 'jpeg', 'webp'] as const)('validates %s while computing the original byte hash', async (format) => {
    const bytes = await fixture(format);
    const verified = await validateImage(bytes);
    expect(verified).toMatchObject({ width: 64, height: 48, bytes: bytes.length, mime: `image/${format}` });
    expect(verified.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  });

  it('T16: rejects an HTML error page even when it is named PNG', async () => {
    await expect(validateImage(Buffer.from('<!DOCTYPE html><title>Please sign in</title>')))
      .rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });

  it('rejects a corrupt raster with a genuine PNG signature', async () => {
    const bytes = await fixture('png');
    await expect(validateImage(bytes.subarray(0, Math.floor(bytes.length / 2))))
      .rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });

  it('checks both byte and decoded pixel limits', async () => {
    const bytes = await fixture('png', 64, 64);
    await expect(validateImage(bytes, { max_bytes: bytes.length - 1, max_pixels: 64_000_000 }))
      .rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    await expect(validateImage(bytes, { max_bytes: 25 * 1024 * 1024, max_pixels: 4095 }))
      .rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    await expect(validateImage(Buffer.alloc(0))).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });
});

describe('safe original and preview storage', () => {
  it('preflights nested storage and removes only its own probes, leaving existing files intact', async () => {
    const directory = path.join(await folder(), 'new-output', 'images');
    const store = new ImageStore(directory);
    await store.preflight();
    const userFile = path.join(directory, 'my-existing-image.png');
    await writeFile(userFile, 'user-owned sentinel');
    await store.preflight();
    expect(await readdir(directory)).toEqual(['.ngini-metadata', 'my-existing-image.png']);
    expect(await readdir(path.join(directory, '.ngini-metadata'))).toEqual([]);
    expect(await readFile(userFile, 'utf8')).toBe('user-owned sentinel');
  });

  it('classifies an ordinary file occupying output as STORAGE_ERROR for both preflight and save', async () => {
    const output = path.join(await folder(), 'output-file');
    await writeFile(output, 'user-owned output sentinel');
    const store = new ImageStore(output);
    await expect(store.preflight()).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    await expect(store.save(await fixture('png'), 'occupied-output')).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    expect(await readFile(output, 'utf8')).toBe('user-owned output sentinel');
  });

  it('does not overwrite an ordinary file occupying metadata during preflight or save', async () => {
    const directory = await folder();
    const metadata = path.join(directory, '.ngini-metadata');
    await writeFile(metadata, 'user-owned metadata sentinel');
    const store = new ImageStore(directory);
    await expect(store.preflight()).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    await expect(store.save(await fixture('png'), 'occupied-metadata')).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    expect(await readdir(directory)).toEqual(['.ngini-metadata']);
    expect(await readFile(metadata, 'utf8')).toBe('user-owned metadata sentinel');
  });

  it.each(['output', 'metadata', 'ancestor'] as const)('rejects a %s junction before writing through it', async location => {
    const directory = await folder();
    const target = path.join(directory, 'unowned-target');
    await mkdir(target);
    await writeFile(path.join(target, 'sentinel.txt'), 'keep unchanged');
    const output = path.join(directory, 'output');
    if (location === 'metadata') {
      await mkdir(output);
      await symlink(target, path.join(output, '.ngini-metadata'), 'junction');
    } else {
      await symlink(target, output, 'junction');
    }
    const store = new ImageStore(location === 'ancestor' ? path.join(output, 'nested-images') : output);
    await expect(store.preflight()).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    await expect(store.save(await fixture('png'), 'linked-output')).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    expect(await readdir(target)).toEqual(['sentinel.txt']);
    expect(await readFile(path.join(target, 'sentinel.txt'), 'utf8')).toBe('keep unchanged');
  });

  it('T17/T18: original bytes stay identical and preview stays separate at small, normal, large sizes', async () => {
    const store = new ImageStore(await folder());
    for (const width of [32, 1024, 3072]) {
      const bytes = await fixture('png', width, width);
      const saved = await store.save(bytes, `fixture-${width}`);
      const original = await store.readOriginal(saved.image_id);
      expect(original.data.equals(bytes)).toBe(true);
      expect(original.metadata.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      const preview = await sharp(await store.readPreview(saved.image_id)).metadata();
      expect(preview.width).toBeLessThanOrEqual(768);
      expect(preview.height).toBeLessThanOrEqual(768);
      expect(saved.preview_path).not.toBe(saved.original_path);
    }
  });

  it('never uses an external filename and permits only issued image IDs', async () => {
    const directory = await folder();
    const store = new ImageStore(directory);
    const saved = await store.save(await fixture('jpeg'), 'test-intent');
    expect(saved.filename).toMatch(/^ngini-[a-f0-9-]+\.jpg$/);
    expect(saved.original_path.startsWith(directory + path.sep)).toBe(true);
    await expect(store.get('../../private')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(await store.get('de000000-0000-4000-8000-000000000000')).toBeUndefined();
    const reopened = new ImageStore(directory);
    expect((await reopened.get(saved.image_id))?.sha256).toBe(saved.sha256);
    expect(await readFile(saved.original_path)).toEqual(await fixture('jpeg'));
  });

  it('keeps a high-entropy RGBA preview below the card transport limit without changing the original', async () => {
    const bytes = await sharp(randomBytes(1024 * 1024 * 4), { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
    expect(bytes.length).toBeGreaterThan(1024 * 1024);
    const store = new ImageStore(await folder());
    const saved = await store.save(bytes, 'large-byte-fixture');
    expect((await store.readPreview(saved.image_id)).length).toBeLessThanOrEqual(MAX_TRANSPORT_PREVIEW_BYTES);
    expect((await store.readOriginal(saved.image_id)).data.equals(bytes)).toBe(true);
  });

  it('does not write rejected inputs and detects a changed original file', async () => {
    const directory = await folder();
    const store = new ImageStore(directory);
    await expect(store.save(Buffer.from('invalid'), 'test')).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    expect(await readdir(directory)).toHaveLength(0);
    const saved = await store.save(await fixture('png'), 'test');
    await writeFile(saved.original_path, '<html>changed</html>');
    await expect(store.readOriginal(saved.image_id)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    await expect(store.readOriginalChunk(saved.image_id, 0)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });

  it('rejects traversal inside tampered metadata instead of reading another file', async () => {
    const directory = await folder();
    const store = new ImageStore(directory);
    const saved = await store.save(await fixture('png'), 'test');
    const manifestPath = path.join(directory, '.ngini-metadata', `${saved.image_id}.json`);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.filename = '../../private.png';
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(store.readOriginal(saved.image_id)).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    await expect(store.readOriginalChunk(saved.image_id, 0)).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
  });

  it('reads the original as bounded exact-offset chunks and reassembles the original byte hash', async () => {
    const bytes = await sharp(randomBytes(512 * 512 * 4), { raw: { width: 512, height: 512, channels: 4 } }).png().toBuffer();
    expect(bytes.length).toBeGreaterThan(ORIGINAL_CHUNK_BYTES * 3);
    const store = new ImageStore(await folder());
    const saved = await store.save(bytes, 'chunk-transport');
    const chunks: Buffer[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const chunk = await store.readOriginalChunk(saved.image_id, offset);
      expect(chunk.offset).toBe(offset);
      expect(chunk.data.length).toBe(Math.min(ORIGINAL_CHUNK_BYTES, bytes.length - offset));
      expect(chunk.metadata.sha256).toBe(saved.sha256);
      expect(chunk.data.equals(bytes.subarray(offset, offset + chunk.data.length))).toBe(true);
      chunks.push(chunk.data);
      offset = chunk.next_offset;
    }
    const reassembled = Buffer.concat(chunks);
    expect(reassembled.equals(bytes)).toBe(true);
    expect(createHash('sha256').update(reassembled).digest('hex')).toBe(saved.sha256);
    const arbitrary = await store.readOriginalChunk(saved.image_id, 33);
    expect(arbitrary.data.equals(bytes.subarray(33, 33 + ORIGINAL_CHUNK_BYTES))).toBe(true);
    expect(arbitrary.next_offset).toBe(33 + ORIGINAL_CHUNK_BYTES);
    const tail = await store.readOriginalChunk(saved.image_id, bytes.length - 1);
    expect(tail.data.equals(bytes.subarray(bytes.length - 1))).toBe(true);
    expect(tail.next_offset).toBeNull();
    expect((await store.readOriginalChunk(saved.image_id, 0)).data.equals(chunks[0]!)).toBe(true);
  });

  it('rejects invalid chunk offsets, unknown IDs and out-of-range offsets without an arbitrary path', async () => {
    const store = new ImageStore(await folder());
    const saved = await store.save(await fixture('png'), 'chunk-bounds');
    for (const offset of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, saved.bytes, saved.bytes + 1, Number.MAX_SAFE_INTEGER]) {
      await expect(store.readOriginalChunk(saved.image_id, offset)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    }
    await expect(store.readOriginalChunk('../../private', 0)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(store.readOriginalChunk('de000000-0000-4000-8000-000000000000', 0)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('requires valid 25 MiB metadata, MIME, dimensions and preview identity for chunk access', async () => {
    const directory = await folder();
    const store = new ImageStore(directory);
    const saved = await store.save(await fixture('png'), 'chunk-metadata');
    const manifestPath = path.join(directory, '.ngini-metadata', `${saved.image_id}.json`);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    for (const patch of [
      { bytes: 25 * 1024 * 1024 + 1 }, { width: 0 }, { height: 0.5 },
      { mime: 'image/jpeg' }, { preview_mime: 'text/html' }, { created_at: 'invalid-date' },
    ]) {
      await writeFile(manifestPath, JSON.stringify({ ...manifest, ...patch }));
      await expect(store.readOriginalChunk(saved.image_id, 0)).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    }
  });

  it('rejects metadata directory junctions instead of following them to an unowned record', async () => {
    const directory = await folder();
    const store = new ImageStore(directory);
    const saved = await store.save(await fixture('png'), 'metadata-junction');
    const metadataDirectory = path.join(directory, '.ngini-metadata');
    const relocated = path.join(directory, '.held-metadata');
    await rename(metadataDirectory, relocated);
    await symlink(relocated, metadataDirectory, 'junction');
    await expect(store.readOriginalChunk(saved.image_id, 0)).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    const originalsBefore = await readdir(directory);
    await expect(store.save(await fixture('png'), 'new-request')).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    expect(await readdir(directory)).toEqual(originalsBefore);
  });

  it('bounds temporary/original reads before allocation and requires exact metadata size', async () => {
    const directory = await folder();
    const filename = path.join(directory, 'controlled.download');
    const bytes = await fixture('png');
    await writeFile(filename, bytes);
    expect(await readBoundedImageFile(filename, bytes.length, bytes.length)).toEqual(bytes);
    await expect(readBoundedImageFile(filename, bytes.length - 1)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    await expect(readBoundedImageFile(filename, bytes.length, bytes.length + 1)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    const file = await open(filename, 'r+');
    try { await file.truncate(25 * 1024 * 1024 + 1); } finally { await file.close(); }
    await expect(readBoundedImageFile(filename)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    // A caller cannot raise the built-in 25 MiB read boundary by passing a bigger limit.
    await expect(readBoundedImageFile(filename, 50 * 1024 * 1024)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });

  it('does not falsely verify a same-size mutated original: reconstructed SHA differs', async () => {
    const store = new ImageStore(await folder());
    const bytes = await fixture('png');
    const saved = await store.save(bytes, 'chunk-tampered-content');
    const changed = Buffer.from(bytes);
    changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
    await writeFile(saved.original_path, changed);
    const chunk = await store.readOriginalChunk(saved.image_id, 0);
    expect(chunk.metadata.sha256).toBe(saved.sha256);
    expect(createHash('sha256').update(chunk.data).digest('hex')).not.toBe(saved.sha256);
    await expect(store.readOriginal(saved.image_id)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });

  it('bounds legacy high-entropy PNG previews in memory without modifying either file', async () => {
    const store = new ImageStore(await folder());
    const bytes = await sharp(randomBytes(512 * 512 * 4), { raw: { width: 512, height: 512, channels: 4 } }).png().toBuffer();
    const saved = await store.save(bytes, 'legacy-preview');
    await writeFile(saved.preview_path, bytes);
    expect(bytes.length).toBeGreaterThan(MAX_TRANSPORT_PREVIEW_BYTES);
    const preview = await store.readPreview(saved.image_id);
    expect(preview.length).toBeLessThanOrEqual(MAX_TRANSPORT_PREVIEW_BYTES);
    const metadata = await sharp(preview).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBeLessThanOrEqual(768);
    expect(metadata.height).toBeLessThanOrEqual(768);
    expect(await readFile(saved.preview_path)).toEqual(bytes);
    expect(await readFile(saved.original_path)).toEqual(bytes);
  });
});
