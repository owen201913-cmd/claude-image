import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';
import { BrowserSession } from '../../src/browser/session.js';

describe.skipIf(process.env.NGINI_SESSION_BROWSER_TEST !== '1')('production background session through a DNS-blocked local fixture', () => {
  it('launches actual headless Edge, retains one dedicated profile across restart, and never visits Ngini', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'ngini-session-headless-'));
    const actualLaunch = chromium.launchPersistentContext.bind(chromium);
    let launchError: unknown;
    const launch = vi.spyOn(chromium, 'launchPersistentContext').mockImplementation(async (profile, options) => {
      try { return await actualLaunch(profile, { ...options, serviceWorkers: 'block', args: ['--host-resolver-rules=MAP * ~NOTFOUND'] }); }
      catch (error) { launchError = error; throw error; }
    });
    const sessions = [new BrowserSession({ dataDir, channel: 'msedge', operationTimeoutMs: 5000 }), new BrowserSession({ dataDir, channel: 'msedge', operationTimeoutMs: 5000 })];
    const requests: string[] = [];
    const fixtureUrl = 'https://ngini-session-fixture.invalid/';
    let stage = 'setup';
    let failure: Error | undefined;
    try {
      for (let index = 0; index < sessions.length; index++) {
        const session = sessions[index]!;
        stage = `launch-${index}`;
        const page = await session.page();
        await page.context().route('**/*', async route => {
          const url = route.request().url(); requests.push(url);
          if (url === fixtureUrl) await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Offline session only</title><p>Local fixture</p>' });
          else await route.abort('blockedbyclient');
        });
        stage = `navigate-${index}`;
        await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
        expect(await page.title()).toBe('Offline session only');
        expect(session.headless).toBe(true);
        expect(await page.evaluate(() => navigator.userAgent)).toContain('HeadlessChrome');
        if (index === 0) await page.evaluate(() => localStorage.setItem('offline-fixture-state', 'retained'));
        else expect(await page.evaluate(() => localStorage.getItem('offline-fixture-state'))).toBe('retained');
        expect(session.versionInfo.channel).toBe('msedge');
        expect(session.versionInfo.version).toMatch(/^\d+\./);
        stage = `close-${index}`;
        await session.close();
      }
      expect(launch).toHaveBeenCalledTimes(2);
      expect(launch.mock.calls.map(([profile, options]) => [profile, options?.headless, options?.chromiumSandbox]))
        .toEqual([[sessions[0]!.profileDir, true, true], [sessions[0]!.profileDir, true, true]]);
      expect(requests.filter(url => url === fixtureUrl)).toHaveLength(2);
      expect(requests.every(url => url.startsWith(fixtureUrl))).toBe(true);
    } catch (error) {
      failure = new Error(`Offline headless smoke failed at ${stage}`, { cause: launchError ?? error });
      throw failure;
    } finally {
      await Promise.all(sessions.map(session => session.close()));
      launch.mockRestore();
      if (path.dirname(path.resolve(dataDir)) !== path.resolve(tmpdir()) || !path.basename(dataDir).startsWith('ngini-session-headless-')) {
        throw new Error('Refusing cleanup outside the dedicated offline profile');
      }
      try { await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch (error) { if (!failure) throw error; } // Preserve the launch diagnostic if Windows still holds its temporary lockfile.
    }
  }, 30_000);
});
