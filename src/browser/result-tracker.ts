import { createHash } from 'node:crypto';
import { BridgeError, type ErrorCode } from '../shared/errors.js';
import { UNKNOWN_QUOTA, type QuotaInfo } from '../jobs/state-machine.js';

export interface BrowserCheckpoint {
  request_id: string;
  page_url: string;
  baseline_message_keys: string[];
  baseline_result_keys: string[];
  prompt_sha256?: string;
  submission_started_at?: string;
}

export interface BrowserImage {
  key: string;
  /** Only a scoped normal result download control counts as a downloadable image. */
  downloadable: boolean;
}

export interface BrowserMessage {
  key: string;
  role: 'user' | 'assistant';
  text_sha256: string;
  complete: boolean;
  reply_to?: string;
  images: BrowserImage[];
  error_code?: ErrorCode;
}

export interface BrowserSnapshot {
  page_url: string;
  messages: BrowserMessage[];
  /** Alerts are scoped UI states, never arbitrary instructions in provider text. */
  error_code?: ErrorCode;
  quota?: QuotaInfo;
}

export interface BrowserResult {
  request_id: string;
  message_key: string;
  result_key: string;
  actual_image_count: number;
  quota: QuotaInfo;
}

export function textHash(text: string): string {
  return createHash('sha256').update(text.trim().replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/** A result is accepted only inside the new reply to the exact submitted prompt. */
export function selectCurrentResult(snapshot: BrowserSnapshot, checkpoint: BrowserCheckpoint): BrowserResult | undefined {
  if (snapshot.error_code) throw providerFailure(snapshot.error_code);
  const fresh = snapshot.messages.filter(message => !checkpoint.baseline_message_keys.includes(message.key));
  const users = fresh.filter(message => message.role === 'user' && message.text_sha256 === checkpoint.prompt_sha256);
  if (users.length > 1) throw new BridgeError('UI_CHANGED', '無法唯一關聯本次提交的訊息；沒有再次生成。');
  const user = users[0];
  if (!user) return undefined;
  const start = snapshot.messages.findIndex(message => message.key === user.key);
  const later = snapshot.messages.slice(start + 1);
  const nextUser = later.findIndex(message => message.role === 'user');
  const turn = nextUser < 0 ? later : later.slice(0, nextUser);
  const replies = turn.filter(message => message.role === 'assistant'
    && !checkpoint.baseline_message_keys.includes(message.key)
    && (message.reply_to === undefined || message.reply_to === user.key));
  if (replies.length > 1) throw new BridgeError('UI_CHANGED', '本次結果容器不明確；沒有抓取其他圖片。');
  const reply = replies[0];
  if (!reply) return undefined;
  if (reply.error_code) throw providerFailure(reply.error_code);
  const images = reply.images.filter(image => !checkpoint.baseline_result_keys.includes(image.key));
  const ready = images.filter(image => image.downloadable);
  if (ready.length > 0 && reply.complete) {
    // Snapshot order is the result-container order. Deliver its first image and report the real count.
    return { request_id: checkpoint.request_id, message_key: reply.key, result_key: ready[0]!.key,
      actual_image_count: images.length, quota: snapshot.quota ?? { ...UNKNOWN_QUOTA } };
  }
  if (reply.complete && images.length === 0) throw providerFailure('PROVIDER_TEXT_ONLY');
  return undefined;
}

function providerFailure(code: ErrorCode): BridgeError {
  const messages: Partial<Record<ErrorCode, string>> = {
    QUOTA_EXHAUSTED: '網站免費額度已用完；請依網站提示稍後再試。',
    RATE_LIMITED: '網站目前限制請求頻率；沒有再次提交。',
    HUMAN_VERIFICATION_REQUIRED: '目前需要你在專用瀏覽器完成一次驗證。',
    LOGIN_OR_PAYMENT_REQUIRED: '網站目前要求登入或付費，免登入流程暫時不可用。',
    GENERATION_REFUSED: '這次要求未被生圖服務接受。',
    PROVIDER_TEXT_ONLY: '服務沒有回傳圖片；沒有自動追問或再次生成。',
    UI_CHANGED: '網站介面變動，工具目前無法可靠辨識本次結果。',
  };
  return new BridgeError(code, messages[code] ?? '網站回報任務未完成；沒有再次生成。');
}
