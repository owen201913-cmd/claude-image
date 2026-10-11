import { open, unlink, type FileHandle } from 'node:fs/promises';
import type { APIResponse, Page, Response } from 'playwright-core';
import { BridgeError, type ErrorCode } from '../shared/errors.js';
import type { BrowserSession } from './session.js';
import type { BrowserPort } from './ngini-adapter.js';
import type { BrowserResult, BrowserSnapshot } from './result-tracker.js';
import { GUEST_DOM, NGINI_GUEST_IMAGE, groupKey, imageKey, isCanonicalConversationUrl,
  reviewedDownloadUrl, snapshotFromGuestDom, type GuestDomData } from './ngini-dom.js';
import { challengeHttpCode, submissionHttpCode, systemStateCode, throwSystemState, waitForGuestSurface } from './ngini-system-state.js';

type Session = Pick<BrowserSession, 'page' | 'close'>;

/** Real DOM mapping observed by the P1 browser run; all actions use the normal guest UI. */
export class ObservedGuestPort implements BrowserPort {
  readonly resultContractObserved = true;
  private prepared = false;
  private preparedPrompt?: string;
  private clicked = false;
  private observedPage?: Page;
  private responseError?: ErrorCode;
  private readonly onResponse = (response: Response): void => {
    if (!this.observedPage) return;
    const request = response.request();
    try {
      if (request.frame() !== this.observedPage.mainFrame()) return;
      const mainDocument = request.isNavigationRequest() && request.resourceType() === 'document';
      const challenge = challengeHttpCode(response.url(), request.method(), response.headers(), mainDocument);
      if (challenge && (mainDocument || this.clicked)) { this.responseError = challenge; return; }
      // Manual verification can reload the same reviewed document. Do not retain
      // a cleared pre-submit challenge forever, and never retry the submission.
      if (mainDocument && !this.clicked && this.responseError === 'HUMAN_VERIFICATION_REQUIRED'
          && response.ok() && (response.url() === NGINI_GUEST_IMAGE || isCanonicalConversationUrl(response.url()))) {
        this.responseError = undefined;
      }
      if (!this.clicked) return;
      const code = submissionHttpCode(response.url(), request.method(), response.status());
      if (code) this.responseError = code;
    } catch { /* Detached frames/service workers have no reviewed submission identity. */ }
  };

  constructor(private readonly session: Session, private readonly options: { downloadTimeoutMs?: number; maxDownloadBytes?: number } = {}) {}

  private async page(): Promise<Page> {
    const page = await this.session.page();
    if (this.observedPage !== page) {
      this.observedPage?.off('response', this.onResponse);
      this.observedPage = page;
      page.on('response', this.onResponse);
    }
    return page;
  }

  private async assertNoSystemGate(page: Page): Promise<void> {
    if (this.responseError) throwSystemState(this.responseError);
    const code = await systemStateCode(page);
    if (code) throwSystemState(code);
  }

  private async assertEmptyImageMode(page: Page): Promise<void> {
    await this.assertNoSystemGate(page);
    const heading = page.getByRole('heading', { name: 'Describe the image you want', exact: true });
    const input = page.getByRole('textbox', { name: 'Ask anything...', exact: true });
    const send = page.getByRole('button', { name: 'Send', exact: true });
    if (page.url() !== NGINI_GUEST_IMAGE || await heading.count() !== 1 ||
        await input.count() !== 1 || await send.count() !== 1 ||
        !await heading.isVisible() || !await input.isVisible() || !await send.isVisible() ||
        await input.evaluate(element => element.tagName) !== 'INPUT') {
      throw new BridgeError('UI_CHANGED', '原空白生圖模式或輸入控制已變更；未提交生成。');
    }
    const snapshot = snapshotFromGuestDom(page.url(), await this.collect(page));
    if (snapshot.messages.length) throw new BridgeError('UI_CHANGED', '新任務頁面不再空白；未提交生成。');
    if (snapshot.quota?.availability === 'exhausted') throwSystemState('QUOTA_EXHAUSTED');
  }

