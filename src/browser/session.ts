import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { ProfileLock } from '../jobs/profile-lock.js';
import { BridgeError } from '../shared/errors.js';

export interface BrowserSessionOptions {
  dataDir: string;
  operationTimeoutMs?: number;
  channel?: 'msedge' | 'chrome';
  /** Background by default. A visible window requires explicit configuration. */
  headless?: boolean;
}

type BrowserChannel = 'msedge' | 'chrome';
type LaunchPhase = 'launch' | 'configure' | 'create_page' | 'cleanup';
type LaunchErrorCategory = 'not_installed' | 'permission_denied' | 'timeout' | 'profile_in_use'
  | 'sandbox_blocked' | 'browser_closed' | 'cancelled' | 'unknown';

export interface BrowserLaunchDiagnostic {
  channel: BrowserChannel;
  phase: LaunchPhase;
  category: LaunchErrorCategory;
}

/** Inspect errors only to choose an allowlisted hint; never retain their text or cause. */
function launchErrorCategory(error: unknown): LaunchErrorCategory {
  if (!(error instanceof Error)) return 'unknown';
  if (error instanceof BridgeError && error.code === 'CANCELLED') return 'cancelled';
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EACCES' || code === 'EPERM') return 'permission_denied';
  if (error.name === 'TimeoutError') return 'timeout';
  // These signatures come from the pinned Playwright launch/close errors. They
  // are diagnostic hints, not an assertion about an unobserved browser policy.
  const message = error.message;
  if (/Chromium distribution '[^']+' is not found|Executable doesn't exist/.test(message)) return 'not_installed';
  if (/\b(?:EACCES|EPERM)\b|Access is denied/i.test(message)) return 'permission_denied';
  if (/Timeout \d+ms exceeded/.test(message)) return 'timeout';
  if (/ProcessSingleton|user data directory is already in use/i.test(message)) return 'profile_in_use';
  if (/No usable sandbox!/.test(message)) return 'sandbox_blocked';
  if (error.name === 'TargetClosedError' || /Target page, context or browser has been closed/.test(message)) return 'browser_closed';
  return 'unknown';
}

/** Owns one persistent tool profile; never attaches to a daily browser or a debug port. */
export class BrowserSession {
  readonly profileDir: string;
  readonly headless: boolean;
  private context?: BrowserContext;
  private lock?: ProfileLock;
  private opening?: Promise<Page>;
  private closing?: Promise<void>;
  private selectedChannel?: 'msedge' | 'chrome';
  private launchFailures: BrowserLaunchDiagnostic[] = [];

  constructor(private readonly options: BrowserSessionOptions) {
    this.profileDir = path.join(path.resolve(options.dataDir), 'browser-profile');
    this.headless = options.headless ?? true;
  }

  async page(): Promise<Page> {
    if (this.closing) throw new BridgeError('CANCELLED', '專用瀏覽器正在關閉；沒有另開工作階段。');
    // Track newPage as well as launch: close must wait for every acquisition,
    // and concurrent callers must not create two pages in the same profile.
    if (!this.opening) this.opening = this.context ? this.existingPage() : this.launch();
    const opening = this.opening;
    try { return await opening; }
    finally { if (this.opening === opening) this.opening = undefined; }
  }

  private async existingPage(): Promise<Page> {
    const existing = this.context!.pages().find(page => !page.isClosed());
    const page = existing ?? await this.context!.newPage();
    if (this.closing) throw new BridgeError('CANCELLED', '專用瀏覽器正在關閉；沒有另開工作階段。');
    return page;
  }

  private async launch(): Promise<Page> {
    this.launchFailures = [];
    const dataDir = path.resolve(this.options.dataDir);
    await mkdir(dataDir, { recursive: true });
    this.lock = await ProfileLock.acquire(dataDir, { name: '.browser-session.lock' });
    const channels = this.options.channel ? [this.options.channel] : ['msedge', 'chrome'] as const;
    try {
      if (this.closing) throw new BridgeError('CANCELLED', '已停止開啟專用瀏覽器。');
      for (const channel of channels) {
        let candidate: BrowserContext | undefined;
        let phase: LaunchPhase = 'launch';
        try {
          // Each channel fallback preserves the same profile and visibility mode.
          candidate = await chromium.launchPersistentContext(this.profileDir, {
            channel, headless: this.headless, acceptDownloads: true, chromiumSandbox: true,
            timeout: this.options.operationTimeoutMs ?? 30_000,
          });
          this.context = candidate;
          phase = 'configure';
          if (this.closing) throw new BridgeError('CANCELLED', '已停止開啟專用瀏覽器。');
          candidate.setDefaultTimeout(this.options.operationTimeoutMs ?? 30_000);
          candidate.setDefaultNavigationTimeout(this.options.operationTimeoutMs ?? 30_000);
          phase = 'create_page';
          const page = candidate.pages()[0] ?? await candidate.newPage();
          if (this.closing) throw new BridgeError('CANCELLED', '已停止開啟專用瀏覽器。');
          this.selectedChannel = channel;
          return page;
        } catch (error) {
          this.recordLaunchFailure(channel, phase, error);
          if (candidate) {
            try { await candidate.close(); this.context = undefined; }
            catch (cleanupError) {
              this.recordLaunchFailure(channel, 'cleanup', cleanupError);
              // Retain context and lock when shutdown cannot be confirmed. A
              // second channel must never race a possibly live first browser.
              throw new BridgeError('BROWSER_UNAVAILABLE', '無法確認專用瀏覽器已關閉；沒有啟動第二個工作階段。',
                { browser_startup: this.launchDiagnostics });
            }
          }
          if (this.closing) throw new BridgeError('CANCELLED', '已停止開啟專用瀏覽器。');
          // Branded browsers need a one-time installation if both normal channels are absent.
        }
      }
      throw new BridgeError('BROWSER_UNAVAILABLE', this.headless
        ? '無法以背景模式啟動 Edge／Chrome；請確認瀏覽器安裝及執行權限。沒有切換成可見視窗。'
        : '無法啟動 Edge／Chrome；請確認瀏覽器安裝及執行權限。',
        { browser_startup: this.launchDiagnostics });
    } catch (error) {
      if (!this.context) { await this.lock.release(); this.lock = undefined; }
      throw error;
    }
  }

  private recordLaunchFailure(channel: BrowserChannel, phase: LaunchPhase, error: unknown): void {
    // At most two channels and their cleanup failures. Never accumulate retries
    // across launches or retain Playwright errors with commands/profile paths.
    if (this.launchFailures.length < 4) this.launchFailures.push({ channel, phase, category: launchErrorCategory(error) });
  }

  get launchDiagnostics(): { headless: boolean; failures: BrowserLaunchDiagnostic[] } {
    return { headless: this.headless, failures: this.launchFailures.map(failure => ({ ...failure })) };
  }

  get versionInfo(): { channel: string | null; version: string | null } {
    return { channel: this.selectedChannel ?? null, version: this.context?.browser()?.version() ?? null };
  }

  async close(): Promise<void> {
    if (!this.closing) {
      const opening = this.opening;
      // Start on the next microtask so launch sees closing before publishing a
      // page, including when close was called before the profile lock existed.
      this.closing = Promise.resolve().then(async () => {
        await opening?.catch(() => undefined);
        await this.context?.close();
        this.context = undefined;
        this.selectedChannel = undefined;
        await this.lock?.release(); this.lock = undefined;
      });
    }
    const closing = this.closing;
    try { await closing; }
    finally { if (this.closing === closing) this.closing = undefined; }
  }
}
