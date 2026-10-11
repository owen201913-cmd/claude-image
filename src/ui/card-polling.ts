import { parseCardToolResult, type CardResult } from './card-contract.js';

export const ACTIVE_CARD_STATUSES = new Set(['received', 'opening_page', 'ready_to_submit', 'submitting',
  'waiting_for_image', 'downloading', 'validating', 'presenting']);
const phaseMessages: Record<string, string> = {
  received: '已收到圖片要求，正在開始處理…', opening_page: '正在準備生圖頁面…',
  ready_to_submit: '描述已準備，等待提交…', submitting: '正在提交本次圖片要求…',
  waiting_for_image: '正在等待本次圖片結果…', downloading: '正在取得本次原圖…',
  validating: '正在驗證圖片檔案…', presenting: '原圖已保存，正在準備聊天交付…',
};

export function cardStatusMessage(result: CardResult): string {
  return result.message && result.message !== '任務狀態已讀取。'
    ? result.message : phaseMessages[result.status] ?? result.status;
}

/** A tool-query failure is separate from the original generation's persisted status. */
export function cardQueryErrorMessage(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') return;
  const value = response as { isError?: unknown; structuredContent?: unknown };
  if (value.isError !== true || !value.structuredContent || typeof value.structuredContent !== 'object') return;
  const data = value.structuredContent as Record<string, unknown>;
  // Guarded operations keep the current ID. A query failure must not replace the original job's state.
  // The missing-ID shape remains accepted for older installed bridge results.
  if ((data.query_error !== true && data.request_id !== undefined) || data.status !== 'failed' || typeof data.message !== 'string' ||
      !data.message.trim() || data.message.length > 2000) return;
  return data.message;
}

interface PollCallbacks {
  read(requestId: string): Promise<unknown>;
  result(value: CardResult): void;
  message(value: string, blocked: boolean): void;
  settled?(): void;
}

/** Read-only queries reuse one ID. Scheduling resumes in finally after a busy read. */
export class CardPoller {
  private latest?: CardResult;
  private connected = false;
  private serverTools = false;
  private inFlight = false;
  private stopped = false;
  private failures = 0;
  private startedAt = 0;
  private revision = 0;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly callbacks: PollCallbacks, private readonly options = {
    intervalMs: 2500, budgetMs: 240_000, maxReadFailures: 3,
  }) {}

  get querying(): boolean { return this.inFlight; }

  update(result: CardResult, connected: boolean, serverTools: boolean): void {
    this.revision++;
    if (this.latest?.request_id !== result.request_id) {
      this.startedAt = Date.now(); this.failures = 0; this.stopped = false;
    }
    this.latest = result;
    this.connected = connected;
    this.serverTools = serverTools;
    this.schedule();
  }

  stop(): void { this.stopped = true; this.revision++; clearTimeout(this.timer); this.timer = undefined; }

  /** Only an explicit new host tool result or manual refresh resumes a stopped card. */
  resume(): void {
    this.stopped = false; this.failures = 0; this.startedAt = Date.now();
    this.schedule();
  }

  async refresh(): Promise<void> {
    if (this.inFlight) return;
    this.stopped = false; this.failures = 0; this.startedAt = Date.now();
    await this.read();
  }

  private schedule(): void {
    clearTimeout(this.timer); this.timer = undefined;
    if (!this.latest || this.stopped || !this.connected || this.latest.image ||
        !ACTIVE_CARD_STATUSES.has(this.latest.status)) return;
    if (!this.serverTools) {
      this.callbacks.message('無法自動查詢：聊天客戶端未宣告本機工具橋接能力。原任務不會重新提交。', true);
      return;
    }
    if (Date.now() - this.startedAt >= this.options.budgetMs) {
      this.callbacks.message('自動查詢已暫停；尚未確認原任務結果。可按「更新狀態」查詢同一任務，不會重新生圖。', true);
      return;
    }
    if (this.inFlight || this.failures >= this.options.maxReadFailures) return;
    this.timer = setTimeout(() => { void this.read(); }, this.options.intervalMs);
  }

  private async read(): Promise<void> {
    if (!this.latest || this.inFlight || !this.connected || !this.serverTools) { this.schedule(); return; }
    const requestId = this.latest.request_id;
    const revision = this.revision;
    let safeErrorMessage: string | undefined;
    this.inFlight = true;
    this.callbacks.message('正在查詢原任務狀態…', false);
    try {
      const response = await this.callbacks.read(requestId);
      if (this.stopped || this.revision !== revision || this.latest?.request_id !== requestId) return;
      const queryError = cardQueryErrorMessage(response);
      if (queryError) { safeErrorMessage = queryError; throw new Error('QUERY_FAILED'); }
      const parsed = parseCardToolResult(response);
      if (parsed.request_id !== requestId) {
        safeErrorMessage = '查詢回傳的任務識別碼不一致。';
        throw new Error('REQUEST_MISMATCH');
      }
      this.failures = 0;
      this.latest = parsed;
      this.callbacks.result(parsed);
    } catch {
      if (this.stopped || this.revision !== revision || this.latest?.request_id !== requestId) return;
      this.failures++;
      const detail = safeErrorMessage ?? '無法取得原任務狀態。';
      this.callbacks.message(`${detail} ${this.failures >= this.options.maxReadFailures
        ? '已暫停自動查詢，可按「更新狀態」重取同一任務。' : '將有限重試查詢同一任務。'} 未重新提交生圖。`, true);
    } finally {
      this.inFlight = false;
      this.callbacks.settled?.();
      this.schedule();
    }
  }
}
