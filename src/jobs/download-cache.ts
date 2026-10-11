import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, opendir, rmdir, unlink } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { assertUnchangedDirectories, ensureSafeDirectory, type CheckedDirectory } from '../images/image-store.js';
import { BridgeError } from '../shared/errors.js';
import { processIsAlive } from './profile-lock.js';

export const DOWNLOAD_CACHE_POLICY = { max_bytes: 64 * 1024 * 1024, max_age_ms: 24 * 60 * 60 * 1000 } as const;
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const OWNED_NAME = new RegExp(`^ngini-download-(${UUID})$`);
const OWNER_FILE = '.ngini-download-owner.json';
const IMAGE_FILE = 'image.download';
const MAX_SCAN_ENTRIES = 4096;
const MAX_OWNER_BYTES = 1024;
interface Owner { schema_version: 1; tool: 'ngini-image-bridge'; id: string; pid: number; created_at: string }
interface OwnedDirectory {
  directory: string; stat: Stats; owner: Owner; owner_stat: Stats; image_stat?: Stats; bytes: number;
}
export interface DownloadCacheCleanupResult {
  scanned: number; removed: number; removed_bytes: number; retained_bytes: number; skipped: number; scan_limited: boolean;
}
export interface DownloadTemporary { filename: string; remove(): Promise<void> }

/** A private, exclusive child; no legacy UUID.download file is assumed to be owned. */
export async function createDownloadTemporary(root: string): Promise<DownloadTemporary> {
  let ancestors: CheckedDirectory[] = [];
  let created: { directory: string; stat: Stats } | undefined;
  try {
    ancestors = await ensureSafeDirectory(root);
    await assertUnchangedDirectories(ancestors);
    const id = randomUUID();
    const directory = path.join(path.resolve(root), `ngini-download-${id}`);
    await mkdir(directory, { mode: 0o700 });
    const stat = await lstat(directory);
    created = { directory, stat };
    const owner: Owner = { schema_version: 1, tool: 'ngini-image-bridge', id, pid: process.pid, created_at: new Date().toISOString() };
    await assertDirectory(ancestors, directory, stat);
    const file = await open(path.join(directory, OWNER_FILE), 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(owner)); await file.sync(); }
    finally { await file.close(); }
    const owned = await inspectOwnedDirectory(ancestors, directory, id);
    return {
      filename: path.join(directory, IMAGE_FILE),
      async remove() {
        await assertDirectory(ancestors, directory, owned.stat);
        const current = await inspectOwnedDirectory(ancestors, directory, id);
        if (!sameFile(current.owner_stat, owned.owner_stat)) throw new Error('Download ownership changed');
        await removeOwnedDirectory(ancestors, current);
      },
    };
  } catch (error) {
    // A failed owner publication is not permission to delete arbitrary children.
    // rmdir can remove only the exact empty child we just created.
    if (created) {
      try { await assertDirectory(ancestors, created.directory, created.stat); await rmdir(created.directory); } catch { /* Preserve uncertain leftovers. */ }
    }
    throw new BridgeError('STORAGE_ERROR', '無法安全建立下載暫存；沒有再次提交生成。', undefined, { cause: error });
  }
}

/** Call only while holding the request-store idle gate and the browser-session lock. */
export async function cleanupDownloadCache(root: string,
  options: { now?: number; max_bytes?: number; max_age_ms?: number } = {}): Promise<DownloadCacheCleanupResult> {
  const now = options.now ?? Date.now();
  const maxBytes = options.max_bytes ?? DOWNLOAD_CACHE_POLICY.max_bytes;
  const maxAge = options.max_age_ms ?? DOWNLOAD_CACHE_POLICY.max_age_ms;
  if (![now, maxBytes, maxAge].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new BridgeError('INVALID_ARGUMENT', '不合法的下載快取清理界限。');
  }
  const result: DownloadCacheCleanupResult = { scanned: 0, removed: 0, removed_bytes: 0, retained_bytes: 0, skipped: 0, scan_limited: false };
  let ancestors: CheckedDirectory[];
  try { ancestors = await ensureSafeDirectory(root, false); } catch { return result; }
  const candidates: OwnedDirectory[] = [];
  const entries = await opendir(root);
  for await (const entry of entries) {
    if (result.scanned >= MAX_SCAN_ENTRIES) { result.scan_limited = true; break; }
    result.scanned++;
    const match = OWNED_NAME.exec(entry.name);
    if (!match || !entry.isDirectory() || entry.isSymbolicLink()) { result.skipped++; continue; }
    try {
      const owned = await inspectOwnedDirectory(ancestors, path.join(path.resolve(root), entry.name), match[1]!);
      // A recycled PID can retain old data; uncertainty favors preservation.
      if (processIsAlive(owned.owner.pid) || Date.parse(owned.owner.created_at) > now) { result.skipped++; continue; }
      candidates.push(owned);
      result.retained_bytes += owned.bytes;
    } catch { result.skipped++; }
  }
  candidates.sort((left, right) => Date.parse(left.owner.created_at) - Date.parse(right.owner.created_at));
  for (const candidate of candidates) {
    if (now - Date.parse(candidate.owner.created_at) < maxAge && result.retained_bytes <= maxBytes) continue;
    try {
      if (processIsAlive(candidate.owner.pid)) { result.skipped++; continue; }
      await removeOwnedDirectory(ancestors, candidate);
      result.removed++; result.removed_bytes += candidate.bytes; result.retained_bytes -= candidate.bytes;
    } catch { result.skipped++; }
  }
  return result;
}

