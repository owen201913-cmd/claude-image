import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const serverEntry=process.argv[2] ? path.resolve(process.argv[2]) : path.join(root,'dist','bootstrap.js');
const manifestDirectory=path.resolve(path.dirname(serverEntry),'..');
const manifest=JSON.parse(await readFile(path.join(manifestDirectory,'manifest.json'),'utf8'));
assert.equal(serverEntry,path.resolve(manifestDirectory,manifest.server.entry_point),'Smoke must exercise the packaged manifest entry point');
const runtime=path.join(root,'.runtime','protocol',randomUUID());
await mkdir(runtime,{recursive:true});
// A durable fixture blocker makes the BUSY wire check deterministic without racing a real job.
const blockerId=`blocker-${randomUUID()}`;
const blockerPrompt='LOCAL PROTOCOL BLOCKER - NOT NGINI';
const requestDirectory=path.join(runtime,'requests');
await mkdir(requestDirectory,{recursive:true});
const blockerTime=new Date().toISOString();
await writeFile(path.join(requestDirectory,`${createHash('sha256').update(blockerId).digest('hex')}.json`),JSON.stringify({
  schema_version:1,request_id:blockerId,prompt_sha256:createHash('sha256').update(blockerPrompt).digest('hex'),
  status:'received',source:'fixture',owner_pid:process.pid,created_at:blockerTime,updated_at:blockerTime,
  quota:{availability:'unknown',remaining:null,observed_at:null,source:'not_observed'},
}));
function assertErrorWire(response,requestId,code,details,privateText) {
  assert.equal(response.isError,true,'Expected a failed tool result');
  assert.equal(response.content.length,1,'Guarded error should expose only the bounded text envelope');
  assert.equal(response.content[0].type,'text');
  const text=response.content[0].text;
  assert.ok(Buffer.byteLength(text)<=8192,'Error envelope exceeded its narrow wire budget');
  const wire=JSON.parse(text);
  assert.deepEqual(wire,response.structuredContent,'Text-only clients lost structured error fields');
  assert.deepEqual(Object.keys(wire).sort(),['error','message','query_error','request_id','status']);
  assert.equal(wire.query_error,true,'Failed tool query was confused with a persisted job failure');
  assert.equal(wire.request_id,requestId,'Current call identity was replaced by the blocking task ID');
  assert.equal(wire.status,'failed');
  assert.equal(wire.error.code,code);
  assert.equal(wire.message,wire.error.message);
  assert.equal(typeof wire.message,'string');
  assert.ok(wire.message.length<=2000);
  assert.deepEqual(Object.keys(wire.error).sort(),details===undefined?['code','message']:['code','details','message']);
  assert.deepEqual(wire.error.details,details,'Recovery details were lost or expanded');
  for(const value of [root,runtime,privateText].filter(Boolean)) {
    assert.ok(!text.includes(JSON.stringify(value).slice(1,-1))&&!text.includes(value.replaceAll('\\','/')),
      'Guarded error exposed a private path or caller prompt');
  }
}
function assertImageTaskWire(response,requestId,expectedImage) {
  assert.ok(expectedImage && typeof expectedImage==='object','Expected original image metadata is missing');
  const textBlocks=response.content.filter(item=>item.type==='text');
  assert.equal(textBlocks.length,1,'Image task must retain one factual text result');
  const parsedText=JSON.parse(textBlocks[0].text);
  const privateFields=['next_action','schema_version','owner_pid','prompt_sha256','created_at','updated_at',
    'submission_started_at','submitted_at','interrupted_phase','browser_checkpoint','recovery_error','delivery'];
  for(const payload of [response.structuredContent,parsedText]) {
    assert.ok(payload && typeof payload==='object','Image task factual result is missing');
    for(const field of privateFields)
      assert.equal(Object.hasOwn(payload,field),false,'Image task exposed behavioral or private record field: '+field);
    assert.equal(payload.request_id,requestId,'Image task lost its original request identity');
    assert.equal(payload.status,'image_ready','Image readiness was lost or promoted to host delivery');
    assert.equal(payload.source,'fixture','Image task lost the local-test provenance');
    for(const field of ['image_id','filename','mime','width','height','bytes','sha256'])
      assert.equal(payload.image?.[field],expectedImage[field],'Image task wire changed original identity: '+field);
  }
}
const started=Date.now();
const client=new Client({name:'offline-protocol-smoke',version:'0.1.0'},{capabilities:{}});
const transport=new StdioClientTransport({command:process.execPath,args:[serverEntry],env:{PATH:process.env.PATH || '',SystemRoot:process.env.SystemRoot || '',LOCALAPPDATA:runtime,NGINI_FIXTURE_MODE:'1',NGINI_DATA_DIR:runtime,NGINI_OUTPUT_DIR:path.join(runtime,'outputs')},stderr:'pipe'});
await client.connect(transport);
try {
  const list=await client.listTools();
  assert.deepEqual(list.tools.map(tool=>tool.name).filter(name=>name!=='ngini_delivery_probe').sort(),
    manifest.tools.map(tool=>tool.name).sort(),'Manifest fixed tools differ from server capabilities');
  assert.equal(manifest.tools_generated,true,'Fixture-only capabilities require dynamic-tool metadata');
  const instructions=client.getInstructions();
  if(!instructions || /[^\x00-\x7f]/.test(instructions))throw new Error('MCP initialization instructions are not English');
  for(const tool of list.tools) {
    if(!tool.description || /[^\x00-\x7f]/.test(tool.description))throw new Error('Tool instructions are not English: '+tool.name);
  }
  const generateSchema=list.tools.find(tool=>tool.name==='ngini_generate_image')?.inputSchema;
  if(!generateSchema?.properties?.prompt?.description || !generateSchema?.properties?.request_id?.description)throw new Error('Model-facing parameter instructions missing');
  for(const name of ['ngini_generate_image','ngini_get_status','ngini_get_result','ngini_cancel_generation','ngini_read_image','ngini_read_image_chunk'])
    if(!list.tools.some(tool=>tool.name===name))throw new Error(`Missing tool ${name}`);
  const resources=await client.listResources();
  const serverVersion=client.getServerVersion()?.version;
  if(typeof serverVersion!=='string'||!serverVersion)throw new Error('Missing server version for card resource identity');
  const cardUri=`ui://ngini-image-bridge/${encodeURIComponent(serverVersion)}/image-card.html`;
  if(!resources.resources.some(resource=>resource.uri===cardUri))throw new Error('Missing versioned card resource');
  if(resources.resources.some(resource=>resource.uri==='ui://ngini-image-bridge/image-card.html'))throw new Error('Unversioned cached card URI remains registered');
  for(const name of ['ngini_generate_image','ngini_get_result','ngini_read_image','ngini_read_image_chunk','ngini_report_delivery'])
    if(list.tools.find(tool=>tool.name===name)?._meta?.ui?.resourceUri!==cardUri)throw new Error('Tool/card resource identity differs: '+name);
  for(const name of ['ngini_get_status','ngini_cancel_generation'])
    if(list.tools.find(tool=>tool.name===name)?._meta?.ui?.resourceUri)throw new Error('Ordinary status/cancel tool can open a duplicate card');
  const card=await client.readResource({uri:cardUri});
  const cardHtml=card.contents.find(item=>item.uri===cardUri&&item.mimeType==='text/html;profile=mcp-app'&&typeof item.text==='string')?.text;
  if(!cardHtml?.includes('ngini_read_image_chunk')||/name:\s*["']ngini_read_image["']/.test(cardHtml))throw new Error('Served card is missing the chunk client or still uses whole-file reads');
  const blockedId=`blocked-${randomUUID()}`;
  const privatePrompt='LOCAL PRIVATE CALLER DESCRIPTION - DO NOT ECHO';
  const busy=await client.callTool({name:'ngini_generate_image',arguments:{request_id:blockedId,prompt:privatePrompt}});
  assertErrorWire(busy,blockedId,'BUSY',{request_id:blockerId},privatePrompt);
  const duplicateId=`duplicate-${randomUUID()}`;
  const blockedDuplicate=await client.callTool({name:'ngini_generate_image',arguments:{request_id:duplicateId,prompt:blockerPrompt}});
  assertErrorWire(blockedDuplicate,duplicateId,'DUPLICATE_ACTIVE_REQUEST',{request_id:blockerId},blockerPrompt);
  const cancelledBlocker=await client.callTool({name:'ngini_cancel_generation',arguments:{request_id:blockerId}});
  if(cancelledBlocker.isError||cancelledBlocker.structuredContent?.status!=='cancelled')throw new Error('Fixture blocker did not release');
  const id=`probe-${randomUUID()}`;
  const prompt='本機診斷圖，並非 Ngini 生成。';
  const generated=await client.callTool({name:'ngini_generate_image',arguments:{request_id:id,prompt}});
  if(generated.isError||generated.structuredContent?.status!=='image_ready'||generated.structuredContent?.request_id!==id||
    !generated.content.some(item=>item.type==='image'))throw new Error('Fast fixture did not return its final model preview in the first generation result');
  assertImageTaskWire(generated,id,generated.structuredContent.image);
  if(generated.structuredContent?.delivery_mode!=='model_poll')throw new Error('Undeclared App client did not receive honest polling fallback');
  let result;
  for(let i=0;i<50;i++){
    result=await client.callTool({name:'ngini_get_status',arguments:{request_id:id}});
    if(result.structuredContent?.status==='image_ready')break;
    if(result.isError)throw new Error(JSON.stringify(result.structuredContent));
    await delay(100);
  }
  const image=result?.structuredContent?.image;
  if(!image || image.source!=='fixture')throw new Error('Fixture image missing or falsely attributed');
  if(!result.content.some(item=>item.type==='image'))throw new Error('Model-visible preview missing');
  const reopened=await client.callTool({name:'ngini_get_result',arguments:{request_id:id}});
  if(reopened.structuredContent?.image?.image_id!==image.image_id)throw new Error('Explicit reopen did not retain the same original');
  assertImageTaskWire(reopened,id,generated.structuredContent.image);
  const duplicate=await client.callTool({name:'ngini_generate_image',arguments:{request_id:id,prompt}});
  if(duplicate.structuredContent?.image?.image_id!==image.image_id)throw new Error('Duplicate generated again');
  const conflict=await client.callTool({name:'ngini_generate_image',arguments:{request_id:id,prompt:privatePrompt}});
  assertErrorWire(conflict,id,'PARAMETER_CONFLICT',undefined,privatePrompt);
  const missingId=`missing-${randomUUID()}`;
  const missing=await client.callTool({name:'ngini_get_result',arguments:{request_id:missingId}});
  assertErrorWire(missing,missingId,'NOT_FOUND');
  const missingCancel=await client.callTool({name:'ngini_cancel_generation',arguments:{request_id:missingId}});
  assertErrorWire(missingCancel,missingId,'NOT_FOUND');
  const original=await client.callTool({name:'ngini_read_image',arguments:{image_id:image.image_id}});
  const embedded=original.content.find(item=>item.type==='resource')?.resource;
  if(!embedded?.blob)throw new Error('Original resource missing');
  const bytes=Buffer.from(embedded.blob,'base64');
  if(createHash('sha256').update(bytes).digest('hex')!==image.sha256)throw new Error('Original bytes changed');
  const chunkResult=await client.callTool({name:'ngini_read_image_chunk',arguments:{image_id:image.image_id,offset:0}});
  const chunk=chunkResult.structuredContent;
  if(chunk?.image_id!==image.image_id||chunk.total_bytes!==image.bytes||chunk.offset!==0||chunk.next_offset!==null||chunk.sha256!==image.sha256||!Buffer.from(chunk.data,'base64').equals(bytes))throw new Error('Fixture chunk identity or bytes changed');
  if(Buffer.byteLength(JSON.stringify(result))>=1024*1024||Buffer.byteLength(JSON.stringify(chunkResult))>=1024*1024)throw new Error('Bounded tool response exceeded real host result budget');
  for (const evidence of ['delivery_blocked','preview_visible','download_accepted']) {
    const observation=await client.callTool({name:'ngini_report_delivery',arguments:{request_id:id,evidence}});
    if(observation.isError)throw new Error('Delivery observation rejected');
    const current=await client.callTool({name:'ngini_get_result',arguments:{request_id:id}});
    const state=current.structuredContent;
    if(state?.status!=='presenting'||state.image?.image_id!==image.image_id||state.message?.includes('DELIVERY_BLOCKED'))throw new Error('Delivery observation changed image or retained false blocked status');
    if(evidence==='download_accepted'&&!state.message?.includes('尚未獨立驗證'))throw new Error('Download acceptance falsely claims a saved original');
  }
  const probe=await client.callTool({name:'ngini_delivery_probe',arguments:{request_id:`standard-${randomUUID()}`}});
  if(!probe.content.some(item=>item.type==='image') || probe.structuredContent?.source!=='fixture')throw new Error('Standard diagnostic image response missing');
  const isolatedCandidate=serverEntry !== path.join(root,'dist','bootstrap.js');
  const report={status:'PASS',version:client.getServerVersion()?.version,scope:'Local MCP stdio + fixture only; NOT Claude Desktop display/download',isolated_candidate:isolatedCandidate,checked_at:new Date().toISOString(),node:process.version,english_initialization_instructions:true,english_tool_descriptions:true,model_facing_parameter_descriptions_present:true,ui_resource_uri:cardUri,tool_resource_metadata_consistent:true,served_chunk_client_present:true,first_generation_result_has_final_fixture_preview:true,task_result_wire_omits_next_action:true,task_result_wire_omits_private_record_fields:true,task_result_wire_retains_fixture_identity:true,undeclared_app_capability_uses_model_poll:true,guarded_error_text_matches_structured:true,guarded_error_current_and_blocking_ids_retained:true,guarded_error_private_path_and_prompt_checks:true,delivery_observation_recovery:true,download_acceptance_not_delivered:true,tools:list.tools.length,original_bytes:bytes.length,original_sha256:image.sha256,elapsed_ms:Date.now()-started,live_submissions:0};
  await writeFile(path.join(root,'docs',isolatedCandidate ? 'candidate-protocol-smoke.json' : 'protocol-smoke.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}finally{await client.close();}
