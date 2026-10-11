// Real local stdio protocol with generated fixtures only. No browser or Ngini.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
assert.ok(process.argv.length <= 4, 'Usage: node scripts/protocol-app-card-smoke.mjs [bootstrap.js] [report.json]');
const entry = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'dist/bootstrap.js');
const artifactRoot = path.resolve(path.dirname(entry), '..');
const manifest = JSON.parse(await readFile(path.join(artifactRoot, 'manifest.json'), 'utf8'));
assert.equal(entry, path.resolve(artifactRoot, manifest.server.entry_point), 'Exercise the manifest entry point');
const defaultName = `protocol-app-card-${manifest.version.split('-').at(-1).replaceAll('.', '')}.json`;
const reportPath = path.resolve(root, process.argv[3] ?? path.join('docs', defaultName));
const relativeReport = path.relative(root, reportPath);
assert.ok(/^(?:docs|\.runtime)[\\/]/.test(relativeReport) && !relativeReport.startsWith('..') && !path.isAbsolute(relativeReport),
  'Keep reports within this project docs or private runtime directory');
assert.ok(!existsSync(reportPath), 'Do not overwrite prior evidence');
const { CARD_RESULT_META_KEY, parseCardToolResult, assembleOriginalDownload } =
  await import(pathToFileURL(path.join(path.dirname(entry), 'ui/card-contract.js')).href);
assert.equal(CARD_RESULT_META_KEY, 'ngini-image-bridge/card');
const runtime = path.join(root, '.runtime', 'app-card-protocol', randomUUID());
const output = path.join(runtime, 'outputs');
await mkdir(output, { recursive: true });
await mkdir(path.join(runtime, 'home'), { recursive: true });
const env = {
  PATH: '', NODE_PATH: '', SystemRoot: process.env.SystemRoot ?? '',
  NGINI_FIXTURE_MODE: '1', NGINI_DATA_DIR: runtime, NGINI_OUTPUT_DIR: output,
  USERPROFILE: path.join(runtime, 'home'), HOME: path.join(runtime, 'home'),
  APPDATA: path.join(runtime, 'roaming'), LOCALAPPDATA: path.join(runtime, 'local'),
  TEMP: path.join(runtime, 'tmp'), TMP: path.join(runtime, 'tmp'),
};
for (const key of ['APPDATA', 'LOCALAPPDATA', 'TEMP']) await mkdir(env[key], { recursive: true });
const report = {
  status: 'NOT_RUN', version: manifest.version, started_at: new Date().toISOString(), checks: [],
  scope: 'Actual compiled MCP stdio protocol with private fixture data; not Claude iframe, model behavior, host download, or sealed archive acceptance',
  node: process.version, fixture_mode: true, isolated_user_data: true, child_PATH_empty: true, child_NODE_PATH_empty: true,
  image_jobs_created: 0, live_submissions: 0, browser_launches: 0, actual_claude_meta_forwarding: 'NOT_RUN',
  actual_claude_image_only_response: 'NOT_RUN', real_host_saved_original: false,
};
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
let stage = 'connect_app_capable_client';
let stderrBytes = 0;
const persist = async () => { await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n'); };
const checkpoint = async (name, details = {}) => { report.checks.push({ name, status: 'PASS', ...details }); await persist(); };
const appCapabilities = { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } };

