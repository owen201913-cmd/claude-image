import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { CARD_RESULT_META_KEY, parseCardToolResult } from '../../src/ui/card-contract.js';

const state = vi.hoisted(() => ({ capabilities: {} as any, record: {} as any,
  tools: new Map<string, { options: any; call: any }>(), generate: vi.fn(), get: vi.fn(), cancel: vi.fn() }));
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({ McpServer: class {
  server = { getClientCapabilities: () => state.capabilities };
  registerTool(name: string, options: unknown, call: unknown) { state.tools.set(name, { options, call }); }
  registerResource() {}
  async connect() {}
  async close() {}
} }));
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({ StdioServerTransport: class {} }));
vi.mock('../../src/shared/config.js', () => ({ VERSION: 'unit-test', getConfig: () => ({ fixtureMode: false }) }));
vi.mock('../../src/jobs/request-store.js', () => ({ RequestStore: {
  open: async () => ({ get: async () => state.record, transition: vi.fn() }),
} }));
vi.mock('../../src/images/image-store.js', () => ({ ImageStore: class {
  async readPreview() { return Buffer.from('controlled preview'); }
} }));
vi.mock('../../src/jobs/runner.js', () => ({ JobRunner: class {
  generate(...args: unknown[]) { return state.generate(...args); }
  get(...args: unknown[]) { return state.get(...args); }
  cancel(...args: unknown[]) { return state.cancel(...args); }
  async shutdown() {}
} }));

const image = { image_id: 'server-image', filename: 'ngini-server-test.png', mime: 'image/png',
  width: 48, height: 32, bytes: 10, sha256: 'a'.repeat(64) };
const quota = { availability: 'unknown', remaining: null, observed_at: null, source: 'not_observed' };
const replyContract = 'For an image-only request, the attached image card is the response. Finish that turn without an additional assistant message.';
const appCapabilities = { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } };
const ownedListeners: Array<[NodeJS.EventEmitter, string, (...args: any[]) => void]> = [];

beforeAll(async () => {
  const targets = [[process, 'SIGINT'], [process, 'SIGTERM'], [process.stdin, 'end']] as const;
  const prior = targets.map(([emitter, event]) => new Set(emitter.listeners(event)));
  await import('../../src/server.js');
  targets.forEach(([emitter, event], index) => {
    for (const listener of emitter.listeners(event)) {
      if (!prior[index].has(listener)) ownedListeners.push([emitter, event, listener as (...args: any[]) => void]);
    }
  });
});
afterAll(() => { for (const [emitter, event, listener] of ownedListeners) emitter.removeListener(event, listener); });
beforeEach(() => {
  state.capabilities = appCapabilities;
  state.record = { schema_version: 1, request_id: 'server.same-id', status: 'image_ready',
    source: 'fixture', quota, image, provider_image_count: 1, message: 'Original saved; host visibility unconfirmed.' };
  state.generate.mockReset().mockImplementation(async () => state.record);
  state.get.mockReset().mockImplementation(async () => state.record);
  state.cancel.mockReset().mockImplementation(async () => ({ ...state.record, status: 'cancelled', message: 'Local waiting stopped.' }));
});

function invoke(name: string, args: Record<string, unknown> = { request_id: 'server.same-id' }) {
  return state.tools.get(name)!.call(args, { signal: new AbortController().signal });
}

