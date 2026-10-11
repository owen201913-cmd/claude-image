import { readFile } from 'node:fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { VERSION } from '../shared/config.js';

/** A new release must not reuse a host-cached App document from an older release. */
export function imageCardResourceUri(version: string): string {
  return `ui://ngini-image-bridge/${encodeURIComponent(version)}/image-card.html`;
}
export const IMAGE_CARD_URI = imageCardResourceUri(VERSION);
type ToolUiMetadata = { ui: { resourceUri: string; visibility: Array<'model' | 'app'> } };
export const imageToolMeta: ToolUiMetadata = { ui: { resourceUri: IMAGE_CARD_URI, visibility: ['model', 'app'] } };
export const appOnlyToolMeta: ToolUiMetadata = { ui: { resourceUri: IMAGE_CARD_URI, visibility: ['app'] } };

export function registerImageCardResource(server: McpServer): void {
  registerAppResource(server, 'Ngini image card', IMAGE_CARD_URI, {
    description: 'Preview a bridge image and ask the host to download the unchanged original.',
  }, async () => ({ contents: [{
    uri: IMAGE_CARD_URI,
    mimeType: RESOURCE_MIME_TYPE,
    text: await readFile(new URL('./image-card.html', import.meta.url), 'utf8'),
    // No external origins or iframe permissions. The spec default permits inline JS/CSS and data images.
    _meta: { ui: { prefersBorder: false } },
  }] }));
}
