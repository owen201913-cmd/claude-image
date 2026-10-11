import path from 'node:path';
import sharp from 'sharp';
import { NginiAdapter, type BrowserCheckpoint, type BrowserResult } from '../browser/ngini-adapter.js';
import { ImageStore, preflightStorageDirectory, readBoundedImageFile } from '../images/image-store.js';
import { RequestStore, type RequestPatch } from './request-store.js';
import { isPreSubmissionHuman, type JobImage, type RequestRecord } from './state-machine.js';
import { BridgeError, errorInfo } from '../shared/errors.js';
import { getConfig } from '../shared/config.js';
import { cleanupDownloadCache, createDownloadTemporary, type DownloadTemporary } from './download-cache.js';
import { ProfileLock } from './profile-lock.js';

export type GenerationAdapter = Pick<NginiAdapter, 'open' | 'submit' | 'wait' | 'recover' | 'download' | 'close'> & {
  /** Recheck only a retained, never-submitted page without navigating or sending. */
  recheckBeforeSubmit?(requestId: string, signal?: AbortSignal): Promise<BrowserCheckpoint>;
};
// Older candidates prematurely classified an image task's first text as terminal.
// Recovery only reads the original checkpoint and can never invoke submit().
const RECOVERABLE = new Set(['SUBMISSION_UNKNOWN', 'GENERATION_TIMEOUT', 'DOWNLOAD_FAILED', 'STORAGE_ERROR', 'PROVIDER_TEXT_ONLY', 'HUMAN_VERIFICATION_REQUIRED']);

export class JobRunner {
  private active = new Map<string, { controller: AbortController; promise: Promise<void> }>();
  private recoveryTried = new Set<string>();
  private retained = new Map<string, GenerationAdapter>();
  private stopping = false;
  private lastMaintenance = 0;
  private maintenance?: Promise<void>;

  constructor(readonly requests: RequestStore, readonly images: ImageStore,
    readonly config: ReturnType<typeof getConfig>,
    private readonly makeAdapter: () => GenerationAdapter = () => new NginiAdapter({
      dataDir: config.dataDir, operationTimeoutMs: config.operationTimeoutMs,
      headless: config.browserHeadless,
      generationTimeoutMs: config.generationTimeoutMs, downloadTimeoutMs: config.downloadTimeoutMs,
    })) {}

  async generate(id: string, prompt: string, signal?: AbortSignal): Promise<RequestRecord> {
    if (this.stopping) throw new BridgeError('PROCESS_INTERRUPTED', '工具程序正在停止，沒有提交生成。');
    if (signal?.aborted) throw new BridgeError('CANCELLED', '已在提交前取消，未送出生成。');
    if (Buffer.byteLength(prompt, 'utf8') > 32768) throw new BridgeError('INVALID_ARGUMENT', '描述超過本工具暫定 32 KiB 傳輸上限；網站上限尚未量測。');
    if (this.active.size > 0 && !this.active.has(id)) throw new BridgeError('BUSY', '專用瀏覽器仍有任務處理中。');
    if (this.retained.size > 0 && !this.retained.has(id)) throw new BridgeError('BUSY', '原任務仍保留人工驗證頁面，請先完成或取消原任務。');
    await this.maintainDownloadCache();
    if (this.stopping) throw new BridgeError('PROCESS_INTERRUPTED', '工具程序正在停止，沒有提交生成。');
    if (signal?.aborted) throw new BridgeError('CANCELLED', '已在提交前取消，未送出生成。');
    const { kind, record } = await this.requests.begin(id, prompt, { source: this.config.fixtureMode ? 'fixture' : 'ngini' });
    // begin() may wait for another process's publication lock. Shutdown/cancel
    // during that wait must not start an untracked browser after shutdown settled.
    if (kind === 'created' && (this.stopping || signal?.aborted)) {
      return this.stopping ? this.interrupt(id) : this.requests.cancel(id);
    }
    if (kind === 'existing') {
      const held = this.retained.get(id);
      // begin() checked the original caller hash. No retained page or any submission marker means no replay.
      if (this.active.has(id) || !isPreSubmissionHuman(record) || !held?.recheckBeforeSubmit || this.config.browserHeadless) return record;
      let releaseReservation!: () => void;
      const reservation = { controller: new AbortController(), promise: new Promise<void>(resolve => { releaseReservation = resolve; }) };
      this.active.set(id, reservation);
      try {
        const resuming = await this.requests.transition(id, 'opening_page', {
          message: '正在查核保留的人工驗證頁面；本任務尚未提交生成。', recovery_error: undefined,
        });
        if (this.stopping || reservation.controller.signal.aborted || signal?.aborted) {
          return this.stopping ? await this.interrupt(id) : await this.requests.cancel(id);
        }
        this.start(id, localSignal => this.run(id, prompt, localSignal, undefined, held), signal);
        return resuming;
      } finally {
        if (this.active.get(id) === reservation) this.active.delete(id);
        releaseReservation();
      }
    }
    this.start(id, localSignal => this.run(id, prompt, localSignal), signal);
    return record;
  }

