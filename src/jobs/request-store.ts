import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { BridgeError, ERROR_CODES } from '../shared/errors.js';
import type { BrowserCheckpoint } from '../browser/result-tracker.js';
import { ProfileLock, processIsAlive } from './profile-lock.js';
import {
  assertDelivery, assertTransition, isBlockingRequest, JOB_STATUSES, UNKNOWN_QUOTA,
  type DeliveryEvidence, type JobStatus, type RequestRecord,
} from './state-machine.js';

export type RequestPatch = Partial<Pick<RequestRecord, 'message' | 'error' | 'image' | 'quota' | 'delivery' | 'submitted_at'
  | 'source' | 'browser_checkpoint' | 'provider_image_count' | 'recovery_error' | 'interrupted_phase'>>;
export interface BeginResult { kind: 'created' | 'existing'; record: RequestRecord }

export function assertRequestId(requestId: string): void {
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(requestId)) {
    throw new BridgeError('INVALID_ARGUMENT', 'request_id 必須是 1–160 字元的安全唯一識別碼。');
  }
}

export function hashPrompt(prompt: string): string { return createHash('sha256').update(prompt, 'utf8').digest('hex'); }

/** Durable metadata only. The full prompt is held by the caller in memory. */
export class RequestStore {
  private constructor(readonly directory: string) {}

  static async open(directory: string): Promise<RequestStore> {
    const store = new RequestStore(path.resolve(directory));
    await mkdir(store.directory, { recursive: true });
    await store.withLock(async () => {
      for (const record of await store.readAll()) {
        // A recorded failure already preserves its original uncertainty or manual handoff.
        // Only interrupted in-flight work needs conversion; reopening must not rewrite it.
        if (record.status === 'failed' || !isBlockingRequest(record) || processIsAlive(record.owner_pid)) continue;
        const previous = record.status;
        const started = record.submission_started_at !== undefined;
        // Read-only recovery changes the phase, never the submission confirmation.
        // A second crash must retain uncertainty even after the original error was cleared.
        const uncertain = previous === 'submitting' || (started && record.submitted_at === undefined);
        record.status = 'failed';
        record.interrupted_phase = previous;
        record.updated_at = new Date().toISOString();
        record.error = uncertain
          ? { code: 'SUBMISSION_UNKNOWN', message: '程序中斷時尚未確認提交；必須查核原頁面，不能再次生成。' }
          : started
            ? { code: 'GENERATION_TIMEOUT', message: '先前程序已中斷；只可查詢或取得原任務結果。' }
            : { code: 'PROCESS_INTERRUPTED', message: '先前程序在提交前中斷，未自動重新執行。' };
        await store.write(record);
      }
    });
    return store;
  }

  async begin(requestId: string, prompt: string, metadata: { source?: 'fixture' | 'ngini' } = {}): Promise<BeginResult> {
    assertRequestId(requestId);
    if (typeof prompt !== 'string' || prompt.trim().length === 0) throw new BridgeError('INVALID_ARGUMENT', '生圖描述不能空白。');
    const promptHash = hashPrompt(prompt);
    return this.withLock(async () => {
      const existing = await this.read(requestId);
      if (existing) {
        if (existing.prompt_sha256 !== promptHash) throw new BridgeError('PARAMETER_CONFLICT', '相同 request_id 不能使用不同描述。');
        return { kind: 'existing', record: existing };
      }
      const active = (await this.readAll()).find(isBlockingRequest);
      if (active) {
        const duplicate = active.prompt_sha256 === promptHash;
        throw new BridgeError(duplicate ? 'DUPLICATE_ACTIVE_REQUEST' : 'BUSY',
          duplicate ? '相同描述已有任務，請查詢原 request_id。' : '已有一個生成任務處理中。',
          { request_id: active.request_id });
      }
      const now = new Date().toISOString();
      const record: RequestRecord = {
        schema_version: 1, request_id: requestId, prompt_sha256: promptHash,
        status: 'received', created_at: now, updated_at: now, owner_pid: process.pid,
        quota: { ...UNKNOWN_QUOTA },
        ...(metadata.source ? { source: metadata.source } : {}),
      };
      await this.write(record);
      return { kind: 'created', record };
    });
  }

  async get(requestId: string): Promise<RequestRecord | undefined> {
    assertRequestId(requestId);
    // Share the publication lock so Windows readers cannot hold the target during atomic replacement.
    return this.withLock(() => this.read(requestId));
  }

  async list(): Promise<RequestRecord[]> { return this.withLock(() => this.readAll()); }

