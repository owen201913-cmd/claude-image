import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { JobRunner, type GenerationAdapter } from '../../src/jobs/runner.js';
import { RequestStore } from '../../src/jobs/request-store.js';
import { ImageStore } from '../../src/images/image-store.js';
import { getConfig } from '../../src/shared/config.js';
import { BridgeError, type ErrorCode } from '../../src/shared/errors.js';
import { textHash, type BrowserCheckpoint, type BrowserResult } from '../../src/browser/result-tracker.js';
import { UNKNOWN_QUOTA, type RequestRecord } from '../../src/jobs/state-machine.js';
import { createDownloadTemporary, DOWNLOAD_CACHE_POLICY } from '../../src/jobs/download-cache.js';
import { ProfileLock } from '../../src/jobs/profile-lock.js';

const prompt = '請生成一張中文需求的測試圖片，兩隻黑貓，禁止額外角色。';
let png: Buffer;
beforeAll(async () => { png = await sharp({ create: { width: 48, height: 32, channels: 3, background: '#4e8cab' } }).png().toBuffer(); });

interface Counts {
  submits: number; opens: number; recoveries: number; downloads: number; closes: number;
  waitError?: ErrorCode; recoverError?: ErrorCode;
  downloadError?: ErrorCode;
  holdOpen?: boolean;
  holdWait?: boolean;
  holdJournal?: boolean;
  beforeSubmitError?: ErrorCode;
  rechecks?: number;
  journalChecked?: boolean;
  canonicalUrl?: string;
}

const directories: string[] = [];
const runners: JobRunner[] = [];
afterEach(async () => {
  await Promise.allSettled(runners.splice(0).map(runner => runner.shutdown()));
  const tempRoot = await realpath(tmpdir());
  await Promise.all(directories.splice(0).map(async directory => {
    const resolved = await realpath(directory);
    const relative = path.relative(tempRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep)
      || !relative.startsWith('ngini-runner-offline-')) throw new Error('Unsafe test cleanup target');
    await rm(resolved, { recursive: true, force: true });
  }));
});

async function setup(fixtureMode = false, shared: Counts = { submits: 0, opens: 0, recoveries: 0, downloads: 0, closes: 0 },
  overrides: Partial<ReturnType<typeof getConfig>> = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ngini-runner-offline-'));
  directories.push(directory);
  const config = { ...getConfig(), dataDir: directory, requestDir: path.join(directory, 'requests'),
    profileDir: path.join(directory, 'browser-profile'), outputDir: path.join(directory, 'images'), fixtureMode,
    generationTimeoutMs: 100, operationTimeoutMs: 100, downloadTimeoutMs: 100,
    browserHeadless: false, ...overrides };
  const requests = await RequestStore.open(config.requestDir);
  const images = new ImageStore(config.outputDir);
  const makeAdapter = (): GenerationAdapter => ({
    async open(requestId, signal) {
      shared.opens++;
      if (shared.holdOpen) await new Promise<void>(resolve => {
        if (signal?.aborted) resolve(); else signal?.addEventListener('abort', () => resolve(), { once: true });
      });
      return { request_id: requestId, page_url: 'https://ngini.com/c/offline-fixture-turn',
        baseline_message_keys: ['previous-user', 'previous-reply'], baseline_result_keys: ['previous-image'] };
    },
    async submit(value, checkpoint, journal, signal) {
      if (shared.beforeSubmitError) throw new BridgeError(shared.beforeSubmitError, 'controlled offline pre-submission failure');
      const submitted: BrowserCheckpoint = { ...checkpoint, prompt_sha256: textHash(value), submission_started_at: new Date().toISOString() };
      await journal(submitted);
      const persisted = await requests.get(checkpoint.request_id);
      expect(persisted?.status).toBe('submitting');
      expect(persisted?.browser_checkpoint).toEqual(submitted);
      shared.journalChecked = true;
      if (shared.holdJournal) await new Promise<void>((_resolve, reject) => {
        const abort = () => reject(new BridgeError('CANCELLED', 'controlled offline journal abort'));
        if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
      });
      if (signal?.aborted) throw new BridgeError('CANCELLED', 'aborted before click');
      shared.submits++;
      return submitted;
    },
    async wait(checkpoint, signal, _timeout, onCheckpoint) {
      if (shared.canonicalUrl) await onCheckpoint?.({ ...checkpoint, page_url: shared.canonicalUrl });
      if (shared.holdWait) await new Promise<void>((_resolve, reject) => {
        const abort = () => reject(new BridgeError('CANCELLED', 'controlled offline waiting abort'));
        if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
      });
      if (shared.waitError) throw new BridgeError(shared.waitError, 'controlled offline wait failure');
      return result(checkpoint);
    },
    async recover(checkpoint) {
      shared.recoveries++;
      if (shared.recoverError) throw new BridgeError(shared.recoverError, 'controlled offline recovery failure');
      return result(checkpoint);
    },
    async recheckBeforeSubmit(requestId) {
      shared.rechecks = (shared.rechecks ?? 0) + 1;
      if (shared.beforeSubmitError) throw new BridgeError(shared.beforeSubmitError, 'controlled offline verification still required');
      return { request_id: requestId, page_url: 'https://ngini.com/c/offline-fixture-turn',
        baseline_message_keys: ['previous-user', 'previous-reply'], baseline_result_keys: ['previous-image'] };
    },
    async download(_result, destination) {
      shared.downloads++;
      if (shared.downloadError) throw new BridgeError(shared.downloadError, 'controlled offline download failure');
      await writeFile(destination, png);
      return { path: destination, actual_image_count: 1 };
    },
    async close() { shared.closes++; },
  });
  const runner = new JobRunner(requests, images, config, makeAdapter); runners.push(runner);
  return { directory, requests, images, config, shared, runner, makeAdapter };
}

