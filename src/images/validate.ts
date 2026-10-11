import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { BridgeError } from '../shared/errors.js';

export interface ImageLimits { max_bytes: number; max_pixels: number }
export const DEFAULT_IMAGE_LIMITS: ImageLimits = { max_bytes: 25 * 1024 * 1024, max_pixels: 64_000_000 };
export interface ValidatedImage {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  extension: 'png' | 'jpg' | 'webp';
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

/** Verify both the container signature and a complete raster decode. */
export async function validateImage(data: Uint8Array, limits: ImageLimits = DEFAULT_IMAGE_LIMITS): Promise<ValidatedImage> {
  if (!Number.isSafeInteger(limits.max_bytes) || !Number.isSafeInteger(limits.max_pixels)
      || limits.max_bytes <= 0 || limits.max_pixels <= 0) throw new BridgeError('INVALID_ARGUMENT', '不合法的圖片驗證限制。');
  if (data.byteLength === 0 || data.byteLength > limits.max_bytes) throw new BridgeError('INVALID_IMAGE', '圖片檔案為空或超過 25 MiB 上限。');
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const format = detectFormat(bytes);
  if (!format) throw new BridgeError('INVALID_IMAGE', '檔案不是 PNG、JPEG 或 WebP 原圖。');
  try {
    const decoder = sharp(bytes, { limitInputPixels: limits.max_pixels, failOn: 'error', sequentialRead: true });
    const metadata = await decoder.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (metadata.format !== format || width <= 0 || height <= 0
        || width * height > limits.max_pixels || (metadata.pages ?? 1) > 1) throw new Error('Invalid raster dimensions');
    await decoder.stats(); // Metadata alone accepts some truncated images; stats forces full decode.
    return {
      mime: format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png',
      extension: format === 'jpeg' ? 'jpg' : format,
      width, height, bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  } catch {
    throw new BridgeError('INVALID_IMAGE', '圖片無法完整解碼，或尺寸超過允許上限。');
  }
}

function detectFormat(data: Buffer): 'png' | 'jpeg' | 'webp' | undefined {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpeg';
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return undefined;
}