  /** Maintenance must not race begin/recovery; callback must never reenter this store lock. */
  async whenIdleMaintenance(operation: () => Promise<void>): Promise<boolean> {
    return this.withLock(async () => {
      if ((await this.readAll()).some(isBlockingRequest)) return false;
      await operation();
      return true;
    });
  }

  async transition(requestId: string, status: JobStatus, patch: RequestPatch = {}): Promise<RequestRecord> {
    assertRequestId(requestId);
    if (!JOB_STATUSES.includes(status)) throw new BridgeError('INVALID_ARGUMENT', '未知任務階段。');
    return this.withLock(async () => {
      const record = await this.require(requestId);
      const previousStatus = record.status;
      assertTransition(record, status);
      if (status === 'delivered') assertDelivery({ ...record, ...patch }, patch.delivery ?? record.delivery);
      if (patch.browser_checkpoint) patch = { ...patch, browser_checkpoint: validateCheckpoint(patch.browser_checkpoint, requestId) };
      if (record.source && Object.hasOwn(patch, 'source') && record.source !== patch.source) {
        throw new BridgeError('PARAMETER_CONFLICT', '已建立任務的圖片來源不能變更。');
      }
      Object.assign(record, patch);
      record.status = status;
      record.updated_at = new Date().toISOString();
      record.owner_pid = process.pid;
      if (status === 'submitting' && record.submission_started_at === undefined) {
        // This fsynced record is committed before the browser can click Send.
        record.submission_started_at = record.updated_at;
      }
      if (status === 'waiting_for_image' && previousStatus === 'submitting'
        && record.submitted_at === undefined && record.error?.code !== 'SUBMISSION_UNKNOWN') {
        record.submitted_at = record.updated_at;
      }
      if (status !== 'failed') delete record.error;
      await this.write(record);
      return record;
    });
  }

  async cancel(requestId: string): Promise<RequestRecord> {
    const record = await this.get(requestId);
    if (!record) throw new BridgeError('NOT_FOUND', '找不到這個任務。');
    if (record.status === 'delivered' || record.status === 'cancelled') return record;
    return this.transition(requestId, 'cancelled', {
      message: record.submission_started_at
        ? record.source === 'fixture' ? '已停止本機診斷測試；沒有提交 Ngini。'
          : '已停止本機處理；網站可能已使用額度，不能保證停止生成或退款。'
        : '已在提交前取消，未送出生成。',
    });
  }

  async markDelivery(requestId: string, evidence: DeliveryEvidence): Promise<RequestRecord> {
    const record = await this.get(requestId);
    if (!record) throw new BridgeError('NOT_FOUND', '找不到這個任務。');
    if (record.status === 'image_ready') await this.transition(requestId, 'presenting');
    return this.transition(requestId, 'delivered', { delivery: evidence });
  }

  private filename(requestId: string): string {
    return path.join(this.directory, `${createHash('sha256').update(requestId).digest('hex')}.json`);
  }

  private async require(requestId: string): Promise<RequestRecord> {
    const record = await this.read(requestId);
    if (!record) throw new BridgeError('NOT_FOUND', '找不到這個任務。');
    return record;
  }

  private async read(requestId: string): Promise<RequestRecord | undefined> {
    try { return parseRecord(await readFile(this.filename(requestId), 'utf8'), requestId); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      if (error instanceof BridgeError) throw error;
      throw new BridgeError('STORAGE_ERROR', '無法讀取本機任務紀錄。');
    }
  }

  private async readAll(): Promise<RequestRecord[]> {
    const entries = await readdir(this.directory);
    const records: RequestRecord[] = [];
    for (const entry of entries) {
      if (!/^[a-f0-9]{64}\.json$/.test(entry)) continue;
      records.push(parseRecord(await readFile(path.join(this.directory, entry), 'utf8')));
    }
    return records.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  private async write(record: RequestRecord): Promise<void> {
    // Check before publication as well as on restart, so an invalid patch cannot
    // replace the last known-good record or claim image readiness/delivery.
    const json = JSON.stringify(record);
    parseRecord(json, record.request_id);
    const target = this.filename(record.request_id);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(json); await file.sync(); }
      finally { await file.close(); }
      // Windows can temporarily deny replacing a file while a concurrent reader or scanner holds it.
      // Retry only the same fsynced metadata publication, never a browser submission, and keep atomic rename.
      for (let attempt = 0; ; attempt++) {
        try { await rename(temporary, target); break; }
        catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (attempt >= 4 || (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY')) throw error;
          await delay(10 * (attempt + 1));
        }
      }
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw new BridgeError('STORAGE_ERROR', '無法原子保存任務；沒有再次提交生成。', undefined, { cause: error });
    }
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const lock = await ProfileLock.acquire(this.directory, { name: '.ngini-store.lock', wait_ms: 5000 });
    try { return await operation(); }
    finally { await lock.release(); }
  }
}

