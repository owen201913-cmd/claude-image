# RC8 image-only response boundary

Recorded: 2026-10-10 (Asia/Taipei). Version: `0.1.0-rc.8`.

This is a follow-up review document created after the RC8 source and MCPB were sealed. It is not evidence of a new build, a new package, or additional host acceptance. The review made no code changes, browser launches, desktop actions, image jobs, or Ngini submissions.

## What the extension controls

The extension controls its tool descriptions, initialization instructions, tool-result facts, and the HTML inside its sandboxed MCP App. It can render a minimal clickable image, display necessary local status, and request an original-file download through the host. It can request a borderless card; the host decides how to apply that preference.

The extension does not control the host conversation DOM or the final assistant message. In the reviewed pinned SDK contracts there is no standardized capability or tool-result field that forces the host model to end its turn or suppress final prose. This is a statement about the reviewed contracts, not a claim about undocumented or future host features.

## Primary local contract evidence

Pinned dependencies: `@modelcontextprotocol/ext-apps` **1.3.2** and `@modelcontextprotocol/sdk` **1.32.1**, verified from their installed package metadata.

| Local primary source | Verified contract and implication |
| --- | --- |
| `node_modules/@modelcontextprotocol/ext-apps/dist/src/spec.types.d.ts:361–390`, `McpUiHostCapabilities` | Advertises external links, downloads, server tool/resource proxying, logging, sandbox settings, model-context updates, and messages. It declares no silence or end-turn capability. |
| Same file, `:617–633`, `McpUiToolMeta` | `resourceUri` chooses the App resource; `visibility` controls access by `model` or `app`. Tool visibility does not suppress an assistant reply. |
| Same file, `:574–582`, `McpUiResourceMeta.prefersBorder` | Requests a visual border/background preference. It does not control model-generated text. |
| Same file, `:100–106`, `McpUiMessageRequest` | `ui/message` supports the `user` role. It cannot replace a final assistant response. The current card does not call `app.sendMessage`. |
| Same file, `:293–310`, `McpUiUpdateModelContextRequest`; `app.d.ts:718–725`, `App.updateModelContext` | Context updates do not trigger follow-ups and are normally deferred to a future user turn. They are not an in-flight response cancellation or suppression mechanism. |
| `node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:1289–1317`, `CallToolResultSchema` | Tool results define `content`, `structuredContent`, and `isError`, extending base result metadata. No standardized assistant silence/end-turn switch is declared. |

Current official references agree that MCP Apps add a sandboxed UI surface to the conversation. They describe UI resource registration, tool visibility, border preferences, and host-mediated interaction; they do not document a final-assistant silence switch in the reviewed material: [Claude MCP Apps introduction](https://claude.com/docs/connectors/building/mcp-apps/getting-started), [Anthropic's MCP App reference](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/mcp-server-dev/skills/build-mcp-app/SKILL.md). The latter also explicitly describes the host DOM as inaccessible to a widget.

## RC8 implementation review

`src/agent-instructions.ts` and the generation/reopen descriptions in `src/server.ts` explicitly require image-only normal replies, including pending cards, and prohibit a success recap or host-rendering uncertainty disclaimer. They retain text exceptions for actual failures, required human handoff, observed mismatches, user-reported problems, and explicit information requests.

The installed resource inspection verified the intended metadata: generation/reopen tools are accessible to the model and App, image-read/report helpers are App-only, ordinary status/cancel tools do not reference a card, and the resource requests `prefersBorder: false`. No metadata defect or contradictory imperative to narrate was identified in this bounded review.

The result still provides truthful task facts, and optional future-turn preview context still distinguishes preview visibility from independently verified saving. Claude may paraphrase these facts. That possibility is not proof that these fields caused the unwanted prose. Neither successful tool return nor backend image storage proves host rendering or original-file saving.

## Actual acceptance status

| RC8 host check | Status | Evidence boundary |
| --- | --- | --- |
| Existing cat image in the original Claude chat | **FAIL** for image-only final response | Root's actual host observation reported that the new image card preview rendered, but Claude again appended prose about visibility uncertainty. This supplement did not repeat that desktop observation. |
| Fresh ordinary-chat single-cat response | **FAIL** for image-only final response | Root screenshot/UI-tree observation: one preview PASS, but a final scene-description sentence remained. Completed no later than 2026-10-09T21:04:42Z; UI only, no second cat save requested. See [fresh-chat report](host-new-chat-cat-reopen-rc8.json). |
| Controlled three-existing-fixture response | **FAIL** for image-only final response | All three TEST previews individually visible PASS; final itemized descriptions and status prose remained. No conflicting-instruction narration. All three fresh original files passed byte/SHA/full-decode/stable-stat checks; the existing post-read metadata comparison passed separately, before file verification. These do not change the final-prose FAIL. See [fixture report](host-size-fixtures-rc8.json). |
| Historical chat context as the cause | **NOT_PROVEN** | Both the original and fresh ordinary chats appended prose. The fresh chat omitted the old visibility disclaimer, but this does not establish history as the sole cause or establish the cause of the remaining prose. |

Image-only behavior remains an empirical host/model acceptance item. Instructions can request it, but this extension cannot truthfully guarantee it through the reviewed SDK. Do not treat the minimal App image UI, a package inspection, or a controlled browser fixture as proof that the final Claude response contains no prose.


## Practical remaining gap

RC8 already requests image-only replies in initialization and tool descriptions, yet the original-chat, fresh-chat and controlled fixture observations all failed that strict requirement. Another instruction-only version change would not demonstrate a fix. A substantive next integration step needs a documented, host-supported response mechanism that can satisfy the requirement, followed by an actual fresh ordinary-chat check. No such suppress-final-prose mechanism was found in the reviewed pinned contracts; this does not establish that future or undocumented host support is impossible.

The candidate therefore retains the image-only acceptance failure. Accepting a minimal clickable App image with occasional Claude prose would change the user's requirement and needs an explicit user decision; it is not silently waived here. Do not control or rewrite Claude's conversation DOM as an undisclosed workaround.

The single four-image fresh-save comparison now passed for all four exact normal filenames, bytes/SHA/full Sharp decode and stable stats; see [original-file report](host-original-downloads-rc8.json). The already-recorded original-chat and post-fresh-chat/fixture metadata comparisons also passed, each 9→9 with no ID, submission timestamp, image-identity SHA or source changes; see [state report](host-request-state-rc8.json). These are separate from visible previews and model prose; the later comparison preceded saved-file byte verification. The delayed confirmation UI case also does not prove a thrown-response or local-abort branch in the real host. These checks can improve delivery evidence without resolving final prose. All these supplements leave sealed source exports, archives and MCPB unchanged.
