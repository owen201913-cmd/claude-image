import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';
import { BridgeError } from '../../src/shared/errors.js';
import { guardedTool, registerModelTools } from '../../src/shared/model-tools.js';

const connections: { client: Client; server: McpServer }[] = [];
afterEach(async () => {
  await Promise.allSettled(connections.splice(0).flatMap(({ client, server }) => [client.close(), server.close()]));
});

function result(status: string): CallToolResult {
  return { content: [{ type: 'text', text: status }], structuredContent: { request_id: 'same-request', status } };
}

async function setup(status = vi.fn(async (_id: string, _signal: AbortSignal) => result('waiting_for_image')),
  cancel = vi.fn(async (_id: string) => result('cancelled'))) {
  const server = new McpServer({ name: 'local-model-query-test', version: '0.0.0' });
  registerModelTools(server, z.string().regex(/^[A-Za-z0-9._-]+$/), { status, cancel });
  const client = new Client({ name: 'local-test-client', version: '0.0.0' });
  connections.push({ client, server });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, status, cancel };
}

describe('plain model polling and cancellation; in-memory MCP only', () => {
  it('registers status and cancellation without App metadata and permits only request IDs', async () => {
    const { client, status, cancel } = await setup();
    const listed = await client.listTools();
    expect(listed.tools.map(tool => tool.name)).toEqual(['ngini_get_status', 'ngini_cancel_generation']);
    for (const tool of listed.tools) {
      expect(tool._meta).toBeUndefined();
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(Object.keys(tool.inputSchema.properties ?? {})).toEqual(['request_id']);
    }
    const invalid = await client.callTool({ name: 'ngini_get_status', arguments: { request_id: 'same-request', prompt: 'private body' } });
    expect(invalid.isError).toBe(true);
    expect(status).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('polls the same existing task without adding an App resource, then returns a model preview', async () => {
    const ready: CallToolResult = { content: [{ type: 'image', mimeType: 'image/png',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' }],
      structuredContent: { request_id: 'same-request', status: 'image_ready' } };
    const status = vi.fn(async (_id: string, _signal: AbortSignal) => result('waiting_for_image'))
      .mockResolvedValueOnce(result('waiting_for_image')).mockResolvedValueOnce(ready);
    const { client, cancel } = await setup(status);
    const first = await client.callTool({ name: 'ngini_get_status', arguments: { request_id: 'same-request' } });
    const second = await client.callTool({ name: 'ngini_get_status', arguments: { request_id: 'same-request' } });
    expect(first.structuredContent).toMatchObject({ status: 'waiting_for_image' });
    expect(second.structuredContent).toMatchObject({ status: 'image_ready' });
    expect(second.content).toEqual(ready.content);
    expect(status.mock.calls.map(([id]) => id)).toEqual(['same-request', 'same-request']);
    expect(status.mock.calls.every(([, signal]) => signal instanceof AbortSignal)).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
    expect((await client.listTools()).tools.every(tool => tool._meta === undefined)).toBe(true);
  });

  it('cancels through a plain tool without polling or registering a picture resource', async () => {
    const { client, status, cancel } = await setup();
    const reply = await client.callTool({ name: 'ngini_cancel_generation', arguments: { request_id: 'same-request' } });
    expect(reply.structuredContent).toMatchObject({ status: 'cancelled' });
    expect(cancel).toHaveBeenCalledExactlyOnceWith('same-request');
    expect(status).not.toHaveBeenCalled();
  });
});

describe('caught query failures are not persisted terminal job failures', () => {
  it('preserves a real failed job result without the temporary query marker', async () => {
    const failure: CallToolResult = { ...result('failed'), isError: true,
      structuredContent: { request_id: 'same-request', status: 'failed', error: { code: 'SUBMISSION_UNKNOWN' } } };
    expect(await guardedTool(async () => failure, 'same-request')).toBe(failure);
    expect(failure.structuredContent).not.toHaveProperty('query_error');
  });

  it('marks a caught query exception identically in text and structured JSON, retaining the caller ID', async () => {
    const reply = await guardedTool(async () => { throw new BridgeError('NOT_FOUND', '找不到這個任務。'); }, 'same-request');
    expect(reply.isError).toBe(true);
    expect(reply.structuredContent).toMatchObject({ request_id: 'same-request', query_error: true,
      status: 'failed', error: { code: 'NOT_FOUND' } });
    const text = reply.content[0];
    expect(text.type).toBe('text');
    if (text.type !== 'text') throw new Error('Missing error JSON');
    expect(JSON.parse(text.text)).toEqual(reply.structuredContent);
  });

  it('does not expose a raw filesystem path, prompt or stack when a query throws unexpectedly', async () => {
    const privateValue = 'PRIVATE PROMPT C:/Users/private-owner/browser-profile/cookies';
    const reply = await guardedTool(async () => { throw new Error(privateValue); }, 'same-request');
    expect(reply.structuredContent).toMatchObject({ request_id: 'same-request', query_error: true,
      error: { code: 'STORAGE_ERROR' } });
    expect(JSON.stringify(reply)).not.toContain(privateValue);
    expect(JSON.stringify(reply)).not.toContain('private-owner');
    expect(JSON.stringify(reply)).not.toContain('stack');
  });
});
