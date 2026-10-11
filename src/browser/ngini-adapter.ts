import { stat, unlink } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { BridgeError } from '../shared/errors.js';
import { BrowserSession, type BrowserSessionOptions } from './session.js';
import { ObservedGuestPort } from './ngini-port.js';
import { isCanonicalConversationUrl, NGINI_GUEST_NEW, NGINI_GUEST_IMAGE } from './ngini-dom.js';
import { buildSubmissionPrompt } from './submission-prompt.js';
import { selectCurrentResult, textHash, type BrowserCheckpoint, type BrowserResult, type BrowserSnapshot } from './result-tracker.js';

export { BridgeError as BrowserFailure } from '../shared/errors.js';
export type { BrowserCheckpoint, BrowserResult, BrowserSnapshot } from './result-tracker.js';

export const NGINI_ENTRY = 'https://ngini.com/en-us/free-ai-image-generator-no-signup';
export const OBSERVED_ENTRY = Object.freeze({
  observed_at: '2026-10-07',
  browser: 'Microsoft Edge 154.0.4258.53 / Playwright 1.62.1',
  prompt_label: 'Ask anything...', submit_name: 'Send',
  public_landing_prompt_label: 'Describe your image...', public_landing_submit_name: 'Generate',
  result_dom_observed: true,
  guest_entry: NGINI_GUEST_IMAGE,
  guest_heading: 'Describe the image you want',
  note: 'P1 observed the guest user bubble, grouped image/result, canonical conversation, and normal download control.',
});

