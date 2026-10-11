import type { Page } from 'playwright-core';
import { BridgeError, type ErrorCode } from '../shared/errors.js';
import { GUEST_DOM, isGuestPageUrl } from './ngini-dom.js';

/**
 * Structure from the observed public index.BGRkrJPi.js asset (2026-10-07):
 * credit_insufficient renders Ht / qt in rr's children slot, a direct child of
 * content__inner inside role=log, after the message groups. These are
 * payment/guest-limit gates, unlike the separate first-purchase upsell. Class
 * hashes intentionally fail closed on a changed structure; labels are localized.
 * Guest-limit copy was observed live. The mapped card structures are
 * source-reviewed and tested offline; this does not establish a live payment test.
 */
export const SYSTEM_STATE_DOM = Object.freeze({
  guest: 'div.IwjZ_W_card[role="region"][aria-label]',
  payment: 'div.t0BchG_card[role="region"][aria-label]',
  inner: GUEST_DOM.inner,
  excluded: '[data-assistant="true"], [class*="_userBubble"], [class*="_messageGroup"], [class*="_artifacts"], pre, code, [contenteditable="true"]',
});

export async function systemStateCode(page: Page): Promise<ErrorCode | undefined> {
  return page.evaluate(selectors => {
    const visible = (element: Element): boolean => element.getClientRects().length > 0
      && getComputedStyle(element).visibility !== 'hidden'
      && getComputedStyle(element).display !== 'none';
    const candidates = [...document.querySelectorAll(`${selectors.guest}, ${selectors.payment}`)]
      .filter(element => visible(element) && !element.closest(selectors.excluded));
    if (!candidates.length) return undefined;
    if (candidates.length !== 1) return 'UI_CHANGED';
    const card = candidates[0]!;
    const log = card.closest('[role="log"]');
    // The real system gate is in rr's appended children slot, not in a user or
    // assistant message. Excluding the entire log previously hid this gate.
    if (log && card.parentElement !== log.querySelector(`:scope > ${selectors.inner}`)) return 'UI_CHANGED';
    if (!card.getAttribute('aria-label')?.trim()) return 'UI_CHANGED';
    const prefix = card.matches(selectors.guest) ? 'IwjZ_W' : 't0BchG';
    const hasOne = (selector: string): boolean => card.querySelectorAll(selector).length === 1;
    if (!hasOne(`:scope > div.${prefix}_copy`)
      || !hasOne(`:scope > div.${prefix}_copy > span.${prefix}_title`)
      || card.querySelectorAll(`:scope > div.${prefix}_copy > span.${prefix}_subtitle`).length < 1
      || !hasOne(`:scope > button.${prefix}_primary`)) return 'UI_CHANGED';
    if (prefix === 'IwjZ_W') {
      if (!hasOne(':scope > button.IwjZ_W_secondary')
        || !hasOne(':scope > div.IwjZ_W_footer > span.IwjZ_W_reset')) return 'UI_CHANGED';
      return 'QUOTA_EXHAUSTED';
    }
    return 'LOGIN_OR_PAYMENT_REQUIRED';
  }, SYSTEM_STATE_DOM);
}

/** Metadata of the normal page's own current submission; never an API call. */
export function submissionHttpCode(url: string, method: string, status: number): ErrorCode | undefined {
  if (url !== 'https://ngini.com/api/chat' || method !== 'POST') return undefined;
  if (status === 429) return 'RATE_LIMITED';
  if (status === 401) return 'LOGIN_OR_PAYMENT_REQUIRED';
  // The reviewed UI rejects !response.ok. Other failures are deliberately
  // generic: 403 alone cannot distinguish a captcha, authorization, or refusal.
  if (status >= 400 && status <= 599) return 'UI_CHANGED';
  return undefined;
}

/**
 * Cloudflare documents this response header for its interstitial challenge.
 * This signal is documented, not live-observed on Ngini. Accept it only on the
 * main document's reviewed guest route or our exact current normal submission.
 * A 403 status, provider prose, iframe, asset, or unrelated POST is insufficient.
 */
export function challengeHttpCode(url: string, method: string, headers: Record<string, string>, mainDocument: boolean): ErrorCode | undefined {
  if (headers['cf-mitigated']?.trim().toLowerCase() !== 'challenge') return undefined;
  return (mainDocument && method === 'GET' && isGuestPageUrl(url))
    || (url === 'https://ngini.com/api/chat' && method === 'POST')
    ? 'HUMAN_VERIFICATION_REQUIRED' : undefined;
}

export function throwSystemState(code: ErrorCode): never {
  const messages: Partial<Record<ErrorCode, string>> = {
    QUOTA_EXHAUSTED: '網站顯示 guest 免費額度不足；已停止，不登入或購買。',
    RATE_LIMITED: '網站對本次正常提交回傳頻率限制；沒有再次提交。',
    LOGIN_OR_PAYMENT_REQUIRED: '網站目前要求登入或付費；免登入流程已停止。',
    HUMAN_VERIFICATION_REQUIRED: '網站回傳人工驗證頁；已停止，請在專用瀏覽器自行完成驗證。',
    UI_CHANGED: '網站的提交或系統限制介面受阻，工具不能可靠判定原因；已停止。',
  };
  throw new BridgeError(code, messages[code] ?? '網站流程受阻；沒有再次提交生成。');
}

/** Wait for either the normal surface or a source-reviewed blocking card. */
export async function waitForGuestSurface(page: Page, kind: 'empty' | 'conversation'): Promise<void> {
  try {
    await page.waitForFunction(({ selectors, kind }) => {
      const visible = (element: Element): boolean => element.getClientRects().length > 0
        && getComputedStyle(element).visibility !== 'hidden';
      if ([...document.querySelectorAll(`${selectors.guest}, ${selectors.payment}`)]
        .some(element => visible(element) && !element.closest(selectors.excluded))) return true;
      if (kind === 'conversation') return Boolean(document.querySelector('[role="log"]'));
      return Boolean(document.querySelector('input[aria-label="Ask anything..."]'))
        && [...document.querySelectorAll('button')].some(button => (button.getAttribute('aria-label') ?? button.textContent)?.trim() === 'Send');
    }, { selectors: SYSTEM_STATE_DOM, kind });
  } catch {
    throw new BridgeError('UI_CHANGED', '網站沒有出現已驗證的生圖介面或限制卡片；未辨識的驗證／登入頁不會被自動操作。');
  }
  const code = await systemStateCode(page);
  if (code) throwSystemState(code);
}
