import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_RESULT_META_KEY, imageCardToolResult } from '../../src/ui/card-contract.js';

const bridge = vi.hoisted(() => ({ app: undefined as any, capabilities: {} as any,
  assemble: vi.fn(), calls: vi.fn(), download: vi.fn(), context: vi.fn() }));
vi.mock('@modelcontextprotocol/ext-apps', () => ({
  App: class {
    constructor() { bridge.app = this; }
    async connect() {}
    getHostContext() { return {}; }
    getHostCapabilities() { return bridge.capabilities; }
    callServerTool(...args: unknown[]) { return bridge.calls(...args); }
    downloadFile(...args: unknown[]) { return bridge.download(...args); }
    updateModelContext(...args: unknown[]) { return bridge.context(...args); }
  }, applyHostStyleVariables: vi.fn(),
}));
vi.mock('../../src/ui/card-contract.js', async (importOriginal) => ({
  ...await importOriginal<object>(), assembleOriginalDownload: bridge.assemble,
}));

class Element {
  hidden = false;
  disabled = false;
  textContent = '';
  dataset: Record<string, string> = {};
  src?: string;
  alt = '';
  onload?: () => void;
  onerror?: () => void;
  handlers: Record<string, () => unknown> = {};
  removeAttribute(name: string) { if (name === 'src') this.src = undefined; }
  addEventListener(name: string, handler: () => unknown) { this.handlers[name] = handler; }
  fire(name: string) { return this.handlers[name]?.(); }
}
let elements: Record<string, Element>;
const image = { image_id: 'test-image', filename: 'ngini-test.png', mime: 'image/png',
  width: 48, height: 32, bytes: 10, sha256: 'a'.repeat(64),
  preview: { mime: 'image/png', data: 'aGVsbG8=' } };

beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers();
  bridge.calls.mockReset().mockResolvedValue({ content: [] });
  bridge.download.mockReset().mockResolvedValue({});
  bridge.context.mockReset().mockResolvedValue({});
  bridge.assemble.mockReset().mockResolvedValue({ type: 'resource', resource: { blob: 'unit-mock' } });
  bridge.capabilities = { serverTools: {}, downloadFile: {} };
  elements = Object.fromEntries(['main', 'header', '#status', '#preview', '#preview-label',
    '#fixture-label', '#details', '#download', '#refresh', '#cancel', '#image-frame',
    '#download-label', '#recovery'].map(name => [name, new Element()]));
  vi.stubGlobal('document', { querySelector: (name: string) => elements[name], documentElement: { dataset: {} } });
  await import('../../src/ui/image-card-client.js');
  await Promise.resolve();
});
afterEach(() => { bridge.app.onteardown?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function show(source: 'ngini' | 'fixture' = 'ngini', status = 'presenting', message = '原圖已保存，正在準備聊天交付…') {
  bridge.app.ontoolresult({ structuredContent: { request_id: 'presentation.same-id', status, message,
    source, image: { ...image, source } } });
  elements['#preview'].onload?.();
}

/** The host response can arrive after the local SDK request has expired. */
function delayedHostConfirmation(responseDelayMs?: number) {
  const observations = { hostResponses: 0, localAborts: 0 };
  bridge.download.mockImplementation((_params, options: { timeout?: number; signal?: AbortSignal }) => new Promise((resolve, reject) => {
    const signal = options.signal;
    const deadline = setTimeout(() => {
      signal?.removeEventListener('abort', stopWaiting);
      reject(Object.assign(new Error('Local SDK request timeout'), { code: -32001 }));
    }, options.timeout ?? 60_000);
    const stopWaiting = () => {
      observations.localAborts++;
      clearTimeout(deadline);
      reject(signal?.reason ?? new Error('Local request aborted'));
    };
    signal?.addEventListener('abort', stopWaiting, { once: true });
    if (responseDelayMs !== undefined) setTimeout(() => {
      observations.hostResponses++;
      clearTimeout(deadline);
      signal?.removeEventListener('abort', stopWaiting);
      resolve({});
    }, responseDelayMs);
  }));
  return observations;
}

describe('image card presentation modes (mock DOM; no host acceptance)', () => {
  it('renders the metadata-only original identity and uses that same image for the download', async () => {
    const card = { request_id: 'presentation.same-id', status: 'image_ready', message: 'Original preserved.',
      delivery_mode: 'app_poll', source: 'fixture', image: { ...image, source: 'fixture' } };
    const response = imageCardToolResult(card);
    expect(response.structuredContent).toEqual({ request_id: card.request_id, status: card.status, delivery_mode: 'app_poll' });
    expect(response.structuredContent).not.toHaveProperty('image');
    bridge.app.ontoolresult(response);
    elements['#preview'].onload?.();
    expect(elements.main.dataset.display).toBe('image');
    expect(elements['#fixture-label'].hidden).toBe(false);
    expect(elements['#preview'].src).toBe(`data:${image.preview.mime};base64,${image.preview.data}`);
    await elements['#download'].fire('click');
    expect(bridge.assemble).toHaveBeenCalledExactlyOnceWith(card.image, expect.any(Function), expect.any(AbortSignal));
    expect(bridge.download).toHaveBeenCalledTimes(1);
    expect(bridge.calls.mock.calls.some(([arg]) => arg.name === 'ngini_generate_image')).toBe(false);
  });

  it('rejects malformed metadata without displaying an otherwise valid legacy image', () => {
    bridge.app.ontoolresult({ structuredContent: { request_id: 'presentation.same-id', status: 'image_ready',
      message: 'legacy', image }, _meta: { [CARD_RESULT_META_KEY]: { status: 'image_ready' } } });
    expect(elements['#preview'].src).toBeUndefined();
    expect(elements['#status'].textContent).toContain('DELIVERY_BLOCKED');
    expect(bridge.download).not.toHaveBeenCalled();
  });

  it('handles a same-request cancellation result carried in metadata without submitting an image', async () => {
    const waiting = { request_id: 'presentation.same-id', status: 'waiting_for_image',
      message: 'Waiting.', delivery_mode: 'app_poll', source: 'ngini' };
    bridge.app.ontoolresult(imageCardToolResult(waiting));
    bridge.calls.mockImplementation(async ({ name }) => name === 'ngini_cancel_generation'
      ? imageCardToolResult({ ...waiting, status: 'cancelled', message: 'Local waiting stopped.' }) : { content: [] });
    await elements['#cancel'].fire('click');
    expect(bridge.calls).toHaveBeenCalledExactlyOnceWith({ name: 'ngini_cancel_generation',
      arguments: { request_id: waiting.request_id } });
    expect(elements['#status'].textContent).toBe('Local waiting stopped.');
    expect(elements['#cancel'].hidden).toBe(true);
    expect(elements['#image-frame'].hidden).toBe(true);
    expect(bridge.download).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(bridge.calls).toHaveBeenCalledTimes(1);
  });

  it('keeps only the ready Ngini picture with an accessible original-download action', () => {
    show();
    expect(elements.main.dataset.display).toBe('image');
    expect(elements.header.hidden).toBe(true);
    expect(elements['#status'].hidden).toBe(true);
    expect(elements['#details'].hidden).toBe(true);
    expect(elements['#refresh'].hidden).toBe(true);
    expect(elements['#cancel'].hidden).toBe(true);
    expect(elements['#preview'].hidden).toBe(false);
    expect(elements['#preview-label'].hidden).toBe(false);
    expect(elements['#fixture-label'].hidden).toBe(true);
    expect(elements['#download'].disabled).toBe(false);
    expect(elements['#image-frame'].hidden).toBe(false);
    expect(elements['#download-label'].hidden).toBe(true);
    expect(elements['#recovery'].hidden).toBe(true);
  });
  it('retains only the small TEST-not-Ngini badge alongside a ready fixture picture', () => {
    show('fixture');
    expect(elements.main.dataset.display).toBe('image');
    expect(elements.header.hidden).toBe(false);
    expect(elements['#fixture-label'].hidden).toBe(false);
    expect(elements['#status'].hidden).toBe(true);
    expect(elements['#details'].hidden).toBe(true);
    expect(elements['#details'].textContent).toBe('');
    expect(elements['#recovery'].hidden).toBe(true);
  });
  it('discloses unexpected multiple provider images in the existing card without changing its single download', async () => {
    bridge.app.ontoolresult({ structuredContent: { request_id: 'presentation.same-id', status: 'image_ready',
      message: '原圖已保存。', source: 'ngini', provider_image_count: 3, image: { ...image, source: 'ngini' } } });
    elements['#preview'].onload?.();
    expect(elements['#status'].hidden).toBe(false);
    expect(elements['#status'].textContent).toContain('服務回傳 3 張；此處交付 1 張關聯圖片');
    expect(elements['#preview'].hidden).toBe(false);
    await elements['#download'].fire('click');
    expect(bridge.download).toHaveBeenCalledTimes(1);
    expect(elements['#status'].hidden).toBe(false);
    expect(elements['#status'].textContent).toContain('服務回傳 3 張');
    expect(bridge.calls.mock.calls.some(([arg]) => arg.name === 'ngini_generate_image')).toBe(false);
  });
  it('keeps waiting status and same-request refresh/cancel visible', () => {
    bridge.app.ontoolresult({ structuredContent: { request_id: 'presentation.same-id',
      status: 'waiting_for_image', message: '任務狀態已讀取。', source: 'ngini' } });
    expect(elements['#status'].hidden).toBe(false);
    expect(elements['#status'].textContent).toContain('等待本次圖片');
    expect(elements['#details'].hidden).toBe(true);
    expect(elements['#refresh'].hidden).toBe(false);
    expect(elements['#cancel'].hidden).toBe(false);
    expect(elements['#image-frame'].hidden).toBe(true);
  });
  it('shows failed or missing-host-capability errors even with an image', () => {
    show('ngini', 'failed', 'DOWNLOAD_FAILED：原圖取得失敗。');
    expect(elements['#status'].hidden).toBe(false);
    expect(elements['#status'].textContent).toContain('DOWNLOAD_FAILED');
    expect(elements['#refresh'].hidden).toBe(false);
    bridge.capabilities = { serverTools: {} };
    show();
    expect(elements['#status'].hidden).toBe(false);
    expect(elements['#status'].textContent).toContain('DELIVERY_BLOCKED');
    expect(elements['#download'].disabled).toBe(true);
  });
  it('shows original download progress and cancellation without submitting generation', async () => {
    let reject!: (error: Error) => void;
    bridge.assemble.mockImplementation(() => new Promise((_, rejectPromise) => { reject = rejectPromise; }));
    show();
    const pending = elements['#download'].fire('click');
    expect(elements['#status'].hidden).toBe(false);
    expect(elements['#status'].textContent).toContain('正在取得原圖');
    expect(elements['#cancel'].hidden).toBe(false);
    elements['#cancel'].fire('click');
    reject(new Error('unit cancellation'));
    await pending;
    expect(elements['#status'].textContent).toContain('已停止取得原圖');
    expect(elements['#status'].hidden).toBe(false);
    expect(bridge.download).not.toHaveBeenCalled();
    expect(bridge.calls.mock.calls.some(([arg]) => arg.name === 'ngini_generate_image')).toBe(false);
  });
  it('retains actual blocked download errors and refresh after failure', async () => {
    bridge.assemble.mockRejectedValue(new Error('unit invalid chunk'));
    show(); await elements['#download'].fire('click');
    expect(elements['#status'].hidden).toBe(false);
    expect(elements['#status'].textContent).toContain('DELIVERY_BLOCKED');
    expect(elements['#refresh'].hidden).toBe(false);
  });
  it('keeps host cancellation terminal when an original read finishes later', async () => {
    let reject!: (error: Error) => void;
    bridge.assemble.mockImplementation(() => new Promise((_, rejectPromise) => { reject = rejectPromise; }));
    show();
    const pending = elements['#download'].fire('click');
    bridge.app.ontoolcancelled();
    reject(new Error('late original read failure'));
    await pending;
    expect(elements['#status'].textContent).toContain('已停止本機處理');
    expect(elements['#status'].hidden).toBe(false);
    expect(elements['#download'].disabled).toBe(true);
    expect(elements['#refresh'].hidden).toBe(true);
    expect(elements['#cancel'].hidden).toBe(true);
    expect(bridge.download).not.toHaveBeenCalled();
    const callCount = bridge.calls.mock.calls.length;
    await elements['#download'].fire('click');
    await elements['#refresh'].fire('click');
    expect(bridge.calls).toHaveBeenCalledTimes(callCount);
  });
  it('ignores a stale preview callback after host cancellation until a new tool result arrives', () => {
    bridge.capabilities.updateModelContext = { image: {}, structuredContent: {} };
    bridge.app.ontoolresult({ structuredContent: { request_id: 'presentation.same-id', status: 'presenting',
      message: '原圖已保存，正在準備聊天交付…', source: 'ngini', image: { ...image, source: 'ngini' } } });
    const stalePreviewLoad = elements['#preview'].onload;
    bridge.app.ontoolcancelled();
    stalePreviewLoad?.();
    expect(elements['#status'].textContent).toContain('已停止本機處理');
    expect(elements['#preview'].hidden).toBe(true);
    expect(elements['#download'].disabled).toBe(true);
    expect(bridge.calls.mock.calls.some(([arg]) => arg.arguments?.evidence === 'preview_visible')).toBe(false);
    expect(bridge.context).not.toHaveBeenCalled();
    show();
    expect(elements.main.dataset.display).toBe('image');
    expect(elements['#download'].disabled).toBe(false);
    expect(bridge.calls.mock.calls.some(([arg]) => arg.name === 'ngini_generate_image')).toBe(false);
  });
  it('does not resume a torn-down card from late preview or tool callbacks', () => {
    show();
    const stalePreviewLoad = elements['#preview'].onload;
    bridge.app.onteardown();
    const callCount = bridge.calls.mock.calls.length;
    stalePreviewLoad?.();
    show();
    elements['#download'].fire('click');
    elements['#refresh'].fire('click');
    expect(bridge.calls).toHaveBeenCalledTimes(callCount);
    expect(bridge.download).not.toHaveBeenCalled();
  });
  it('resumes automatic reads when the host explicitly reopens the same pending task after cancellation', async () => {
    const waiting = { request_id: 'presentation.same-id', status: 'waiting_for_image', message: '等待原任務。', source: 'ngini' };
    bridge.app.ontoolresult({ structuredContent: waiting });
    bridge.app.ontoolcancelled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(bridge.calls).not.toHaveBeenCalled();
    bridge.calls.mockResolvedValue({ structuredContent: { ...waiting, status: 'failed', message: '原任務沒有圖片。' }, isError: true });
    bridge.app.ontoolresult({ structuredContent: waiting });
    await vi.advanceTimersByTimeAsync(2500);
    expect(bridge.calls).toHaveBeenCalledExactlyOnceWith({ name: 'ngini_get_result', arguments: { request_id: waiting.request_id } }, { timeout: 15000 });
    expect(elements['#status'].textContent).toBe('原任務沒有圖片。');
  });
  it('exposes only boolean bridge/download capability diagnostics on the card element', () => {
    show();
    expect(elements.main.dataset.serverTools).toBe('true');
    expect(elements.main.dataset.downloadFile).toBe('true');
    bridge.capabilities = { serverTools: {}, privateHostIdentifier: 'not-for-reporting' };
    show();
    expect(elements.main.dataset.downloadFile).toBe('false');
    expect(JSON.stringify(elements.main.dataset)).not.toContain('not-for-reporting');
  });
  it('reports host acceptance without claiming delivered or verified saving', async () => {
    show(); await elements['#download'].fire('click');
    expect(elements['#status'].textContent).toContain('請依下載視窗保存');
    expect(bridge.calls.mock.calls.some(([arg]) => arg.arguments?.evidence === 'download_accepted')).toBe(true);
    expect(elements['#status'].textContent).not.toContain('delivered');
    expect(elements['#status'].hidden).toBe(true);
    expect(elements['#recovery'].hidden).toBe(true);
  });
  it('allows a several-minute manual confirmation beyond the default SDK deadline and sends only one host download', async () => {
    const observed = delayedHostConfirmation(3 * 60_000);
    show(); const pending = elements['#download'].fire('click');
    await vi.advanceTimersByTimeAsync(60_001);
    expect(bridge.download).toHaveBeenCalledTimes(1);
    expect(observed.hostResponses).toBe(0);
    expect(elements['#download'].disabled).toBe(true);
    expect(elements['#cancel'].hidden).toBe(false);
    expect(elements['#cancel'].textContent).toBe('停止本機等待');
    expect(elements['#status'].dataset.state).toBe('normal');
    expect(bridge.calls.mock.calls.some(([arg]) => arg.arguments?.evidence === 'delivery_blocked')).toBe(false);
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    await pending;
    expect(observed.hostResponses).toBe(1);
    expect(bridge.download).toHaveBeenCalledTimes(1);
    expect(bridge.calls.mock.calls.some(([arg]) => arg.arguments?.evidence === 'download_accepted')).toBe(true);
    expect(elements.main.dataset.display).toBe('image');
    expect(bridge.calls.mock.calls.some(([arg]) => arg.name === 'ngini_generate_image')).toBe(false);
  });
  it('keeps an expired host response unknown even if the host answers later, and recovers only on an explicit same-image download', async () => {
    const observed = delayedHostConfirmation(11 * 60_000);
    show(); const pending = elements['#download'].fire('click');
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1);
    await pending;
    expect(elements['#status'].dataset.state).toBe('normal');
    expect(elements['#status'].textContent).toContain('是否已保存尚未確認');
    expect(elements['#status'].textContent).not.toContain('DELIVERY_BLOCKED');
    expect(elements['#download'].disabled).toBe(false);
    expect(bridge.calls.mock.calls.some(([arg]) => ['delivery_blocked', 'download_accepted'].includes(arg.arguments?.evidence))).toBe(false);
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(observed.hostResponses).toBe(1);
    expect(bridge.download).toHaveBeenCalledTimes(1);
    expect(elements['#status'].textContent).toContain('是否已保存尚未確認');
    bridge.download.mockResolvedValue({});
    await elements['#download'].fire('click');
    expect(bridge.download).toHaveBeenCalledTimes(2);
    expect(bridge.download.mock.calls[0][0]).toEqual(bridge.download.mock.calls[1][0]);
    expect(bridge.calls.mock.calls.some(([arg]) => arg.arguments?.evidence === 'download_accepted')).toBe(true);
    expect(elements.main.dataset.display).toBe('image');
    expect(bridge.calls.mock.calls.some(([arg]) => arg.name === 'ngini_generate_image')).toBe(false);
  });
  it('stops local host-confirmation waiting without claiming the dialog closed, the file failed, or sending a generation cancel', async () => {
    const observed = delayedHostConfirmation();
    show(); const pending = elements['#download'].fire('click');
    await vi.advanceTimersByTimeAsync(0);
    await elements['#cancel'].fire('click');
    await pending;
    expect(observed.localAborts).toBe(1);
    expect(elements['#status'].dataset.state).toBe('normal');
    expect(elements['#status'].textContent).toContain('是否已保存尚未確認');
    expect(elements['#status'].textContent).not.toContain('DELIVERY_BLOCKED');
    expect(elements['#download'].disabled).toBe(false);
    expect(bridge.download).toHaveBeenCalledTimes(1);
    expect(bridge.calls.mock.calls.some(([arg]) => arg.name === 'ngini_cancel_generation' || arg.arguments?.evidence === 'delivery_blocked')).toBe(false);
    await vi.advanceTimersByTimeAsync(12 * 60_000);
    expect(bridge.download).toHaveBeenCalledTimes(1);
  });
  it('distinguishes an explicit host denial from a lost host response and from pre-host original failure', async () => {
    show(); bridge.download.mockResolvedValue({ isError: true });
    await elements['#download'].fire('click');
    expect(elements['#status'].dataset.state).toBe('blocked');
    expect(bridge.calls.mock.calls.some(([arg]) => arg.arguments?.evidence === 'delivery_blocked')).toBe(true);
    bridge.calls.mockClear();
    show(); bridge.calls.mockClear(); bridge.download.mockRejectedValue(new Error('Host bridge connection lost'));
    await elements['#download'].fire('click');
    expect(elements['#status'].dataset.state).toBe('normal');
    expect(elements['#status'].textContent).toContain('是否已保存尚未確認');
    expect(bridge.calls.mock.calls.some(([arg]) => ['delivery_blocked', 'download_accepted'].includes(arg.arguments?.evidence))).toBe(false);
    const hostCalls = bridge.download.mock.calls.length;
    show(); bridge.calls.mockClear(); bridge.assemble.mockRejectedValue(new Error('Original hash mismatch'));
    await elements['#download'].fire('click');
    expect(elements['#status'].dataset.state).toBe('blocked');
    expect(bridge.download).toHaveBeenCalledTimes(hostCalls);
    expect(bridge.calls.mock.calls.some(([arg]) => arg.arguments?.evidence === 'delivery_blocked')).toBe(true);
    expect(bridge.calls.mock.calls.some(([arg]) => arg.name === 'ngini_generate_image')).toBe(false);
  });
  it('keeps a terminal failed-image error visible after its preview loads', () => {
    show('ngini', 'failed', 'DELIVERY_BLOCKED：原圖交付受阻。');
    expect(elements['#status'].hidden).toBe(false);
    expect(elements['#status'].textContent).toContain('原圖交付受阻');
    expect(elements['#recovery'].hidden).toBe(false);
    expect(elements['#cancel'].hidden).toBe(true);
  });
  it('publishes a labeled bounded preview for future inspection only when the host declares the modalities', () => {
    bridge.capabilities.updateModelContext = { image: {}, structuredContent: {} };
    bridge.app.ontoolresult({ structuredContent: { request_id: 'presentation.same-id', status: 'image_ready',
      message: 'LOCAL TEST ONLY', source: 'fixture', provider_image_count: 2, image: { ...image, source: 'fixture' } } });
    elements['#preview'].onload?.();
    elements['#preview'].onload?.();
    expect(bridge.context).toHaveBeenCalledTimes(1);
    const update = bridge.context.mock.calls[0][0];
    expect(update.content).toEqual([{ type: 'image', mimeType: image.preview.mime, data: image.preview.data }]);
    expect(update.structuredContent).toMatchObject({ request_id: 'presentation.same-id', source: 'fixture',
      image_id: image.image_id, provider_image_count: 2, available_in: 'future_turn' });
    expect(update.structuredContent.evidence).toContain('not verified content match');
    expect(bridge.calls.mock.calls.some(([arg]) => arg.name === 'ngini_generate_image')).toBe(false);
  });
  it('does not send unlabeled images or unsupported/oversized model context', () => {
    show();
    expect(bridge.context).not.toHaveBeenCalled();
    bridge.capabilities.updateModelContext = { image: {} };
    show();
    expect(bridge.context).not.toHaveBeenCalled();
    bridge.capabilities.updateModelContext = { image: {}, text: {} };
    bridge.app.ontoolresult({ structuredContent: { request_id: 'presentation.same-id', status: 'image_ready',
      message: 'LOCAL TEST ONLY', source: 'fixture', image: { ...image, source: 'fixture',
        preview: { mime: 'image/png', data: Buffer.alloc(256 * 1024 + 1).toString('base64') } } } });
    elements['#preview'].onload?.();
    expect(bridge.context).not.toHaveBeenCalled();
    expect(elements.main.dataset.display).toBe('image');
  });
  it('keeps a visible picture when an optional future-context update is rejected', async () => {
    bridge.capabilities.updateModelContext = { image: {}, text: {} };
    bridge.context.mockRejectedValue(new Error('unsupported future context'));
    show();
    await Promise.resolve();
    expect(elements.main.dataset.display).toBe('image');
    expect(elements['#status'].hidden).toBe(true);
    expect(bridge.context).toHaveBeenCalledTimes(1);
    expect(bridge.calls.mock.calls.some(([arg]) => arg.name === 'ngini_generate_image')).toBe(false);
  });
});