/** Internal browser operations, supplied by a reviewed DOM mapping, never by MCP arguments. */
export interface BrowserPort {
  readonly resultContractObserved: boolean;
  open(): Promise<BrowserSnapshot>;
  prepare(prompt: string): Promise<void>;
  submitOnce(signal?: AbortSignal): Promise<void>;
  read(): Promise<BrowserSnapshot>;
  /** Only the already retained, unsubmitted empty image-mode page; no navigation. */
  recheckBeforeSubmit?(signal?: AbortSignal): Promise<BrowserSnapshot>;
  resume(pageUrl: string): Promise<BrowserSnapshot>;
  download(result: BrowserResult, destination: string, signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

export interface AdapterOptions extends BrowserSessionOptions {
  generationTimeoutMs?: number;
  downloadTimeoutMs?: number;
  maxDownloadBytes?: number;
  /** Test seam only. No tool/schema accepts a selector, URL, code, or port. */
  port?: BrowserPort;
}

/** One click, no automatic resubmission. Durable journal callback must finish before the click. */
export class NginiAdapter {
  private readonly port: BrowserPort;
  private readonly claimedRequests = new Set<string>();
  private activeRequest?: string;
  private heldRequest?: string;

  constructor(private readonly options: AdapterOptions) {
    this.port = options.port ?? new ObservedGuestPort(new BrowserSession(options), options);
  }

  async open(requestId: string, signal?: AbortSignal): Promise<BrowserCheckpoint> {
    checkAbort(signal);
    this.heldRequest = requestId;
    const snapshot = await this.port.open();
    checkAbort(signal);
    if (snapshot.error_code) selectCurrentResult(snapshot, { request_id: requestId, page_url: snapshot.page_url,
      baseline_message_keys: [], baseline_result_keys: [] });
    return { request_id: requestId, page_url: snapshot.page_url,
      baseline_message_keys: snapshot.messages.map(message => message.key),
      baseline_result_keys: snapshot.messages.flatMap(message => message.images.map(image => image.key)) };
  }

  async recheckBeforeSubmit(requestId: string, signal?: AbortSignal): Promise<BrowserCheckpoint> {
    checkAbort(signal);
    if (this.heldRequest !== requestId || this.claimedRequests.has(requestId) || this.activeRequest !== undefined || !this.port.recheckBeforeSubmit) {
      throw new BridgeError('SUBMISSION_UNKNOWN', '沒有保留可安全重查的同一個未提交任務；沒有導頁或重新生成。');
    }
    const snapshot = await this.port.recheckBeforeSubmit(signal);
    checkAbort(signal);
    if (snapshot.page_url !== NGINI_GUEST_NEW || snapshot.messages.length) {
      throw new BridgeError('UI_CHANGED', '重查頁面不是同一個空白生圖工作階段；沒有提交。');
    }
    if (snapshot.error_code) selectCurrentResult(snapshot, { request_id: requestId, page_url: snapshot.page_url,
      baseline_message_keys: [], baseline_result_keys: [] });
    return { request_id: requestId, page_url: NGINI_GUEST_NEW, baseline_message_keys: [], baseline_result_keys: [] };
  }

  async submit(prompt: string, checkpoint: BrowserCheckpoint,
    beforeClick: (checkpoint: BrowserCheckpoint) => Promise<void>, signal?: AbortSignal): Promise<BrowserCheckpoint> {
    checkAbort(signal);
    if (!this.port.resultContractObserved) {
      throw new BridgeError('UI_CHANGED', '已觀察 Ngini 輸入介面，但尚未驗證結果及下載容器；為避免消耗額度，未提交生成。');
    }
    if (checkpoint.submission_started_at || this.claimedRequests.has(checkpoint.request_id)) {
      throw new BridgeError('SUBMISSION_UNKNOWN', '此任務已開始提交；只能恢復原任務，不能再次按生成。');
    }
    if (this.activeRequest !== undefined) throw new BridgeError('BUSY', '專用瀏覽器已有任務，沒有建立暗中排隊的生成。');
    if (!prompt.trim()) throw new BridgeError('INVALID_ARGUMENT', '生圖描述不能空白。');
    const submittedPrompt = buildSubmissionPrompt(prompt);
    this.activeRequest = checkpoint.request_id;
    try { await this.port.prepare(submittedPrompt); checkAbort(signal); }
    catch (error) { this.activeRequest = undefined; throw error; }
    const submitted = { ...checkpoint, prompt_sha256: textHash(submittedPrompt), submission_started_at: new Date().toISOString() };
    // Claim before awaiting the journal to protect against two concurrent calls in this process.
    this.claimedRequests.add(checkpoint.request_id);
    try { await beforeClick(submitted); }
    catch (error) { this.claimedRequests.delete(checkpoint.request_id); this.activeRequest = undefined; throw error; }
    checkAbort(signal);
    try { await this.port.submitOnce(signal); }
    catch {
      checkAbort(signal);
      // Timeout/crash does not prove that the click or provider submit failed.
      throw new BridgeError('SUBMISSION_UNKNOWN', '無法確認是否已送出；請查核原任務，沒有再次提交。');
    }
    return submitted;
  }

  async wait(checkpoint: BrowserCheckpoint, signal?: AbortSignal,
    timeoutMs = this.options.generationTimeoutMs ?? 180_000,
    onCheckpoint?: (checkpoint: BrowserCheckpoint) => Promise<void>): Promise<BrowserResult> {
    if (!checkpoint.submission_started_at || !checkpoint.prompt_sha256) {
      throw new BridgeError('SUBMISSION_UNKNOWN', '沒有可查核的提交紀錄；不會重新送出。');
    }
    if (!this.port.resultContractObserved) throw new BridgeError('UI_CHANGED', '尚未建立經觀察驗證的 Ngini 結果定位。');
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      checkAbort(signal);
      let snapshot: BrowserSnapshot;
      try { snapshot = await this.port.read(); }
      catch (error) {
        if (error instanceof BridgeError) throw error;
        throw new BridgeError('GENERATION_TIMEOUT', '原頁面讀取中斷；只能查詢既有結果，沒有再次生成。');
      }
      if (snapshot.page_url !== checkpoint.page_url) {
        if (checkpoint.page_url === NGINI_GUEST_NEW && isCanonicalConversationUrl(snapshot.page_url)) {
          const matchingUsers = snapshot.messages.filter(message => message.role === 'user'
            && message.text_sha256 === checkpoint.prompt_sha256
            && !checkpoint.baseline_message_keys.includes(message.key));
          if (matchingUsers.length !== 1) throw new BridgeError('UI_CHANGED', '新任務網址沒有唯一吻合本次描述的訊息；沒有綁定或下載其他任務。');
          const updated = { ...checkpoint, page_url: snapshot.page_url };
          if (onCheckpoint) await onCheckpoint(updated);
          checkpoint = updated;
        } else if (isCanonicalConversationUrl(checkpoint.page_url) || isCanonicalConversationUrl(snapshot.page_url)) {
          throw new BridgeError('UI_CHANGED', '原任務網址已變更；沒有綁定或下載其他任務。');
        }
      }
      const result = selectCurrentResult(snapshot, checkpoint);
      if (result) return result;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new BridgeError('GENERATION_TIMEOUT', '尚未取得結果；沒有自動再生成一次。');
      try { await delay(Math.min(250, remaining), undefined, { signal }); }
      catch { checkAbort(signal); throw new BridgeError('GENERATION_TIMEOUT', '本機等待已中斷。'); }
    }
  }

  async recover(checkpoint: BrowserCheckpoint, signal?: AbortSignal, timeoutMs?: number,
    onCheckpoint?: (checkpoint: BrowserCheckpoint) => Promise<void>): Promise<BrowserResult> {
    checkAbort(signal);
    // resume never fills a prompt or clicks Send, including SUBMISSION_UNKNOWN recovery.
    await this.port.resume(checkpoint.page_url);
    return this.wait(checkpoint, signal, timeoutMs, onCheckpoint);
  }

  async download(result: BrowserResult, destination: string, signal?: AbortSignal): Promise<{ path: string; actual_image_count: number }> {
    checkAbort(signal);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.port.download(result, destination, signal);
        checkAbort(signal);
        const info = await stat(destination);
        if (!info.isFile() || info.size === 0 || info.size > (this.options.maxDownloadBytes ?? 25 * 1024 * 1024)) {
          await unlink(destination).catch(() => {});
          throw new BridgeError('INVALID_IMAGE', '下載檔案為空或超過圖片大小上限。');
        }
        this.activeRequest = undefined;
        return { path: destination, actual_image_count: result.actual_image_count };
      } catch (error) {
        // The real port uses typed failures too. Only retry acquisition of this
        // existing image; quota/rate limits, changed UI, cancellation and invalid
        // content remain terminal and can never trigger another generation.
        if (error instanceof BridgeError && error.code !== 'DOWNLOAD_FAILED') throw error;
        checkAbort(signal);
        if (attempt === 2) throw new BridgeError('DOWNLOAD_FAILED', '既有圖片下載失敗；沒有重新生成。');
      }
    }
    throw new BridgeError('DOWNLOAD_FAILED', '既有圖片下載失敗。');
  }

  async close(): Promise<void> { await this.port.close(); this.activeRequest = undefined; this.heldRequest = undefined; }
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new BridgeError('CANCELLED', '已停止本機處理；已提交的網站任務不保證停止或返還額度。');
}
