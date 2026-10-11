import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { deliveryCapabilitySummary, deliveryModeForCapabilities, requestResultFacts, waitForClientResult } from '../../src/ui/tool-delivery.js';
import type { RequestRecord } from '../../src/jobs/state-machine.js';

// Vitest's fake clock controls global timers, not Node's promise-timer internals.
vi.mock('node:timers/promises', () => ({ setTimeout: (ms: number, value: unknown, options: { signal?: AbortSignal } = {}) =>
  new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('aborted')); };
    const timer = setTimeout(() => { options.signal?.removeEventListener('abort', abort); resolve(value); }, ms);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
  }) }));

const waiting = { schema_version: 1, request_id: 'original.same-id', prompt_sha256: 'a'.repeat(64),
  status: 'waiting_for_image', owner_pid: 123, created_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z',
  quota: { availability: 'unknown', remaining: null, observed_at: null, source: 'not_observed' } } as RequestRecord;
afterEach(() => vi.useRealTimers());

describe('one-card tool delivery coordination', () => {
  it('selects App polling only for the SDK extension advertising the actual App MIME', () => {
    expect(deliveryModeForCapabilities({ extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } })).toBe('app_poll');
    for (const capabilities of [undefined, {}, { extensions: { [EXTENSION_ID]: { mimeTypes: ['text/html'] } } },
      { extensions: { [EXTENSION_ID]: { mimeTypes: RESOURCE_MIME_TYPE } } }, { _meta: { ui: { resourceUri: 'ui://fake' } } }]) {
      expect(deliveryModeForCapabilities(capabilities as any)).toBe('model_poll');
    }
  });
  it('reports only advertised UI flags and the selected mode, without retaining client identity or raw capabilities', () => {
    const capabilities = { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE], private_extension_data: 'do-not-retain' } },
      private_client_identity: 'do-not-retain' };
    expect(deliveryCapabilitySummary(capabilities)).toEqual({ ui_advertised: true, mime_supported: true, delivery_mode: 'app_poll' });
    expect(deliveryCapabilitySummary({ extensions: { [EXTENSION_ID]: {} } })).toEqual({
      ui_advertised: true, mime_supported: false, delivery_mode: 'model_poll' });
    expect(deliveryCapabilitySummary(undefined)).toEqual({ ui_advertised: false, mime_supported: false, delivery_mode: 'model_poll' });
    expect(JSON.stringify(deliveryCapabilitySummary(capabilities))).not.toContain('do-not-retain');
  });
  it('projects task facts without behavioral fields or private durable-record data', () => {
    const record = { ...waiting, next_action: 'End this turn.', unrelated_private_field: 'do-not-retain' };
    const capabilities = deliveryCapabilitySummary({ extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } });
    const result = requestResultFacts(record, capabilities);
    expect(result).toEqual({
      request_id: waiting.request_id, status: 'waiting_for_image', delivery_capabilities: capabilities,
      delivery_mode: 'app_poll', message: '正在處理原任務。', quota: waiting.quota, source: 'unknown',
    });
    const serialized = JSON.stringify(result);
    for (const key of ['next_action', 'owner_pid', 'prompt_sha256', 'unrelated_private_field']) {
      expect(result).not.toHaveProperty(key);
      expect(serialized).not.toContain(key);
    }
    expect(serialized).not.toContain('do-not-retain');
  });
  it('preserves original task state and fixture provenance regardless of advertised delivery mode', () => {
    const image = { image_id: 'existing-image', filename: 'test.png', mime: 'image/png' as const,
      width: 64, height: 64, bytes: 100, sha256: 'b'.repeat(64) };
    for (const capabilities of [deliveryCapabilitySummary(undefined),
      deliveryCapabilitySummary({ extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } })]) {
      for (const status of ['image_ready', 'presenting', 'delivered'] as const) {
        const record = { ...waiting, status, image, source: 'fixture' as const, provider_image_count: 1,
          message: 'TEST IMAGE — NOT NGINI / 本機測試圖片' };
        const result = requestResultFacts(record, capabilities);
        expect(result).toMatchObject({ request_id: waiting.request_id, status, source: 'fixture',
          message: record.message, provider_image_count: 1, quota: waiting.quota,
          delivery_mode: capabilities.delivery_mode });
        expect(result).not.toHaveProperty('next_action');
        expect(record.status).toBe(status);
        expect(record.image).toBe(image);
      }
    }
  });
  it('retains errors, actual provider counts and historical delivery qualification', () => {
    const error = { code: 'DOWNLOAD_FAILED' as const, message: '原圖取得失敗。' };
    const capabilities = deliveryCapabilitySummary(undefined);
    expect(requestResultFacts({ ...waiting, status: 'failed', error, provider_image_count: 2,
      message: '下載失敗；網站實際產生兩張圖片。' }, capabilities)).toMatchObject({
      status: 'failed', error, provider_image_count: 2, message: '下載失敗；網站實際產生兩張圖片。',
    });
    const result = requestResultFacts({ ...waiting, status: 'image_ready',
      image: { image_id: 'existing-image' } as RequestRecord['image'],
      message: '圖片卡片已回報預覽可見；原圖已保存，可下載同一張圖片。原檔下載尚未獨立驗證。' }, capabilities);
    expect(result.status).toBe('image_ready');
    expect(result.message).toBe('此任務曾由圖片卡片回報預覽可見；不代表目前對話的卡片已載入。原圖已保存，原檔下載尚未獨立驗證。');
    expect(result.quota.remaining).toBeNull();
  });
  it('returns a fast original result in the first bounded response instead of another model tool call', async () => {
    vi.useFakeTimers();
    const ready = { ...waiting, status: 'image_ready', image: { image_id: 'existing-image' } } as RequestRecord;
    const read = vi.fn().mockResolvedValueOnce(waiting).mockResolvedValueOnce(ready);
    const pending = waitForClientResult(waiting, read, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toBe(ready);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('ends a slow-job wait at eight seconds with the same pending ID and no job-start seam', async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => waiting);
    const pending = waitForClientResult(waiting, read, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toBe(waiting);
    const readsAtDeadline = read.mock.calls.length;
    expect(readsAtDeadline).toBeGreaterThan(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(read).toHaveBeenCalledTimes(readsAtDeadline);
  });
  it('returns a terminal error without waiting again', async () => {
    vi.useFakeTimers();
    const failed = { ...waiting, status: 'failed', error: { code: 'QUOTA_EXHAUSTED', message: 'No quota.' } } as RequestRecord;
    const read = vi.fn(async () => failed);
    const pending = waitForClientResult(waiting, read, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(250);
    expect(await pending).toBe(failed);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('does not read after cancellation before or during the bounded wait', async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => waiting);
    const controller = new AbortController();
    const pending = waitForClientResult(waiting, read, controller.signal);
    controller.abort();
    expect(await pending).toBe(waiting);
    expect(await waitForClientResult(waiting, read, controller.signal)).toBe(waiting);
    expect(read).not.toHaveBeenCalled();
  });
  it('rejects a changed request identity rather than showing another task', async () => {
    vi.useFakeTimers();
    const pending = waitForClientResult(waiting, vi.fn(async () => ({ ...waiting, request_id: 'other' })), new AbortController().signal);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    await vi.advanceTimersByTimeAsync(250);
    await assertion;
  });
});
