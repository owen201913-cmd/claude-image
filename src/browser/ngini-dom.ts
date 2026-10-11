import { BridgeError } from '../shared/errors.js';
import { UNKNOWN_QUOTA, type QuotaInfo } from '../jobs/state-machine.js';
import { textHash, type BrowserSnapshot } from './result-tracker.js';

export const NGINI_GUEST_NEW = 'https://ngini.com/c/new';
/** Fixed observed image mode: no prompt, arbitrary URL, or arbitrary query input. */
export const NGINI_GUEST_IMAGE = 'https://ngini.com/c/new?tool=image&locale=en';
const ULID = '[0-9A-HJKMNP-TV-Z]{26}';
const conversationPath = new RegExp(`^/c/${ULID}$`);
const imagePath = new RegExp(`^/generations/${ULID}\\.jpg$`);

/** Class suffixes and roles observed in the real guest conversation on 2026-10-07. */
export const GUEST_DOM = Object.freeze({
  inner: '[class*="_content__inner"]',
  group: 'div[class*="_messageGroup"]',
  user: 'div[class*="_userBubble"]',
  assistant: '[data-assistant="true"]',
  finalAssistant: ':scope > div[data-assistant="true"][class*="_prose"]:not([class*="_streamingContent"])',
  responseActions: ':scope > div[class*="_responseActions__wrapper"]',
  copyResponse: ':scope > div[class*="_responseActions"] > button[class*="_responseActions__btn"][aria-label="Copy response"]',
  errorState: ':scope > div[class*="_errorState"]',
  errorText: ':scope > span[class*="_errorState__text"]',
  item: 'div[class*="_generatedImage__item"]',
  image: 'img[class*="_generatedImage__img"]',
  download: 'a[class*="_generatedImage__download"][download]',
  working: '[role="status"][aria-label="Working on it..."]',
  quota: 'button[class*="_quotaChip"]',
});

function cleanUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return undefined;
    return url;
  } catch { return undefined; }
}

export function isCanonicalConversationUrl(value: string): boolean {
  const url = cleanUrl(value);
  return Boolean(url && url.hostname === 'ngini.com' && !url.search && conversationPath.test(url.pathname));
}

export function isGuestPageUrl(value: string): boolean {
  return value === NGINI_GUEST_NEW || value === NGINI_GUEST_IMAGE || isCanonicalConversationUrl(value);
}

/** No arbitrary URLs: only the normal observed download route for this scoped media image. */
export function reviewedDownloadUrl(imageSrc: string, href: string, label: string): string {
  const media = cleanUrl(imageSrc);
  const number = /^Download ([1-9]\d*)$/.exec(label)?.[1];
  let download: URL | undefined;
  try { download = cleanUrl(new URL(href, 'https://ngini.com').href); } catch { /* fail below */ }
  if (!media || media.hostname !== 'media.ngini.com' || media.search || !imagePath.test(media.pathname) ||
      !download || download.hostname !== 'ngini.com' || download.pathname !== '/api/media/download' || !number ||
      download.searchParams.getAll('u').length !== 1 || download.searchParams.getAll('n').length !== 1 ||
      [...download.searchParams.keys()].some(key => key !== 'u' && key !== 'n') ||
      download.searchParams.get('u') !== media.href || download.searchParams.get('n') !== `ngini-image-${number}`) {
    throw new BridgeError('UI_CHANGED', '圖片下載控制不符合已觀察的 Ngini 結果來源；已停止。');
  }
  return download.href;
}

export interface GuestImageDom {
  src: string;
  imageCount: number;
  downloadCount: number;
  href: string;
  label: string;
}

export interface GuestGroupDom {
  ordinal: number;
  userCount: number;
  userText: string;
  assistantTexts: string[];
  working: boolean;
  /** Non-streaming prose plus the reviewed, sibling response-actions structure. */
  terminalText?: boolean;
  /** The frontend's generic isError surface; not evidence of a safety refusal. */
  terminalError?: boolean;
  images: GuestImageDom[];
}

export interface GuestDomData {
  groups: GuestGroupDom[];
  quotaText: string | null;
}

export function groupKey(pageUrl: string, group: Pick<GuestGroupDom, 'ordinal' | 'userText'>): string {
  return `group:${textHash(new URL(pageUrl).pathname).slice(0, 16)}:${group.ordinal}:${textHash(group.userText)}`;
}

export function imageKey(image: Pick<GuestImageDom, 'src'>): string {
  return `image:${textHash(image.src)}`;
}

export function observedQuota(text: string | null): QuotaInfo {
  const match = text?.trim().replace(/\s+/g, ' ').match(/^(\d+) free images left today\s*·\s*Add credits$/);
  if (!match) return { ...UNKNOWN_QUOTA };
  const remaining = Number(match[1]);
  if (!Number.isSafeInteger(remaining) || remaining < 0) return { ...UNKNOWN_QUOTA };
  return { availability: remaining === 0 ? 'exhausted' : 'available', remaining,
    observed_at: new Date().toISOString(), source: 'page' };
}

/** Prompt text comes only from the observed user bubble, never duplicate screen-reader headings. */
export function snapshotFromGuestDom(pageUrl: string, dom: GuestDomData): BrowserSnapshot {
  if (!isGuestPageUrl(pageUrl)) throw new BridgeError('UI_CHANGED', 'Ngini 任務頁不是已驗證的 guest conversation 路徑。');
  // Only canonical task identity or the clean blank identity is journalled.
  pageUrl = pageUrl === NGINI_GUEST_IMAGE ? NGINI_GUEST_NEW : pageUrl;
  const messages: BrowserSnapshot['messages'] = [];
  for (const group of dom.groups) {
    if (group.userCount !== 1 || !group.userText.trim() || group.assistantTexts.length > 1) {
      throw new BridgeError('UI_CHANGED', '本次訊息容器無法唯一辨識，沒有下載其他圖片。');
    }
    const key = groupKey(pageUrl, group);
    messages.push({ key, role: 'user', text_sha256: textHash(group.userText), complete: true, images: [] });
    const images = group.images.map(image => {
      if (image.imageCount !== 1 || !image.src || image.downloadCount > 1) {
        throw new BridgeError('UI_CHANGED', '圖片結果容器與已觀察的結構不一致。');
      }
      if (image.downloadCount === 1) reviewedDownloadUrl(image.src, image.href, image.label);
      return { key: imageKey(image), downloadable: image.downloadCount === 1 };
    });
    const text = group.assistantTexts[0] ?? '';
    if (group.assistantTexts.length || group.working || images.length || group.terminalError) {
      messages.push({ key: `${key}:assistant`, role: 'assistant', reply_to: key,
        text_sha256: textHash(text), images,
        // Real image-mode text can stream before the image, and the final assistant
        // element can be empty/hidden. Source-reviewed final response actions make
        // nonempty text terminal; arbitrary prose or a nested Copy button do not.
        complete: isCanonicalConversationUrl(pageUrl) && !group.working
          && (images.some(image => image.downloadable) || Boolean(group.terminalText && text.trim()) || Boolean(group.terminalError)),
        ...(group.terminalError ? { error_code: 'UI_CHANGED' as const } : {}) });
    }
  }
  return { page_url: pageUrl, messages, quota: observedQuota(dom.quotaText) };
}
