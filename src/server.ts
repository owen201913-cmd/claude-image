import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import * as z from 'zod';
import { RequestStore } from './jobs/request-store.js';
import { ImageStore } from './images/image-store.js';
import { JobRunner } from './jobs/runner.js';
import { getConfig, VERSION } from './shared/config.js';
import { AGENT_INSTRUCTIONS } from './agent-instructions.js';
import { BridgeError } from './shared/errors.js';
import { guardedTool as guarded, registerModelTools } from './shared/model-tools.js';
import { imageToolMeta, appOnlyToolMeta, registerImageCardResource } from './ui/image-card.js';
import { imageResourceUri, imageCardToolResult } from './ui/card-contract.js';
import { deliveryObservationPatch } from './ui/delivery-status.js';
import { deliveryCapabilitySummary, requestResultFacts, waitForClientResult } from './ui/tool-delivery.js';
import type { RequestRecord } from './jobs/state-machine.js';

const config = getConfig();
const requests = await RequestStore.open(config.requestDir);
const images = new ImageStore(config.outputDir);
const runner = new JobRunner(requests,images,config);
const server = new McpServer({name:'ngini-image-bridge',version:VERSION},{instructions:AGENT_INSTRUCTIONS});
registerImageCardResource(server);
const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/)
  .describe('A fresh unique ID for each new image intent, preferably a UUID. Reuse the same ID for queries and interrupted retries of that intent.');

async function present(record: RequestRecord, cardOnly = false) {
  const deliveryCapabilities = deliveryCapabilitySummary(server.server.getClientCapabilities());
  let image;
  if (record.image) {
    const preview = await images.readPreview(record.image.image_id);
    image = {...record.image,source:record.source ?? 'unknown',
      ...(preview.length <= 256*1024 ? {preview:{mime:'image/png',data:preview.toString('base64')}} : {})};
  }
  const result = { ...requestResultFacts(record,deliveryCapabilities), ...(image ? {image} : {}) };
  if (cardOnly && deliveryCapabilities.delivery_mode === 'app_poll') return imageCardToolResult(result);
  return {content:[{type:'text' as const,text:JSON.stringify({...result,image:record.image})},
    ...(image?.preview ? [{type:'image' as const,mimeType:image.preview.mime,data:image.preview.data}] : [])],
    structuredContent:result,isError:record.status==='failed'};
}
async function getForClient(requestId:string, signal:AbortSignal, initial?:RequestRecord):Promise<RequestRecord> {
  return waitForClientResult(initial ?? await runner.get(requestId),()=>requests.get(requestId),signal);
}

registerModelTools(server,idSchema,{
  status:async (requestId,signal)=>present(await getForClient(requestId,signal)),
  cancel:async requestId=>present(await runner.cancel(requestId)),
});

registerAppTool(server,'ngini_generate_image',{
  description: 'For an image-only user request, the normal card-producing result is the reply even while pending: add no prose, title, metadata, recap, browser narration, or host-rendering uncertainty disclaimer. Complete all explicitly requested distinct existing-image reopens before ending; returned failures, stopping statuses, human handoffs, observed mismatches or unexpected image counts, user-reported delivery problems, and explicit information requests remain exceptions. Unconfirmed rendering prevents claims of visible, delivered, or saved images. Generate one image through the guest Ngini website in the dedicated local browser. Call only for an explicit request to generate an image, never for prompt writing alone. Use a plain subject + action + setting description, for example "a cat curled up asleep by a spaceship window". Reuse a short, complete user description exactly, including short Chinese scenes. Preserve the original language and every explicit condition; do not truncate or translate. Do not add unrequested lighting, style, composition, mood, background details, or exclusions. Omit conversational framing and generation/tool-operation instructions. The server submits the description unchanged in image mode. Use a fresh unique request_id for a new intent and retain that same ID for retries; never change IDs to resubmit. The first call waits at most eight seconds for the same task. When delivery_mode is app_poll, let the existing card update itself and do not call get_result merely to wait or add another card. With model_poll or no mode, use ngini_get_status with the same ID to wait without opening duplicate cards. Inspect an available preview before claiming it matches; a future-turn App context update is not immediate model inspection. Fixture mode returns a labeled local test image. The dedicated local browser runs in the background by default, without a website window. The clickable MCP App picture provides original download when selected; Claude outer tool chrome remains under host control. Stop on human verification and follow the returned manual handoff without resubmitting. Claude host permission prompts cannot be hidden.',
  inputSchema:z.object({prompt:z.string().min(1).describe('The user scene description in the original language: subject + action + setting, such as "a cat curled up asleep by a spaceship window". Keep an existing short, complete description exactly, including short Chinese scenes. Preserve explicit conditions without truncation; add no unrequested lighting, style, composition, mood, background, exclusions, or tool instructions. Never include the whole conversation.'),request_id:idSchema}).strict(),
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true},_meta:imageToolMeta,
},async ({prompt,request_id},extra)=>guarded(async()=>present(await getForClient(request_id,extra.signal,
  await runner.generate(request_id,prompt,extra.signal)),true),request_id));