  async open(): Promise<BrowserSnapshot> {
    const page = await this.page();
    await page.goto(NGINI_GUEST_IMAGE, { waitUntil: 'domcontentloaded' });
    await this.assertNoSystemGate(page);
    await waitForGuestSurface(page, 'empty');
    await page.getByRole('heading', { name: 'Describe the image you want', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('textbox', { name: 'Ask anything...', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Send', exact: true }).waitFor({ state: 'visible' });
    const snapshot = await this.read();
    if (snapshot.messages.length) throw new BridgeError('UI_CHANGED', '空白 guest page 出現既有訊息；未提交新任務。');
    if (snapshot.quota?.availability === 'exhausted') throw new BridgeError('QUOTA_EXHAUSTED', '網站顯示免費額度已用完；未提交生成。');
    return snapshot;
  }

  async prepare(prompt: string): Promise<void> {
    if (this.clicked) throw new BridgeError('SUBMISSION_UNKNOWN', '此瀏覽器任務已提交；不能再次生成。');
    this.prepared = false;
    this.preparedPrompt = undefined;
    const page = await this.page();
    await this.assertEmptyImageMode(page);
    const input = page.getByRole('textbox', { name: 'Ask anything...', exact: true });
    const send = page.getByRole('button', { name: 'Send', exact: true });
    if (await input.count() !== 1 || await send.count() !== 1) throw new BridgeError('UI_CHANGED', 'Ngini guest 輸入控制不再吻合。');
    const maximum = await input.getAttribute('maxlength');
    if (maximum && /^\d+$/.test(maximum) && Number(maximum) > 0 && prompt.length > Number(maximum)) {
      throw new BridgeError('INVALID_ARGUMENT', '描述超過目前網站輸入上限；未提交生成。');
    }
    await input.fill(prompt);
    if (await input.inputValue() !== prompt) {
      throw new BridgeError('INVALID_ARGUMENT', '網站的單行生圖欄位無法原樣保留此描述；未提交生成。');
    }
    await this.assertNoSystemGate(page);
    if (!await send.isEnabled()) throw new BridgeError('UI_CHANGED', '網站沒有開放送出此描述；未提交生成。');
    this.preparedPrompt = prompt;
    this.prepared = true;
  }

  async submitOnce(signal?: AbortSignal): Promise<void> {
    abortIfRequested(signal);
    if (!this.prepared || this.preparedPrompt === undefined || this.clicked) throw new BridgeError('SUBMISSION_UNKNOWN', '此任務沒有可安全重用的送出操作。');
    // Never replace a lost prepared page. The journal can take time; recheck the
    // image mode and exact input immediately before the one allowed click.
    const page = this.observedPage;
    if (!page || page.isClosed()) throw new BridgeError('UI_CHANGED', '原準備頁面已關閉；沒有另開頁面或提交。');
    await this.assertEmptyImageMode(page);
    if (await page.getByRole('textbox', { name: 'Ask anything...', exact: true }).inputValue() !== this.preparedPrompt ||
        !await page.getByRole('button', { name: 'Send', exact: true }).isEnabled()) {
      throw new BridgeError('UI_CHANGED', '待提交的描述或送出控制已變更；未提交生成。');
    }
    abortIfRequested(signal);
    this.clicked = true; // A click exception is uncertain; never allow a second click.
    await page.getByRole('button', { name: 'Send', exact: true }).click();
  }

  async recheckBeforeSubmit(signal?: AbortSignal): Promise<BrowserSnapshot> {
    abortIfRequested(signal);
    // Read only the retained page. session.page() could launch a context, so it
    // is intentionally not called by this recovery seam.
    const page = this.observedPage;
    if (!page || page.isClosed() || this.clicked || this.prepared) {
      throw new BridgeError('SUBMISSION_UNKNOWN', '沒有可只讀重查的未提交頁面；沒有開新頁或再次生成。');
    }
    if (page.url() !== NGINI_GUEST_IMAGE) throw new BridgeError('UI_CHANGED', '原未提交的 image-mode 頁面已變更；沒有導頁或生成。');
    const snapshot = snapshotFromGuestDom(page.url(), await this.collect(page));
    if (snapshot.messages.length || await page.getByRole('textbox', { name: 'Ask anything...', exact: true }).inputValue() !== '') {
      throw new BridgeError('UI_CHANGED', '原未提交頁面不再空白；沒有填寫或生成。');
    }
    if (snapshot.quota?.availability === 'exhausted') throwSystemState('QUOTA_EXHAUSTED');
    abortIfRequested(signal);
    return snapshot;
  }

  private async collect(page: Page): Promise<GuestDomData> {
    if (page.url() !== NGINI_GUEST_IMAGE && !isCanonicalConversationUrl(page.url())) throw new BridgeError('UI_CHANGED', 'Ngini 轉向未驗證的生圖任務網址，已停止。');
    await this.assertNoSystemGate(page);
    const log = page.getByRole('log');
    const logCount = await log.count();
    let groups: GuestDomData['groups'] = [];
    if (logCount === 0) {
      // The observed initial guest page has no log. Accept only its exact empty
      // route and unique normal input controls; a missing canonical log is unsafe.
      const input = page.getByRole('textbox', { name: 'Ask anything...', exact: true });
      const send = page.getByRole('button', { name: 'Send', exact: true });
      if (page.url() !== NGINI_GUEST_IMAGE ||
          await page.getByRole('heading', { name: 'Describe the image you want', exact: true }).count() !== 1 ||
          await input.count() !== 1 || await send.count() !== 1 ||
          await page.locator(GUEST_DOM.group).count() !== 0 || await input.evaluate(element => element.tagName) !== 'INPUT') {
        throw new BridgeError('UI_CHANGED', '找不到已觀察的 Ngini 對話容器或空白 guest 輸入介面。');
      }
    } else if (logCount !== 1) {
      throw new BridgeError('UI_CHANGED', 'Ngini 對話容器不再唯一，已停止。');
    } else try {
      groups = await log.evaluate((element, selectors) => {
        const visible = (node: Element): boolean => node.getClientRects().length > 0
          && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none';
        const inner = element.querySelector(`:scope > ${selectors.inner}`);
        if (!inner) throw new Error('Missing conversation inner');
        return Array.from(inner.children).filter(child => child.matches(selectors.group)).map((group, ordinal) => {
          const users = group.querySelectorAll(selectors.user);
          const finalAssistant = group.querySelectorAll(selectors.finalAssistant);
          const actions = group.querySelectorAll(selectors.responseActions);
          const errors = group.querySelectorAll(selectors.errorState);
          const terminalText = finalAssistant.length === 1 && visible(finalAssistant[0]!)
            && actions.length === 1 && actions[0]!.querySelectorAll(selectors.copyResponse).length === 1;
          // The reviewed generic error branch also covers capacity/timeout/input
          // failures. No text keyword is promoted to GENERATION_REFUSED.
          const terminalError = errors.length === 1 && visible(errors[0]!)
            && errors[0]!.querySelectorAll(selectors.errorText).length === 1;
          return { ordinal, userCount: users.length, userText: users[0]?.textContent ?? '',
            assistantTexts: Array.from(group.querySelectorAll(selectors.assistant), node => node.textContent ?? ''),
            working: Boolean(group.querySelector(selectors.working)),
            terminalText, terminalError,
            images: Array.from(group.querySelectorAll(selectors.item), item => {
              const images = item.querySelectorAll(selectors.image);
              const downloads = item.querySelectorAll(selectors.download);
              return { imageCount: images.length, src: images[0]?.getAttribute('src') ?? '',
                downloadCount: downloads.length, href: downloads[0]?.getAttribute('href') ?? '',
                label: downloads[0]?.getAttribute('aria-label') ?? '' };
            }) };
        });
      }, GUEST_DOM);
    } catch { throw new BridgeError('UI_CHANGED', 'Ngini 對話 DOM 不符合已觀察的結構。'); }
    const quota = page.locator(GUEST_DOM.quota);
    const quotaCount = await quota.count();
    if (quotaCount > 1) throw new BridgeError('UI_CHANGED', '額度控制出現不明重複，已停止。');
    return { groups, quotaText: quotaCount === 1 ? await quota.textContent() : null };
  }

  async read(): Promise<BrowserSnapshot> {
    const page = await this.page();
    return snapshotFromGuestDom(page.url(), await this.collect(page));
  }

  async resume(pageUrl: string): Promise<BrowserSnapshot> {
    if (!isCanonicalConversationUrl(pageUrl)) throw new BridgeError('SUBMISSION_UNKNOWN', '沒有可恢復的 canonical 任務網址；未重新生成。');
    const page = await this.page();
    if (page.url() !== pageUrl) await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
    await this.assertNoSystemGate(page);
    await waitForGuestSurface(page, 'conversation');
    await page.getByRole('log').waitFor({ state: 'attached' });
    return this.read();
  }

  async download(result: BrowserResult, destination: string, signal?: AbortSignal): Promise<void> {
    abortIfRequested(signal);
    const page = await this.page();
    const dom = await this.collect(page);
    const group = dom.groups.find(row => `${groupKey(page.url(), row)}:assistant` === result.message_key);
    const image = group?.images.find(item => imageKey(item) === result.result_key);
    if (!group || !image || group.working || image.downloadCount !== 1) {
      throw new BridgeError('DOWNLOAD_FAILED', '原任務的圖片下載控制尚未就緒；未重新生成。');
    }
    // The normal download was observed but is unreliable in the production port,
    // and browser-process <a download> redirects bypass Playwright routing.
    // Use only the exact original media URL offered by this scoped result;
    // maxRedirects: 0 rejects every redirect before another origin is contacted.
    reviewedDownloadUrl(image.src, image.href, image.label);
    let response: APIResponse | undefined;
    let abandoned = false;
    const io = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    let destinationHandle: FileHandle | undefined;
    let saving: Promise<void> | undefined;
    let saved = false;
    const interrupted = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { io.abort(); reject(new BridgeError('DOWNLOAD_FAILED', '既有原圖取得逾時；未重新生成。')); }, this.options.downloadTimeoutMs ?? 60_000);
      onAbort = () => { io.abort(); reject(new BridgeError('CANCELLED', '已停止本機圖片下載。')); };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    try {
      abortIfRequested(signal);
      const pending = page.context().request.get(image.src, {
        maxRedirects: 0, maxRetries: 0, timeout: this.options.downloadTimeoutMs ?? 60_000,
      }).then(value => {
        if (abandoned) { void value.dispose().catch(() => {}); throw new BridgeError('DOWNLOAD_FAILED', '原圖取得已停止。'); }
        response = value;
        return value;
      });
      response = await Promise.race([pending, interrupted]);
      abortIfRequested(signal);
      if (response.url() === image.src && response.status() === 429) {
        throw new BridgeError('RATE_LIMITED', '原圖來源限制下載頻率；已停止，不重送下載或生成。');
      }
      if (response.url() !== image.src || response.status() !== 200) {
        throw new BridgeError('DOWNLOAD_FAILED', '已提供的原圖來源沒有直接回傳可用圖片；未追蹤重新導向或重新生成。');
      }
      const headers = response.headers();
      const mime = (headers['content-type'] ?? '').split(';', 1)[0]!.trim().toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
        throw new BridgeError('INVALID_IMAGE', '原圖來源回傳的檔案類型不是支援的點陣圖片。');
      }
      const maximum = this.options.maxDownloadBytes ?? 25 * 1024 * 1024;
      const length = headers['content-length'];
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > maximum)) {
        throw new BridgeError('INVALID_IMAGE', '原圖回應超過圖片大小上限。');
      }
      // APIRequestContext buffers its response: the actual limit below still rejects
      // an oversized body when a server omits Content-Length. Decoding follows in ImageStore.
      const bytes = await Promise.race([response.body(), interrupted]);
      if (bytes.length === 0 || bytes.length > maximum) throw new BridgeError('INVALID_IMAGE', '原圖為空或超過圖片大小上限。');
      abortIfRequested(signal);
      // Claim this new file explicitly: failure cleanup may remove only the file
      // opened by this attempt, never an existing original. Settle an aborted
      // write before cleanup so a late write cannot corrupt a download retry.
      destinationHandle = await open(destination, 'wx');
      saving = destinationHandle.writeFile(bytes, { signal: io.signal });
      await Promise.race([saving, interrupted]);
      saved = true;
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      abortIfRequested(signal);
      throw new BridgeError('DOWNLOAD_FAILED', '既有原圖取得或保存失敗；沒有重新生成。');
    } finally {
      abandoned = true;
      if (timer) clearTimeout(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
      await saving?.catch(() => {});
      await destinationHandle?.close().catch(() => {});
      if (destinationHandle && !saved) await unlink(destination).catch(() => {});
      await response?.dispose().catch(() => {});
    }
  }

  async close(): Promise<void> {
    this.observedPage?.off('response', this.onResponse);
    this.observedPage = undefined;
    await this.session.close();
  }
}

function abortIfRequested(signal?: AbortSignal): void {
  if (signal?.aborted) throw new BridgeError('CANCELLED', '已停止本機處理。');
}
