import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, opendir, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { BridgeError } from '../shared/errors.js';
import { validateImage, DEFAULT_IMAGE_LIMITS, type ImageLimits } from './validate.js';
import type { JobImage } from '../jobs/state-machine.js';

export interface StoredImage extends JobImage {
  request_id: string;
  created_at: string;
  original_path: string;
  preview_filename: string;
  preview_path: string;
  preview_mime: 'image/png';
}

type ImageManifest = Omit<StoredImage, 'original_path' | 'preview_path'> & { schema_version: 1 };
export const ORIGINAL_CHUNK_BYTES = 256 * 1024;
export const MAX_TRANSPORT_PREVIEW_BYTES = 256 * 1024;
const MAX_MANIFEST_BYTES = 16 * 1024;
export const PREVIEW_CACHE_POLICY = { max_bytes: 32 * 1024 * 1024, max_age_ms: 30 * 24 * 60 * 60 * 1000 } as const;
const MAX_CACHE_SCAN_ENTRIES = 4096;
export interface CacheCleanupResult { scanned: number; removed: number; removed_bytes: number; retained_bytes: number; skipped: number; scan_limited: boolean }

export interface OriginalImageChunk {
  metadata: StoredImage;
  data: Buffer;
  offset: number;
  next_offset: number | null;
}

/** Only generated image IDs map to files; caller input is never a filesystem path. */
export class ImageStore {
  readonly directory: string;
  private previewCleanup?: Promise<CacheCleanupResult>;
  private lastPreviewCleanup = 0;
  constructor(directory: string, private readonly limits: ImageLimits = DEFAULT_IMAGE_LIMITS) {
    this.directory = path.resolve(directory);
  }

  /** Check the exact create/write/publish/cleanup operations before consuming a generation. */
  async preflight(): Promise<void> {
    await preflightStorageDirectory(this.directory, true);
    await preflightStorageDirectory(path.join(this.directory, '.ngini-metadata'), true);
  }

  async save(data: Uint8Array, requestId: string): Promise<StoredImage> {
    const validation = await validateImage(data, this.limits);
    if (typeof requestId !== 'string' || requestId.length === 0 || requestId.length > 160) throw new BridgeError('INVALID_ARGUMENT', '缺少有效的 request_id。');
    const id = randomUUID();
    const manifest: ImageManifest = {
      schema_version: 1, image_id: id, request_id: requestId,
      filename: `ngini-${id}.${validation.extension}`, mime: validation.mime,
      width: validation.width, height: validation.height, bytes: validation.bytes, sha256: validation.sha256,
      created_at: new Date().toISOString(), preview_filename: `ngini-${id}.preview.png`, preview_mime: 'image/png',
    };
    const metadataDirectory = path.join(this.directory, '.ngini-metadata');
    const originalPath = path.join(this.directory, manifest.filename);
    const previewPath = path.join(this.directory, manifest.preview_filename);
    const manifestPath = this.manifestPath(id);
    const created: string[] = [];
    try {
      // Directory creation and validation are storage operations too. A path
      // changing after preflight must remain STORAGE_ERROR, never UI_CHANGED.
      await ensureSafeDirectory(metadataDirectory);
      await writeNew(originalPath, data); created.push(originalPath);
      const preview = await boundedPreview(data, this.limits.max_pixels);
      await ensureSafeDirectory(metadataDirectory);
      await writeNew(previewPath, preview); created.push(previewPath);
      await ensureSafeDirectory(metadataDirectory);
      await writeNew(manifestPath, JSON.stringify(manifest)); created.push(manifestPath);
      // Cache maintenance cannot roll back a successfully preserved original.
      await this.cleanupPreviewCache().catch(() => undefined);
      return this.withPaths(manifest);
    } catch (error) {
      await Promise.all(created.map((filename) => unlink(filename).catch(() => undefined)));
      if (error instanceof BridgeError) throw error;
      throw new BridgeError('STORAGE_ERROR', '無法保存原圖；沒有重新生成。', undefined, { cause: error });
    }
  }