  async get(id: string): Promise<RequestRecord> {
    await this.maintainDownloadCache();
    const record = await this.requests.get(id);
    if (!record) throw new BridgeError('NOT_FOUND', '找不到這個任務。');
    // A background challenge needs explicit manual handoff. Polling cannot
    // repeat the inaccessible page or turn a stopped browser into a visible one.
    if (this.config.browserHeadless && (record.error?.code === 'HUMAN_VERIFICATION_REQUIRED'
      || record.recovery_error?.code === 'HUMAN_VERIFICATION_REQUIRED'
      || record.error?.details?.browser_visibility === 'background'
      || record.recovery_error?.details?.browser_visibility === 'background')) return record;
    // One bounded recovery per server lifetime. Polling can never click Send or recreate a fixture.
    const heldHuman = this.retained.has(id) && (record.error?.code === 'HUMAN_VERIFICATION_REQUIRED'
      || record.recovery_error?.code === 'HUMAN_VERIFICATION_REQUIRED');
    if (!this.stopping && this.active.size === 0 && (!this.recoveryTried.has(id) || heldHuman)
      && (this.retained.size === 0 || this.retained.has(id))
      && record.status === 'failed' && record.source === 'ngini' && !record.image
      && record.browser_checkpoint?.submission_started_at && RECOVERABLE.has(record.error?.code ?? '')) {
      this.recoveryTried.add(id);
      // Reserve the profile while publishing the recovery state so concurrent gets/generates cannot start another task.
      let releaseReservation!: () => void;
      const reservation = { controller: new AbortController(), promise: new Promise<void>(resolve => { releaseReservation = resolve; }) };
      this.active.set(id, reservation);
      try {
        const recovering = await this.requests.transition(id, 'waiting_for_image', {
          message: '正在恢復原任務的既有結果；沒有再次提交生成。',
        });
        if (this.stopping || reservation.controller.signal.aborted) {
          return this.stopping ? await this.interrupt(id) : await this.requests.cancel(id);
        }
        // Preserve the original error in the recovery snapshot for a failure, while telling run that its phase is already durable.
        this.start(id, localSignal => this.run(id, undefined, localSignal, { ...record, status: 'waiting_for_image' }), reservation.controller.signal);
        return recovering;
      } finally {
        if (this.active.get(id) === reservation) this.active.delete(id);
        releaseReservation();
      }
    }
    return record;
  }

  async cancel(id: string): Promise<RequestRecord> {
    this.active.get(id)?.controller.abort();
    const record = await this.requests.cancel(id);
    const retained = this.retained.get(id);
    this.retained.delete(id);
    await retained?.close().catch(() => undefined);
    return record;
  }

  private start(id: string, operation: (signal: AbortSignal) => Promise<void>, externalSignal?: AbortSignal): void {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (externalSignal?.aborted) abort();
    else externalSignal?.addEventListener('abort', abort, { once: true });
    const promise = operation(controller.signal)
      // No unhandled background rejection; run() records narrow failures when storage works.
      .catch(() => undefined).finally(() => {
        externalSignal?.removeEventListener('abort', abort);
        this.active.delete(id);
      });
    this.active.set(id, { controller, promise });
  }

