import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { VERSION } from '../../src/shared/config.js';

const mocks = vi.hoisted(() => ({ register: vi.fn(), readFile: vi.fn() }));
vi.mock('@modelcontextprotocol/ext-apps/server', () => ({
  registerAppResource: mocks.register, RESOURCE_MIME_TYPE: 'text/html;profile=mcp-app',
}));
vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }));
import { IMAGE_CARD_URI, imageCardResourceUri, imageToolMeta, appOnlyToolMeta, registerImageCardResource } from '../../src/ui/image-card.js';

beforeEach(() => {
  mocks.register.mockReset(); mocks.readFile.mockReset();
  // This tests resource registration, not the compiled App. Protocol smoke reads the actual bundled HTML.
  mocks.readFile.mockResolvedValue('UNIT RESOURCE CALLBACK FIXTURE');
});

describe('versioned MCP App resource identity', () => {
  it('derives one URI from the server release and distinguishes future releases', () => {
    expect(IMAGE_CARD_URI).toBe(`ui://ngini-image-bridge/${encodeURIComponent(VERSION)}/image-card.html`);
    expect(imageCardResourceUri('0.1.0-dev.7')).not.toBe(imageCardResourceUri('0.1.0-dev.8'));
    expect(imageCardResourceUri('version/segment')).toBe('ui://ngini-image-bridge/version%2Fsegment/image-card.html');
    expect(IMAGE_CARD_URI).not.toBe('ui://ngini-image-bridge/image-card.html');
  });
  it('shares the same resource between model-visible and app-only tools', () => {
    expect(imageToolMeta.ui.resourceUri).toBe(IMAGE_CARD_URI);
    expect(appOnlyToolMeta.ui.resourceUri).toBe(IMAGE_CARD_URI);
    expect(imageToolMeta.ui.visibility).toEqual(['model', 'app']);
    expect(appOnlyToolMeta.ui.visibility).toEqual(['app']);
  });
  it('registers and returns exactly the same versioned URI without changing the local bundled file', async () => {
    const server = {} as McpServer;
    registerImageCardResource(server);
    expect(mocks.register).toHaveBeenCalledTimes(1);
    const [registeredServer, , registeredUri, , readResource] = mocks.register.mock.calls[0];
    expect(registeredServer).toBe(server);
    expect(registeredUri).toBe(IMAGE_CARD_URI);
    const response = await readResource();
    expect(response.contents[0]).toMatchObject({ uri: IMAGE_CARD_URI, mimeType: 'text/html;profile=mcp-app' });
    expect(response.contents[0]._meta.ui.prefersBorder).toBe(false);
    expect(mocks.readFile.mock.calls[0][0]).toBeInstanceOf(URL);
    expect(mocks.readFile.mock.calls[0][0].pathname.endsWith('/ui/image-card.html')).toBe(true);
  });
});
