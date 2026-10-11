/** Procedural, labeled test fixtures only: never Ngini, Claude, or a real artwork. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { chromium } from 'playwright-core';
import { ImageStore } from '../../dist/images/image-store.js';
import { validateImage, DEFAULT_IMAGE_LIMITS } from '../../dist/images/validate.js';
import { imageResourceUri, parseCardResult, selectOriginalResource, prepareOriginalDownload,
  MAX_ORIGINAL_BYTES, MAX_PREVIEW_BYTES } from '../../dist/ui/card-contract.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtureDirectory = await realpath(path.join(root, 'tests/fixtures'));
const runDirectory = await mkdtemp(path.join(fixtureDirectory, '.t17-run-'));
const reportPath = path.join(root, 'docs/t17-offline.json');
const html = await readFile(path.join(root, 'dist/ui/image-card.html'), 'utf8');
const hash = data => createHash('sha256').update(data).digest('hex');
const started = Date.now();
const cases = [];
const limits = [];
const failures = [];
let context;
const previousReport = process.argv.includes('--limits-only') ? JSON.parse(await readFile(reportPath, 'utf8')) : undefined;
if (previousReport) {
  assert.equal(previousReport.image_card_html_sha256, hash(html), 'Cannot reuse App evidence for changed HTML');
  assert.equal(previousReport.cases.length, 3);
  assert(previousReport.cases.every(test => test.status === 'PASS' && test.app.status === 'PASS'));
  cases.push(...previousReport.cases);
}

async function proceduralPng(size, seed) {
  const pixels = Buffer.alloc(size * size * 3);
  let state = seed >>> 0;
  for (let offset = 0; offset < pixels.length; offset++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    pixels[offset] = state & 255;
  }
  const label = size < 256 ? 'TEST' : 'T17 OFFLINE FIXTURE - NOT NGINI';
  const font = Math.max(12, Math.floor(size / 28));
  const banner = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${font * 3}"><rect width="100%" height="100%" fill="#14243b"/><text x="8" y="${font * 2}" font-family="sans-serif" font-size="${font}" fill="white">${label}</text></svg>`);
  return sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .composite([{ input: banner, left: 0, top: 0 }]).png({ compressionLevel: 6 }).toBuffer();
}

async function rejected(name, operation, expected) {
  const begin = Date.now();
  try { await operation(); throw new Error(`Expected rejection: ${name}`); }
  catch (error) {
    const code = error.code ?? error.message;
    assert.equal(code, expected, name);
    limits.push({ name, status: 'PASS', actual_error: code, elapsed_ms: Date.now() - begin });
  }
}

async function syntheticCard(fixture, original) {
  const hostUrl = 'https://t17-offline.test/host';
  const cardUrl = 'https://t17-offline.test/card';
  // Do not load the App while the large inline original is still being parsed.
  // Its initialize notification must arrive only after this synthetic host is listening.
  const hostHtml = `<!doctype html><html><body><iframe id="card" title="T17 offline synthetic card" width="650" height="700"></iframe><script>
const fixture = ${JSON.stringify(fixture).replace(/</g, '\\u003c')};
const original = ${JSON.stringify(original).replace(/</g, '\\u003c')};
const originalBytes = atob(original.resource.blob);
window.t17 = { listener_ready: false, initialized: false, methods: [], reports: [], original_reads: 0, downloads: [] };
addEventListener('message', async event => {
  if (event.source !== document.getElementById('card').contentWindow) return;
  const message = event.data;
  if (message?.jsonrpc !== '2.0' || typeof message.method !== 'string') return;
  window.t17.methods.push(message.method);
  const reply = response => event.source.postMessage({ jsonrpc:'2.0', id:message.id, result:response }, '*');
  if (message.method === 'ui/initialize') {
    reply({ protocolVersion:message.params.protocolVersion, hostInfo:{name:'T17 offline synthetic host',version:'1'},
      hostCapabilities:{serverTools:{},downloadFile:{}},hostContext:{theme:'light'} });
  } else if (message.method === 'ui/notifications/initialized') {
    window.t17.initialized = true;
    event.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{content:[{type:'text',text:'T17 OFFLINE FIXTURE - NOT NGINI'}],structuredContent:fixture}},'*');
  } else if (message.method === 'tools/call' && message.params.name === 'ngini_read_image_chunk' && message.params.arguments.image_id === fixture.image.image_id) {
    const offset = message.params.arguments.offset;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= fixture.image.bytes || offset % 262144 !== 0) throw Error('Invalid synthetic chunk offset');
    const end = Math.min(fixture.image.bytes, offset + 262144);
    const chunk = {content:[{type:'text',text:'Synthetic original chunk.'}],structuredContent:{
      image_id:fixture.image.image_id,total_bytes:fixture.image.bytes,offset,next_offset:end===fixture.image.bytes?null:end,
      sha256:fixture.image.sha256,data:btoa(originalBytes.slice(offset,end))}};
    if (new TextEncoder().encode(JSON.stringify(chunk)).length >= 1048576) throw Error('Synthetic chunk exceeds observed host tool budget');
    window.t17.original_reads++;
    reply(chunk);
  } else if (message.method === 'tools/call' && message.params.name === 'ngini_report_delivery') {
    window.t17.reports.push(message.params.arguments.evidence);
    reply({content:[{type:'text',text:'Synthetic telemetry only.'}]});
  } else if (message.method === 'ui/download-file') {
    const contents = message.params.contents;
    const resource = contents?.[0]?.resource;
    const bytes = typeof resource?.blob === 'string' ? Uint8Array.from(atob(resource.blob), c => c.charCodeAt(0)) : new Uint8Array();
    const digest = await crypto.subtle.digest('SHA-256',bytes);
    const sha256 = [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
    window.t17.downloads.push({count:contents?.length,type:contents?.[0]?.type,uri:resource?.uri,mime:resource?.mimeType,bytes:bytes.length,sha256});
    reply({});
  } else if (message.method !== 'ui/notifications/size-changed') {
    event.source.postMessage({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Only this local fixture and delivery telemetry are permitted.'}},'*');
  }
});
window.t17.listener_ready = true;
document.getElementById('card').src = ${JSON.stringify(cardUrl)};
</script></body></html>`;
  const blockedRequests = [];
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message.slice(0, 400)));
  await page.route('**/*', async route => {
    if (route.request().url() === hostUrl) await route.fulfill({ contentType: 'text/html', body: hostHtml,
      headers: { 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'" } });
    else if (route.request().url() === cardUrl) await route.fulfill({ contentType: 'text/html', body: html,
      headers: { 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'" } });
    else { blockedRequests.push(route.request().url()); await route.abort('blockedbyclient'); }
  });
  const begin = Date.now();
  let stage = 'host_navigation';
  try {
    await page.goto(hostUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    const frame = page.frameLocator('#card');
    stage = 'preview_wait';
    await frame.locator('#preview').waitFor({ state: 'visible', timeout: 15_000 });
    stage = 'preview_telemetry_wait';
    await page.waitForFunction(() => window.t17.reports.includes('preview_visible'), undefined, { timeout: 5000 });
    stage = 'download_click';
    await frame.locator('#download').click();
    stage = 'download_telemetry_wait';
    await page.waitForFunction(() => window.t17.reports.includes('download_accepted'), undefined, { timeout: 20_000 });
    stage = 'download_integrity';
    const host = await page.evaluate(() => window.t17);
    const card = page.frames().find(candidate => candidate.url() === cardUrl);
    const preview = await card.evaluate(() => ({
      width: document.getElementById('preview').naturalWidth, height: document.getElementById('preview').naturalHeight,
      fixture_label_visible: !document.getElementById('fixture-label').hidden,
    }));
    assert.equal(host.original_reads, Math.ceil(fixture.image.bytes / 262144));
    assert.equal(host.downloads.length, 1);
    assert.deepEqual(host.downloads[0], { count: 1, type: 'resource', uri: original.resource.uri,
      mime: 'application/octet-stream', bytes: fixture.image.bytes, sha256: fixture.image.sha256 });
    assert.equal(preview.fixture_label_visible, true);
    assert.equal(errors.length, 0);
    assert.deepEqual(blockedRequests, []);
    return { status: 'PASS', elapsed_ms: Date.now() - begin, preview,
      original_reads: host.original_reads, download: host.downloads[0],
      host_methods: [...new Set(host.methods)], telemetry: host.reports,
      page_errors: errors, external_requests: blockedRequests,
      evidence_scope: 'local synthetic MCP App host only; not Claude Desktop', real_host_saved_original: false };
  } catch (error) {
    const host = await page.evaluate(() => ({
      listener_ready: window.t17?.listener_ready ?? false,
      initialized: window.t17?.initialized ?? false,
      methods: [...new Set(window.t17?.methods ?? [])].slice(0, 16),
      reports: (window.t17?.reports ?? []).slice(-8),
      original_reads: window.t17?.original_reads ?? 0,
      download_count: window.t17?.downloads?.length ?? 0,
    })).catch(() => ({ unavailable: true }));
    const card = page.frames().find(candidate => candidate.url() === cardUrl);
    const cardState = card ? await card.evaluate(() => ({
      ready_state: document.readyState,
      status: document.getElementById('status')?.textContent?.slice(0, 300),
      status_state: document.getElementById('status')?.dataset.state,
      preview_complete: document.getElementById('preview')?.complete ?? false,
      preview_width: document.getElementById('preview')?.naturalWidth ?? 0,
      preview_hidden: document.getElementById('preview')?.hidden ?? true,
      download_disabled: document.getElementById('download')?.disabled ?? true,
    })).catch(() => ({ unavailable: true })) : { not_loaded: true };
    error.diagnostic = { request_id: fixture.request_id, stage, host, card: cardState,
      page_errors: errors.slice(0, 10), external_requests: blockedRequests.slice(0, 10) };
    throw error;
  } finally { await page.close(); }
}

try {
  const store = new ImageStore(path.join(runDirectory, 'generated-test-images'));
  if (!previousReport) {
    context = await chromium.launchPersistentContext(path.join(runDirectory, 'synthetic-browser-profile'), {
      channel: 'msedge', headless: true, serviceWorkers: 'block', viewport: { width: 800, height: 800 }, timeout: 15_000,
    });
    for (const test of [{ name: 'small', size: 64, seed: 0x1017 },
    { name: 'normal', size: 1024, seed: 0x2017 }, { name: 'larger', size: 2048, seed: 0x3017 }]) {
    const begin = Date.now();
    const generated = await proceduralPng(test.size, test.seed);
    const metadata = await store.save(generated, `t17-offline-${test.name}`);
    const originalRead = await store.readOriginal(metadata.image_id);
    const previewBytes = await store.readPreview(metadata.image_id);
    const previewDimensions = await sharp(previewBytes).metadata();
    assert.equal(originalRead.data.equals(generated), true);
    assert.equal(metadata.sha256, hash(generated));
    assert.notEqual(metadata.original_path, metadata.preview_path);
    assert(previewBytes.length <= MAX_PREVIEW_BYTES);
    assert(previewDimensions.width <= 480 && previewDimensions.height <= 480);
    const image = { image_id: metadata.image_id, filename: metadata.filename, mime: metadata.mime,
      width: metadata.width, height: metadata.height, bytes: metadata.bytes, sha256: metadata.sha256,
      source: 'fixture', preview: { mime: 'image/png', data: previewBytes.toString('base64') } };
    const fixture = parseCardResult({ request_id: `t17-offline-${test.name}`, status: 'image_ready',
      message: 'T17 OFFLINE FIXTURE - NOT NGINI / 程式產生測試圖', source: 'fixture', image });
    const original = selectOriginalResource([{ type: 'resource', resource: {
      uri: imageResourceUri(image), mimeType: metadata.mime, blob: originalRead.data.toString('base64'),
    } }], fixture.image);
    const transport = await prepareOriginalDownload(original, fixture.image);
    assert.equal(transport.resource.blob, original.resource.blob);
    assert.equal(hash(Buffer.from(transport.resource.blob, 'base64')), metadata.sha256);
    assert.equal(original.resource.mimeType, 'image/png');
    const app = await syntheticCard(fixture, original);
    cases.push({ name: test.name, source: 'PROGRAM_GENERATED_TEST_FIXTURE_NOT_NGINI', generator: 'seeded-xorshift32 RGB with visible test banner',
      seed: test.seed, status: 'PASS', width: metadata.width, height: metadata.height,
      original_bytes: metadata.bytes, original_base64_characters: original.resource.blob.length,
      original_sha256: metadata.sha256, original_mime: metadata.mime, preview_bytes: previewBytes.length,
      preview_width: previewDimensions.width, preview_height: previewDimensions.height, preview_sha256: hash(previewBytes),
      preview_path_separate: metadata.original_path !== metadata.preview_path,
      image_store_exact_original: true, resource_exact_original: true, app,
      elapsed_ms: Date.now() - begin });
    }
  }
  const reference = cases[0];
  const baseImage = { image_id: '00000000-0000-4000-8000-000000000017', filename: 't17-fixture.png', mime: 'image/png',
    width: reference.width, height: reference.height, bytes: reference.original_bytes, sha256: reference.original_sha256 };
  await rejected('ImageStore rejects max original bytes + 1 before publishing',
    () => store.save(Buffer.alloc(MAX_ORIGINAL_BYTES + 1), 't17-over-original-limit'), 'INVALID_IMAGE');
  await rejected('Card metadata rejects max original bytes + 1',
    () => parseCardResult({ request_id: 't17-limit', status: 'image_ready', message: '', image: { ...baseImage, bytes: MAX_ORIGINAL_BYTES + 1 } }), 'INVALID_CARD_IMAGE');
  await rejected('Card rejects max preview bytes + 1',
    () => parseCardResult({ request_id: 't17-limit', status: 'image_ready', message: '', image: { ...baseImage,
      preview: { mime: 'image/png', data: Buffer.alloc(MAX_PREVIEW_BYTES + 1).toString('base64') } } }), 'INVALID_IMAGE_SIZE');
  await rejected('Card rejects dimensions above 64 million pixels',
    () => parseCardResult({ request_id: 't17-limit', status: 'image_ready', message: '', image: { ...baseImage, width: 8001, height: 8000 } }), 'INVALID_CARD_IMAGE');
  const pixelFixture = await proceduralPng(64, 0x4017);
  await rejected('Raster decode rejects fixture exceeding a configured pixel limit',
    () => validateImage(pixelFixture, { max_bytes: DEFAULT_IMAGE_LIMITS.max_bytes, max_pixels: 64 * 64 - 1 }), 'INVALID_IMAGE');
} catch (error) {
  failures.push({ status: 'FAIL', message: error.message.slice(0, 800),
    ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}) });
} finally {
  const browserVersion = context?.browser()?.version() ?? previousReport?.browser.version ?? 'unknown';
  await context?.close();
  const command = `node tests/fixtures/t17-offline.mjs${previousReport ? ' --limits-only' : ''}`;
  const previousRuns = previousReport?.verification_runs ?? (previousReport ? [{ command: previousReport.command,
    checked_at: previousReport.checked_at, status: previousReport.status, failures: previousReport.failures }] : []);
  const report = { checked_at: new Date().toISOString(), status: failures.length ? 'FAIL' : 'PASS',
    scope: 'T17 OFFLINE ImageStore/resource/current built MCP App synthetic transport; NOT Claude host acceptance',
    claude_host_T17: 'NOT_RUN', ngini_submissions: 0, claude_actions: 0,
    browser: { channel: 'msedge', version: browserVersion, mode: 'headless dedicated test profile' },
    node: process.version, image_card_html_sha256: hash(html),
    byte_limits: { original: MAX_ORIGINAL_BYTES, preview: MAX_PREVIEW_BYTES, raster_pixels: DEFAULT_IMAGE_LIMITS.max_pixels },
    command, elapsed_ms: Date.now() - started,
    verification_runs: [...previousRuns, { command, checked_at: new Date().toISOString(), status: failures.length ? 'FAIL' : 'PASS', failures }],
    prior_coverage: 'ImageStore sizes32/1024/3072 solid PNG and1024 RGBA; App synthetic only48x32. This adds multi-MiB end-to-end synthetic card messages.',
    cases, limit_cases: limits, failures,
    limitations: ['No real Claude host transport ceiling or saved file measured.',
      'Multi-MiB stdio transport is not exercised; synthetic host routes embedded tool resources through postMessage.',
      'Largest actual App payload is the reported larger fixture;25MiB maximum transport not exercised.',
      'Validation rejects oversized complete buffers; it does not prove streaming/network memory caps.',
      '64M default card metadata boundary and configured raster-decoder limit are checked; no actual >64MP raster allocated.'],
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const resolvedRun = await realpath(runDirectory);
  if (path.dirname(resolvedRun) !== fixtureDirectory || !path.basename(resolvedRun).startsWith('.t17-run-')) {
    throw new Error('Refusing to clean any folder outside the created fixture test directory');
  }
  await rm(resolvedRun, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify({ status: report.status, cases: cases.map(test => ({ name: test.name,
    bytes: test.original_bytes, preview_bytes: test.preview_bytes, app: test.app.status })),
    limits: limits.length, report: 'docs/t17-offline.json', claude_host_T17: report.claude_host_T17 })}\n`);
  if (failures.length) process.exitCode = 1;
}
