import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NginiAdapter } from '../../src/browser/ngini-adapter.js';
import { NGINI_GUEST_IMAGE, NGINI_GUEST_NEW } from '../../src/browser/ngini-dom.js';
import { ObservedGuestPort } from '../../src/browser/ngini-port.js';
import { challengeHttpCode, submissionHttpCode } from '../../src/browser/ngini-system-state.js';

const canonical = 'https://ngini.com/c/01ARZ3NDEKTSV4RRFFQ69G5FAV';
const guestWall = `<div class="IwjZ_W_card" role="region" aria-label="Source-reviewed localized guest-limit label"><div class="IwjZ_W_copy"><span class="IwjZ_W_title">Limit</span><span class="IwjZ_W_subtitle">Credit limit</span></div><button class="IwjZ_W_primary">Pack</button><button class="IwjZ_W_secondary">Sign up</button><div class="IwjZ_W_footer"><span class="IwjZ_W_reset">Reset</span><button class="IwjZ_W_dismiss">Dismiss</button></div></div>`;
// Observed exhausted-page text, with class/role/placement from public rr + Ht.
const observedExhaustedWall = guestWall.replace('>Limit<', '>Your free images for today are used up<')
  .replace('>Pack<', '>Unlock 25 more images now — €1.99, no account needed<');
const paywall = `<div class="t0BchG_card" role="region" aria-label="Source-reviewed localized inline-paywall label"><div class="t0BchG_copy"><span class="t0BchG_title">Payment</span><span class="t0BchG_subtitle">Pack</span></div><button class="t0BchG_primary">Buy</button></div>`;
const controls = '<h1>Describe the image you want</h1><input aria-label="Ask anything..."><button aria-label="Send">Send</button>';
const html = (body: string, script = '') => `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}<script>${script}</script></body></html>`;
// Cached public rr source: the final non-error branch renders sibling prose and
// response actions. The streaming branch has streamingContent and no actions.
const finalActions = '<div class="TMZXJW_responseActions__wrapper"><div class="TMZXJW_responseActions"><button class="TMZXJW_responseActions__btn" aria-label="Copy response">Copy</button></div></div>';
const textGroup = (assistant: string, sibling = finalActions) => `<div role="log"><div class="TMZXJW_content__inner"><div class="TMZXJW_messageGroup"><div class="TMZXJW_userBubble">貓</div>${assistant}${sibling}</div></div></div>`;

describe('normal submission HTTP metadata (no requests)', () => {
  it('maps only the reviewed exact current POST status, never guesses a captcha from 403', () => {
    expect(submissionHttpCode('https://ngini.com/api/chat', 'POST', 429)).toBe('RATE_LIMITED');
    expect(submissionHttpCode('https://ngini.com/api/chat', 'POST', 401)).toBe('LOGIN_OR_PAYMENT_REQUIRED');
    for (const url of ['https://ngini.com/api/chat/warm', 'https://ngini.com/api/chat/suggest', 'https://ngini.com/api/chat?other=1', 'https://evil.invalid/api/chat']) {
      expect(submissionHttpCode(url, 'POST', 429)).toBeUndefined();
    }
    expect(submissionHttpCode('https://ngini.com/api/chat', 'GET', 429)).toBeUndefined();
    expect(submissionHttpCode('https://ngini.com/api/chat', 'POST', 403)).toBe('UI_CHANGED');
  });

  it('requires the documented challenge header on a reviewed main document or exact submission', () => {
    const challenge = { 'cf-mitigated': 'challenge' };
    expect(challengeHttpCode(NGINI_GUEST_IMAGE, 'GET', challenge, true)).toBe('HUMAN_VERIFICATION_REQUIRED');
    expect(challengeHttpCode(canonical, 'GET', challenge, true)).toBe('HUMAN_VERIFICATION_REQUIRED');
    expect(challengeHttpCode('https://ngini.com/api/chat', 'POST', challenge, false)).toBe('HUMAN_VERIFICATION_REQUIRED');
    for (const [url, method, document] of [
      [NGINI_GUEST_IMAGE, 'GET', false], ['https://ngini.com/api/chat/warm', 'POST', false],
      ['https://ngini.com/api/chat?other=1', 'POST', false], ['https://evil.invalid/c/new', 'GET', true],
    ] as const) expect(challengeHttpCode(url, method, challenge, document)).toBeUndefined();
    expect(challengeHttpCode(NGINI_GUEST_IMAGE, 'GET', {}, true)).toBeUndefined();
    expect(challengeHttpCode(NGINI_GUEST_IMAGE, 'GET', { 'cf-mitigated': 'refused' }, true)).toBeUndefined();
  });
});