describe('server routing of model facts and App card payloads', () => {
  it('gives an App-capable reopen only coordination facts while preserving the full original for the App', async () => {
    const result = await invoke('ngini_get_result');
    expect(result.structuredContent).toEqual({ request_id: state.record.request_id, status: 'image_ready', delivery_mode: 'app_poll' });
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }, { type: 'text', text: replyContract }]);
    expect(parseCardToolResult(result)).toMatchObject({ source: 'fixture', image, message: state.record.message });
    expect(result._meta[CARD_RESULT_META_KEY].quota).toEqual(quota);
    expect(state.generate).not.toHaveBeenCalled();
  });

  it('applies the same split after exactly one explicit generate operation', async () => {
    const result = await state.tools.get('ngini_generate_image')!.call({ request_id: state.record.request_id,
      prompt: '貓蜷縮在太空船窗邊睡覺' }, { signal: new AbortController().signal });
    expect(state.generate).toHaveBeenCalledExactlyOnceWith(state.record.request_id,
      '貓蜷縮在太空船窗邊睡覺', expect.any(AbortSignal));
    expect(result.structuredContent).not.toHaveProperty('image');
    expect(result.content.every((item: any) => item.type === 'text')).toBe(true);
    expect(result.content[1]).toEqual({ type: 'text', text: replyContract });
    expect(parseCardToolResult(result).image?.sha256).toBe(image.sha256);
  });

  it('retains full image inspection and factual source/quota through the ordinary status tool', async () => {
    const result = await invoke('ngini_get_status');
    expect(result.structuredContent).toMatchObject({ source: 'fixture', quota, image });
    expect(result.content.some((item: any) => item.type === 'image')).toBe(true);
    expect(result.content.some((item: any) => item.text === replyContract)).toBe(false);
    expect(result._meta?.[CARD_RESULT_META_KEY]).toBeUndefined();
    expect(state.tools.get('ngini_get_status')!.options._meta).toBeUndefined();
    expect(state.generate).not.toHaveBeenCalled();
  });

  it('retains the full legacy result for hosts without usable App support', async () => {
    for (const capabilities of [{}, { extensions: { [EXTENSION_ID]: { mimeTypes: ['text/html'] } } }]) {
      state.capabilities = capabilities;
      const result = await invoke('ngini_get_result');
      expect(result.structuredContent).toMatchObject({ delivery_mode: 'model_poll', source: 'fixture', quota, image });
      expect(result.content.some((item: any) => item.type === 'image')).toBe(true);
      expect(result.content.some((item: any) => item.text === replyContract)).toBe(false);
      expect(result._meta?.[CARD_RESULT_META_KEY]).toBeUndefined();
      expect(parseCardToolResult(result).image?.sha256).toBe(image.sha256);
    }
  });

  it('retains a submitted human-verification handoff and quota error in model output', async () => {
    state.record = { ...state.record, status: 'failed', image: undefined,
      error: { code: 'HUMAN_VERIFICATION_REQUIRED', message: 'Manual verification needed.',
        details: { manual_handoff: 'enable_visible_browser_and_restart', submitted: true } },
      quota: { ...quota, availability: 'exhausted', remaining: 0, source: 'page' } };
    const result = await invoke('ngini_get_result');
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }]);
    expect(result.structuredContent).toMatchObject({ error: state.record.error, source: 'fixture', quota: state.record.quota });
    expect(parseCardToolResult(result).status).toBe('failed');
    expect(state.generate).not.toHaveBeenCalled();
  });

  it('retains actual guarded query errors without the App reply contract or metadata', async () => {
    state.get.mockRejectedValueOnce(new Error('Controlled query failure'));
    const result = await invoke('ngini_get_result');
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ request_id: state.record.request_id, status: 'failed', query_error: true });
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }]);
    expect(result._meta?.[CARD_RESULT_META_KEY]).toBeUndefined();
    expect(state.generate).not.toHaveBeenCalled();
  });

  it('does not quiet unknown submissions, provider anomalies or missing results', async () => {
    const initial = state.record;
    for (const changed of [
      { status: 'SUBMISSION_UNKNOWN' }, { provider_image_count: 3 }, { image: undefined },
      { error: { code: 'DELIVERY_BLOCKED', message: 'Original delivery needs recovery.' } },
      { quota: { ...quota, availability: 'exhausted', remaining: 0 } },
    ]) {
      state.record = { ...initial, ...changed };
      const result = await invoke('ngini_get_result');
      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }]);
      expect(result._meta[CARD_RESULT_META_KEY].request_id).toBe(initial.request_id);
      expect(result.structuredContent.request_id).toBe(initial.request_id);
      expect(parseCardToolResult(result).request_id).toBe(initial.request_id);
    }
    expect(state.generate).not.toHaveBeenCalled();
  });

  it('keeps ordinary cancellation results complete and never calls generation', async () => {
    const result = await invoke('ngini_cancel_generation');
    expect(result.structuredContent).toMatchObject({ status: 'cancelled', message: 'Local waiting stopped.', image });
    expect(result.content.some((item: any) => item.text === replyContract)).toBe(false);
    expect(result._meta?.[CARD_RESULT_META_KEY]).toBeUndefined();
    expect(state.cancel).toHaveBeenCalledExactlyOnceWith(state.record.request_id);
    expect(state.generate).not.toHaveBeenCalled();
  });

  it('keeps an App-only delivery observation fallback complete rather than quieting a known handler', async () => {
    state.record = { ...state.record, status: 'delivered' };
    const result = await invoke('ngini_report_delivery', { request_id: state.record.request_id, evidence: 'preview_visible' });
    expect(result.structuredContent).toMatchObject({ request_id: state.record.request_id, status: 'delivered', image });
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content.some((item: any) => item.text === replyContract)).toBe(false);
    expect(result._meta?.[CARD_RESULT_META_KEY]).toBeUndefined();
    expect(state.generate).not.toHaveBeenCalled();
  });
});