function result(checkpoint: BrowserCheckpoint): BrowserResult {
  return { request_id: checkpoint.request_id, message_key: 'offline-new-reply', result_key: 'offline-new-image', actual_image_count: 1,
    quota: { ...UNKNOWN_QUOTA } };
}

async function until(predicate: () => Promise<boolean> | boolean): Promise<void> {
  const deadline = Date.now() + 2500;
  while (!await predicate()) { if (Date.now() >= deadline) throw new Error('offline task did not settle'); await delay(5); }
}

async function state(requests: RequestStore, id: string, expected: RequestRecord['status']): Promise<RequestRecord> {
  await until(async () => {
    const record = await requests.get(id);
    if (expected === 'image_ready' && record?.status === 'failed'
      && (record.recovery_error || !['SUBMISSION_UNKNOWN', 'GENERATION_TIMEOUT'].includes(record.error?.code ?? ''))) {
      throw new Error(`offline image failure: ${JSON.stringify(record.error)}`);
    }
    return record?.status === expected;
  });
  return (await requests.get(id))!;
}

describe('runner integration using a controlled adapter; zero Ngini/network requests', () => {
  it('cold runner removes only eligible crash downloads before request creation, preserving unproven legacy data', async () => {
    const { runner, requests, config, shared } = await setup(true);
    const temporary = await createDownloadTemporary(path.join(config.dataDir, 'tmp'));
    await writeFile(temporary.filename, 'crash download');
    const ownerPath = path.join(path.dirname(temporary.filename), '.ngini-download-owner.json');
    const owner = JSON.parse(await readFile(ownerPath, 'utf8')) as Record<string, unknown>;
    await writeFile(ownerPath, JSON.stringify({ ...owner, pid: 2147483647,
      created_at: new Date(Date.now() - DOWNLOAD_CACHE_POLICY.max_age_ms - 1000).toISOString() }));
    const legacy = path.join(config.dataDir, 'tmp', 'legacy.download');
    await writeFile(legacy, 'keep legacy');
    await runner.generate('cache-cold-fixture', prompt);
    await state(requests, 'cache-cold-fixture', 'image_ready');
    await expect(readFile(temporary.filename)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(legacy, 'utf8')).toBe('keep legacy');
    expect(shared.submits).toBe(0); expect(shared.opens).toBe(0);
  });

  it('cold runner preserves crash download data when another browser-session lock is held', async () => {
    const { runner, config } = await setup();
    const temporary = await createDownloadTemporary(path.join(config.dataDir, 'tmp'));
    await writeFile(temporary.filename, 'preserve while locked');
    const ownerPath = path.join(path.dirname(temporary.filename), '.ngini-download-owner.json');
    const owner = JSON.parse(await readFile(ownerPath, 'utf8')) as Record<string, unknown>;
    await writeFile(ownerPath, JSON.stringify({ ...owner, pid: 2147483647,
      created_at: new Date(Date.now() - DOWNLOAD_CACHE_POLICY.max_age_ms - 1000).toISOString() }));
    const lock = await ProfileLock.acquire(config.dataDir, { name: '.browser-session.lock' });
    try {
      await expect(runner.get('missing-cache-read')).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(await readFile(temporary.filename, 'utf8')).toBe('preserve while locked');
    } finally { await lock.release(); }
  });

  it('shutdown waits for delayed idle maintenance and does not create a new request afterward', async () => {
    const { runner, requests, shared } = await setup();
    let entered!: () => void; let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const maintenance = requests.whenIdleMaintenance.bind(requests);
    vi.spyOn(requests, 'whenIdleMaintenance').mockImplementation(async operation => {
      entered(); await gate; return maintenance(operation);
    });
    const generation = runner.generate('shutdown-maintenance', prompt);
    const interrupted = expect(generation).rejects.toMatchObject({ code: 'PROCESS_INTERRUPTED' });
    await started;
    let settled = false;
    const shutdown = runner.shutdown().then(() => { settled = true; });
    await delay(10);
    expect(settled).toBe(false);
    release();
    await shutdown; await interrupted;
    expect(await requests.get('shutdown-maintenance')).toBeUndefined();
    expect(shared.opens).toBe(0); expect(shared.submits).toBe(0);
  });

  it.each(['output-file', 'metadata-file', 'metadata-junction', 'tmp-file', 'tmp-junction'] as const)(
    'rejects unavailable storage (%s) before opening or submitting and preserves existing files', async obstacle => {
      const { runner, requests, config, directory, shared } = await setup();
      const metadata = path.join(config.outputDir, '.ngini-metadata');
      const temporary = path.join(config.dataDir, 'tmp');
      let sentinel: string;
      if (obstacle.endsWith('junction')) {
        const target = path.join(directory, 'unowned-target');
        await mkdir(target);
        sentinel = path.join(target, 'sentinel.txt');
        if (obstacle === 'metadata-junction') await mkdir(config.outputDir);
        await symlink(target, obstacle === 'metadata-junction' ? metadata : temporary, 'junction');
      } else {
        if (obstacle === 'metadata-file') await mkdir(config.outputDir);
        sentinel = obstacle === 'output-file' ? config.outputDir : obstacle === 'metadata-file' ? metadata : temporary;
      }
      await writeFile(sentinel, 'user-owned sentinel');
      const id = `unavailable-${obstacle}`;
      await runner.generate(id, prompt);
      const failed = await state(requests, id, 'failed');
      expect(failed.error?.code).toBe('STORAGE_ERROR');
      expect(failed.submission_started_at).toBeUndefined();
      expect(failed.browser_checkpoint).toBeUndefined();
      expect(failed.image).toBeUndefined();
      expect(shared.opens).toBe(0); expect(shared.submits).toBe(0); expect(shared.downloads).toBe(0);
      expect((await runner.generate(id, prompt)).error?.code).toBe('STORAGE_ERROR');
      expect((await runner.get(id)).error?.code).toBe('STORAGE_ERROR');
      expect(shared.recoveries).toBe(0); expect(shared.submits).toBe(0);
      expect(await readFile(sentinel, 'utf8')).toBe('user-owned sentinel');
    });

  it('rechecks storage after page preparation and still stops before the submission journal or Send', async () => {
    const { requests, images, config, shared, makeAdapter } = await setup();
    const held = `${config.outputDir}-held`;
    const runner = new JobRunner(requests, images, config, () => {
      const adapter = makeAdapter();
      const open = adapter.open.bind(adapter);
      adapter.open = async (...args) => {
        const checkpoint = await open(...args);
        await rename(config.outputDir, held);
        await writeFile(config.outputDir, 'became a user-owned file during page preparation');
        return checkpoint;
      };
      return adapter;
    });
    runners.push(runner);
    await runner.generate('storage-changed-before-send', prompt);
    const failed = await state(requests, 'storage-changed-before-send', 'failed');
    expect(failed.error?.code).toBe('STORAGE_ERROR');
    expect(failed.submission_started_at).toBeUndefined();
    expect(failed.browser_checkpoint?.submission_started_at).toBeUndefined();
    expect(shared.opens).toBe(1); expect(shared.submits).toBe(0); expect(shared.journalChecked).toBeUndefined();
    expect(await readFile(config.outputDir, 'utf8')).toBe('became a user-owned file during page preparation');
  });

  it.each(['tmp-after-submit', 'metadata-after-download'] as const)(
    'classifies storage changes after submission (%s) and recovers the same image without submitting again', async obstacle => {
      const { requests, images, config, shared, makeAdapter } = await setup();
      const unavailable = obstacle === 'tmp-after-submit' ? path.join(config.dataDir, 'tmp')
        : path.join(config.outputDir, '.ngini-metadata');
      const held = `${unavailable}-held`;
      const blockStorage = async () => {
        await rename(unavailable, held);
        await writeFile(unavailable, 'user-owned changed-path sentinel');
      };
      const runner = new JobRunner(requests, images, config, () => {
        const adapter = makeAdapter();
        if (obstacle === 'tmp-after-submit') {
          const wait = adapter.wait.bind(adapter);
          adapter.wait = async (...args) => { const result = await wait(...args); await blockStorage(); return result; };
        } else {
          const download = adapter.download.bind(adapter);
          adapter.download = async (...args) => { const result = await download(...args); await blockStorage(); return result; };
        }
        return adapter;
      });
      runners.push(runner);
      const id = `changed-${obstacle}`;
      await runner.generate(id, prompt);
      const failed = await state(requests, id, 'failed');
      expect(failed.error?.code).toBe('STORAGE_ERROR');
      expect(failed.submission_started_at).toBeDefined(); expect(failed.submitted_at).toBeDefined();
      expect(failed.image).toBeUndefined(); expect(shared.submits).toBe(1);
      expect(shared.downloads).toBe(obstacle === 'tmp-after-submit' ? 0 : 1);
      expect((await runner.generate(id, prompt)).error?.code).toBe('STORAGE_ERROR');
      expect(shared.submits).toBe(1);
      expect(await readFile(unavailable, 'utf8')).toBe('user-owned changed-path sentinel');
      await runner.shutdown();
      // The test owns this sentinel; production preflight never removes it.
      await unlink(unavailable); await rename(held, unavailable);
      const restarted = new JobRunner(await RequestStore.open(config.requestDir), images, config, makeAdapter);
      runners.push(restarted);
      expect((await restarted.get(id)).status).toBe('waiting_for_image');
      const ready = await state(requests, id, 'image_ready');
      expect(ready.submission_started_at).toBe(failed.submission_started_at);
      expect(ready.submitted_at).toBe(failed.submitted_at);
      expect((await images.readOriginal(ready.image!.image_id)).data).toEqual(png);
      expect(shared.submits).toBe(1); expect(shared.opens).toBe(1); expect(shared.recoveries).toBe(1);
      expect(await readdir(path.join(config.dataDir, 'tmp'))).toEqual([]);
    });

  it('honors cancellation during preflight and cannot open or submit when the check finishes', async () => {
    const { runner, requests, images, shared } = await setup();
    const preflight = images.preflight.bind(images);
    let reached = false;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(images, 'preflight').mockImplementation(async () => { await preflight(); reached = true; await gate; });
    await runner.generate('cancel-during-storage-check', prompt);
    await until(() => reached);
    await runner.cancel('cancel-during-storage-check');
    release();
    expect((await state(requests, 'cancel-during-storage-check', 'cancelled')).submission_started_at).toBeUndefined();
    await runner.shutdown();
    expect(shared.opens).toBe(0); expect(shared.submits).toBe(0); expect(shared.downloads).toBe(0);
  });

  it.each([false, true])('closes a retained human-verification browser when recovery storage is unsafe (submitted=%s)', async submitted => {
    const { runner, requests, config, shared } = await setup();
    if (submitted) shared.waitError = 'HUMAN_VERIFICATION_REQUIRED';
    else shared.beforeSubmitError = 'HUMAN_VERIFICATION_REQUIRED';
    const id = submitted ? 'human-storage-submitted' : 'human-storage-before-send';
    await runner.generate(id, prompt);
    const original = await state(requests, id, 'failed');
    expect(original.error?.code).toBe('HUMAN_VERIFICATION_REQUIRED');
    await delay(5);
    expect(shared.closes).toBe(0); expect(shared.submits).toBe(submitted ? 1 : 0);
    await rename(config.outputDir, `${config.outputDir}-held`);
    await writeFile(config.outputDir, 'user-owned changed-path sentinel');
    shared.beforeSubmitError = undefined; shared.waitError = undefined;
    if (submitted) await runner.get(id); else await runner.generate(id, prompt);
    await until(async () => (await requests.get(id))?.error?.code === 'STORAGE_ERROR'
      || (await requests.get(id))?.recovery_error?.code === 'STORAGE_ERROR');
    await until(() => shared.closes === 1);
    const failed = await requests.get(id);
    expect(failed?.submission_started_at).toBe(original.submission_started_at);
    expect(shared.submits).toBe(submitted ? 1 : 0);
    expect(shared.rechecks ?? 0).toBe(0); expect(shared.recoveries).toBe(0);
    expect(await readFile(config.outputDir, 'utf8')).toBe('user-owned changed-path sentinel');
    await runner.cancel(id); await runner.shutdown();
    expect(shared.closes).toBe(1);
  });

  it('cannot start an untracked browser when shutdown happens during durable request creation', async () => {
    const { runner, requests, shared } = await setup();
    const begin = requests.begin.bind(requests);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let published = false;
    vi.spyOn(requests, 'begin').mockImplementation(async (...args) => {
      const result = await begin(...args);
      published = true;
      await gate;
      return result;
    });
    const generating = runner.generate('shutdown-during-begin', prompt);
    await until(() => published);
    await runner.shutdown();
    release();
    expect(await generating).toMatchObject({ status: 'failed', error: { code: 'PROCESS_INTERRUPTED' } });
    expect(shared.opens).toBe(0); expect(shared.submits).toBe(0);
    expect((await requests.get('shutdown-during-begin'))?.submission_started_at).toBeUndefined();
  });

  it('cancels before opening a browser when a host abort arrives during request publication', async () => {
    const { runner, requests, shared } = await setup();
    const begin = requests.begin.bind(requests);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let published = false;
    vi.spyOn(requests, 'begin').mockImplementation(async (...args) => {
      const result = await begin(...args);
      published = true;
      await gate;
      return result;
    });
    const controller = new AbortController();
    const generating = runner.generate('abort-during-begin', prompt, controller.signal);
    await until(() => published);
    controller.abort(); release();
    expect((await generating).status).toBe('cancelled');
    expect(shared.opens).toBe(0); expect(shared.submits).toBe(0);
  });

  it('journals the resumable checkpoint before one submit, saves a decodable original, and deduplicates', async () => {
    const { runner, requests, shared } = await setup();
    await runner.generate('one', prompt);
    const completed = await state(requests, 'one', 'image_ready');
    expect(shared.journalChecked).toBe(true);
    expect(completed.source).toBe('ngini');
    expect(completed.provider_image_count).toBe(1);
    expect(completed.browser_checkpoint?.baseline_result_keys).toEqual(['previous-image']);
    expect(completed.image?.width).toBe(48);
    const repeated = await runner.generate('one', prompt);
    expect(repeated.image?.image_id).toBe(completed.image?.image_id);
    expect(shared.submits).toBe(1);
    await expect(runner.generate('one', 'different')).rejects.toMatchObject({ code: 'PARAMETER_CONFLICT' });
  });

  it('recovers an existing timeout across runner restart using only recover/download, never another submit', async () => {
    const { runner, requests, images, config, shared, makeAdapter } = await setup();
    shared.waitError = 'GENERATION_TIMEOUT';
    await runner.generate('timeout', prompt);
    await state(requests, 'timeout', 'failed');
    await runner.shutdown();
    const restarted = new JobRunner(await RequestStore.open(config.requestDir), images, config, makeAdapter); runners.push(restarted);
    expect((await restarted.generate('timeout', prompt)).error?.code).toBe('GENERATION_TIMEOUT');
    expect(shared.submits).toBe(1);
    const recovering = await restarted.get('timeout');
    expect(recovering.status).toBe('waiting_for_image');
    expect(shared.submits).toBe(1);
    await Promise.all([restarted.get('timeout'), restarted.get('timeout')]);
    const completed = await state(requests, 'timeout', 'image_ready');
    expect(completed.image).toBeDefined();
    expect(shared.recoveries).toBe(1); expect(shared.submits).toBe(1); expect(shared.opens).toBe(1);
  });

  it('retries a failed existing-image download through recovery without a second submit', async () => {
    const { runner, requests, shared } = await setup();
    shared.downloadError = 'DOWNLOAD_FAILED';
    await runner.generate('download-recovery', prompt);
    expect((await state(requests, 'download-recovery', 'failed')).error?.code).toBe('DOWNLOAD_FAILED');
    await until(() => shared.closes === 1); await delay(5);
    shared.downloadError = undefined;
    await runner.get('download-recovery');
    expect((await state(requests, 'download-recovery', 'image_ready')).image).toBeDefined();
    expect(shared.submits).toBe(1); expect(shared.opens).toBe(1);
    expect(shared.recoveries).toBe(1); expect(shared.downloads).toBe(2);
  });

  it('persists the canonical job URL before a timeout and restores that exact existing job', async () => {
    const { runner, requests, images, config, shared, makeAdapter } = await setup();
    shared.canonicalUrl = 'https://ngini.com/c/01M4A7ZVABDGTN99HZQMJ1P1J3';
    shared.waitError = 'GENERATION_TIMEOUT';
    await runner.generate('canonical-timeout', prompt);
    const failed = await state(requests, 'canonical-timeout', 'failed');
    expect(failed.browser_checkpoint?.page_url).toBe(shared.canonicalUrl);
    expect(failed.browser_checkpoint?.submission_started_at).toBeDefined();
    expect(failed.browser_checkpoint?.prompt_sha256).toBe(textHash(prompt));
    await runner.shutdown();
    let recoveredUrl: string | undefined;
    const restarted = new JobRunner(await RequestStore.open(config.requestDir), images, config, () => {
      const adapter = makeAdapter();
      const recover = adapter.recover.bind(adapter);
      adapter.recover = async (checkpoint, ...args) => {
        recoveredUrl = checkpoint.page_url;
        return recover(checkpoint, ...args);
      };
      return adapter;
    });
    runners.push(restarted);
    await restarted.get('canonical-timeout');
    await state(requests, 'canonical-timeout', 'image_ready');
    expect(recoveredUrl).toBe(shared.canonicalUrl);
    expect(shared.submits).toBe(1);
    expect(shared.opens).toBe(1);
  });

  it('recovers a legacy premature text-only result using its original checkpoint without resubmitting', async () => {
    const { runner, requests, images, config, shared, makeAdapter } = await setup();
    shared.canonicalUrl = 'https://ngini.com/c/01M4ADBWFH0FJ45SG898HTGF4S';
    shared.waitError = 'PROVIDER_TEXT_ONLY';
    await runner.generate('late-image', prompt);
    const failed = await state(requests, 'late-image', 'failed');
    expect(failed.error?.code).toBe('PROVIDER_TEXT_ONLY');
    expect(failed.browser_checkpoint?.page_url).toBe(shared.canonicalUrl);
    await runner.shutdown();
    const restarted = new JobRunner(await RequestStore.open(config.requestDir), images, config, makeAdapter);
    runners.push(restarted);
    expect((await restarted.get('late-image')).status).toBe('waiting_for_image');
    const ready = await state(requests, 'late-image', 'image_ready');
    expect(ready.image).toBeDefined();
    expect(ready.error).toBeUndefined();
    await restarted.get('late-image');
    expect(shared.submits).toBe(1);
    expect(shared.opens).toBe(1);
    expect(shared.recoveries).toBe(1);
    expect(shared.downloads).toBe(1);
  });

  it('preserves unknown-submission protection when recovery cannot read the changed UI and retries only once', async () => {
    const { runner, requests, shared } = await setup();
    shared.waitError = 'SUBMISSION_UNKNOWN'; shared.recoverError = 'UI_CHANGED';
    await runner.generate('unknown', prompt);
    await state(requests, 'unknown', 'failed');
    await until(() => shared.closes >= 1); await delay(5);
    await runner.get('unknown');
    await until(() => shared.recoveries === 1 && shared.closes >= 2);
    const failed = await state(requests, 'unknown', 'failed');
    expect(failed.error?.code).toBe('SUBMISSION_UNKNOWN');
    expect(failed.recovery_error?.code).toBe('UI_CHANGED');
    await runner.get('unknown'); await runner.get('unknown');
    expect(shared.recoveries).toBe(1); expect(shared.submits).toBe(1);
    await expect(runner.generate('new-id-same-intent', prompt)).rejects.toMatchObject({ code: 'DUPLICATE_ACTIVE_REQUEST' });
  });

  it('never relabels a persisted fixture as Ngini when fixture mode is disabled on restart', async () => {
    const { runner, requests, images, config, shared, makeAdapter } = await setup(true);
    await runner.generate('fixture', prompt);
    const completed = await state(requests, 'fixture', 'image_ready');
    expect(completed.source).toBe('fixture'); expect(shared.opens).toBe(0); expect(shared.submits).toBe(0);
    await runner.shutdown();
    const restarted = new JobRunner(await RequestStore.open(config.requestDir), images, { ...config, fixtureMode: false }, makeAdapter);
    runners.push(restarted);
    const read = await restarted.get('fixture');
    const retry = await restarted.generate('fixture', prompt);
    expect(read.source).toBe('fixture'); expect(retry.source).toBe('fixture');
    expect(retry.image?.sha256).toBe(completed.image?.sha256);
    expect(retry.image?.image_id).toBe(completed.image?.image_id);
    expect(shared.opens).toBe(0); expect(shared.submits).toBe(0); expect(shared.recoveries).toBe(0);
  });

  it('honors a host signal before click and does not resurrect a cancelled task', async () => {
    const { runner, requests, shared } = await setup(); shared.holdOpen = true;
    const controller = new AbortController();
    await runner.generate('cancel-before-click', prompt, controller.signal);
    await until(() => shared.opens === 1);
    controller.abort();
    const cancelled = await state(requests, 'cancel-before-click', 'cancelled');
    expect(cancelled.submission_started_at).toBeUndefined(); expect(shared.submits).toBe(0);
    await runner.get('cancel-before-click');
    expect((await runner.generate('cancel-before-click', prompt)).status).toBe('cancelled');
    expect(shared.recoveries).toBe(0); expect(shared.submits).toBe(0);
  });

  it('cancelled submitted work remains cancelled after restart and get cannot re-submit', async () => {
    const { runner, requests, images, config, shared, makeAdapter } = await setup();
    shared.waitError = 'GENERATION_TIMEOUT';
    await runner.generate('cancel-submitted', prompt);
    await state(requests, 'cancel-submitted', 'failed');
    await runner.cancel('cancel-submitted'); await runner.shutdown();
    const restarted = new JobRunner(await RequestStore.open(config.requestDir), images, config, makeAdapter); runners.push(restarted);
    expect((await restarted.get('cancel-submitted')).status).toBe('cancelled');
    expect((await restarted.generate('cancel-submitted', prompt)).status).toBe('cancelled');
    expect(shared.submits).toBe(1); expect(shared.recoveries).toBe(0);
  });

  it('keeps full prompts out of persisted checkpoint and rejects query URLs with prompt/auto-submit risk', async () => {
    const { runner, requests, directory } = await setup();
    await runner.generate('private', prompt); await state(requests, 'private', 'image_ready');
    const entries = (await readdir(path.join(directory, 'requests'))).filter(name => name.endsWith('.json'));
    const persisted = await readFile(path.join(directory, 'requests', entries[0]!), 'utf8');
    expect(persisted).not.toContain(prompt);
    await requests.begin('unsafe', prompt, { source: 'ngini' }); await requests.transition('unsafe', 'opening_page');
    await expect(requests.transition('unsafe', 'ready_to_submit', { browser_checkpoint: {
      request_id: 'unsafe', page_url: 'https://ngini.com/c/new?prompt=private', baseline_message_keys: [], baseline_result_keys: [],
    } })).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    expect((await requests.get('unsafe'))?.status).toBe('opening_page');
  });

  it('does not erase fixture provenance with an internal source patch', async () => {
    const { requests } = await setup(true);
    await requests.begin('source', prompt, { source: 'fixture' });
    await expect(requests.transition('source', 'opening_page', { source: 'ngini' })).rejects.toMatchObject({ code: 'PARAMETER_CONFLICT' });
    await expect(requests.transition('source', 'opening_page', { source: undefined })).rejects.toMatchObject({ code: 'PARAMETER_CONFLICT' });
    expect((await requests.get('source'))?.source).toBe('fixture');
  });

  it('retains the human verification browser and closes it on cancel instead of leaking it', async () => {
    const { runner, requests, shared } = await setup(); shared.waitError = 'HUMAN_VERIFICATION_REQUIRED';
    await runner.generate('human', prompt); await state(requests, 'human', 'failed');
    await delay(5); expect(shared.closes).toBe(0);
    await runner.cancel('human'); expect(shared.closes).toBe(1);
    expect((await requests.get('human'))?.status).toBe('cancelled');
    expect(shared.submits).toBe(1);
  });

  it('distinguishes shutdown from user cancellation and recovers a late original after restart with one submit', async () => {
    const { runner, requests, images, config, shared, makeAdapter } = await setup();
    shared.holdWait = true;
    shared.canonicalUrl = 'https://ngini.com/c/01M4ADBWFH0FJ45SG898HTGF4S';
    await runner.generate('shutdown-late', prompt);
    await state(requests, 'shutdown-late', 'waiting_for_image');
    await runner.shutdown();
    const interrupted = await requests.get('shutdown-late');
    expect(interrupted).toMatchObject({ status: 'failed', interrupted_phase: 'waiting_for_image',
      error: { code: 'GENERATION_TIMEOUT' } });
    expect(interrupted?.browser_checkpoint?.page_url).toBe(shared.canonicalUrl);
    expect(interrupted?.browser_checkpoint?.submission_started_at).toBeDefined();
    const restarted = new JobRunner(await RequestStore.open(config.requestDir), images, config, makeAdapter); runners.push(restarted);
    await restarted.get('shutdown-late');
    await state(requests, 'shutdown-late', 'image_ready');
    expect(shared.submits).toBe(1); expect(shared.recoveries).toBe(1); expect(shared.opens).toBe(1);
  });

  it('records shutdown before submission as interrupted without background revival', async () => {
    const { runner, requests, images, config, shared, makeAdapter } = await setup();
    shared.holdOpen = true;
    await runner.generate('shutdown-before', prompt);
    await until(() => shared.opens === 1);
    await runner.shutdown();
    expect(await requests.get('shutdown-before')).toMatchObject({ status: 'failed', error: { code: 'PROCESS_INTERRUPTED' } });
    const restarted = new JobRunner(await RequestStore.open(config.requestDir), images, config, makeAdapter); runners.push(restarted);
    await restarted.get('shutdown-before');
    await restarted.generate('shutdown-before', prompt);
    expect(shared.submits).toBe(0); expect(shared.recoveries).toBe(0); expect(shared.opens).toBe(1);
  });

  it('preserves unknown journaled submission on shutdown and forbids same-ID replay', async () => {
    const { runner, requests, images, config, shared, makeAdapter } = await setup(); shared.holdJournal = true;
    await runner.generate('shutdown-unknown', prompt);
    await state(requests, 'shutdown-unknown', 'submitting');
    await runner.shutdown();
    const stopped = await requests.get('shutdown-unknown');
    expect(stopped).toMatchObject({ status: 'failed', error: { code: 'SUBMISSION_UNKNOWN' } });
    expect(stopped?.submitted_at).toBeUndefined();
    expect(stopped?.browser_checkpoint?.submission_started_at).toBeDefined();
    const restarted = new JobRunner(await RequestStore.open(config.requestDir), images, config, makeAdapter); runners.push(restarted);
    expect((await restarted.generate('shutdown-unknown', prompt)).error?.code).toBe('SUBMISSION_UNKNOWN');
    expect(shared.submits).toBe(0); expect(shared.opens).toBe(1);
    await restarted.get('shutdown-unknown');
    await state(requests, 'shutdown-unknown', 'image_ready');
    expect(shared.recoveries).toBe(1); expect(shared.submits).toBe(0); expect(shared.opens).toBe(1);
  });

  it('resumes pre-submission human verification only with the original ID/hash and retained page', async () => {
    const { runner, requests, shared } = await setup(); shared.beforeSubmitError = 'HUMAN_VERIFICATION_REQUIRED';
    await runner.generate('human-before', prompt);
    const paused = await state(requests, 'human-before', 'failed'); await delay(5);
    expect(paused.submission_started_at).toBeUndefined(); expect(paused.submitted_at).toBeUndefined();
    expect(paused.error?.details).toEqual({ resume_action: 'generate_same_request' });
    expect((await runner.get('human-before')).status).toBe('failed');
    expect(shared.rechecks ?? 0).toBe(0); expect(shared.submits).toBe(0);
    await expect(runner.generate('human-before', 'changed caller prompt')).rejects.toMatchObject({ code: 'PARAMETER_CONFLICT' });
    await expect(runner.generate('another-human', 'different prompt')).rejects.toMatchObject({ code: 'BUSY' });
    expect(await requests.list()).toHaveLength(1);
    await runner.generate('human-before', prompt);
    await state(requests, 'human-before', 'failed'); await delay(5);
    expect(shared.rechecks).toBe(1); expect(shared.submits).toBe(0); expect(shared.opens).toBe(1);
    shared.beforeSubmitError = undefined;
    await runner.generate('human-before', prompt);
    const ready = await state(requests, 'human-before', 'image_ready');
    expect(ready.source).toBe('ngini');
    expect(shared.rechecks).toBe(2); expect(shared.submits).toBe(1); expect(shared.opens).toBe(1);
  });

  it('resumes submitted human verification with bounded same-ID recover calls and never submits again', async () => {
    const { runner, requests, shared } = await setup(); shared.waitError = 'HUMAN_VERIFICATION_REQUIRED';
    await runner.generate('human-after', prompt);
    const paused = await state(requests, 'human-after', 'failed'); await delay(5);
    expect(paused.error?.details).toEqual({ resume_action: 'get_same_request' });
    expect(paused.submission_started_at).toBeDefined();
    await expect(runner.generate('human-other', 'different prompt')).rejects.toMatchObject({ code: 'BUSY' });
    expect((await runner.generate('human-after', prompt)).status).toBe('failed');
    expect(shared.submits).toBe(1); expect(shared.rechecks ?? 0).toBe(0);
    shared.recoverError = 'HUMAN_VERIFICATION_REQUIRED';
    await runner.get('human-after');
    await state(requests, 'human-after', 'failed'); await delay(5);
    expect(shared.recoveries).toBe(1); expect(shared.submits).toBe(1); expect(shared.closes).toBe(0);
    expect((await requests.get('human-after'))?.error?.details).toEqual({ resume_action: 'get_same_request' });
    shared.recoverError = undefined;
    await runner.get('human-after');
    await state(requests, 'human-after', 'image_ready');
    expect(shared.recoveries).toBe(2); expect(shared.submits).toBe(1); expect(shared.opens).toBe(1);
  });

  it('cancels a held pre-submission human page and never resurrects it after restart', async () => {
    const { runner, requests, images, config, shared, makeAdapter } = await setup(); shared.beforeSubmitError = 'HUMAN_VERIFICATION_REQUIRED';
    await runner.generate('human-cancel', prompt);
    await state(requests, 'human-cancel', 'failed'); await delay(5);
    await runner.cancel('human-cancel');
    expect(shared.closes).toBe(1);
    await runner.shutdown();
    const restarted = new JobRunner(await RequestStore.open(config.requestDir), images, config, makeAdapter); runners.push(restarted);
    expect((await restarted.get('human-cancel')).status).toBe('cancelled');
    expect((await restarted.generate('human-cancel', prompt)).status).toBe('cancelled');
    expect(shared.submits).toBe(0); expect(shared.rechecks ?? 0).toBe(0); expect(shared.recoveries).toBe(0);
  });

  it('releases a held pre-submission page on shutdown but requires a new explicit intent', async () => {
    const { runner, requests, images, config, shared, makeAdapter } = await setup(); shared.beforeSubmitError = 'HUMAN_VERIFICATION_REQUIRED';
    await runner.generate('human-stop', prompt);
    await state(requests, 'human-stop', 'failed'); await delay(5);
    await runner.shutdown();
    expect(shared.closes).toBe(1);
    expect(await requests.get('human-stop')).toMatchObject({ status: 'failed', error: { code: 'PROCESS_INTERRUPTED' } });
    const restarted = new JobRunner(await RequestStore.open(config.requestDir), images, config, makeAdapter); runners.push(restarted);
    await restarted.get('human-stop'); await restarted.generate('human-stop', prompt);
    expect(shared.submits).toBe(0); expect(shared.opens).toBe(1); expect(shared.rechecks ?? 0).toBe(0);
    shared.beforeSubmitError = undefined;
    await restarted.generate('new-explicit-intent', 'new caller request');
    await state(requests, 'new-explicit-intent', 'image_ready');
    expect(shared.submits).toBe(1);
  });

  it.each([false, true])('does not resume background human verification through repeated calls; submitted=%s', async submitted => {
    const shared: Counts = { submits: 0, opens: 0, recoveries: 0, downloads: 0, closes: 0 };
    const { runner, requests, images, config, makeAdapter } = await setup(false, shared, { browserHeadless: true });
    if (submitted) shared.waitError = 'HUMAN_VERIFICATION_REQUIRED';
    else shared.beforeSubmitError = 'HUMAN_VERIFICATION_REQUIRED';
    const id = submitted ? 'background-human-after' : 'background-human-before';
    await runner.generate(id, prompt);
    const paused = await state(requests, id, 'failed'); await delay(5);
    expect(paused.error).toMatchObject({ code: 'HUMAN_VERIFICATION_REQUIRED', details: {
      manual_handoff: 'enable_visible_browser_and_restart', browser_visibility: 'background', submitted,
    } });
    expect(paused.error?.details).not.toHaveProperty('resume_action');
    expect(Boolean(paused.submission_started_at)).toBe(submitted);
    expect(shared.closes).toBe(0);

    // Even if the controlled page later appears clear, polling cannot resume a hidden challenge.
    shared.beforeSubmitError = undefined; shared.waitError = undefined;
    for (let index = 0; index < 3; index++) {
      expect((await runner.get(id)).status).toBe('failed');
      expect((await runner.generate(id, prompt)).status).toBe('failed');
    }
    await expect(runner.generate(id, 'different description')).rejects.toMatchObject({ code: 'PARAMETER_CONFLICT' });
    await expect(runner.generate('other-background-job', 'different request')).rejects.toMatchObject({ code: 'BUSY' });
    expect(await requests.list()).toHaveLength(1);
    expect(shared.submits).toBe(submitted ? 1 : 0);
    expect(shared.opens).toBe(1); expect(shared.rechecks ?? 0).toBe(0);
    expect(shared.recoveries).toBe(0); expect(shared.downloads).toBe(0);

    await runner.cancel(id); await runner.shutdown();
    expect(shared.closes).toBe(1);
    const restarted = new JobRunner(await RequestStore.open(config.requestDir), images, config, makeAdapter);
    runners.push(restarted);
    expect((await restarted.get(id)).status).toBe('cancelled');
    expect((await restarted.generate(id, prompt)).status).toBe('cancelled');
    expect(shared.submits).toBe(submitted ? 1 : 0);
    expect(shared.opens).toBe(1); expect(shared.recoveries).toBe(0); expect(shared.rechecks ?? 0).toBe(0);
  });

  it('never replays an unsubmitted background challenge after shutdown and an explicit visible-mode restart', async () => {
    const shared: Counts = { submits: 0, opens: 0, recoveries: 0, downloads: 0, closes: 0,
      beforeSubmitError: 'HUMAN_VERIFICATION_REQUIRED' };
    const { runner, requests, images, config, makeAdapter } = await setup(false, shared, { browserHeadless: true });
    await runner.generate('background-before-shutdown', prompt);
    await state(requests, 'background-before-shutdown', 'failed'); await delay(5);
    await runner.shutdown();
    expect(shared.closes).toBe(1);
    expect((await requests.get('background-before-shutdown'))?.submission_started_at).toBeUndefined();
    shared.beforeSubmitError = undefined;
    const visible = new JobRunner(await RequestStore.open(config.requestDir), images,
      { ...config, browserHeadless: false }, makeAdapter);
    runners.push(visible);
    expect((await visible.get('background-before-shutdown')).status).toBe('failed');
    expect((await visible.generate('background-before-shutdown', prompt)).status).toBe('failed');
    expect(shared.submits).toBe(0); expect(shared.opens).toBe(1);
    expect(shared.recoveries).toBe(0); expect(shared.rechecks ?? 0).toBe(0);
  });

  it('keeps a submitted background challenge blocked across background restart; visible restart only recovers the original', async () => {
    const shared: Counts = { submits: 0, opens: 0, recoveries: 0, downloads: 0, closes: 0,
      waitError: 'HUMAN_VERIFICATION_REQUIRED', canonicalUrl: 'https://ngini.com/c/01M4ADBWFH0FJ45SG898HTGF4S' };
    const { runner, requests, images, config, makeAdapter } = await setup(false, shared, { browserHeadless: true });
    await runner.generate('background-after-shutdown', prompt);
    const paused = await state(requests, 'background-after-shutdown', 'failed'); await delay(5);
    expect(paused.browser_checkpoint?.page_url).toBe(shared.canonicalUrl);
    expect(paused.browser_checkpoint?.submission_started_at).toBeDefined();
    await runner.shutdown();
    const background = new JobRunner(await RequestStore.open(config.requestDir), images, config, makeAdapter);
    runners.push(background);
    expect((await background.get('background-after-shutdown')).status).toBe('failed');
    expect((await background.generate('background-after-shutdown', prompt)).status).toBe('failed');
    expect(shared.submits).toBe(1); expect(shared.recoveries).toBe(0); expect(shared.opens).toBe(1);
    await background.shutdown();

    let recoveredCheckpoint: BrowserCheckpoint | undefined;
    const visible = new JobRunner(await RequestStore.open(config.requestDir), images,
      { ...config, browserHeadless: false }, () => {
        const adapter = makeAdapter();
        const recover = adapter.recover.bind(adapter);
        adapter.recover = async (checkpoint, ...args) => {
          recoveredCheckpoint = checkpoint;
          return recover(checkpoint, ...args);
        };
        return adapter;
      });
    runners.push(visible);
    expect((await visible.get('background-after-shutdown')).status).toBe('waiting_for_image');
    const completed = await state(requests, 'background-after-shutdown', 'image_ready');
    expect(completed.image).toBeDefined(); expect(completed.source).toBe('ngini');
    expect(recoveredCheckpoint).toEqual(paused.browser_checkpoint);
    expect(shared.submits).toBe(1); expect(shared.recoveries).toBe(1);
    expect(shared.opens).toBe(1); expect(shared.downloads).toBe(1); expect(shared.rechecks ?? 0).toBe(0);
  });
});