function parseRecord(json: string, expectedId?: string): RequestRecord {
  try {
    const record = JSON.parse(json) as RequestRecord;
    if (record.schema_version !== 1 || typeof record.request_id !== 'string'
      || (expectedId !== undefined && record.request_id !== expectedId)
      || !/^[a-f0-9]{64}$/.test(record.prompt_sha256)
      || !JOB_STATUSES.includes(record.status) || !Number.isSafeInteger(record.owner_pid)
      || record.owner_pid <= 0 || !validDate(record.created_at) || !validDate(record.updated_at)) throw new Error('Invalid record');
    assertRequestId(record.request_id);
    if (record.source !== undefined && record.source !== 'fixture' && record.source !== 'ngini') throw new Error('Invalid source');
    for (const timestamp of [record.submission_started_at, record.submitted_at]) {
      if (timestamp !== undefined && !validDate(timestamp)) throw new Error('Invalid submission timestamp');
    }
    if (record.submitted_at !== undefined && record.submission_started_at === undefined) throw new Error('Missing submission boundary');
    for (const failure of [record.error, record.recovery_error]) {
      if (failure !== undefined && (!failure || !ERROR_CODES.includes(failure.code) || typeof failure.message !== 'string')) throw new Error('Invalid error');
    }
    const quota = record.quota;
    if (!quota || !['unknown', 'available', 'exhausted'].includes(quota.availability)
      || !['page', 'not_observed'].includes(quota.source)
      || (quota.remaining !== null && (!Number.isSafeInteger(quota.remaining) || quota.remaining < 0))
      || (quota.observed_at !== null && !validDate(quota.observed_at))) throw new Error('Invalid quota');
    if (record.image !== undefined) {
      const image = record.image;
      if (!image || typeof image.image_id !== 'string'
        || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(image.image_id)
        || typeof image.filename !== 'string' || !/^[A-Za-z0-9_-]+\.(png|jpg|webp)$/.test(image.filename)
        || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mime)
        || !Number.isSafeInteger(image.bytes) || image.bytes <= 0 || image.bytes > 25 * 1024 * 1024
        || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
        || image.width <= 0 || image.height <= 0 || image.width * image.height > 64_000_000
        || !/^[a-f0-9]{64}$/.test(image.sha256)) throw new Error('Invalid image summary');
    }
    if (['image_ready', 'presenting', 'delivered'].includes(record.status) && !record.image) throw new Error('Missing image');
    if (record.status === 'delivered') assertDelivery(record, record.delivery);
    if (record.browser_checkpoint) record.browser_checkpoint = validateCheckpoint(record.browser_checkpoint, record.request_id);
    return record;
  } catch {
    throw new BridgeError('STORAGE_ERROR', '本機任務紀錄無法驗證；不會重新送出生成。');
  }
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validateCheckpoint(checkpoint: BrowserCheckpoint, requestId: string): BrowserCheckpoint {
  try {
    const allowed = new Set(['request_id', 'page_url', 'baseline_message_keys', 'baseline_result_keys', 'prompt_sha256', 'submission_started_at']);
    if (!checkpoint || typeof checkpoint !== 'object' || Object.keys(checkpoint).some(key => !allowed.has(key))
      || checkpoint.request_id !== requestId || typeof checkpoint.page_url !== 'string') throw new Error('Invalid checkpoint');
    const url = new URL(checkpoint.page_url);
    // Query/hash can contain a prompt or cause a navigation to auto-submit. Store only a clean observed page URL.
    if (url.protocol !== 'https:' || url.hostname !== 'ngini.com' || url.username || url.password || url.port || url.search || url.hash) {
      throw new Error('Unsafe resume URL');
    }
    for (const keys of [checkpoint.baseline_message_keys, checkpoint.baseline_result_keys]) {
      if (!Array.isArray(keys) || keys.length > 1000 || keys.some(key => typeof key !== 'string' || key.length > 256)) throw new Error('Invalid baseline');
    }
    if (checkpoint.prompt_sha256 !== undefined && !/^[a-f0-9]{64}$/.test(checkpoint.prompt_sha256)) throw new Error('Invalid prompt digest');
    if (checkpoint.submission_started_at !== undefined && (!checkpoint.prompt_sha256 || !Number.isFinite(Date.parse(checkpoint.submission_started_at)))) {
      throw new Error('Invalid submission marker');
    }
    return structuredClone(checkpoint);
  } catch {
    throw new BridgeError('STORAGE_ERROR', '瀏覽器恢復紀錄無法安全驗證；沒有重新送出生成。');
  }
}
