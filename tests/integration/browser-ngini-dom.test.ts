import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type APIResponse } from 'playwright-core';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { NginiAdapter, type BrowserCheckpoint } from '../../src/browser/ngini-adapter.js';
import { ObservedGuestPort } from '../../src/browser/ngini-port.js';
import { NGINI_GUEST_NEW, NGINI_GUEST_IMAGE, groupKey, imageKey, isCanonicalConversationUrl, isGuestPageUrl, observedQuota,
  reviewedDownloadUrl, snapshotFromGuestDom, type GuestGroupDom } from '../../src/browser/ngini-dom.js';
import { selectCurrentResult, textHash } from '../../src/browser/result-tracker.js';
import { buildSubmissionPrompt } from '../../src/browser/submission-prompt.js';

const canonical = 'https://ngini.com/c/01ARZ3NDEKTSV4RRFFQ69G5FAV';
const media = 'https://media.ngini.com/generations/01ARZ3NDEKTSV4RRFFQ69G5FAW.jpg';
const href = `/api/media/download?u=${encodeURIComponent(media)}&n=ngini-image-1`;
const prompt = '兩隻黑貓坐在太空船窗邊，溫暖插畫風，不要文字。';
const group: GuestGroupDom = { ordinal: 0, userCount: 1, userText: prompt,
  assistantTexts: ['圖片已完成。'], working: false,
  images: [{ src: media, imageCount: 1, downloadCount: 1, href, label: 'Download 1' }] };

