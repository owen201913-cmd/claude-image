import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { assembleOriginalDownload, imageResourceUri, MAX_ORIGINAL_BYTES, ORIGINAL_CHUNK_BYTES, type CardImage } from '../../src/ui/card-contract.js';

// Procedural transport bytes, not Ngini images or image-decoder fixtures.
function fixture(size = ORIGINAL_CHUNK_BYTES + 13) {
  const bytes = Buffer.alloc(size, 0x71);
  const image: CardImage = { image_id: 'transport-fixture', filename: 'test-fixture.png', mime: 'image/png',
    width: 64, height: 48, bytes: size, sha256: createHash('sha256').update(bytes).digest('hex'), source: 'fixture' };
  const response = (offset: number) => {
    const end = Math.min(size, offset + ORIGINAL_CHUNK_BYTES);
    return { content: [{ type: 'text', text: 'OFFLINE TRANSPORT FIXTURE' }], structuredContent: {
      image_id: image.image_id, total_bytes: size, offset, next_offset: end === size ? null : end,
      sha256: image.sha256, data: bytes.subarray(offset, end).toString('base64'),
    } };
  };
  return { bytes, image, response };
}

describe('bounded original chunk assembly', () => {
  it.each([1, ORIGINAL_CHUNK_BYTES, ORIGINAL_CHUNK_BYTES + 1, 3 * 1024 * 1024 + 17, MAX_ORIGINAL_BYTES])
    ('preserves %i original bytes/hash with sequential bounded responses', async size => {
      const { bytes, image, response } = fixture(size);
      const offsets: number[] = [];
      let pending = 0;
      const download = await assembleOriginalDownload(image, async offset => {
        expect(++pending).toBe(1);
        offsets.push(offset);
        const result = response(offset);
        expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThan(1024 * 1024);
        pending--;
        return result;
      });
      expect(offsets).toEqual(Array.from({ length: Math.ceil(size / ORIGINAL_CHUNK_BYTES) }, (_, index) => index * ORIGINAL_CHUNK_BYTES));
      expect(offsets.length).toBeLessThanOrEqual(100);
      expect(download.resource.uri).toBe(imageResourceUri(image));
      expect(download.resource.mimeType).toBe('application/octet-stream');
      expect(Buffer.from(download.resource.blob, 'base64').equals(bytes)).toBe(true);
      expect(createHash('sha256').update(Buffer.from(download.resource.blob, 'base64')).digest('hex')).toBe(image.sha256);
      expect(image.mime).toBe('image/png');
    });
  it.each([
    ['image_id', 'other'], ['total_bytes', ORIGINAL_CHUNK_BYTES + 14], ['sha256', 'f'.repeat(64)],
    ['offset', 1], ['next_offset', null], ['next_offset', 1],
  ])('rejects inconsistent %s before requesting another chunk', async (key, value) => {
    const { image, response } = fixture();
    const read = vi.fn(async (offset: number) => {
      const result = response(offset);
      return { ...result, structuredContent: { ...result.structuredContent, [key]: value } };
    });
    await expect(assembleOriginalDownload(image, read)).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(1);
  });
  it.each(['short', 'oversized', 'malformed', 'wrong_final'])('rejects %s chunk boundaries/data', async kind => {
    const { image, response } = fixture();
    const read = vi.fn(async (offset: number) => {
      const result = response(offset);
      if (kind === 'wrong_final' && offset !== 0) result.structuredContent.next_offset = offset + 13;
      else if (kind === 'short') result.structuredContent.data = Buffer.alloc(ORIGINAL_CHUNK_BYTES - 1).toString('base64');
      else if (kind === 'oversized') result.structuredContent.data = Buffer.alloc(ORIGINAL_CHUNK_BYTES + 1).toString('base64');
      else if (kind === 'malformed') result.structuredContent.data = 'not base64';
      return result;
    });
    await expect(assembleOriginalDownload(image, read)).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(kind === 'wrong_final' ? 2 : 1);
  });
  it('checks the full hash after individually plausible chunks', async () => {
    const { image, response } = fixture();
    await expect(assembleOriginalDownload(image, async offset => {
      const result = response(offset);
      if (offset !== 0) result.structuredContent.data = Buffer.alloc(13, 0x72).toString('base64');
      return result;
    })).rejects.toThrow('ORIGINAL_HASH_MISMATCH');
  });
  it('rejects error or missing structured responses without fallback to whole-file reads', async () => {
    const { image, response } = fixture();
    for (const value of [undefined, {}, { ...response(0), isError: true }]) {
      const read = vi.fn(async () => value);
      await expect(assembleOriginalDownload(image, read)).rejects.toThrow('ORIGINAL_CHUNK_READ_FAILED');
      expect(read).toHaveBeenCalledTimes(1);
    }
  });
  it('rejects over-limit declared originals before any request or allocation', async () => {
    const { image } = fixture(1);
    const read = vi.fn();
    await expect(assembleOriginalDownload({ ...image, bytes: MAX_ORIGINAL_BYTES + 1 }, read)).rejects.toThrow('INVALID_CARD_IMAGE');
    expect(read).not.toHaveBeenCalled();
  });
  it('stops before reads or before the next chunk when cancelled', async () => {
    const { image, response } = fixture();
    const alreadyCancelled = new AbortController(); alreadyCancelled.abort();
    const unopened = vi.fn();
    await expect(assembleOriginalDownload(image, unopened, alreadyCancelled.signal)).rejects.toThrow('ORIGINAL_DOWNLOAD_CANCELLED');
    expect(unopened).not.toHaveBeenCalled();
    const controller = new AbortController();
    const read = vi.fn(async (offset: number, signal?: AbortSignal) => {
      expect(signal).toBe(controller.signal);
      controller.abort();
      return response(offset);
    });
    await expect(assembleOriginalDownload(image, read, controller.signal)).rejects.toThrow('ORIGINAL_DOWNLOAD_CANCELLED');
    expect(read).toHaveBeenCalledTimes(1);
  });
});