async function inspectOwnedDirectory(ancestors: CheckedDirectory[], directory: string, id: string): Promise<OwnedDirectory> {
  await assertUnchangedDirectories(ancestors);
  const stat = await lstat(directory);
  await assertDirectory(ancestors, directory, stat);
  // Never recurse. Any unrecognized child, link, or file replacement preserves the whole directory.
  const children: string[] = [];
  const entries = await opendir(directory);
  for await (const entry of entries) {
    children.push(entry.name);
    if (children.length > 2) throw new Error('Unknown download children');
  }
  if (!children.includes(OWNER_FILE) || children.some(name => name !== OWNER_FILE && name !== IMAGE_FILE)) throw new Error('Unknown download children');
  const ownerPath = path.join(directory, OWNER_FILE);
  const ownerStat = await lstat(ownerPath);
  if (!plainFile(ownerStat) || ownerStat.size < 1 || ownerStat.size > MAX_OWNER_BYTES) throw new Error('Invalid download owner');
  const file = await open(ownerPath, 'r');
  let owner: Owner;
  try {
    if (!sameFile(ownerStat, await file.stat())) throw new Error('Download owner changed');
    const bytes = Buffer.alloc(ownerStat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await file.read(bytes, offset, bytes.length - offset, offset);
      if (read.bytesRead === 0) throw new Error('Incomplete download owner');
      offset += read.bytesRead;
    }
    owner = JSON.parse(bytes.toString('utf8')) as Owner;
    if (!sameFile(ownerStat, await file.stat()) || !sameFile(ownerStat, await lstat(ownerPath))) throw new Error('Download owner changed');
  } finally { await file.close(); }
  if (Object.keys(owner).length !== 5 || owner.schema_version !== 1 || owner.tool !== 'ngini-image-bridge' || owner.id !== id
    || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.created_at !== 'string'
    || !Number.isFinite(Date.parse(owner.created_at))) throw new Error('Invalid download ownership');
  let imageStat: Stats | undefined;
  if (children.includes(IMAGE_FILE)) {
    imageStat = await lstat(path.join(directory, IMAGE_FILE));
    if (!plainFile(imageStat) || !Number.isSafeInteger(imageStat.size) || imageStat.size < 0) throw new Error('Unsafe temporary image');
  }
  await assertDirectory(ancestors, directory, stat);
  return { directory, stat, owner, owner_stat: ownerStat, ...(imageStat ? { image_stat: imageStat } : {}), bytes: ownerStat.size + (imageStat?.size ?? 0) };
}

async function removeOwnedDirectory(ancestors: CheckedDirectory[], candidate: OwnedDirectory): Promise<void> {
  const current = await inspectOwnedDirectory(ancestors, candidate.directory, candidate.owner.id);
  if (!sameDirectory(candidate.stat, current.stat) || !sameFile(candidate.owner_stat, current.owner_stat)
    || (candidate.image_stat ? !current.image_stat || !sameFile(candidate.image_stat, current.image_stat) : current.image_stat !== undefined)) {
    throw new Error('Download cache changed before deletion');
  }
  if (current.image_stat) {
    await assertDirectory(ancestors, current.directory, current.stat);
    const filename = path.join(current.directory, IMAGE_FILE);
    if (!sameFile(current.image_stat, await lstat(filename))) throw new Error('Download changed before deletion');
    await unlink(filename);
  }
  await assertDirectory(ancestors, current.directory, current.stat);
  const ownerPath = path.join(current.directory, OWNER_FILE);
  if (!sameFile(current.owner_stat, await lstat(ownerPath))) throw new Error('Download owner changed before deletion');
  await unlink(ownerPath);
  await assertDirectory(ancestors, current.directory, current.stat);
  await rmdir(current.directory); // Unknown files added concurrently prevent removal; no recursive deletion.
}

function plainFile(stat: Stats): boolean { return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1; }
function sameFile(expected: Stats, actual: Stats): boolean {
  return plainFile(actual) && expected.dev === actual.dev && expected.ino === actual.ino && expected.size === actual.size
    && expected.mtimeMs === actual.mtimeMs && expected.ctimeMs === actual.ctimeMs;
}
function sameDirectory(expected: Stats, actual: Stats): boolean {
  return actual.isDirectory() && !actual.isSymbolicLink() && expected.dev === actual.dev && expected.ino === actual.ino;
}
async function assertDirectory(ancestors: CheckedDirectory[], directory: string, expected: Stats): Promise<void> {
  await assertUnchangedDirectories(ancestors);
  if (!sameDirectory(expected, await lstat(directory))) throw new Error('Download directory changed');
}
