import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { errorInfo } from './errors.js';

/** A failed query is distinct from a persisted job failure; never expose raw errors. */
export async function guardedTool(operation: () => Promise<CallToolResult>, requestId?: string): Promise<CallToolResult> {
  try { return await operation(); }
  catch (error) {
    const failure = errorInfo(error);
    const result = { ...(requestId ? { request_id: requestId } : {}), status: 'failed',
      query_error: true, error: failure, message: failure.message };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  }
}

/** Model polling/cancellation intentionally has no App metadata and cannot open a card. */
export function registerModelTools(server: McpServer, idSchema: z.ZodString, operations: {
  status: (requestId: string, signal: AbortSignal) => Promise<CallToolResult>;
  cancel: (requestId: string) => Promise<CallToolResult>;
}): void {
  server.registerTool('ngini_get_status', {
    description: 'Read or recover only an existing image request, with a bounded wait of at most eight seconds. Never submits a generation. This ordinary tool does not open an MCP App card. Use for model_poll waiting, instead of repeatedly opening get_result cards. Reuse the original request_id. A ready preview may be returned for inspection; do not automatically call ngini_get_result to repeat it. A model_poll mode does not prove that no App card exists. Use ngini_get_result only for the user\'s explicit request to reopen the picture or a confirmed blocked or invisible original card. Stop on a persisted terminal error; a query_error marks a failed query, not a new provider job failure.',
    inputSchema: z.object({ request_id: idSchema }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ request_id }, extra) => guardedTool(() => operations.status(request_id, extra.signal), request_id));

  server.registerTool('ngini_cancel_generation', {
    description: 'Stop local processing for this request without opening a new picture card. A submitted provider job may continue; stopping locally does not guarantee provider cancellation or a quota refund.',
    inputSchema: z.object({ request_id: idSchema }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ request_id }) => guardedTool(() => operations.cancel(request_id), request_id));
}