  private async run(id: string, prompt: string | undefined, signal: AbortSignal, recovery?: RequestRecord,
    resumedBeforeSubmission?: GenerationAdapter): Promise<void> {
    let adapter: GenerationAdapter | undefined;
    let temporary: DownloadTemporary | undefined;
    let keepForHuman = false;
    const phase = async (status: Parameters<RequestStore['transition']>[1], patch: RequestPatch = {}) => {
      if (signal.aborted) throw new BridgeError('CANCELLED', '已停止本機處理。');
      await this.requests.transition(id, status, patch);
    };
    try {
      // Own any retained browser before storage checks, so a failed preflight
      // also closes it instead of leaving a hidden profile reservation behind.
      adapter = resumedBeforeSubmission ?? this.retained.get(id);
      if (adapter) this.retained.delete(id);
      // Fail before opening/submitting when storage is already unavailable.
      // Recovery checks the same paths but still only reads the original task.
      await this.preflightStorage(signal);
      let bytes: Buffer;
      if (!recovery && !resumedBeforeSubmission) await phase('opening_page');
      if (!recovery && !resumedBeforeSubmission && this.config.fixtureMode) {
        await phase('ready_to_submit'); await phase('submitting'); await phase('waiting_for_image'); await phase('downloading');
        const svg = '<svg width="960" height="640" xmlns="http://www.w3.org/2000/svg"><rect width="960" height="640" fill="#122d43"/><circle cx="480" cy="250" r="115" fill="#ffc56b"/><text x="480" y="440" text-anchor="middle" font-family="sans-serif" font-size="52" fill="white">LOCAL TEST IMAGE</text><text x="480" y="500" text-anchor="middle" font-family="sans-serif" font-size="28" fill="white">NOT GENERATED BY NGINI</text></svg>';
        bytes = await sharp(Buffer.from(svg)).png().toBuffer();
      } else {
        adapter ??= this.makeAdapter();
        let submitted: BrowserCheckpoint;
        let result: BrowserResult;
        if (recovery) {
          submitted = recovery.browser_checkpoint!;
          // get() already committed this phase; repeating it could incorrectly mark an unknown submit as confirmed.
          if (recovery.status !== 'waiting_for_image') await phase('waiting_for_image');
          result = await adapter.recover(submitted, signal, this.config.generationTimeoutMs,
            value => phase('waiting_for_image', { browser_checkpoint: value }));
        } else {
          const checkpoint = resumedBeforeSubmission
            ? await adapter.recheckBeforeSubmit!(id, signal) : await adapter.open(id, signal);
          if (checkpoint.request_id !== id || checkpoint.submission_started_at
            || (resumedBeforeSubmission && checkpoint.prompt_sha256 !== undefined)) {
            throw new BridgeError('SUBMISSION_UNKNOWN', '保留頁面不能確認尚未提交；沒有再次生成。');
          }
          await phase('ready_to_submit', { browser_checkpoint: checkpoint });
          // Opening the provider can take time; recheck before the first and only Send.
          await this.preflightStorage(signal);
          submitted = await adapter.submit(prompt!, checkpoint,
            async value => { await phase('submitting', { browser_checkpoint: value }); }, signal);
          await phase('waiting_for_image', { browser_checkpoint: submitted });
          result = await adapter.wait(submitted, signal, this.config.generationTimeoutMs,
            value => phase('waiting_for_image', { browser_checkpoint: value }));
        }
        await phase('downloading', { quota: result.quota, provider_image_count: result.actual_image_count });
        const tempDir = path.join(this.config.dataDir, 'tmp');
        await this.preflightStorage(signal);
        temporary = await createDownloadTemporary(tempDir);
        await adapter.download(result, temporary.filename, signal);
        // A downloader or changed local file cannot force an unbounded allocation.
        bytes = await readBoundedImageFile(temporary.filename);
      }
      await phase('validating');
      const stored = await this.images.save(bytes, id);
      const { image_id, filename, mime, width, height, bytes: size, sha256 } = stored;
      const image: JobImage = { image_id, filename, mime, width, height, bytes: size, sha256 };
      if (signal.aborted) throw new BridgeError('CANCELLED', '已停止本機處理。');
      const record = await this.requests.get(id);
      await this.requests.transition(id, 'image_ready', { image, message: record?.source === 'fixture'
        ? '本機交付診斷測試圖，並非 Ngini 生成；尚未驗證 Claude 顯示及下載。'
        : '原圖已保存；尚待聊天室預覽及原圖下載驗證。' });
    } catch (error) {
      const record = await this.requests.get(id);
      if (record && record.status !== 'cancelled') {
        if (this.stopping && signal.aborted) {
          await this.interrupt(id);
          return;
        }
        const failure = errorInfo(error, 'UI_CHANGED');
        if (failure.code === 'HUMAN_VERIFICATION_REQUIRED' && adapter && !signal.aborted) {
          keepForHuman = true;
          const started = record.submission_started_at !== undefined || record.submitted_at !== undefined
            || record.browser_checkpoint?.submission_started_at !== undefined;
          if (this.config.browserHeadless) {
            failure.message = started
              ? '背景瀏覽器需要人工驗證。請在外掛設定開啟「顯示網站瀏覽器」並重啟，再以同一 ID 查詢原任務；不會重新送出生成。'
              : '背景瀏覽器需要人工驗證，本次尚未提交。請先取消原任務，在外掛設定開啟「顯示網站瀏覽器」並重啟；下次明確生圖要求才會開啟同一專用瀏覽器供你驗證。原未提交頁面不能跨重啟自動接續。';
            failure.details = { browser_visibility: 'background', manual_handoff: 'enable_visible_browser_and_restart', submitted: started };
          } else {
            const resumeAction = started && record.browser_checkpoint?.submission_started_at
              ? 'get_same_request' : !started && adapter.recheckBeforeSubmit ? 'generate_same_request' : undefined;
            if (resumeAction) failure.details = { resume_action: resumeAction };
          }
        }
        if (recovery && failure.code !== 'CANCELLED') {
          // A failed DOM recovery cannot turn a still-unknown provider submission into safe-to-resubmit.
          const originalError = failure.code === 'HUMAN_VERIFICATION_REQUIRED' && recovery.error
            ? { ...recovery.error, details: failure.details } : recovery.error;
          await this.requests.transition(id, 'failed', { error: originalError,
            recovery_error: failure, message: `${failure.message} 原任務沒有再次提交。` });
        } else {
          await this.requests.transition(id, failure.code === 'CANCELLED' ? 'cancelled' : 'failed', { error: failure, message: failure.message });
        }
      }
    } finally {
      try { keepForHuman = keepForHuman && (await this.requests.get(id))?.status === 'failed' && !signal.aborted && !this.stopping; }
      catch { keepForHuman = false; }
      if (keepForHuman && adapter) this.retained.set(id, adapter);
      else await adapter?.close().catch(() => undefined);
      await temporary?.remove().catch(() => undefined);
    }
  }

