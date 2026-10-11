import { describe, expect, it, vi } from 'vitest';
import { bootstrapServer } from '../../src/shared/platform-guard.js';

describe('native platform bootstrap', () => {
  it('loads the server once on Windows x64 without writing protocol or diagnostic text', async () => {
    const loadServer = vi.fn().mockResolvedValue(undefined);
    const writeStderr = vi.fn();
    expect(await bootstrapServer({platform:'win32',architecture:'x64',loadServer,writeStderr})).toBe(0);
    expect(loadServer).toHaveBeenCalledExactlyOnceWith();
    expect(writeStderr).not.toHaveBeenCalled();
  });

  it.each([
    ['darwin','x64','UNSUPPORTED_PLATFORM'],
    ['linux','x64','UNSUPPORTED_PLATFORM'],
    ['win32','arm64','UNSUPPORTED_ARCHITECTURE'],
    ['win32','ia32','UNSUPPORTED_ARCHITECTURE'],
  ])('rejects %s/%s before any native server import', async (platform, architecture, code) => {
    const loadServer = vi.fn().mockRejectedValue(new Error('Must never reach native imports'));
    const writeStderr = vi.fn();
    expect(await bootstrapServer({platform,architecture,loadServer,writeStderr})).toBe(1);
    expect(loadServer).not.toHaveBeenCalled();
    expect(writeStderr).toHaveBeenCalledTimes(1);
    const text = writeStderr.mock.calls[0][0] as string;
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toMatchObject({event:'startup_failed',code});
    expect(text).toContain('Windows');
  });

  it('keeps unexpected import errors and private paths out of startup diagnostics', async () => {
    const writeStderr = vi.fn();
    expect(await bootstrapServer({platform:'win32',architecture:'x64',
      loadServer: async () => { throw new Error('C:/private-user/profile/secret-token'); },writeStderr})).toBe(1);
    const text = writeStderr.mock.calls[0][0] as string;
    expect(JSON.parse(text)).toMatchObject({event:'startup_failed',code:'STARTUP_FAILED'});
    expect(text).not.toContain('private-user');
    expect(text).not.toContain('secret-token');
  });
});
