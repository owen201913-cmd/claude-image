import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserSession } from '../../src/browser/session.js';

const directories: string[] = [];
const sessions: BrowserSession[] = [];
async function fixture(headless?: boolean, channel?: 'msedge' | 'chrome') {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'ngini-session-unit-'));
  directories.push(dataDir);
  const session = new BrowserSession({ dataDir, headless, channel });
  sessions.push(session);
  return { dataDir, session };
}
function contextFixture() {
  const page = { isClosed: () => false } as Page;
  const context = { pages: () => [page], newPage: vi.fn(async () => page),
    setDefaultTimeout: vi.fn(), setDefaultNavigationTimeout: vi.fn(),
    browser: () => ({ version: () => 'offline mocked browser' }), close: vi.fn(async () => {}) } as unknown as BrowserContext;
  return { page, context };
}
afterEach(async () => {
  await Promise.all(sessions.splice(0).map(session => session.close()));
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('ngini-session-unit-')) {
      throw new Error('Refusing cleanup outside the dedicated test directory');
    }
    await rm(directory, { recursive: true, force: true });
  }
});

describe('dedicated browser session visibility and profile invariants', () => {
  it('defaults to one background context while retaining the dedicated profile and sandbox', async () => {
    const { dataDir, session } = await fixture();
    const { page, context } = contextFixture();
    const launch = vi.spyOn(chromium, 'launchPersistentContext').mockResolvedValue(context);
    expect(await Promise.all([session.page(), session.page()])).toEqual([page, page]);
    expect(await session.page()).toBe(page);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledWith(path.join(dataDir, 'browser-profile'), expect.objectContaining({
      channel: 'msedge', headless: true, chromiumSandbox: true, acceptDownloads: true,
    }));
    expect(session.headless).toBe(true);
    expect(await readdir(dataDir)).toContain('.browser-session.lock');
    await session.close();
    expect(await readdir(dataDir)).not.toContain('.browser-session.lock');
  });

  it('opens a visible context only when explicitly configured', async () => {
    const { dataDir, session } = await fixture(false, 'chrome');
    const { context } = contextFixture();
    const launch = vi.spyOn(chromium, 'launchPersistentContext').mockResolvedValue(context);
    await session.page();
    expect(launch).toHaveBeenCalledWith(path.join(dataDir, 'browser-profile'), expect.objectContaining({
      channel: 'chrome', headless: false, chromiumSandbox: true,
    }));
    expect(launch).toHaveBeenCalledTimes(1);
    expect(session.headless).toBe(false);
  });

  it('keeps the same profile and background mode across channel fallback', async () => {
    const { dataDir, session } = await fixture();
    const { context } = contextFixture();
    const launch = vi.spyOn(chromium, 'launchPersistentContext').mockRejectedValueOnce(new Error('offline Edge unavailable'))
      .mockResolvedValueOnce(context);
    await session.page();
    expect(launch).toHaveBeenCalledTimes(2);
    expect(launch.mock.calls.map(([profile, options]) => [profile, options?.channel, options?.headless]))
      .toEqual([[path.join(dataDir, 'browser-profile'), 'msedge', true], [path.join(dataDir, 'browser-profile'), 'chrome', true]]);
    expect(session.launchDiagnostics).toEqual({ headless: true,
      failures: [{ channel: 'msedge', phase: 'launch', category: 'unknown' }] });
  });

  it('never silently switches to a visible browser on background launch failure and releases its lock', async () => {
    const { dataDir, session } = await fixture();
    const launch = vi.spyOn(chromium, 'launchPersistentContext')
      .mockRejectedValueOnce(new Error("Chromium distribution 'msedge' is not found at C:\\private\\edge.exe"))
      .mockRejectedValueOnce(Object.assign(new Error('private Chrome launch trace'), { name: 'TimeoutError' }));
    await expect(session.page()).rejects.toMatchObject({ code: 'BROWSER_UNAVAILABLE',
      details: { browser_startup: { headless: true, failures: [
        { channel: 'msedge', phase: 'launch', category: 'not_installed' },
        { channel: 'chrome', phase: 'launch', category: 'timeout' },
      ] } } });
    expect(launch).toHaveBeenCalledTimes(2);
    expect(launch.mock.calls.every(([, options]) => options?.headless === true)).toBe(true);
    expect(await readdir(dataDir)).not.toContain('.browser-session.lock');
  });

  it.each([
    ['not_installed', new Error("Chromium distribution 'msedge' is not found at C:\\private\\browser.exe")],
    ['permission_denied', Object.assign(new Error('private process path'), { code: 'EACCES' })],
    ['timeout', Object.assign(new Error('private launch trace'), { name: 'TimeoutError' })],
    ['profile_in_use', new Error('Failed to create a ProcessSingleton for your profile directory. C:\\private')],
    ['sandbox_blocked', new Error('No usable sandbox! private launch arguments')],
    ['browser_closed', new Error('Target page, context or browser has been closed\nprivate browser log')],
    ['unknown', new Error('unrecognized private browser failure')],
    ['unknown', { message: 'not an Error; private arbitrary details', cause: 'private cookie' }],
  ])('reports only the allowlisted %s category for one selected channel', async (category, error) => {
    const { dataDir, session } = await fixture(undefined, 'msedge');
    const launch = vi.spyOn(chromium, 'launchPersistentContext').mockRejectedValue(error);
    await expect(session.page()).rejects.toMatchObject({ code: 'BROWSER_UNAVAILABLE',
      details: { browser_startup: { headless: true,
        failures: [{ channel: 'msedge', phase: 'launch', category }] } } });
    expect(launch).toHaveBeenCalledTimes(1);
    expect(await readdir(dataDir)).not.toContain('.browser-session.lock');
  });

  it('never exposes raw error fields and returns independent, bounded diagnostic snapshots', async () => {
    const { session } = await fixture();
    const secret = 'private-profile-cookie-prompt-command-token';
    const raw = Object.assign(new Error(`${secret} --user-data-dir=C:\\private\\profile`), {
      code: 'EPERM', cause: new Error(secret), name: secret, stack: secret, cookies: secret,
    });
    const launch = vi.spyOn(chromium, 'launchPersistentContext').mockRejectedValue(raw);
    const failure = await session.page().catch(error => error);
    expect(failure.code).toBe('BROWSER_UNAVAILABLE');
    expect(failure.cause).toBeUndefined();
    expect(`${JSON.stringify(failure)}\n${failure.stack}`).not.toContain(secret);
    const snapshot = session.launchDiagnostics;
    snapshot.failures[0]!.channel = 'chrome';
    snapshot.failures.push({ channel: 'chrome', phase: 'cleanup', category: 'unknown' });
    expect(session.launchDiagnostics.failures).toEqual([
      { channel: 'msedge', phase: 'launch', category: 'permission_denied' },
      { channel: 'chrome', phase: 'launch', category: 'permission_denied' },
    ]);
    const originalDetails = structuredClone(failure.details);
    const { context } = contextFixture();
    launch.mockResolvedValue(context);
    await session.page(); // An explicit new acquisition, never a hidden launch retry.
    expect(launch).toHaveBeenCalledTimes(3);
    expect(session.launchDiagnostics).toEqual({ headless: true, failures: [] });
    expect(failure.details).toEqual(originalDetails);
  });

  it('does not allow another session to race the same persistent profile', async () => {
    const { dataDir, session } = await fixture();
    const { context } = contextFixture();
    const launch = vi.spyOn(chromium, 'launchPersistentContext').mockResolvedValue(context);
    await session.page();
    const competitor = new BrowserSession({ dataDir }); sessions.push(competitor);
    await expect(competitor.page()).rejects.toMatchObject({ code: 'BUSY' });
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('keeps existing dedicated profile files when a session closes or is explicitly reopened visible', async () => {
    const { dataDir, session } = await fixture();
    await mkdir(session.profileDir, { recursive: true });
    const sentinel = path.join(session.profileDir, 'offline-profile-marker');
    await writeFile(sentinel, 'do not clear normal browser state');
    const { context } = contextFixture();
    const launch = vi.spyOn(chromium, 'launchPersistentContext').mockResolvedValue(context);
    await session.page(); await session.close();
    const visible = new BrowserSession({ dataDir, headless: false }); sessions.push(visible);
    await visible.page();
    expect(launch.mock.calls.map(([profile]) => profile)).toEqual([session.profileDir, session.profileDir]);
    expect(await readFile(sentinel, 'utf8')).toBe('do not clear normal browser state');
  });

  it('waits for an in-flight launch on close, rejects new page calls, and releases the same profile lock', async () => {
    const { dataDir, session } = await fixture();
    const { context } = contextFixture();
    let resolveLaunch!: (context: BrowserContext) => void;
    const launch = vi.spyOn(chromium, 'launchPersistentContext')
      .mockImplementation(() => new Promise(resolve => { resolveLaunch = resolve; }));
    const opening = session.page();
    const rejected = expect(opening).rejects.toMatchObject({ code: 'CANCELLED' });
    await vi.waitFor(() => expect(launch).toHaveBeenCalledTimes(1));
    const closing = session.close();
    await expect(session.page()).rejects.toMatchObject({ code: 'CANCELLED' });
    resolveLaunch(context);
    await rejected; await closing;
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(session.launchDiagnostics.failures).toEqual([
      { channel: 'msedge', phase: 'configure', category: 'cancelled' },
    ]);
    expect(await readdir(dataDir)).not.toContain('.browser-session.lock');
    expect(session.versionInfo).toEqual({ channel: null, version: null });
  });

  it('waits for in-flight page creation and never races another page against close', async () => {
    const { dataDir, session } = await fixture();
    const { page, context } = contextFixture();
    vi.spyOn(chromium, 'launchPersistentContext').mockResolvedValue(context);
    await session.page();
    vi.spyOn(context, 'pages').mockReturnValue([]);
    let resolvePage!: (page: Page) => void;
    vi.mocked(context.newPage).mockImplementation(() => new Promise(resolve => { resolvePage = resolve; }));
    const first = session.page(); const second = session.page();
    const rejectedFirst = expect(first).rejects.toMatchObject({ code: 'CANCELLED' });
    const rejectedSecond = expect(second).rejects.toMatchObject({ code: 'CANCELLED' });
    const closing = session.close();
    resolvePage(page);
    await rejectedFirst; await rejectedSecond; await closing;
    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(await readdir(dataDir)).not.toContain('.browser-session.lock');
  });

  it('closes a partially launched context before attempting the same-profile fallback', async () => {
    const { session } = await fixture();
    const failed = contextFixture(); const next = contextFixture();
    vi.spyOn(failed.context, 'pages').mockReturnValue([]);
    vi.mocked(failed.context.newPage).mockRejectedValue(new Error('offline page creation failure'));
    const launch = vi.spyOn(chromium, 'launchPersistentContext').mockResolvedValueOnce(failed.context)
      .mockImplementationOnce(async () => {
        expect(failed.context.close).toHaveBeenCalledTimes(1);
        return next.context;
      });
    expect(await session.page()).toBe(next.page);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(launch.mock.calls[0]?.[0]).toBe(launch.mock.calls[1]?.[0]);
    expect(session.launchDiagnostics.failures).toEqual([
      { channel: 'msedge', phase: 'create_page', category: 'unknown' },
    ]);
    await session.close();
    expect(next.context.close).toHaveBeenCalledTimes(1);
  });

  it('does not fall back or release the profile lock if partial context shutdown is uncertain', async () => {
    const { dataDir, session } = await fixture();
    const { context } = contextFixture();
    vi.spyOn(context, 'pages').mockReturnValue([]);
    vi.mocked(context.newPage).mockRejectedValue(new Error('offline page creation failure'));
    vi.mocked(context.close).mockRejectedValueOnce(new Error('offline close failure')).mockResolvedValueOnce();
    const launch = vi.spyOn(chromium, 'launchPersistentContext').mockResolvedValue(context);
    await expect(session.page()).rejects.toMatchObject({ code: 'BROWSER_UNAVAILABLE',
      details: { browser_startup: { failures: [
        { channel: 'msedge', phase: 'create_page', category: 'unknown' },
        { channel: 'msedge', phase: 'cleanup', category: 'unknown' },
      ] } } });
    expect(launch).toHaveBeenCalledTimes(1);
    expect(await readdir(dataDir)).toContain('.browser-session.lock');
    const competitor = new BrowserSession({ dataDir }); sessions.push(competitor);
    await expect(competitor.page()).rejects.toMatchObject({ code: 'BUSY' });
    await session.close();
    expect(context.close).toHaveBeenCalledTimes(2);
    expect(await readdir(dataDir)).not.toContain('.browser-session.lock');
  });

  it('records configuration failure before cleaning up and considering the next channel', async () => {
    const { session } = await fixture();
    const failed = contextFixture(); const next = contextFixture();
    vi.mocked(failed.context.setDefaultTimeout).mockImplementation(() => {
      throw Object.assign(new Error('private configuration trace'), { name: 'TargetClosedError' });
    });
    const launch = vi.spyOn(chromium, 'launchPersistentContext').mockResolvedValueOnce(failed.context)
      .mockImplementationOnce(async () => {
        expect(failed.context.close).toHaveBeenCalledTimes(1);
        return next.context;
      });
    expect(await session.page()).toBe(next.page);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(session.launchDiagnostics.failures).toEqual([
      { channel: 'msedge', phase: 'configure', category: 'browser_closed' },
    ]);
  });
});
