import { setTimeout as delay } from 'node:timers/promises';
import { getUiCapability, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { BridgeError } from '../shared/errors.js';
import type { RequestRecord } from '../jobs/state-machine.js';
import { deliveryMessageForClient } from './delivery-status.js';

export type DeliveryMode = 'app_poll' | 'model_poll';

/** This is advertised protocol support, not evidence that an App was rendered or a file saved. */
export function deliveryCapabilitySummary(capabilities: Parameters<typeof getUiCapability>[0]): {
  ui_advertised: boolean; mime_supported: boolean; delivery_mode: DeliveryMode;
} {
  const ui = getUiCapability(capabilities);
  const mimeSupported = Array.isArray(ui?.mimeTypes) && ui.mimeTypes.includes(RESOURCE_MIME_TYPE);
  return { ui_advertised: Boolean(ui), mime_supported: mimeSupported,
    delivery_mode: mimeSupported ? 'app_poll' : 'model_poll' };
}

/** Use the SDK's advertised extension capability, never a guessed result _meta override. */
export function deliveryModeForCapabilities(capabilities: Parameters<typeof getUiCapability>[0]): DeliveryMode {
  return deliveryCapabilitySummary(capabilities).delivery_mode;
}

const pendingStatuses = new Set(['received', 'opening_page', 'ready_to_submit', 'submitting',
  'waiting_for_image', 'downloading', 'validating']);

/** Tool results describe this task; behavior belongs in initialization and tool descriptions. */
export function requestResultFacts(record: RequestRecord,
  capabilities: ReturnType<typeof deliveryCapabilitySummary>) {
  return {
    request_id: record.request_id,
    status: record.status,
    delivery_capabilities: capabilities,
    delivery_mode: capabilities.delivery_mode,
    message: deliveryMessageForClient(record) ??
      (record.status === 'received' ? '正在準備生成。' : '正在處理原任務。'),
    quota: record.quota,
    source: record.source ?? 'unknown',
    ...(record.provider_image_count !== undefined ? { provider_image_count: record.provider_image_count } : {}),
    ...(record.error ? { error: record.error } : {}),
  };
}

/** Wait on the original durable task only. This function cannot start or submit a job. */
export async function waitForClientResult(initial: RequestRecord,
  read: () => Promise<RequestRecord | undefined>, signal: AbortSignal): Promise<RequestRecord> {
  let record = initial;
  const deadline = Date.now() + 8000;
  while (!signal.aborted && !record.image && pendingStatuses.has(record.status) && Date.now() < deadline) {
    try { await delay(Math.min(250, deadline - Date.now()), undefined, { signal }); }
    catch (error) { if (signal.aborted) break; throw error; }
    if (signal.aborted) break;
    const next = await read();
    if (next && next.request_id !== initial.request_id) {
      throw new BridgeError('STORAGE_ERROR', '原任務識別碼不一致；沒有重新生成。');
    }
    record = next ?? record;
  }
  return record;
}