describe('observed guest DOM projection and narrow URL policy (offline)', () => {
  it('groups the observed user bubble and image into one stable assistant turn across reload', () => {
    const first = snapshotFromGuestDom(canonical, { groups: [group], quotaText: '2 free images left today · Add credits' });
    const restored = snapshotFromGuestDom(canonical, { groups: [structuredClone(group)], quotaText: null });
    const checkpoint: BrowserCheckpoint = { request_id: 'dom-a', page_url: canonical,
      baseline_message_keys: [], baseline_result_keys: [], prompt_sha256: textHash(prompt),
      submission_started_at: '2026-10-07T00:00:00Z' };
    expect(first.messages).toEqual(restored.messages);
    expect(first.messages).toHaveLength(2);
    expect(selectCurrentResult(first, checkpoint)).toMatchObject({ message_key: `${groupKey(canonical, group)}:assistant`,
      result_key: imageKey(group.images[0]!), actual_image_count: 1, quota: { remaining: 2, source: 'page' } });
  });

  it('waits for the observed pending marker and canonical route without requiring hover controls', () => {
    const pending = snapshotFromGuestDom(canonical, { groups: [{ ...group, working: true }], quotaText: null });
    const newPage = snapshotFromGuestDom(NGINI_GUEST_NEW, { groups: [group], quotaText: null });
    const modePage = snapshotFromGuestDom(NGINI_GUEST_IMAGE, { groups: [], quotaText: null });
    expect(pending.messages[1]?.complete).toBe(false);
    expect(newPage.messages[1]?.complete).toBe(false);
    expect(modePage.page_url).toBe(NGINI_GUEST_NEW);
    expect(modePage.page_url).not.toContain('?');
    expect(snapshotFromGuestDom(canonical, { groups: [group], quotaText: null }).messages[1]?.complete).toBe(true);
  });

  it('retains a completed last image even if the observed remaining quota is zero', () => {
    const snapshot = snapshotFromGuestDom(canonical, { groups: [group], quotaText: '0 free images left today · Add credits' });
    expect(snapshot.error_code).toBeUndefined();
    expect(snapshot.quota).toMatchObject({ availability: 'exhausted', remaining: 0, source: 'page' });
    expect(snapshot.messages[1]?.images[0]?.downloadable).toBe(true);
    expect(observedQuota('10 free images usually')).toMatchObject({ remaining: null, source: 'not_observed' });
  });

  it('does not mistake early nonempty assistant text for a terminal image response', () => {
    const snapshot = snapshotFromGuestDom(canonical, { groups: [{ ...group, assistantTexts: ['正在生成圖片…'], images: [] }], quotaText: null });
    const checkpoint: BrowserCheckpoint = { request_id: 'early-text', page_url: canonical,
      baseline_message_keys: [], baseline_result_keys: [], prompt_sha256: textHash(prompt),
      submission_started_at: '2026-10-07T00:00:00Z' };
    expect(snapshot.messages[1]?.complete).toBe(false);
    expect(selectCurrentResult(snapshot, checkpoint)).toBeUndefined();
  });

  it('ends a source-reviewed final text response without inventing an image or refusal', () => {
    const snapshot = snapshotFromGuestDom(canonical, { groups: [{ ...group,
      assistantTexts: ['I cannot generate this image.'], images: [], terminalText: true }], quotaText: null });
    const checkpoint: BrowserCheckpoint = { request_id: 'final-text', page_url: canonical,
      baseline_message_keys: [], baseline_result_keys: [], prompt_sha256: textHash(prompt),
      submission_started_at: '2026-10-07T00:00:00Z' };
    expect(snapshot.messages[1]?.complete).toBe(true);
    expect(snapshot.messages[1]?.error_code).toBeUndefined();
    expect(() => selectCurrentResult(snapshot, checkpoint)).toThrow(expect.objectContaining({ code: 'PROVIDER_TEXT_ONLY' }));
    for (const pending of [{ working: true }, { assistantTexts: [''] }]) {
      expect(snapshotFromGuestDom(canonical, { groups: [{ ...group, images: [], terminalText: true,
        ...pending }], quotaText: null }).messages[1]?.complete).toBe(false);
    }
  });

  it.each([{ assistantTexts: [''] }, { assistantTexts: [] }])('accepts a verified image when the assistant element is empty or absent: %j', ({ assistantTexts }) => {
    const snapshot = snapshotFromGuestDom(canonical, { groups: [{ ...group, assistantTexts }], quotaText: null });
    const checkpoint: BrowserCheckpoint = { request_id: 'empty-assistant', page_url: canonical,
      baseline_message_keys: [], baseline_result_keys: [], prompt_sha256: textHash(prompt),
      submission_started_at: '2026-10-07T00:00:00Z' };
    expect(snapshot.messages[1]?.complete).toBe(true);
    expect(selectCurrentResult(snapshot, checkpoint)).toMatchObject({ result_key: imageKey(group.images[0]!), actual_image_count: 1 });
  });

  it('rejects arbitrary, credential-bearing, internal, duplicate, and prompt-bearing URL chains', () => {
    expect(isCanonicalConversationUrl(canonical)).toBe(true);
    expect(isCanonicalConversationUrl(`${canonical}?q=prompt`)).toBe(false);
    expect(isCanonicalConversationUrl('https://ngini.com/c/new')).toBe(false);
    expect(isGuestPageUrl(NGINI_GUEST_IMAGE)).toBe(true);
    expect(isGuestPageUrl(`${NGINI_GUEST_IMAGE}&q=prompt`)).toBe(false);
    expect(isGuestPageUrl('https://ngini.com/c/new?tool=chat&locale=en')).toBe(false);
    expect(isCanonicalConversationUrl('https://ngini.com.evil.invalid/c/01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(false);
    expect(reviewedDownloadUrl(media, href, 'Download 1')).toBe(`https://ngini.com${href}`);
    for (const invalid of [
      href.replace(encodeURIComponent(media), encodeURIComponent('http://127.0.0.1/private')),
      href.replace(encodeURIComponent(media), encodeURIComponent('file:///private.png')),
      `${href}&u=${encodeURIComponent(media)}`,
      `${href}&url=https://evil.invalid/`,
      `https://user:password@ngini.com${href}`,
      `https://ngini.com:8443${href}`,
      `https://evil.invalid${href}`,
    ]) expect(() => reviewedDownloadUrl(media, invalid, 'Download 1')).toThrow(expect.objectContaining({ code: 'UI_CHANGED' }));
  });

  it('fails closed for unknown grouped layout and an unreviewed scoped image source', () => {
    expect(() => snapshotFromGuestDom(canonical, { groups: [{ ...group, userCount: 2 }], quotaText: null }))
      .toThrow(expect.objectContaining({ code: 'UI_CHANGED' }));
    expect(() => snapshotFromGuestDom(canonical, { groups: [{ ...group, images: [{ ...group.images[0]!, src: 'https://evil.invalid/image.jpg' }] }], quotaText: null }))
      .toThrow(expect.objectContaining({ code: 'UI_CHANGED' }));
  });
});

const browserEnabled = process.env.NGINI_DOM_BROWSER_TEST === '1';
describe.skipIf(!browserEnabled)('observed guest DOM through a routed offline browser fixture', () => {
  it('submits once, journals the canonical route, restores and gets only the exact offered original without redirects', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ngini-guest-dom-'));
    const original = await sharp({ create: { width: 48, height: 32, channels: 3, background: '#5277a1' } }).jpeg().toBuffer();
    const context = await chromium.launchPersistentContext(path.join(directory, 'browser-profile'), {
      channel: 'msedge', headless: true, chromiumSandbox: true, serviceWorkers: 'block', acceptDownloads: true,
      // Guard browser-process traffic that cannot be caught by Playwright routing.
      args: ['--host-resolver-rules=MAP * ~NOTFOUND'],
    });
    let submissions = 0;
    let downloadRequests = 0;
    const mediaRequests: string[] = [];
    const aborted: string[] = [];
    const submittedPrompt = buildSubmissionPrompt(prompt);
    const completedGroup = `<div class="TMZXJW_messageGroup"><div class="TMZXJW_userQuery__wrapper"><h1 class="srTitle">${submittedPrompt}</h1><div class="TMZXJW_userBubble">${submittedPrompt}</div></div><div class="TMZXJW_generatedImage"><div><div class="TMZXJW_generatedImage__item"><button aria-label="Open image"><img class="TMZXJW_generatedImage__img" src="${media}" alt="${submittedPrompt}"></button><a class="TMZXJW_generatedImage__download" download="" aria-label="Download 1" href="${href.replaceAll('&', '&amp;')}">Download</a></div></div></div><div data-assistant="true" class="TMZXJW_prose" hidden></div><div class="TMZXJW_responseActions__wrapper" hidden><button aria-label="Copy response">Copy</button></div><div class="sourceCard"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></div></div>`;
    const conversation = `<div role="log" class="TMZXJW_content"><div class="TMZXJW_content__inner">${completedGroup}</div></div>`;
    // The observed image mode has its heading + INPUT + Send and no initial log.
    const fixtureHtml = (complete: boolean) => `<!doctype html><html><head><meta charset="utf-8"></head><body><a href="/login">Sign in</a><button class="TMZXJW_quotaChip">2 free images left today · Add credits</button>${complete ? conversation : '<h1>Describe the image you want</h1>'}<input aria-label="Ask anything..." placeholder="A sunset over mountains, oil painting style..."><button aria-label="Send">Send</button><script>document.querySelector('button[aria-label="Send"]').onclick=()=>{window.markMockSubmit();history.pushState({},'',${JSON.stringify(canonical)});document.querySelector('input').insertAdjacentHTML('beforebegin',${JSON.stringify(conversation)});document.querySelector('.TMZXJW_quotaChip').textContent='1 free images left today · Add credits';};</script></body></html>`;
    let bodyReads = 0;
    let disposed = 0;
    const response = (status = 200, headers: Record<string, string> = { 'content-type': 'image/jpeg' }, bytes = original) => ({
      url: () => media, status: () => status, headers: () => headers,
      body: async () => { bodyReads++; return bytes; }, dispose: async () => { disposed++; },
    } as unknown as APIResponse);
    let respond = async () => response();
    // APIRequestContext is not covered by browser routing. Stub it explicitly so
    // this test cannot contact Ngini even while exercising a real DOM and context.
    const get = vi.spyOn(context.request, 'get').mockImplementation(async (url, options) => {
      expect(url).toBe(media); expect(options).toMatchObject({ maxRedirects: 0, maxRetries: 0 });
      mediaRequests.push(String(url)); return respond();
    });
    try {
      await context.exposeFunction('markMockSubmit', () => { submissions++; });
      await context.route('**/*', async route => {
        const url = route.request().url();
        if (url === NGINI_GUEST_IMAGE || url === canonical) await route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixtureHtml(url === canonical) });
        else if (url === media) await route.fulfill({ contentType: 'image/jpeg', body: original });
        else if (url === `https://ngini.com${href}`) {
          downloadRequests++;
          await route.fulfill({ contentType: 'image/jpeg', body: original, headers: { 'content-disposition': 'attachment; filename="ngini-image-1.jpg"' } });
        } else { aborted.push(url); await route.abort('blockedbyclient'); }
      });
      const page = context.pages()[0]!;
      const session = { page: async () => page, close: async () => {} };
      const port = new ObservedGuestPort(session, { maxDownloadBytes: original.length });
      const adapter = new NginiAdapter({ dataDir: directory, port, generationTimeoutMs: 2000 });
      const checkpoint = await adapter.open('offline-dom-submit');
      expect(await page.getByRole('log').count()).toBe(0);
      expect(page.url()).toBe(NGINI_GUEST_IMAGE);
      expect(checkpoint.page_url).toBe(NGINI_GUEST_NEW);
      expect(checkpoint.baseline_message_keys).toEqual([]);
      const submitted = await adapter.submit(prompt, checkpoint, async () => { expect(submissions).toBe(0); });
      expect(submittedPrompt).toBe(prompt);
      expect(await page.getByRole('textbox', { name: 'Ask anything...', exact: true }).inputValue()).toBe(submittedPrompt);
      let persisted = submitted;
      const result = await adapter.wait(submitted, undefined, 2000, async updated => { persisted = updated; });
      expect(persisted.page_url).toBe(canonical);
      expect(persisted.prompt_sha256).toBe(textHash(submittedPrompt));
      expect(result.actual_image_count).toBe(1);
      expect(result.quota.remaining).toBe(1);
      expect(submissions).toBe(1);
      await page.goto('about:blank');
      const restored = await adapter.recover(persisted, undefined, 2000);
      expect(restored.result_key).toBe(result.result_key);
      expect(restored.message_key).toBe(result.message_key);
      expect(submissions).toBe(1);
      const destination = path.join(directory, 'verified-original.jpg');
      await adapter.download(restored, destination);
      expect(await readFile(destination)).toEqual(original);
      expect(mediaRequests).toEqual([media]);
      expect(downloadRequests).toBe(0);
      expect(disposed).toBe(1);
      // Exclusive save does not overwrite even an existing valid original.
      await expect(port.download(restored, destination)).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' });
      expect(await readFile(destination)).toEqual(original);
      let transientDownloads = 0;
      respond = async () => ++transientDownloads < 3 ? response(503, { 'content-type': 'text/html' }) : response();
      const recoveredDestination = path.join(directory, 'recovered-original.jpg');
      await adapter.download(restored, recoveredDestination);
      expect(transientDownloads).toBe(3);
      expect(await readFile(recoveredDestination)).toEqual(original);
      expect(submissions).toBe(1);
      const readsBeforeRedirect = bodyReads;
      const requestsBeforeRateLimit = mediaRequests.length;
      respond = async () => response(429, { 'content-type': 'text/html' });
      await expect(adapter.download(restored, path.join(directory, 'rate-limited.jpg'))).rejects.toMatchObject({ code: 'RATE_LIMITED' });
      expect(mediaRequests).toHaveLength(requestsBeforeRateLimit + 1);
      expect(bodyReads).toBe(readsBeforeRedirect);
      expect(submissions).toBe(1);
      respond = async () => response(302, { location: 'http://127.0.0.1/private' });
      await expect(port.download(restored, path.join(directory, 'redirect.jpg'))).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' });
      expect(bodyReads).toBe(readsBeforeRedirect);
      respond = async () => response(200, { 'content-type': 'text/html' });
      await expect(port.download(restored, path.join(directory, 'html.jpg'))).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
      expect(bodyReads).toBe(readsBeforeRedirect);
      respond = async () => response(200, { 'content-type': 'image/jpeg', 'content-length': String(original.length + 1) });
      await expect(port.download(restored, path.join(directory, 'large-header.jpg'))).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
      expect(bodyReads).toBe(readsBeforeRedirect);
      respond = async () => response(200, { 'content-type': 'image/jpeg' }, Buffer.alloc(original.length + 1));
      await expect(port.download(restored, path.join(directory, 'large-body.jpg'))).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
      let resolveLate!: (value: APIResponse) => void;
      respond = () => new Promise<APIResponse>(resolve => { resolveLate = resolve; });
      const controller = new AbortController();
      const cancelled = port.download(restored, path.join(directory, 'cancelled.jpg'), controller.signal);
      await vi.waitFor(() => expect(resolveLate).toBeTypeOf('function'), { timeout: 1000, interval: 5 });
      controller.abort();
      await expect(cancelled).rejects.toMatchObject({ code: 'CANCELLED' });
      const disposedBeforeLate = disposed;
      resolveLate(response());
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(disposed).toBe(disposedBeforeLate + 1);
      expect(submissions).toBe(1);
      const requestsBeforeInvalid = mediaRequests.length;
      await page.locator('a[download]').evaluate(anchor => anchor.setAttribute('href', '/api/media/download?u=http%3A%2F%2F127.0.0.1%2Fprivate&n=ngini-image-1'));
      await expect(port.download(restored, path.join(directory, 'private.jpg'))).rejects.toMatchObject({ code: 'UI_CHANGED' });
      expect(mediaRequests).toHaveLength(requestsBeforeInvalid);
      expect(aborted).toEqual([]);
      await page.setContent(fixtureHtml(false)); // URL is still canonical: missing log must fail closed.
      await expect(port.read()).rejects.toMatchObject({ code: 'UI_CHANGED' });
      await page.goto(NGINI_GUEST_IMAGE);
      const multilinePort = new ObservedGuestPort(session);
      const multilineAdapter = new NginiAdapter({ dataDir: directory, port: multilinePort });
      const multilineCheckpoint = await multilineAdapter.open('offline-multiline-refused');
      let journalCalls = 0;
      await expect(multilineAdapter.submit('第一行：貓\n第二行：保留這個換行', multilineCheckpoint,
        async () => { journalCalls++; })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
      expect(journalCalls).toBe(0); expect(submissions).toBe(1);
      expect(await page.getByRole('log').count()).toBe(0);
      await page.locator('body').evaluate(body => body.insertAdjacentHTML('beforeend', '<input aria-label="Ask anything...">'));
      await expect(port.read()).rejects.toMatchObject({ code: 'UI_CHANGED' });
      expect(submissions).toBe(1);
    } finally {
      get.mockRestore();
      await context.close();
      if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('ngini-guest-dom-')) {
        throw new Error('Refusing cleanup outside the dedicated fixture directory');
      }
      await rm(directory, { recursive: true, force: true });
    }
  }, 40_000);

  it.each(['input changed', 'mode changed', 'heading changed', 'page closed', 'cancelled'])(
    'does not Send or open a replacement when %s during the durable journal', async change => {
      const directory = await mkdtemp(path.join(tmpdir(), 'ngini-guest-dom-'));
      const context = await chromium.launchPersistentContext(path.join(directory, 'browser-profile'), {
        channel: 'msedge', headless: true, chromiumSandbox: true, serviceWorkers: 'block',
        args: ['--host-resolver-rules=MAP * ~NOTFOUND'],
      });
      let submissions = 0;
      let pageAcquisitions = 0;
      const network: string[] = [];
      try {
        await context.exposeFunction('markMockSubmit', () => { submissions++; });
        await context.route('**/*', async route => {
          const url = route.request().url(); network.push(url);
          if (url !== NGINI_GUEST_IMAGE) { await route.abort('blockedbyclient'); return; }
          await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><h1>Describe the image you want</h1><input aria-label="Ask anything..."><button aria-label="Send" onclick="window.markMockSubmit()">Send</button>' });
        });
        const page = context.pages()[0]!;
        const port = new ObservedGuestPort({ page: async () => { pageAcquisitions++; return page; }, close: async () => {} });
        const adapter = new NginiAdapter({ dataDir: directory, port });
        const checkpoint = await adapter.open(`offline-journal-${change}`);
        const cancellation = new AbortController();
        let journalCalls = 0;
        await expect(adapter.submit(prompt, checkpoint, async () => {
          journalCalls++;
          expect(await page.getByRole('textbox', { name: 'Ask anything...', exact: true }).inputValue()).toBe(prompt);
          if (change === 'input changed') await page.getByRole('textbox', { name: 'Ask anything...', exact: true }).fill('different task');
          else if (change === 'mode changed') await page.evaluate(() => history.pushState({}, '', '/c/new'));
          else if (change === 'heading changed') await page.getByRole('heading').evaluate(element => { element.textContent = 'What is on your mind?'; });
          else if (change === 'page closed') await page.close();
          else {
            // Abort during the port's asynchronous final DOM checks, after the
            // adapter's pre-call signal check. Keep exercising the actual DOM.
            const evaluate = page.evaluate.bind(page);
            vi.spyOn(page, 'evaluate').mockImplementationOnce(async (...args) => {
              const value = await (evaluate as (...args: unknown[]) => Promise<unknown>)(...args);
              cancellation.abort();
              return value;
            });
          }
        }, cancellation.signal)).rejects.toMatchObject({ code: change === 'cancelled' ? 'CANCELLED' : 'SUBMISSION_UNKNOWN' });
        expect(journalCalls).toBe(1);
        const acquisitions = pageAcquisitions;
        await expect(adapter.submit(prompt, checkpoint, async () => {})).rejects.toMatchObject({ code: 'SUBMISSION_UNKNOWN' });
        expect(pageAcquisitions).toBe(acquisitions);
        expect(submissions).toBe(0);
        expect(network).toEqual([NGINI_GUEST_IMAGE]);
        expect(context.pages()).toHaveLength(change === 'page closed' ? 0 : 1);
      } finally {
        vi.restoreAllMocks();
        await context.close();
        if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('ngini-guest-dom-')) {
          throw new Error('Refusing cleanup outside the dedicated fixture directory');
        }
        await rm(directory, { recursive: true, force: true });
      }
    }, 20_000);
});