  async get(imageId: string): Promise<StoredImage | undefined> {
    assertImageId(imageId);
    let json: string;
    try {
      const directoryStat = await lstat(path.join(this.directory, '.ngini-metadata'));
      if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('Invalid metadata directory');
      const checked = await openCheckedFile(this.manifestPath(imageId), MAX_MANIFEST_BYTES);
      try { json = (await readRange(checked.file, 0, checked.stat.size)).toString('utf8'); }
      finally { await checked.file.close(); }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new BridgeError('STORAGE_ERROR', '無法讀取圖片紀錄。');
    }
    try {
      const manifest = JSON.parse(json) as ImageManifest;
      if (manifest.schema_version !== 1 || manifest.image_id !== imageId
          || !new RegExp(`^ngini-${imageId}\\.(png|jpg|webp)$`).test(manifest.filename)
          || manifest.preview_filename !== `ngini-${imageId}.preview.png`
          || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.bytes)
          || manifest.bytes <= 0 || manifest.bytes > Math.min(this.limits.max_bytes, DEFAULT_IMAGE_LIMITS.max_bytes)
          || !Number.isSafeInteger(manifest.width) || !Number.isSafeInteger(manifest.height)
          || manifest.width <= 0 || manifest.height <= 0 || manifest.width * manifest.height > this.limits.max_pixels
          || !['image/png', 'image/jpeg', 'image/webp'].includes(manifest.mime)
          || manifest.filename.slice(manifest.filename.lastIndexOf('.') + 1) !== ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const)[manifest.mime]
          || manifest.preview_mime !== 'image/png'
          || typeof manifest.request_id !== 'string' || !manifest.request_id || manifest.request_id.length > 160
          || typeof manifest.created_at !== 'string' || !Number.isFinite(Date.parse(manifest.created_at))) throw new Error('Invalid manifest');
      return this.withPaths(manifest);
    } catch {
      throw new BridgeError('STORAGE_ERROR', '圖片紀錄無法驗證。');
    }
  }

  async readOriginal(imageId: string): Promise<{ metadata: StoredImage; data: Buffer }> {
    const metadata = await this.get(imageId);
    if (!metadata) throw new BridgeError('NOT_FOUND', '找不到本工具產出的圖片。');
    const data = await readBoundedImageFile(metadata.original_path, this.limits.max_bytes, metadata.bytes);
    const validation = await validateImage(data, this.limits);
    if (validation.sha256 !== metadata.sha256 || validation.mime !== metadata.mime
        || validation.width !== metadata.width || validation.height !== metadata.height) {
      throw new BridgeError('INVALID_IMAGE', '保存的原圖與原任務雜湊或尺寸不符。');
    }
    return { metadata, data };
  }

  async readPreview(imageId: string): Promise<Buffer> {
    const metadata = await this.get(imageId);
    if (!metadata) throw new BridgeError('NOT_FOUND', '找不到本工具產出的預覽。');
    await ensureSafeDirectory(path.join(this.directory, '.ngini-metadata'), false);
    // Opportunistic and throttled: no scheduler, profile cleanup, or original retention limit.
    if (Date.now() - this.lastPreviewCleanup >= 5 * 60 * 1000) await this.cleanupPreviewCache().catch(() => undefined);
    let checked: Awaited<ReturnType<typeof openCheckedFile>>;
    try { checked = await openCheckedFile(metadata.preview_path, Math.min(this.limits.max_bytes, DEFAULT_IMAGE_LIMITS.max_bytes)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const original = await this.readOriginal(imageId); // Includes original SHA, decode and dimension verification.
      const preview = await boundedPreview(original.data, this.limits.max_pixels);
      try {
        await ensureSafeDirectory(path.join(this.directory, '.ngini-metadata'), false);
        await writeNew(metadata.preview_path, preview); // No replacement if another reader already rebuilt it.
        await this.cleanupPreviewCache();
      } catch { /* Return the validated in-memory preview if this optional cache cannot be written. */ }
      return preview;
    }
    let bytes: Buffer;
    try {
      bytes = await readRange(checked.file, 0, checked.stat.size);
      await assertUnchangedFile(metadata.preview_path, checked.file, checked.stat);
    } finally { await checked.file.close(); }
    const validation = await validateImage(bytes, this.limits);
    if (validation.mime !== 'image/png') throw new BridgeError('INVALID_IMAGE', '預覽不是有效PNG。');
    if (bytes.length <= MAX_TRANSPORT_PREVIEW_BYTES && validation.width <= 768 && validation.height <= 768) return bytes;
    // Legacy previews are resized only in memory; neither their file nor the original is changed.
    return boundedPreview(bytes, this.limits.max_pixels);
  }

  /** Best effort: only manifest-associated cache PNGs, never originals or unknown files. */
  async cleanupPreviewCache(options: { now?: number; max_bytes?: number; max_age_ms?: number } = {}): Promise<CacheCleanupResult> {
    if (this.previewCleanup) return this.previewCleanup;
    const operation = this.prunePreviewCache(options);
    this.previewCleanup = operation;
    try { return await operation; }
    finally { if (this.previewCleanup === operation) this.previewCleanup = undefined; }
  }

  private async prunePreviewCache(options: { now?: number; max_bytes?: number; max_age_ms?: number }): Promise<CacheCleanupResult> {
    const now = options.now ?? Date.now();
    const maxBytes = options.max_bytes ?? PREVIEW_CACHE_POLICY.max_bytes;
    const maxAge = options.max_age_ms ?? PREVIEW_CACHE_POLICY.max_age_ms;
    if (![now, maxBytes, maxAge].every(value => Number.isSafeInteger(value) && value >= 0)) throw new BridgeError('INVALID_ARGUMENT', '不合法的預覽快取清理界限。');
    const result: CacheCleanupResult = { scanned: 0, removed: 0, removed_bytes: 0, retained_bytes: 0, skipped: 0, scan_limited: false };
    let directories: CheckedDirectory[];
    try { directories = await ensureSafeDirectory(path.join(this.directory, '.ngini-metadata'), false); }
    catch { return result; }
    const candidates: { filename: string; stat: Stats }[] = [];
    const directory = await opendir(this.directory);
    for await (const entry of directory) {
      if (result.scanned >= MAX_CACHE_SCAN_ENTRIES) { result.scan_limited = true; break; }
      result.scanned++;
      const match = /^ngini-([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\.preview\.png$/.exec(entry.name);
      if (!match || !entry.isFile() || entry.isSymbolicLink()) { result.skipped++; continue; }
      try {
        await assertUnchangedDirectories(directories);
        const metadata = await this.get(match[1]!);
        if (!metadata || metadata.preview_filename !== entry.name) throw new Error('Unowned preview');
        const original = await openCheckedFile(metadata.original_path, this.limits.max_bytes, metadata.bytes);
        await original.file.close();
        const preview = await openCheckedFile(metadata.preview_path, Math.min(this.limits.max_bytes, DEFAULT_IMAGE_LIMITS.max_bytes));
        try {
          if (preview.stat.nlink !== 1) throw new Error('Linked preview');
          if (preview.stat.dev === original.stat.dev && preview.stat.ino === original.stat.ino) throw new Error('Original alias');
          const signature = await readRange(preview.file, 0, Math.min(8, preview.stat.size));
          if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Unknown preview contents');
          await assertUnchangedFile(metadata.preview_path, preview.file, preview.stat);
          candidates.push({ filename: metadata.preview_path, stat: preview.stat });
          result.retained_bytes += preview.stat.size;
        } finally { await preview.file.close(); }
      } catch { result.skipped++; }
    }
    candidates.sort((left, right) => left.stat.mtimeMs - right.stat.mtimeMs);
    for (const candidate of candidates) {
      if (now - candidate.stat.mtimeMs < maxAge && result.retained_bytes <= maxBytes) continue;
      try {
        await assertUnchangedDirectories(directories);
        const actual = await lstat(candidate.filename);
        if (actual.nlink !== 1 || !sameFile(candidate.stat, actual)) { result.skipped++; continue; }
        await unlink(candidate.filename);
        result.removed++; result.removed_bytes += candidate.stat.size; result.retained_bytes -= candidate.stat.size;
      } catch { result.skipped++; }
    }
    this.lastPreviewCleanup = Date.now();
    return result;
  }

  /** A bounded read of the known original; the caller must verify the assembled SHA-256. */
  async readOriginalChunk(imageId: string, offset: number): Promise<OriginalImageChunk> {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new BridgeError('INVALID_ARGUMENT', '圖片分片offset必須是非負整數。');
    const metadata = await this.get(imageId);
    if (!metadata) throw new BridgeError('NOT_FOUND', '找不到本工具產出的圖片。');
    if (offset >= metadata.bytes) throw new BridgeError('INVALID_ARGUMENT', '圖片分片offset超出原檔範圍。');
    const checked = await openCheckedFile(metadata.original_path,
      Math.min(this.limits.max_bytes, DEFAULT_IMAGE_LIMITS.max_bytes), metadata.bytes);
    try {
      const length = Math.min(ORIGINAL_CHUNK_BYTES, metadata.bytes - offset);
      const data = await readRange(checked.file, offset, length);
      await assertUnchangedFile(metadata.original_path, checked.file, checked.stat);
      const nextOffset = offset + data.length;
      return { metadata, data, offset, next_offset: nextOffset === metadata.bytes ? null : nextOffset };
    } finally { await checked.file.close(); }
  }

  private manifestPath(id: string): string { return path.join(this.directory, '.ngini-metadata', `${id}.json`); }
  private withPaths(manifest: ImageManifest): StoredImage {
    const { schema_version: _version, ...metadata } = manifest;
    return { ...metadata, original_path: path.join(this.directory, manifest.filename), preview_path: path.join(this.directory, manifest.preview_filename) };
  }
}

export interface CheckedDirectory { filename: string; stat: Stats }

/** Internally configured storage only; never expose this path as a tool argument. */
export async function preflightStorageDirectory(directory: string, atomicPublication = false): Promise<void> {
  const owned: { filename: string; stat: Stats }[] = [];
  let checked: CheckedDirectory[] = [];
  let failure: unknown;
  try {
    checked = await ensureSafeDirectory(directory);
    await assertUnchangedDirectories(checked);
    const filename = path.join(path.resolve(directory), `.ngini-storage-check-${randomUUID()}.tmp`);
    const file = await open(filename, 'wx', 0o600);
    try {
      const stat = await file.stat();
      owned.push({ filename, stat });
      await file.writeFile('Ngini Image Bridge storage check\n');
      await file.sync();
    } finally { await file.close(); }
    await assertUnchangedDirectories(checked);
    if (atomicPublication) {
      // save() publishes new originals/metadata with hard links, without replacing files.
      const published = `${filename}.published`;
      await link(filename, published);
      owned.push({ filename: published, stat: owned[0]!.stat });
    }
  } catch (error) { failure = error; }
  // Only exclusive creations belonging to this check may be removed. A
  // collision, junction swap, or replaced file cannot authorize deleting it.
  for (const file of owned.reverse()) {
    try {
      await assertUnchangedDirectories(checked);
      const actual = await lstat(file.filename);
      if (!actual.isFile() || actual.isSymbolicLink() || actual.dev !== file.stat.dev || actual.ino !== file.stat.ino) {
        throw new Error('Storage probe ownership changed');
      }
      await unlink(file.filename);
    } catch (error) { failure ??= error; }
  }
  if (failure !== undefined) {
    throw new BridgeError('STORAGE_ERROR', '圖片儲存目錄無法安全建立、寫入或清理檔案；沒有再次提交生成。', undefined, { cause: failure });
  }
}

/** Check every existing ancestor before creating a child; mkdir must not follow a junction. */
export async function ensureSafeDirectory(directory: string, create = true): Promise<CheckedDirectory[]> {
  const absolute = path.resolve(directory);
  const root = path.parse(absolute).root;
  const components = path.relative(root, absolute).split(path.sep).filter(Boolean);
  const checked: CheckedDirectory[] = [];
  let current = root;
  for (const component of [undefined, ...components]) {
    if (component !== undefined) current = path.join(current, component);
    let stat: Stats;
    try { stat = await lstat(current); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || component === undefined || !create) throw error;
      await assertUnchangedDirectories(checked);
      try { await mkdir(current); }
      catch (creationError) {
        if ((creationError as NodeJS.ErrnoException).code !== 'EEXIST') throw creationError;
      }
      stat = await lstat(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new BridgeError('STORAGE_ERROR', '圖片儲存路徑不是安全的一般資料夾。');
    }
    checked.push({ filename: current, stat });
  }
  await assertUnchangedDirectories(checked);
  return checked;
}

export async function assertUnchangedDirectories(checked: CheckedDirectory[]): Promise<void> {
  for (const directory of checked) {
    const actual = await lstat(directory.filename);
    if (!actual.isDirectory() || actual.isSymbolicLink()
      || actual.dev !== directory.stat.dev || actual.ino !== directory.stat.ino) {
      throw new BridgeError('STORAGE_ERROR', '圖片儲存目錄於檢查期間變動。');
    }
  }
}

/** Bounded read of an internally selected image/download path, never a tool argument. */
export async function readBoundedImageFile(filename: string, maxBytes = DEFAULT_IMAGE_LIMITS.max_bytes,
  expectedSize?: number): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new BridgeError('INVALID_ARGUMENT', '不合法的圖片讀取上限。');
  const checked = await openCheckedFile(filename, Math.min(maxBytes, DEFAULT_IMAGE_LIMITS.max_bytes), expectedSize);
  try {
    const bytes = await readRange(checked.file, 0, checked.stat.size);
    await assertUnchangedFile(filename, checked.file, checked.stat);
    return bytes;
  } finally { await checked.file.close(); }
}

async function boundedPreview(data: Uint8Array, maxPixels: number): Promise<Buffer> {
  for (let edge = 768; edge >= 16; edge = Math.floor(edge * 0.75)) {
    const preview = await sharp(data, { limitInputPixels: maxPixels, failOn: 'error' })
      .rotate().resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    if (preview.length <= MAX_TRANSPORT_PREVIEW_BYTES) return preview;
  }
  throw new BridgeError('INVALID_IMAGE', '無法產生傳輸上限內的PNG預覽。');
}

async function openCheckedFile(filename: string, maxBytes: number, expectedSize?: number): Promise<{ file: FileHandle; stat: Stats }> {
  const before = await lstat(filename);
  if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || before.size > maxBytes
      || (expectedSize !== undefined && before.size !== expectedSize)) {
    throw new BridgeError('INVALID_IMAGE', '圖片檔案不是安全的完整一般檔案。');
  }
  const file = await open(filename, 'r');
  try {
    const opened = await file.stat();
    if (!sameFile(before, opened)) throw new BridgeError('INVALID_IMAGE', '圖片檔案於開啟時變動。');
    await assertUnchangedFile(filename, file, before);
    return { file, stat: before };
  } catch (error) {
    await file.close();
    throw error;
  }
}

