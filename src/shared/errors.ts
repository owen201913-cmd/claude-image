export const ERROR_CODES = [
  'INVALID_ARGUMENT', 'PARAMETER_CONFLICT', 'BUSY', 'DUPLICATE_ACTIVE_REQUEST',
  'NOT_FOUND', 'QUOTA_EXHAUSTED', 'RATE_LIMITED', 'HUMAN_VERIFICATION_REQUIRED',
  'LOGIN_OR_PAYMENT_REQUIRED', 'GENERATION_REFUSED', 'PROVIDER_TEXT_ONLY',
  'UI_CHANGED', 'SUBMISSION_UNKNOWN', 'GENERATION_TIMEOUT', 'DOWNLOAD_FAILED',
  'INVALID_IMAGE', 'DELIVERY_BLOCKED', 'CANCELLED', 'PROCESS_INTERRUPTED',
  'STORAGE_ERROR', 'INVALID_TRANSITION', 'BROWSER_UNAVAILABLE',
] as const;

export type ErrorCode = typeof ERROR_CODES[number];

export interface ErrorInfo {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** Expected failures expose a narrow code and message, never raw provider data. */
export class BridgeError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BridgeError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  toJSON(): ErrorInfo {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}

export function errorInfo(error: unknown, fallback: ErrorCode = 'STORAGE_ERROR'): ErrorInfo {
  if (error instanceof BridgeError) return error.toJSON();
  // Stack traces and browser errors may contain prompt text, paths, or URLs.
  return { code: fallback, message: '本機處理失敗；沒有再次提交生成。' };
}