  private async maintainDownloadCache(): Promise<void> {
    if (this.stopping || this.active.size || this.retained.size || Date.now() - this.lastMaintenance < 5 * 60 * 1000) return;
    if (this.maintenance) return this.maintenance;
    const operation = (async () => {
      // Keep lock order store -> browser. The callback never reenters RequestStore.
      await this.requests.whenIdleMaintenance(async () => {
        const lock = await ProfileLock.acquire(this.config.dataDir, { name: '.browser-session.lock' });
        try { await cleanupDownloadCache(path.join(this.config.dataDir, 'tmp')); }
        finally { await lock.release(); }
      });
    })().catch(() => undefined).finally(() => { this.lastMaintenance = Date.now(); });
    this.maintenance = operation;
    try { await operation; }
    finally { if (this.maintenance === operation) this.maintenance = undefined; }
  }

  private async preflightStorage(signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new BridgeError('CANCELLED', '已在儲存檢查期間停止本機處理。');
    await this.images.preflight();
    if (signal.aborted) throw new BridgeError('CANCELLED', '已在儲存檢查期間停止本機處理。');
    await preflightStorageDirectory(path.join(this.config.dataDir, 'tmp'));
    if (signal.aborted) throw new BridgeError('CANCELLED', '已在儲存檢查期間停止本機處理。');
  }

  /** Process shutdown is not a user's cancellation and must preserve an existing provider task. */
  private async interrupt(id: string): Promise<RequestRecord> {
    const record = await this.requests.get(id);
    if (!record) throw new BridgeError('NOT_FOUND', '找不到這個任務。');
    if (record.status === 'cancelled' || record.status === 'delivered' || record.image) return record;
    const started = record.submission_started_at !== undefined || record.submitted_at !== undefined
      || record.browser_checkpoint?.submission_started_at !== undefined;
    const failure = !started
      ? { code: 'PROCESS_INTERRUPTED' as const, message: '工具程序在提交前停止；沒有自動重新執行。' }
      : record.status === 'submitting' || record.submitted_at === undefined
        ? { code: 'SUBMISSION_UNKNOWN' as const, message: '工具程序在提交確認前停止；只可查核原頁面，不能再次生成。' }
        : { code: 'GENERATION_TIMEOUT' as const, message: '工具程序已停止等待；只可查詢或取得原任務結果。' };
    const backgroundHandoff = record.recovery_error?.details?.browser_visibility === 'background'
      ? record.recovery_error.details : record.error?.details?.browser_visibility === 'background' ? record.error.details : undefined;
    return this.requests.transition(id, 'failed', {
      error: backgroundHandoff ? { ...failure, details: { ...backgroundHandoff, submitted: started } } : failure,
      message: failure.message, interrupted_phase: record.status,
    });
  }

  async shutdown(): Promise<void> {
    this.stopping = true;
    for (const { controller } of this.active.values()) controller.abort();
    // Maintenance also owns the store/browser locks. Do not leave their release
    // in flight when the server finishes its shutdown handshake.
    await this.maintenance;
    await Promise.allSettled([...this.active.values()].map(task => task.promise));
    await Promise.allSettled([...this.retained.entries()].map(async ([id, adapter]) => {
      try { await this.interrupt(id); }
      finally { await adapter.close(); }
    }));
    this.retained.clear();
  }
}