function sameFile(expected: Stats, actual: Stats): boolean {
  return actual.isFile() && !actual.isSymbolicLink() && expected.dev === actual.dev
    && expected.ino === actual.ino && expected.size === actual.size
    && expected.mtimeMs === actual.mtimeMs && expected.ctimeMs === actual.ctimeMs;
}

async function assertUnchangedFile(filename: string, file: FileHandle, expected: Stats): Promise<void> {
  if (!sameFile(expected, await file.stat()) || !sameFile(expected, await lstat(filename))) {
    throw new BridgeError('INVALID_IMAGE', '圖片檔案於讀取期間變動。');
  }
}

async function readRange(file: FileHandle, offset: number, length: number): Promise<Buffer> {
  const bytes = Buffer.allocUnsafe(length);
  let read = 0;
  while (read < length) {
    const result = await file.read(bytes, read, length - read, offset + read);
    if (result.bytesRead === 0) throw new BridgeError('INVALID_IMAGE', '圖片檔案讀取未完成。');
    read += result.bytesRead;
  }
  return bytes;
}

function assertImageId(id: string): void {
  if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) {
    throw new BridgeError('INVALID_ARGUMENT', 'image_id 必須是本工具產出的識別碼。');
  }
}

async function writeNew(filename: string, data: Uint8Array | string): Promise<void> {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  let created = false;
  try {
    const file = await open(temporary, 'wx', 0o600);
    created = true;
    try { await file.writeFile(data); await file.sync(); }
    finally { await file.close(); }
    // Hard-link publication is atomic and fails rather than replacing a file.
    await link(temporary, filename);
  } finally {
    if (created) await unlink(temporary).catch(() => undefined);
  }
}
