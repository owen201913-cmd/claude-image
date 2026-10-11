import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RequestStore } from '../../src/jobs/request-store.js';
import { UNKNOWN_QUOTA, type JobImage, type RequestRecord } from '../../src/jobs/state-machine.js';
import { deliveryMessageForClient, deliveryObservationPatch, type DeliveryObservation } from '../../src/ui/delivery-status.js';

const image: JobImage = { image_id: '9753c1f4-106d-493a-8839-68ac9b7d5b34', filename: 'ngini-9753c1f4.png',
  mime: 'image/png', width: 960, height: 640, bytes: 29746, sha256: 'a'.repeat(64) };
const legacyMessage = 'DELIVERY_BLOCKED：圖片已保存，但 host 無法提供預覽或原圖下載。';
const record: RequestRecord = { schema_version: 1, request_id: 'delivery-observation-offline', prompt_sha256: 'b'.repeat(64),
  status: 'presenting', created_at: '2026-10-07T00:00:00Z', updated_at: '2026-10-07T00:00:00Z', owner_pid: process.pid,
  image, source: 'ngini', quota: { ...UNKNOWN_QUOTA }, message: legacyMessage };
const observations: DeliveryObservation[] = ['delivery_blocked', 'preview_visible', 'download_accepted'];

describe('card observations are separate from generation/delivery acceptance', () => {
  it('presents the old fixed blocked message as historical without changing the original request or image', () => {
    const before = structuredClone(record);
    const message = deliveryMessageForClient(record);
    expect(message).toContain('前次圖片卡片回報交付問題');
    expect(message).toContain('可重取同一張圖片');
    expect(message).not.toContain('host 無法');
    expect(record).toEqual(before);
  });

  it('records a new blocked card observation without declaring the current host incapable', () => {
    const patch = deliveryObservationPatch({ ...record, status: 'image_ready' }, 'delivery_blocked');
    expect(patch?.status).toBe('presenting');
    expect(patch?.message).toContain('前次圖片卡片回報交付問題');
    expect(patch?.message).not.toContain('DELIVERY_BLOCKED');
  });

  it.each([
    '圖片卡片已回報預覽可見；原圖已保存，可下載同一張圖片。原檔下載尚未獨立驗證。',
    '聊天客戶端已接受同一張原圖的下載；是否已保存原檔及雜湊尚未獨立驗證。',
  ])('does not reuse a previous card observation as current host visibility: %s', message => {
    const previous = { ...record, message };
    const before = structuredClone(previous);
    expect(deliveryMessageForClient(previous)).toContain('此任務曾');
    expect(deliveryMessageForClient(previous)).toContain('不代表目前對話');
    expect(previous).toEqual(before);
  });

  it.each(['preview_visible', 'download_accepted'] as const)('clears the stale blocked message after %s without marking delivered', observation => {
    const patch = deliveryObservationPatch(record, observation)!;
    expect(patch.status).toBe('presenting');
    expect(patch.message).not.toContain('交付問題');
    expect(patch.message).toContain('尚未獨立驗證');
    expect(patch).not.toHaveProperty('delivery');
  });

  it.each(['failed', 'cancelled', 'delivered'] as const)('does not clear or replace %s errors or messages', status => {
    const stopped = { ...record, status, error: { code: 'INVALID_IMAGE' as const, message: 'Retain original error' } };
    const before = structuredClone(stopped);
    expect(deliveryMessageForClient(stopped)).toBe(legacyMessage);
    for (const observation of observations) expect(deliveryObservationPatch(stopped, observation)).toBeUndefined();
    expect(stopped).toEqual(before);
  });

  it('does not clear an error or stage on a request without an image', () => {
    const missingImage = { ...record, image: undefined, error: { code: 'DOWNLOAD_FAILED' as const, message: 'Retain original error' } };
    expect(deliveryMessageForClient(missingImage)).toBe(legacyMessage);
    for (const observation of observations) expect(deliveryObservationPatch(missingImage, observation)).toBeUndefined();
    expect(missingImage.error.message).toBe('Retain original error');
  });

  it('does not rewrite unrelated messages', () => {
    expect(deliveryMessageForClient({ ...record, message: '另一個具體錯誤' })).toBe('另一個具體錯誤');
  });

  it('supports repeated presenting updates in the actual store and keeps original-save acceptance unverified', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ngini-delivery-status-'));
    try {
      const store = await RequestStore.open(directory);
      await store.begin(record.request_id, 'offline delivery metadata', { source: 'ngini' });
      for (const status of ['opening_page', 'ready_to_submit', 'submitting', 'waiting_for_image', 'downloading', 'validating'] as const) {
        await store.transition(record.request_id, status);
      }
      let current = await store.transition(record.request_id, 'image_ready', { image });
      for (const observation of observations) {
        const patch = deliveryObservationPatch(current, observation)!;
        current = await store.transition(record.request_id, patch.status, { message: patch.message });
      }
      expect(current.status).toBe('presenting');
      expect(current.message).toContain('已接受同一張原圖的下載');
      expect(current.image).toEqual(image);
      expect(current.source).toBe('ngini');
      expect(current.delivery).toBeUndefined();
      await expect(store.markDelivery(record.request_id, { preview_visible: true, original_download_verified: false }))
        .rejects.toMatchObject({ code: 'DELIVERY_BLOCKED' });
      const pending = (await store.get(record.request_id))!;
      const beforeCancel = deliveryObservationPatch(pending, 'preview_visible')!;
      await store.cancel(record.request_id);
      // A cancellation racing a report is protected by the store's atomic transition guard.
      await expect(store.transition(record.request_id, beforeCancel.status, { message: beforeCancel.message }))
        .rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      expect((await store.get(record.request_id))?.status).toBe('cancelled');
    } finally {
      if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('ngini-delivery-status-')) {
        throw new Error('Refusing cleanup outside the dedicated test directory');
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
});