/** Source-derived card shapes, not claimed live screenshots or translated labels. */
describe.skipIf(process.env.NGINI_DOM_BROWSER_TEST !== '1')('production port system gates through a DNS-blocked routed fixture', () => {
  let directory: string;
  let context: BrowserContext;
  let page: Page;
  let fixture = html(controls);
  let status = 200;
  let submits = 0;
  let documentHeaders: Record<string, string> = {};
  let apiHeaders: Record<string, string> = {};
  const ports: ObservedGuestPort[] = [];
  const requests: string[] = [];
  const makePort = () => {
    const port = new ObservedGuestPort({ page: async () => page, close: async () => {} });
    ports.push(port); return port;
  };
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'ngini-system-fixture-'));
    context = await chromium.launchPersistentContext(path.join(directory, 'browser-profile'), {
      channel: 'msedge', headless: true, chromiumSandbox: true, serviceWorkers: 'block',
      args: ['--host-resolver-rules=MAP * ~NOTFOUND'],
    });
    await context.exposeFunction('markMockSubmit', () => { submits++; });
    await context.route('**/*', async route => {
      const url = route.request().url(); requests.push(url);
      if ([NGINI_GUEST_IMAGE, canonical].includes(url)) await route.fulfill({ contentType: 'text/html; charset=utf-8', headers: documentHeaders, body: fixture });
      else if (url === 'https://ngini.com/api/chat' || url === 'https://ngini.com/api/chat/warm') {
        await route.fulfill({ status, contentType: 'text/plain', headers: apiHeaders, body: 'offline fixture only' });
      } else await route.abort('blockedbyclient');
    });
    page = context.pages()[0]!;
    page.setDefaultTimeout(1000);
  }, 20_000);
  beforeEach(() => { status = 200; documentHeaders = {}; apiHeaders = {}; });
  afterAll(async () => {
    for (const port of ports) await port.close();
    await context?.close();
    if (directory) {
      if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('ngini-system-fixture-')) {
        throw new Error('Refusing cleanup outside the dedicated fixture directory');
      }
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('stops open on the guest-limit card even when no composer exists', async () => {
    fixture = html(guestWall); const port = makePort(); const before = submits;
    await expect(port.open()).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
    expect(submits).toBe(before);
  });

  it('stops a documented main-document challenge before any Send and can recheck only after a manual reload clears it', async () => {
    documentHeaders = { 'cf-mitigated': 'challenge' };
    fixture = html('<h1>Verification fixture</h1>'); const before = submits;
    const port = makePort();
    const adapter = new NginiAdapter({ dataDir: directory, port });
    await expect(adapter.open('offline-main-challenge')).rejects.toMatchObject({ code: 'HUMAN_VERIFICATION_REQUIRED' });
    expect(submits).toBe(before);
    documentHeaders = {}; fixture = html(controls);
    // Simulates the human finishing verification. The tool itself never reloads
    // or submits to escape the challenge.
    await page.reload();
    expect((await adapter.recheckBeforeSubmit('offline-main-challenge')).page_url).toBe(NGINI_GUEST_NEW);
    expect(submits).toBe(before);
  });

  it('stops prepare before fill/journal/Send on the source-derived inline paywall', async () => {
    fixture = html(controls); const port = makePort();
    const adapter = new NginiAdapter({ dataDir: directory, port });
    const checkpoint = await adapter.open('offline-paywall');
    await page.locator('body').evaluate((body, card) => body.insertAdjacentHTML('beforeend', card), paywall);
    let journalCalls = 0; const before = submits;
    await expect(adapter.submit('貓', checkpoint, async () => { journalCalls++; })).rejects.toMatchObject({ code: 'LOGIN_OR_PAYMENT_REQUIRED' });
    expect(await page.getByRole('textbox', { name: 'Ask anything...' }).inputValue()).toBe('');
    expect(journalCalls).toBe(0); expect(submits).toBe(before);
  });

  it('stops read and canonical resume on the reviewed guest-limit structure', async () => {
    fixture = html(controls); const port = makePort(); await port.open();
    await page.locator('body').evaluate((body, card) => body.insertAdjacentHTML('beforeend', card), guestWall);
    await expect(port.read()).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
    fixture = html(guestWall); const before = submits;
    await expect(port.resume(canonical)).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
    expect(submits).toBe(before);
  });

  it('recognizes the real exhausted card appended inside role=log after a submitted message, without payment or a second Send', async () => {
    const group = '<div class="TMZXJW_messageGroup"><div class="TMZXJW_userBubble">貓蜷縮在太空船窗邊睡覺</div><div data-assistant="true">你已达到今天的免费图片额度——登录或获取积分即可继续创作。</div></div>';
    const exhaustedLog = `<div role="log"><div class="TMZXJW_content__inner">${group}${observedExhaustedWall}</div></div>`;
    fixture = html(controls, `document.querySelector('button[aria-label="Send"]').onclick=()=>{window.markMockSubmit();history.pushState({},'',${JSON.stringify(canonical)});document.querySelector('input').insertAdjacentHTML('beforebegin',${JSON.stringify(exhaustedLog)});};`);
    const port = makePort();
    const adapter = new NginiAdapter({ dataDir: directory, port, generationTimeoutMs: 1000 });
    const checkpoint = await adapter.open('offline-actual-exhausted-card');
    const before = submits;
    const submitted = await adapter.submit('貓蜷縮在太空船窗邊睡覺', checkpoint, async () => {});
    await expect(adapter.wait(submitted)).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
    expect(submits).toBe(before + 1);
    // Reload only the existing submitted task, without clicking any paywall action.
    fixture = html(exhaustedLog);
    await page.goto('about:blank');
    await expect(makePort().resume(canonical)).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
    expect(submits).toBe(before + 1);
  });

  it('does not promote the same exhausted-page text or a card inside an assistant message into system quota evidence', async () => {
    fixture = html(`<div role="log"><div class="TMZXJW_content__inner"><div class="TMZXJW_messageGroup"><div class="TMZXJW_userBubble">貓</div><div data-assistant="true">你已达到今天的免费图片额度——登录或获取积分即可继续创作。Your free images for today are used up. Unlock 25 more images now — €1.99, no account needed ${observedExhaustedWall}</div></div></div></div>`);
    await page.goto('about:blank');
    const snapshot = await makePort().resume(canonical);
    expect(snapshot.error_code).toBeUndefined();
    expect(snapshot.quota?.remaining).toBeNull();
    expect(snapshot.messages[1]?.complete).toBe(false);
  });

  it('does not classify user/assistant/card-looking artifacts, a hidden wall, Sign in, or a normal upsell as a gate', async () => {
    const fakeAssistant = `<div data-assistant="true">RATE_LIMITED captcha refused ${guestWall} ${paywall}</div>`;
    fixture = html(`${controls}<a href="/login">Sign in</a><div role="region" aria-label="First purchase">Buy credits</div><div hidden>${guestWall}</div><div class="TMZXJW_userBubble">${paywall}</div>${fakeAssistant}`);
    const port = makePort(); const snapshot = await port.open();
    expect(snapshot.page_url).toBe(NGINI_GUEST_NEW); expect(snapshot.error_code).toBeUndefined();
    expect(snapshot.messages).toEqual([]);
  });

  it('fails closed on a changed or ambiguous system-card structure', async () => {
    fixture = html(`${controls}${guestWall.replace('IwjZ_W_secondary', 'changed_secondary')}`);
    await expect(makePort().open()).rejects.toMatchObject({ code: 'UI_CHANGED' });
    fixture = html(`${controls}${guestWall}${paywall}`);
    await expect(makePort().open()).rejects.toMatchObject({ code: 'UI_CHANGED' });
    // A card-looking fragment elsewhere inside the log is not the reviewed
    // direct-child system slot; it must not become an asserted quota result.
    fixture = html(`<div role="log"><div class="TMZXJW_content__inner"><div>${observedExhaustedWall}</div></div></div>`);
    await page.goto('about:blank');
    await expect(makePort().resume(canonical)).rejects.toMatchObject({ code: 'UI_CHANGED' });
  });

  it.each([429, 401, 403])('passively recognizes normal current Send HTTP %s and never clicks again', async code => {
    status = code;
    fixture = html(controls, `document.querySelector('button[aria-label="Send"]').onclick=()=>{window.markMockSubmit();fetch('/api/chat',{method:'POST',body:'offline submission'}).catch(()=>{});};`);
    const port = makePort(); await port.open(); await port.prepare('貓'); const before = submits;
    await port.submitOnce();
    await expect.poll(async () => {
      try { await port.read(); return 'none'; } catch (error) { return (error as { code?: string }).code; }
    }).toBe(code === 429 ? 'RATE_LIMITED' : code === 401 ? 'LOGIN_OR_PAYMENT_REQUIRED' : 'UI_CHANGED');
    await expect(port.submitOnce()).rejects.toMatchObject({ code: 'SUBMISSION_UNKNOWN' });
    expect(submits).toBe(before + 1);
  });

  it('gives an exact current submission challenge precedence over generic 403 and never resubmits', async () => {
    status = 403; apiHeaders = { 'cf-mitigated': 'challenge' };
    fixture = html(controls, `document.querySelector('button[aria-label="Send"]').onclick=()=>{window.markMockSubmit();fetch('/api/chat',{method:'POST',body:'offline submission'}).catch(()=>{});};`);
    const port = makePort(); await port.open(); await port.prepare('貓'); const before = submits;
    await port.submitOnce();
    await expect.poll(async () => {
      try { await port.read(); return 'none'; } catch (error) { return (error as { code?: string }).code; }
    }).toBe('HUMAN_VERIFICATION_REQUIRED');
    await expect(port.submitOnce()).rejects.toMatchObject({ code: 'SUBMISSION_UNKNOWN' });
    expect(submits).toBe(before + 1);
  });

  it('ignores a challenge header on a warm request even after our Send', async () => {
    status = 403; apiHeaders = { 'cf-mitigated': 'challenge' };
    fixture = html(controls, `document.querySelector('button[aria-label="Send"]').onclick=()=>{window.markMockSubmit();fetch('/api/chat/warm',{method:'POST'}).catch(()=>{});};`);
    const beforeRequests = requests.filter(url => url.endsWith('/api/chat/warm')).length;
    const port = makePort(); await port.open(); await port.prepare('貓');
    await port.submitOnce();
    await expect.poll(() => requests.filter(url => url.endsWith('/api/chat/warm')).length).toBeGreaterThan(beforeRequests);
    expect((await port.read()).error_code).toBeUndefined();
  });

  it('ends a source-derived final text-only reply after exactly one Send without rewriting or inventing refusal', async () => {
    const textLog = textGroup('<div data-assistant="true" class="TMZXJW_prose">I cannot generate this image; refused; cf-mitigated: challenge</div>');
    fixture = html(controls, `document.querySelector('button[aria-label="Send"]').onclick=()=>{window.markMockSubmit();history.pushState({},'',${JSON.stringify(canonical)});document.querySelector('input').insertAdjacentHTML('beforebegin',${JSON.stringify(textLog)});};`);
    const port = makePort(); const adapter = new NginiAdapter({ dataDir: directory, port, generationTimeoutMs: 1000 });
    const checkpoint = await adapter.open('offline-terminal-text'); const before = submits;
    const submitted = await adapter.submit('貓', checkpoint, async () => {});
    await expect(adapter.wait(submitted)).rejects.toMatchObject({ code: 'PROVIDER_TEXT_ONLY' });
    expect(submits).toBe(before + 1);
  });

  it.each(['Service capacity exceeded', 'Request timeout', 'Invalid input', 'Generation refused'])('treats the reviewed generic error surface as unknown, not a specific refusal: %s', async text => {
    fixture = html(textGroup(`<div class="TMZXJW_errorState"><span class="TMZXJW_errorState__text">${text}</span><button class="TMZXJW_errorState__retry">Retry</button></div>`, ''));
    await page.goto('about:blank'); const port = makePort(); const before = submits;
    const snapshot = await port.resume(canonical);
    expect(snapshot.messages[1]?.error_code).toBe('UI_CHANGED');
    expect(snapshot.messages[1]?.complete).toBe(true);
    expect(submits).toBe(before); // No retry action is exposed or clicked.
  });

  it.each([
    ['nested actions', `<div data-assistant="true" class="TMZXJW_prose">${finalActions}</div>`, ''],
    ['streaming', '<div data-assistant="true" class="TMZXJW_prose TMZXJW_streamingContent">Generating...</div>', finalActions],
    ['hidden prose', '<div data-assistant="true" class="TMZXJW_prose" hidden>Hidden</div>', finalActions],
    ['nested error', '<div data-assistant="true" class="TMZXJW_prose"><div class="TMZXJW_errorState"><span class="TMZXJW_errorState__text">Refused</span></div></div>', ''],
  ])('does not promote %s into trusted terminal or challenge evidence', async (_name, assistant, sibling) => {
    fixture = html(textGroup(assistant, sibling)); await page.goto('about:blank'); const before = submits;
    const snapshot = await makePort().resume(canonical);
    expect(snapshot.error_code).toBeUndefined();
    expect(snapshot.messages[1]?.complete).toBe(false);
    expect(snapshot.messages[1]?.error_code).toBeUndefined();
    expect(submits).toBe(before);
  });

  it('ignores a rate-limited warm/preflight POST before our Send', async () => {
    status = 429;
    fixture = html(controls, "fetch('/api/chat/warm',{method:'POST'}).catch(()=>{});fetch('/api/chat',{method:'POST'}).catch(()=>{});");
    const port = makePort(); await port.open();
    expect((await port.read()).error_code).toBeUndefined();
  });

  it('only rechecks the retained empty image mode without navigation/fill/click and rejects other task or already claimed use', async () => {
    fixture = html(controls); const port = makePort();
    const adapter = new NginiAdapter({ dataDir: directory, port });
    await adapter.open('retained-empty'); const beforeRequests = requests.length; const before = submits;
    const checkpoint = await adapter.recheckBeforeSubmit('retained-empty');
    expect(checkpoint).toEqual({ request_id: 'retained-empty', page_url: NGINI_GUEST_NEW, baseline_message_keys: [], baseline_result_keys: [] });
    expect(requests).toHaveLength(beforeRequests); expect(submits).toBe(before);
    expect(await page.getByRole('textbox', { name: 'Ask anything...' }).inputValue()).toBe('');
    await expect(adapter.recheckBeforeSubmit('another-request')).rejects.toMatchObject({ code: 'SUBMISSION_UNKNOWN' });
    await page.getByRole('textbox', { name: 'Ask anything...' }).fill('unexpected text');
    await expect(adapter.recheckBeforeSubmit('retained-empty')).rejects.toMatchObject({ code: 'UI_CHANGED' });
    await page.getByRole('textbox', { name: 'Ask anything...' }).fill('');
    await adapter.submit('貓', checkpoint, async () => {});
    await expect(adapter.recheckBeforeSubmit('retained-empty')).rejects.toMatchObject({ code: 'SUBMISSION_UNKNOWN' });
    expect(submits).toBe(before); // This fixture has no Send handler; recheck never clicks.
  });

  it('does not invent terminal refusal/text-only/captcha statuses from ordinary provider words', async () => {
    fixture = html(`<div role="log"><div class="TMZXJW_content__inner"><div class="TMZXJW_messageGroup"><div class="TMZXJW_userBubble">貓</div><div data-assistant="true">refused; quota exceeded; captcha verification required; payment required</div></div></div></div>`);
    const port = makePort(); const snapshot = await port.resume(canonical);
    expect(snapshot.error_code).toBeUndefined(); expect(snapshot.messages[1]?.complete).toBe(false);
    expect(snapshot.messages[1]?.images).toEqual([]);
  });
});
