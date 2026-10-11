import { BridgeError, type ErrorInfo } from '../shared/errors.js';
import type { BrowserCheckpoint } from '../browser/result-tracker.js';

export const JOB_STATUSES = [
  'received', 'opening_page', 'ready_to_submit', 'submitting',
  'waiting_for_image', 'downloading', 'validating', 'image_ready',
  'presenting', 'delivered', 'failed', 'cancelled',
] as const;
export type JobStatus = typeof JOB_STATUSES[number];

export interface QuotaInfo {
  availability: 'unknown' | 'available' | 'exhausted';
  remaining: number | null;
  observed_at: string | null;
  source: 'not_observed' | 'page';
}

export const UNKNOWN_QUOTA: QuotaInfo = {
  availability: 'unknown', remaining: null, observed_at: null, source: 'not_observed',
};

export interface JobImage {
  image_id: string;
  filename: string;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

export interface DeliveryEvidence {
  preview_visible: boolean;
  original_download_verified: boolean;
  downloaded_sha256?: string;
  host?: string;
  verified_at?: string;
}

export interface RequestRecord {
  schema_version: 1;
  request_id: string;
  prompt_sha256: string;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  owner_pid: number;
  submission_started_at?: string;
  submitted_at?: string;
  interrupted_phase?: JobStatus;
  message?: string;
  error?: ErrorInfo;
  image?: JobImage;
  /** Persisted provenance; old records without it must be presented as unknown. */
  source?: 'fixture' | 'ngini';
  browser_checkpoint?: BrowserCheckpoint;
  provider_image_count?: number;
  recovery_error?: ErrorInfo;
  quota: QuotaInfo;
  delivery?: DeliveryEvidence;
}

const normalTransitions: Partial<Record<JobStatus, readonly JobStatus[]>> = {
  received: ['opening_page'],
  opening_page: ['ready_to_submit'],
  ready_to_submit: ['submitting'],
  submitting: ['waiting_for_image'],
  waiting_for_image: ['downloading'],
  downloading: ['validating'],
  validating: ['image_ready'],
  image_ready: ['presenting'],
  presenting: ['image_ready', 'delivered'],
};

/** Only a known, never-submitted human pause may return to preparation. */
export function isPreSubmissionHuman(record: RequestRecord): boolean {
  return record.status === 'failed' && record.source === 'ngini'
    && record.error?.code === 'HUMAN_VERIFICATION_REQUIRED' && !record.image
    && record.submission_started_at === undefined && record.submitted_at === undefined
    && record.browser_checkpoint?.submission_started_at === undefined;
}

/** Submitted recovery can only read an existing result, never return to submission. */
export function assertTransition(record: RequestRecord, next: JobStatus): void {
  if (record.status === next) return;
  if (record.status === 'delivered' || record.status === 'cancelled') {
    throw new BridgeError('INVALID_TRANSITION', '已結束的任務不能再次生成。');
  }
  if (next === 'failed' || next === 'cancelled') return;
  if (record.status === 'failed') {
    if (next === 'opening_page' && isPreSubmissionHuman(record)) return;
    const recoverable = record.submission_started_at !== undefined || record.image !== undefined;
    const recoveryPhases: JobStatus[] = ['waiting_for_image', 'downloading', 'validating', 'image_ready', 'presenting'];
    if (recoverable && recoveryPhases.includes(next)) return;
  }
  if (normalTransitions[record.status]?.includes(next)) return;
  throw new BridgeError('INVALID_TRANSITION', `不允許任務階段從 ${record.status} 移至 ${next}。`);
}

export function isBlockingRequest(record: RequestRecord): boolean {
  if (['received', 'opening_page', 'ready_to_submit', 'submitting', 'waiting_for_image', 'downloading', 'validating'].includes(record.status)) {
    return true;
  }
  return record.status === 'failed' && ['SUBMISSION_UNKNOWN', 'GENERATION_TIMEOUT', 'HUMAN_VERIFICATION_REQUIRED'].includes(record.error?.code ?? '');
}

/** A backend image alone never proves that the person received the original. */
export function assertDelivery(record: RequestRecord, evidence: DeliveryEvidence | undefined): void {
  if (!record.image || evidence?.preview_visible !== true || evidence.original_download_verified !== true
      || evidence.downloaded_sha256 !== record.image.sha256) {
    throw new BridgeError('DELIVERY_BLOCKED', '圖片已保存，但尚未驗證聊天室預覽及原圖下載。');
  }
}
