import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RequestStore } from '../../src/jobs/request-store.js';
import { ProfileLock } from '../../src/jobs/profile-lock.js';
import type { DeliveryEvidence, JobImage, RequestRecord } from '../../src/jobs/state-machine.js';

const cleanup: string[] = [];
async function folder(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ngini-jobs-test-'));
  cleanup.push(directory);
  return directory;
}
afterEach(async () => { await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

const image: JobImage = {
  image_id: '4ab81d8e-a2b8-41aa-a882-435167890001', filename: 'ngini-image.png',
  mime: 'image/png', width: 32, height: 32, bytes: 100, sha256: 'a'.repeat(64),
};

async function readyImage(store: RequestStore, id: string): Promise<void> {
  await store.transition(id, 'opening_page');
  await store.transition(id, 'ready_to_submit');
  await store.transition(id, 'submitting');
  await store.transition(id, 'waiting_for_image');
  await store.transition(id, 'downloading');
  await store.transition(id, 'validating');
  await store.transition(id, 'image_ready', { image });
}

describe('request identity and submission protection', () => {
  it('T06/T07: reuses identical ID and rejects changed content, including after restart', async () => {
    const directory = await folder();
    const store = await RequestStore.open(directory);
    expect((await store.begin('request-1', '中文貓咪')).kind).toBe('created');
    expect((await store.begin('request-1', '中文貓咪')).kind).toBe('existing');
    await expect(store.begin('request-1', '另一張圖片')).rejects.toMatchObject({ code: 'PARAMETER_CONFLICT' });
    const reopened = await RequestStore.open(directory);
    expect((await reopened.begin('request-1', '中文貓咪')).kind).toBe('existing');
    const files = await readdir(directory);
    const persisted = await readFile(path.join(directory, files.find((name) => name.endsWith('.json'))!), 'utf8');
    expect(persisted).not.toContain('中文貓咪');
    expect(persisted).not.toContain('另一張圖片');
  });

  it('T08: concurrent requests create exactly one active job and never a hidden queue', async () => {
    const directory = await folder();
    const storeA = await RequestStore.open(directory);
    const storeB = await RequestStore.open(directory);
    const attempts = await Promise.allSettled([storeA.begin('request-a', '貓'), storeB.begin('request-b', '狗')]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === 'rejected');
    if (rejected?.status === 'rejected') expect(rejected.reason).toMatchObject({ code: 'BUSY' });
    expect(await storeA.list()).toHaveLength(1);
  });

  it('rejects a changed request ID that repeats an active prompt', async () => {
    const store = await RequestStore.open(await folder());
    await store.begin('request-first', '只生成一張');
    await expect(store.begin('request-second', '只生成一張')).rejects.toMatchObject({
      code: 'DUPLICATE_ACTIVE_REQUEST', details: { request_id: 'request-first' },
    });
    expect(await store.list()).toHaveLength(1);
  });

  it('never persists raw prompts and rejects request IDs usable as paths', async () => {
    const store = await RequestStore.open(await folder());
    await expect(store.begin('../outside', '貓')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(store.begin('valid', '   ')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(await store.list()).toHaveLength(0);
  });
});

describe('recovery and cancellation', () => {
  it.each([
    { code: 'SUBMISSION_UNKNOWN' as const, started: true, confirmed: false },
    { code: 'HUMAN_VERIFICATION_REQUIRED' as const, started: false, confirmed: false },
    { code: 'GENERATION_TIMEOUT' as const, started: true, confirmed: true },
  ])('preserves recorded $code failure across restarts without clearing its conservative block', async ({ code, started, confirmed }) => {
    const directory = await folder();
    const store = await RequestStore.open(directory);
    const id = `preserved-${code}`;
    await store.begin(id, '同一張測試圖', { source: 'ngini' });
    const checkpoint = { request_id: id, page_url: 'https://ngini.com/c/original-failed-task',
      baseline_message_keys: ['old-user'], baseline_result_keys: ['old-image'] };
    await store.transition(id, 'opening_page', { browser_checkpoint: checkpoint });
    if (started) {
      await store.transition(id, 'ready_to_submit');
      const prior = (await store.get(id))!;
      await store.transition(id, 'submitting', { browser_checkpoint: { ...checkpoint,
        prompt_sha256: prior.prompt_sha256, submission_started_at: new Date().toISOString() } });
      if (confirmed) await store.transition(id, 'waiting_for_image');
    }
    const failed = await store.transition(id, 'failed', {
      error: { code, message: '已保存的原始失敗原因', details: { submitted: started } },
      recovery_error: { code: 'UI_CHANGED', message: '原任務先前查核失敗，不能重送' },
      interrupted_phase: started ? confirmed ? 'waiting_for_image' : 'submitting' : 'opening_page',
      message: '保留既有任務和人工操作界線',
    });
    await simulateDeadOwner(directory, failed);
    const filename = path.join(directory, `${createHash('sha256').update(id).digest('hex')}.json`);
    const persisted = await readFile(filename, 'utf8');
    for (let restart = 0; restart < 2; restart++) {
      const reopened = await RequestStore.open(directory);
      expect(await reopened.get(id)).toEqual(JSON.parse(persisted));
      expect(await readFile(filename, 'utf8')).toBe(persisted);
      expect((await reopened.begin(id, '同一張測試圖')).kind).toBe('existing');
      await expect(reopened.begin(`different-${restart}`, '另一張')).rejects.toMatchObject({ code: 'BUSY' });
      await expect(reopened.transition(id, 'submitting')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    }
  });

  it('T13: process death during submission becomes SUBMISSION_UNKNOWN and cannot resubmit', async () => {
    const directory = await folder();
    const store = await RequestStore.open(directory);
    await store.begin('uncertain', '睡覺的貓');
    await store.transition('uncertain', 'opening_page');
    await store.transition('uncertain', 'ready_to_submit');
    const record = await store.transition('uncertain', 'submitting');
    expect(record.submission_started_at).toBeDefined();
    await simulateDeadOwner(directory, record);
    const reopened = await RequestStore.open(directory);
    const existing = await reopened.begin('uncertain', '睡覺的貓');
    expect(existing.kind).toBe('existing');
    expect(existing.record).toMatchObject({ status: 'failed', error: { code: 'SUBMISSION_UNKNOWN' } });
    await expect(reopened.transition('uncertain', 'submitting')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await expect(reopened.begin('new-task', '別的圖片')).rejects.toMatchObject({ code: 'BUSY' });
    await reopened.cancel('uncertain');
    expect((await reopened.begin('new-task', '別的圖片')).kind).toBe('created');
  });

  it('T09/T13: post-submission crash permits querying the existing task, never generating again', async () => {
    const directory = await folder();
    const store = await RequestStore.open(directory);
    await store.begin('submitted', '船上的貓');
    await store.transition('submitted', 'opening_page');
    await store.transition('submitted', 'ready_to_submit');
    await store.transition('submitted', 'submitting');
    const record = await store.transition('submitted', 'waiting_for_image');
    await simulateDeadOwner(directory, record);
    const reopened = await RequestStore.open(directory);
    expect(await reopened.get('submitted')).toMatchObject({ status: 'failed', error: { code: 'GENERATION_TIMEOUT' } });
    await reopened.transition('submitted', 'waiting_for_image');
    expect((await reopened.get('submitted'))?.submitted_at).toBe(record.submitted_at);
    await expect(reopened.transition('submitted', 'ready_to_submit')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('does not turn an unknown submit into a confirmed timestamp while publishing recovery checkpoints', async () => {
    const store = await RequestStore.open(await folder());
    await store.begin('unknown-checkpoint', '貓');
    await store.transition('unknown-checkpoint', 'opening_page');
    await store.transition('unknown-checkpoint', 'ready_to_submit');
    const uncertain = await store.transition('unknown-checkpoint', 'submitting');
    await store.transition('unknown-checkpoint', 'failed', { error: { code: 'SUBMISSION_UNKNOWN', message: 'unknown' } });
    await store.transition('unknown-checkpoint', 'waiting_for_image');
    const repeated = await store.transition('unknown-checkpoint', 'waiting_for_image', { browser_checkpoint: {
      request_id: 'unknown-checkpoint', page_url: 'https://ngini.com/c/original-task',
      baseline_message_keys: [], baseline_result_keys: [], prompt_sha256: uncertain.prompt_sha256,
      submission_started_at: uncertain.submission_started_at,
    } });
    expect(repeated.submitted_at).toBeUndefined();
    expect(repeated.submission_started_at).toBe(uncertain.submission_started_at);
    await expect(store.transition('unknown-checkpoint', 'submitting')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('preserves unknown submission when the process dies again during read-only recovery', async () => {
    const directory = await folder();
    const store = await RequestStore.open(directory);
    const id = 'unknown-recovery-crash';
    const prompt = '窗邊睡覺的貓';
    await store.begin(id, prompt, { source: 'ngini' });
    await store.transition(id, 'opening_page');
    await store.transition(id, 'ready_to_submit');
    const submitting = await store.transition(id, 'submitting');
    const checkpoint = {
      request_id: id, page_url: 'https://ngini.com/c/original-unknown-task',
      baseline_message_keys: [], baseline_result_keys: [], prompt_sha256: submitting.prompt_sha256,
      submission_started_at: submitting.submission_started_at,
    };
    await store.transition(id, 'failed', { error: { code: 'SUBMISSION_UNKNOWN', message: 'unknown' },
      browser_checkpoint: checkpoint });
    // Match runner.get(): recovery is durable, but its original error is only in memory.
    const recovering = await store.transition(id, 'waiting_for_image');
    expect(recovering.error).toBeUndefined();
    expect(recovering.submitted_at).toBeUndefined();
    await simulateDeadOwner(directory, recovering);

    const reopened = await RequestStore.open(directory);
    const preserved = await reopened.get(id);
    expect(preserved).toMatchObject({ status: 'failed', interrupted_phase: 'waiting_for_image',
      error: { code: 'SUBMISSION_UNKNOWN' }, browser_checkpoint: checkpoint,
      submission_started_at: submitting.submission_started_at });
    expect(preserved?.submitted_at).toBeUndefined();
    expect((await reopened.begin(id, prompt)).kind).toBe('existing');
    await expect(reopened.begin('different-intent', '另一張圖片')).rejects.toMatchObject({ code: 'BUSY' });
    await expect(reopened.transition(id, 'submitting')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('pre-submission crash releases the active job without claiming it was submitted', async () => {
    const directory = await folder();
    const store = await RequestStore.open(directory);
    const record = (await store.begin('interrupted', '貓')).record;
    await simulateDeadOwner(directory, record);
    const reopened = await RequestStore.open(directory);
    expect(await reopened.get('interrupted')).toMatchObject({ status: 'failed', error: { code: 'PROCESS_INTERRUPTED' } });
    expect((await reopened.begin('another', '狗')).kind).toBe('created');
  });

  it('cancel before submission has no submission timestamp; cancel after submission preserves its risk', async () => {
    const store = await RequestStore.open(await folder());
    await store.begin('before', '貓');
    expect((await store.cancel('before')).submission_started_at).toBeUndefined();
    await store.begin('after', '狗');
    await store.transition('after', 'opening_page');
    await store.transition('after', 'ready_to_submit');
    await store.transition('after', 'submitting');
    const cancelled = await store.cancel('after');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.submission_started_at).toBeDefined();
    expect(cancelled.message).toContain('不能保證');
    await expect(store.transition('after', 'waiting_for_image')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

describe('delivery and profile isolation', () => {
  it('rejects corrupted durable delivery/metadata instead of reporting success or creating a replacement task', async () => {
    const directory = await folder();
    const store = await RequestStore.open(directory);
    await store.begin('corrupted-ready', '貓');
    await readyImage(store, 'corrupted-ready');
    const record = (await store.get('corrupted-ready'))!;
    const filename = path.join(directory, `${createHash('sha256').update(record.request_id).digest('hex')}.json`);
    for (const patch of [
      { status: 'delivered', delivery: { preview_visible: true, original_download_verified: false, downloaded_sha256: image.sha256 } },
      { image: undefined }, { image: { ...image, bytes: 25 * 1024 * 1024 + 1 } },
      { image: { ...image, width: 64_000_001 } },
      { image: { ...image, filename: '../private.png' } },
      { quota: { availability: 'available', remaining: -1, source: 'page', observed_at: record.updated_at } },
    ]) {
      await writeFile(filename, JSON.stringify({ ...record, ...patch }));
      await expect(store.get(record.request_id)).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
      await expect(store.begin(record.request_id, '貓')).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    }
    await writeFile(filename, JSON.stringify(record));
    expect((await store.get(record.request_id))?.status).toBe('image_ready');
  });

  it('does not replace durable state when a patch omits required image metadata', async () => {
    const store = await RequestStore.open(await folder());
    await store.begin('safe-publication', '貓');
    await readyImage(store, 'safe-publication');
    await expect(store.transition('safe-publication', 'presenting', { image: undefined }))
      .rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    expect(await store.get('safe-publication')).toMatchObject({ status: 'image_ready', image });
  });

  it('T18: local saving does not count as delivery without visible preview and matching original hash', async () => {
    const store = await RequestStore.open(await folder());
    await store.begin('image-ready', '貓');
    await readyImage(store, 'image-ready');
    await expect(store.markDelivery('image-ready', { preview_visible: true, original_download_verified: false }))
      .rejects.toMatchObject({ code: 'DELIVERY_BLOCKED' });
    await expect(store.markDelivery('image-ready', { preview_visible: true, original_download_verified: true, downloaded_sha256: 'b'.repeat(64) }))
      .rejects.toMatchObject({ code: 'DELIVERY_BLOCKED' });
    await expect(store.markDelivery('image-ready', {
      preview_visible: 'false', original_download_verified: 'false', downloaded_sha256: image.sha256,
    } as unknown as DeliveryEvidence)).rejects.toMatchObject({ code: 'DELIVERY_BLOCKED' });
    const delivered = await store.markDelivery('image-ready', {
      preview_visible: true, original_download_verified: true, downloaded_sha256: image.sha256, host: 'test host',
    });
    expect(delivered.status).toBe('delivered');
    expect((await store.begin('image-ready', '貓')).kind).toBe('existing');
    expect((await store.begin('next-intent', '貓')).kind).toBe('created');
  });

  it('locks only the dedicated profile; a second owner is busy and release is idempotent', async () => {
    const directory = await folder();
    const first = await ProfileLock.acquire(directory);
    await expect(ProfileLock.acquire(directory)).rejects.toMatchObject({ code: 'BUSY' });
    await first.release();
    await first.release();
    const next = await ProfileLock.acquire(directory);
    await next.release();
  });

  it('recovers a dead process lock without deleting browser data', async () => {
    const directory = await folder();
    await writeFile(path.join(directory, 'Cookies'), 'keep profile');
    await writeFile(path.join(directory, '.ngini-profile.lock'), JSON.stringify({ pid: 999_999_999, token: 'old', created_at: '2020-01-01' }));
    const lock = await ProfileLock.acquire(directory);
    expect(await readFile(path.join(directory, 'Cookies'), 'utf8')).toBe('keep profile');
    await lock.release();
  });
});

async function simulateDeadOwner(directory: string, record: RequestRecord): Promise<void> {
  const filename = `${createHash('sha256').update(record.request_id).digest('hex')}.json`;
  await writeFile(path.join(directory, filename), JSON.stringify({ ...record, owner_pid: 999_999_999 }));
}
