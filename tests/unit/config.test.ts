import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getConfig } from '../../src/shared/config.js';

let previousVisibleBrowser: string | undefined;
beforeEach(() => { previousVisibleBrowser = process.env.NGINI_VISIBLE_BROWSER; });
afterEach(() => {
  if (previousVisibleBrowser === undefined) delete process.env.NGINI_VISIBLE_BROWSER;
  else process.env.NGINI_VISIBLE_BROWSER = previousVisibleBrowser;
});

describe('local browser visibility configuration; no browser/network activity', () => {
  it('defaults to background execution when the visible-browser option is absent', () => {
    delete process.env.NGINI_VISIBLE_BROWSER;
    expect(getConfig().browserHeadless).toBe(true);
  });

  it.each(['1', 'true'])('uses a visible browser only for the explicit option %s', value => {
    process.env.NGINI_VISIBLE_BROWSER = value;
    expect(getConfig().browserHeadless).toBe(false);
  });

  it.each(['', '0', 'false', 'TRUE', 'True', ' true ', 'yes'])('does not interpret %j as a visible-browser opt-in', value => {
    process.env.NGINI_VISIBLE_BROWSER = value;
    expect(getConfig().browserHeadless).toBe(true);
  });
});
