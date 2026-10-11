import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardPoller, cardStatusMessage, cardQueryErrorMessage } from '../../src/ui/card-polling.js';
import { CARD_RESULT_META_KEY, imageCardToolResult, type CardResult } from '../../src/ui/card-contract.js';

const waiting: CardResult = { request_id: 'poll.same-id', status: 'waiting_for_image', message: '任務狀態已讀取。' };
const failed: CardResult = { ...waiting, status: 'failed', message: '服務沒有回傳圖片；沒有再次生成。' };
afterEach(() => { vi.useRealTimers(); });

function setup(read = vi.fn(async () => ({ structuredContent: failed, isError: true }))) {
  vi.useFakeTimers();
  const messages: string[] = [];
  const results: CardResult[] = [];
  const poller = new CardPoller({ read, result: value => { results.push(value); poller.update(value, true, true); },
    message: value => messages.push(value) });
  return { poller, read, messages, results };
}

describe('image card read-only status polling', () => {
  it('reads a pending-to-ready metadata result once, preserving the same image and ending polling', async () => {
    const image = { image_id: 'poll-image', filename: 'ngini-poll.png', mime: 'image/png',
      width: 48, height: 32, bytes: 10, sha256: 'a'.repeat(64) };
    const ready = { ...waiting, status: 'image_ready', delivery_mode: 'app_poll', source: 'fixture', image };
    const read = vi.fn(async () => imageCardToolResult(ready));
    expect(imageCardToolResult(ready).structuredContent).toEqual({ request_id: waiting.request_id,
      status: 'image_ready', delivery_mode: 'app_poll' });
    const { poller, results } = setup(read as any);
    poller.update(waiting, true, true);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(read).toHaveBeenCalledExactlyOnceWith(waiting.request_id);
    expect(results).toEqual([{ request_id: waiting.request_id, status: 'image_ready',
      message: waiting.message, source: 'fixture', image }]);
    expect(poller.querying).toBe(false);
  });

  it('rejects a valid metadata image for a different request instead of replacing the requested task', async () => {
    const image = { image_id: 'other-image', filename: 'ngini-other.png', mime: 'image/png',
      width: 48, height: 32, bytes: 10, sha256: 'b'.repeat(64) };
    const response = imageCardToolResult({ ...waiting, request_id: 'other-request', status: 'image_ready',
      delivery_mode: 'app_poll', image });
    const { poller, messages, results } = setup(vi.fn(async () => response) as any);
    poller.update(waiting, true, true);
    await vi.advanceTimersByTimeAsync(2500);
    expect(results).toEqual([]);
    expect(messages.at(-1)).toContain('任務識別碼不一致');
    poller.stop();
  });

  it('limits malformed-metadata retries without downgrading to a valid legacy terminal result', async () => {
    const response = { structuredContent: failed, _meta: { [CARD_RESULT_META_KEY]: null } };
    const { poller, read, messages, results } = setup(vi.fn(async () => response) as any);
    poller.update(waiting, true, true);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(results).toEqual([]);
    expect(messages.at(-1)).toContain('已暫停自動查詢');
    expect(read.mock.calls.every(args => args[0] === waiting.request_id)).toBe(true);
  });

  it('maps generic status text to a concrete waiting phase and preserves backend failures', () => {
    expect(cardStatusMessage(waiting)).toBe('正在等待本次圖片結果…');
    expect(cardStatusMessage(failed)).toBe(failed.message);
  });
  it('polls the same ID and displays a persisted failed result despite isError:true', async () => {
    const { poller, read, messages, results } = setup();
    poller.update(waiting, true, true);
    await vi.advanceTimersByTimeAsync(2500);
    expect(read).toHaveBeenCalledExactlyOnceWith(waiting.request_id);
    expect(messages).toContain('正在查詢原任務狀態…');
    expect(results).toEqual([failed]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('states missing host capability rather than retaining a stale generic status', () => {
    const { poller, read, messages } = setup();
    poller.update(waiting, true, false);
    expect(read).not.toHaveBeenCalled();
    expect(messages.at(-1)).toContain('未宣告本機工具橋接能力');
  });
  it('rearms after a long in-flight read when a render happens during that read', async () => {
    let complete!: (value: unknown) => void;
    const read = vi.fn(() => new Promise<unknown>(resolve => { complete = resolve; }));
    const { poller } = setup(read as any);
    poller.update(waiting, true, true);
    await vi.advanceTimersByTimeAsync(2500);
    poller.update(waiting, true, true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).toHaveBeenCalledTimes(1);
    complete({ structuredContent: waiting });
    await vi.advanceTimersByTimeAsync(2500);
    expect(read).toHaveBeenCalledTimes(2);
    poller.stop();
  });
  it('distinguishes a guarded query error from a persisted job failure and limits retries', async () => {
    const response = { isError: true, structuredContent: { status: 'failed', message: '本機任務紀錄無法讀取。' } };
    expect(cardQueryErrorMessage(response)).toBe('本機任務紀錄無法讀取。');
    const { poller, read, messages, results } = setup(vi.fn(async () => response) as any);
    poller.update(waiting, true, true);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(results).toEqual([]);
    expect(messages.at(-1)).toContain('本機任務紀錄無法讀取。');
    expect(messages.at(-1)).toContain('已暫停自動查詢');
  });
  it('retries a marked guarded error with the current ID without treating the original job as failed', async () => {
    const guarded = { isError: true, structuredContent: { request_id: waiting.request_id, query_error: true,
      status: 'failed', message: '原任務暫時無法讀取。' } };
    expect(cardQueryErrorMessage(guarded)).toBe('原任務暫時無法讀取。');
    expect(cardQueryErrorMessage({ ...guarded, structuredContent: { ...guarded.structuredContent, query_error: false } })).toBeUndefined();
    const read = vi.fn().mockResolvedValueOnce(guarded).mockResolvedValueOnce({ isError: true, structuredContent: failed });
    const { poller, messages, results } = setup(read as any);
    poller.update(waiting, true, true);
    await vi.advanceTimersByTimeAsync(2500);
    expect(results).toEqual([]);
    expect(messages.at(-1)).toContain('將有限重試查詢同一任務');
    await vi.advanceTimersByTimeAsync(2500);
    expect(results).toEqual([failed]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls.every(args => args[0] === waiting.request_id)).toBe(true);
  });
  it('makes the four-minute query budget visible and permits a manual same-ID refresh', async () => {
    const { poller, read, messages } = setup(vi.fn(async () => ({ structuredContent: waiting })) as any);
    poller.update(waiting, true, true);
    await vi.advanceTimersByTimeAsync(240_000);
    expect(messages.at(-1)).toContain('自動查詢已暫停');
    const count = read.mock.calls.length;
    await poller.refresh();
    expect(read).toHaveBeenCalledTimes(count + 1);
    expect(read.mock.calls.every(args => args[0] === waiting.request_id)).toBe(true);
    poller.stop();
  });
  it('drops a different request response without replacing the current status', async () => {
    const { poller, messages, results } = setup(vi.fn(async () => ({ structuredContent: { ...failed, request_id: 'other' } })) as any);
    poller.update(waiting, true, true);
    await vi.advanceTimersByTimeAsync(2500);
    expect(results).toEqual([]);
    expect(messages.at(-1)).toContain('任務識別碼不一致');
    poller.stop();
  });
  it('notifies controls only after a terminal read is no longer busy', async () => {
    vi.useFakeTimers();
    const busy: boolean[] = [];
    const poller = new CardPoller({ read: async () => ({ structuredContent: failed }),
      result: value => poller.update(value, true, true), message: () => {},
      settled: () => busy.push(poller.querying) });
    poller.update(waiting, true, true);
    await vi.advanceTimersByTimeAsync(2500);
    expect(busy).toEqual([false]);
    expect(poller.querying).toBe(false);
  });
  it('does not overwrite cancellation or a newer host result with a pending read', async () => {
    let complete!: (value: unknown) => void;
    const read = vi.fn(() => new Promise<unknown>(resolve => { complete = resolve; }));
    const { poller, results } = setup(read as any);
    poller.update(waiting, true, true);
    await vi.advanceTimersByTimeAsync(2500);
    poller.stop();
    poller.update({ ...waiting, status: 'cancelled', message: '已停止本機處理。' }, true, true);
    complete({ structuredContent: waiting });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(results).toEqual([]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(poller.querying).toBe(false);
  });
  it('resumes polling the same ID only after explicit reopening, not a late cancelled read', async () => {
    const { poller, read, results } = setup();
    poller.update(waiting, true, true);
    poller.stop();
    poller.update(waiting, true, true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).not.toHaveBeenCalled();
    poller.resume();
    await vi.advanceTimersByTimeAsync(2500);
    expect(read).toHaveBeenCalledExactlyOnceWith(waiting.request_id);
    expect(results).toEqual([failed]);
  });
  it('shows a bounded generic query error without exposing raw bridge diagnostics', async () => {
    const { poller, messages } = setup(vi.fn(async () => { throw new Error('internal://private-token'); }) as any);
    poller.update(waiting, true, true);
    await vi.advanceTimersByTimeAsync(2500);
    expect(messages.at(-1)).toContain('無法取得原任務狀態');
    expect(messages.join(' ')).not.toContain('private-token');
    poller.stop();
  });
});