async function connect(capabilities) {
  const client = new Client({ name: 'local-app-card-protocol', version: '1' }, { capabilities });
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], cwd: artifactRoot, env, stderr: 'pipe' });
  transport.stderr?.on('data', data => { stderrBytes += data.length; });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion()?.version, manifest.version);
    return client;
  } catch (error) { await client.close(); throw error; }
}
function assertMinimal(response, id, expectedStatus = 'image_ready') {
  assert.equal(response.isError, false);
  const facts = { request_id: id, status: expectedStatus, delivery_mode: 'app_poll' };
  assert.deepEqual(response.structuredContent, facts, 'Normal model result must contain only coordination facts');
  assert.deepEqual(response.content, [{ type: 'text', text: JSON.stringify(facts) }, {
    type: 'text', text: 'For an image-only request, the attached image card is the response. Finish that turn without an additional assistant message.',
  }], 'Retain public coordination facts plus the conditional ready-image reply contract, not image metadata or provider text');
  const payload = response._meta?.[CARD_RESULT_META_KEY];
  assert.ok(payload && typeof payload === 'object', 'Full App payload must survive actual MCP serialization');
  assert.equal(payload.request_id, id);
  assert.equal(payload.status, expectedStatus);
  assert.equal(payload.source, 'fixture');
  assert.deepEqual(payload.quota, { availability: 'unknown', remaining: null, observed_at: null, source: 'not_observed' });
  assert.equal(payload.delivery_mode, 'app_poll');
  assert.deepEqual(payload.delivery_capabilities, { ui_advertised: true, mime_supported: true, delivery_mode: 'app_poll' });
  for (const key of ['prompt', 'prompt_sha256', 'owner_pid', 'browser_checkpoint', 'next_action'])
    assert.equal(Object.hasOwn(payload, key), false, 'App payload must not expose private durable fields');
  assert.ok(typeof payload.message === 'string' && payload.image?.preview?.data);
  const parsed = parseCardToolResult(response);
  assert.equal(parsed.image?.image_id, payload.image.image_id);
  assert.equal(parsed.image?.sha256, payload.image.sha256);
  return parsed;
}
function assertFullInspection(response, id, image, mode) {
  assert.equal(response.isError, false);
  assert.equal(response._meta?.[CARD_RESULT_META_KEY], undefined);
  assert.equal(response.structuredContent?.request_id, id);
  assert.equal(response.structuredContent?.delivery_mode, mode);
  assert.equal(response.structuredContent?.source, 'fixture');
  assert.equal(response.structuredContent?.quota?.remaining, null);
  assert.ok(response.content.some(item => item.type === 'image'), 'Full inspection preview must remain available');
  assert.ok(response.content.every(item => item.type !== 'text' ||
    !item.text.includes('Finish that turn without an additional assistant message.')),
  'Status inspection and non-App fallback must not receive the App finish-turn contract');
  for (const field of ['image_id', 'filename', 'mime', 'width', 'height', 'bytes', 'sha256'])
    assert.equal(response.structuredContent.image[field], image[field]);
  assert.equal(parseCardToolResult(response).image?.image_id, image.image_id);
}