registerAppTool(server,'ngini_get_result',{
  description:'For an image-only user request, the normal card-producing result is the reply even while pending: add no prose, title, metadata, recap, or host-rendering uncertainty disclaimer. Complete all explicitly requested distinct existing-image reopens before ending; returned failures, stopping statuses, human handoffs, observed mismatches or unexpected image counts, user-reported delivery problems, and explicit information requests remain exceptions. Present or explicitly reopen an existing request and its original image card. This never submits a new generation. Success, image_ready/presenting status, and a model-visible preview do not prove that the current host card has loaded; do not say opened, visible, delivered, or saved merely because this tool succeeded. Host rendering may be delayed; do not call again or generate again just because the card is slow to appear. App-internal polling may query the same ID. For model waiting, use the ordinary ngini_get_status tool, which does not open another App card. When the original response has delivery_mode app_poll, let its existing card update itself. With model_poll or no mode, wait using ngini_get_status; do not automatically open another card when its preview is ready. A model_poll mode does not prove that no App card exists. Model calls to this tool are only for the user\'s explicit request to reopen the picture or a confirmed blocked or invisible original card. Each query waits at most eight seconds. Do not pretend work survives a stopped server or resubmit an uncertain request.',
  inputSchema:z.object({request_id:idSchema}).strict(),annotations:{readOnlyHint:false,idempotentHint:true,openWorldHint:true},_meta:imageToolMeta,
},async ({request_id},extra)=>guarded(async()=>present(await getForClient(request_id,extra.signal),true),request_id));

registerAppTool(server,'ngini_read_image',{
  description:'Image-card access to an original image already validated and stored by this tool. Accepts only its image ID, never a path or URL.',
  inputSchema:z.object({image_id:z.string().uuid()}).strict(),annotations:{readOnlyHint:true,idempotentHint:true,openWorldHint:false},_meta:appOnlyToolMeta,
},async ({image_id})=>guarded(async()=>{
  const metadataOnly=await images.get(image_id);
  if(!metadataOnly)throw new BridgeError('NOT_FOUND','找不到本工具產出的圖片。');
  if(metadataOnly.bytes>512*1024)throw new BridgeError('DELIVERY_BLOCKED','原圖超過單次工具傳輸預算；請使用圖片卡片的分段原圖下載。');
  const {metadata,data}=await images.readOriginal(image_id);
  return {content:[{type:'resource',resource:{uri:imageResourceUri(metadata),mimeType:metadata.mime,blob:data.toString('base64')}}]};
}));

registerAppTool(server,'ngini_read_image_chunk',{
  description:'Image-card access to a bounded 256 KiB chunk of an already stored original. Accepts only its image ID and byte offset. Never generates, downloads a URL, or accepts a file path. The card verifies the complete original SHA-256 before requesting host download.',
  inputSchema:z.object({image_id:z.string().uuid(),offset:z.number().int().nonnegative().max(25*1024*1024-1)}).strict(),
  annotations:{readOnlyHint:true,idempotentHint:true,openWorldHint:false},_meta:appOnlyToolMeta,
},async ({image_id,offset})=>guarded(async()=>{
  const chunk=await images.readOriginalChunk(image_id,offset);
  return {content:[{type:'text',text:'Original image chunk; no generation.'}],structuredContent:{
    image_id:chunk.metadata.image_id,total_bytes:chunk.metadata.bytes,offset:chunk.offset,
    next_offset:chunk.next_offset,sha256:chunk.metadata.sha256,data:chunk.data.toString('base64'),
  }};
}));

registerAppTool(server,'ngini_report_delivery',{
  description:'Record card preview or host download acceptance. These observations do not prove the original was saved and never mark a request delivered.',
  inputSchema:z.object({request_id:idSchema,evidence:z.enum(['preview_visible','download_accepted','delivery_blocked'])}).strict(),
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},_meta:appOnlyToolMeta,
},async ({request_id,evidence})=>guarded(async()=>{
  const record=await runner.get(request_id);
  const patch=deliveryObservationPatch(record,evidence);
  if(!patch)return present(record); // Preserve missing-image, cancelled, failed, and delivered states.
  await requests.transition(request_id,patch.status,{message:patch.message});
  return {content:[{type:'text',text:'已接收卡片狀態；尚未獨立驗證原圖下載。'}]};
}));

if (config.fixtureMode) server.registerTool('ngini_delivery_probe',{
  description:'Diagnostic mode only: return a labeled local test image and embedded original for P0 display/download verification. Does not contact Ngini and is never real image generation.',
  inputSchema:z.object({request_id:idSchema}).strict(),
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
},async ({request_id})=>guarded(async()=>{
  await runner.generate(request_id,'LOCAL DELIVERY TEST IMAGE - NOT NGINI');
  let record=await runner.get(request_id);
  const deadline=Date.now()+5000;
  while(!record.image && record.status!=='failed' && record.status!=='cancelled' && Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,50));
    record=await runner.get(request_id);
  }
  if(record.source!=='fixture')throw new BridgeError('PARAMETER_CONFLICT','此 ID 屬於其他來源的任務；不能標為診斷圖。');
  if(!record.image)return present(record);
  const {metadata,data}=await images.readOriginal(record.image.image_id);
  const preview=await images.readPreview(record.image.image_id);
  return {content:[
    {type:'text',text:'LOCAL TEST IMAGE — NOT NGINI GENERATED. Standard image/resource client delivery is unverified.'},
    {type:'image',mimeType:'image/png',data:preview.toString('base64')},
    {type:'resource',resource:{uri:imageResourceUri(metadata),mimeType:metadata.mime,blob:data.toString('base64')}},
  ],structuredContent:{request_id,status:'image_ready',source:'fixture',image:record.image}};
}));

await server.connect(new StdioServerTransport());
let closing=false;
async function shutdown(){ if(closing)return;closing=true;await runner.shutdown();await server.close(); }
process.on('SIGINT',()=>void shutdown());
process.on('SIGTERM',()=>void shutdown());
process.stdin.on('end',()=>void shutdown());