let id, image, originalHash;
const start = Date.now();
try {
  let client = await connect(appCapabilities);
  try {
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, manifest.tools.length + 1, 'Fixture-only probe is the only extra tool');
    for (const name of ['ngini_read_image', 'ngini_read_image_chunk', 'ngini_report_delivery'])
      assert.deepEqual(tools.find(tool => tool.name === name)?._meta?.ui?.visibility, ['app']);
    for (const name of ['ngini_get_status', 'ngini_cancel_generation'])
      assert.equal(tools.find(tool => tool.name === name)?._meta?.ui?.resourceUri, undefined);
    const uri = `ui://ngini-image-bridge/${encodeURIComponent(manifest.version)}/image-card.html`;
    const resource = await client.readResource({ uri });
    const html = resource.contents.find(item => item.uri === uri && item.mimeType === RESOURCE_MIME_TYPE)?.text;
    const builtHtml = await readFile(path.join(path.dirname(entry), 'ui/image-card.html'), 'utf8');
    assert.equal(html, builtHtml);
    report.ui_html_sha256 = createHash('sha256').update(html).digest('hex');
    await checkpoint('app_capability_and_resource', { tools: tools.length, exact_built_html: true });

    stage = 'app_generate_and_reopen';
    id = `app-card-${randomUUID()}`;
    const prompt = 'LOCAL APP CARD FIXTURE - NOT NGINI';
    const generated = await client.callTool({ name: 'ngini_generate_image', arguments: { request_id: id, prompt } });
    image = assertMinimal(generated, id).image;
    const reopened = await client.callTool({ name: 'ngini_get_result', arguments: { request_id: id } });
    assert.deepEqual(assertMinimal(reopened, id).image, image);
    const sameId = await client.callTool({ name: 'ngini_generate_image', arguments: { request_id: id, prompt } });
    assert.deepEqual(assertMinimal(sameId, id).image, image);
    await checkpoint(stage, { minimal_model_fields: ['request_id', 'status', 'delivery_mode'],
      full_metadata_truth_and_parser: true, same_id_same_image: true });

    stage = 'actual_same_image_chunk_download';
    let chunkCalls = 0;
    const downloadable = await assembleOriginalDownload(image, async offset => {
      chunkCalls++;
      return client.callTool({ name: 'ngini_read_image_chunk', arguments: { image_id: image.image_id, offset } });
    });
    const bytes = Buffer.from(downloadable.resource.blob, 'base64');
    assert.equal(bytes.length, image.bytes);
    originalHash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(originalHash, image.sha256);
    assert.equal(downloadable.resource.mimeType, 'application/octet-stream');
    const original = await client.callTool({ name: 'ngini_read_image', arguments: { image_id: image.image_id } });
    const embedded = original.content.find(item => item.type === 'resource')?.resource;
    assert.ok(embedded?.blob);
    assert.equal(embedded.uri, downloadable.resource.uri);
    assert.ok(Buffer.from(embedded.blob, 'base64').equals(bytes));
    const stored = await readFile(path.join(output, image.filename));
    assert.ok(stored.equals(bytes), 'Chunk assembly must equal the actual persisted fixture original');
    await checkpoint(stage, { chunk_calls: chunkCalls, original_bytes: bytes.length, original_sha256: originalHash,
      exact_stored_original_bytes: true, host_download_request_prepared_only: true });

    stage = 'app_client_full_status_inspection';
    const inspected = await client.callTool({ name: 'ngini_get_status', arguments: { request_id: id } });
    assertFullInspection(inspected, id, image, 'app_poll');
    await checkpoint(stage, { source_quota_and_preview_remain_available: true, duplicate_card_metadata_absent: true });

    stage = 'actual_guarded_query_error';
    const missing = await client.callTool({ name: 'ngini_get_result', arguments: { request_id: `missing-${randomUUID()}` } });
    assert.equal(missing.isError, true);
    assert.equal(missing.structuredContent?.query_error, true);
    assert.equal(missing.structuredContent?.error?.code, 'NOT_FOUND');
    assert.deepEqual(JSON.parse(missing.content[0].text), missing.structuredContent);
    assert.equal(missing._meta?.[CARD_RESULT_META_KEY], undefined);
    await checkpoint(stage, { actionable_error_preserved: true });
  } finally { await client.close(); }

  stage = 'non_app_restart_full_fallback';
  client = await connect({});
  try {
    const fallback = await client.callTool({ name: 'ngini_get_result', arguments: { request_id: id } });
    assertFullInspection(fallback, id, image, 'model_poll');
    const status = await client.callTool({ name: 'ngini_get_status', arguments: { request_id: id } });
    assertFullInspection(status, id, image, 'model_poll');
    const records = (await readdir(path.join(runtime, 'requests'))).filter(name => name.endsWith('.json'));
    assert.equal(records.length, 1, 'Reopen, inspection, errors and restart must not create another image job');
    report.image_jobs_created = records.length;
    await checkpoint(stage, { same_image_after_restart: true, full_legacy_preview: true, total_image_jobs: records.length });
  } finally { await client.close(); }
  report.status = 'PASS';
  report.original_sha256 = originalHash;
} catch (error) {
  report.status = 'FAIL';
  report.failed_check = stage;
  report.failure_code = typeof error?.code === 'string' ? error.code : 'ASSERTION_OR_PROTOCOL_FAILED';
  process.exitCode = 1;
} finally {
  report.stderr_bytes = stderrBytes;
  report.elapsed_ms = Date.now() - start;
  report.completed_at = new Date().toISOString();
  await persist();
}
console.log(JSON.stringify(report));
