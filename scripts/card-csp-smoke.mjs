import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
export const STRICT_CARD_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const HOST_URL = 'https://bridge.test/host';
const CARD_URL = 'https://bridge.test/card';

/** Local synthetic host only. All URLs are fulfilled or aborted; no provider calls. */
export async function runCardCspSmoke(options = {}) {
  const htmlPath = path.resolve(options.htmlPath ?? path.join(root, 'dist/ui/image-card.html'));
  const html = await readFile(htmlPath, 'utf8');
  const profileDir = path.resolve(options.profileDir ?? path.join(root, '.runtime/card-csp-browser-profile'));
  const label = options.label ?? 'current';
  const initialHeight = options.initialHeight ?? 420;
  if (!Number.isSafeInteger(initialHeight) || initialHeight < 0 || initialHeight > 2000) throw new Error('Invalid synthetic iframe height');
  const applySizeNotifications = options.applySizeNotifications === true;
  const syntheticSource = options.syntheticSource ?? 'fixture';
  if (!['fixture', 'ngini'].includes(syntheticSource)) throw new Error('Invalid synthetic presentation source');
  const image = await sharp({ create: { width: 48, height: 32, channels: 3, background: '#507baf' } }).png().toBuffer();
  const imageId = randomUUID();
  const fixture = {
    request_id: 'csp-smoke-fixture', status: 'image_ready',
    delivery_mode: 'app_poll',
    message: options.fixtureMessage ?? 'STRICT CSP SMOKE — local fixture, no Ngini submission', source: syntheticSource,
    image: {
      image_id: imageId, filename: `ngini-${imageId}.png`, mime: 'image/png',
      width: 48, height: 32, bytes: image.length,
      sha256: createHash('sha256').update(image).digest('hex'), source: syntheticSource,
      preview: { mime: 'image/png', data: image.toString('base64') },
    },
  };
  const hostHtml = `<!doctype html><html><head><meta charset="utf-8"></head><body><iframe id="card" title="Synthetic MCP App" src="${CARD_URL}" width="600" height="${initialHeight}"></iframe>
<script>
window.smokeHost = { methods: [], initialized: false, reports: [], original_reads: [], downloads: [], resize_messages: [] };
const result = ${JSON.stringify(fixture).replace(/</g, '\\u003c')};
const facts = { request_id: result.request_id, status: result.status, delivery_mode: result.delivery_mode };
addEventListener('message', event => {
  if (event.source !== document.getElementById('card').contentWindow) return;
  const message = event.data;
  if (message?.jsonrpc !== '2.0' || typeof message.method !== 'string') return;
  window.smokeHost.methods.push(message.method);
  const reply = response => event.source.postMessage({ jsonrpc: '2.0', id: message.id, result: response }, '*');
  if (message.method === 'ui/initialize') {
    reply({ protocolVersion: message.params.protocolVersion,
      hostInfo: { name: 'Strict CSP synthetic host', version: '1' },
      hostCapabilities: { serverTools: {}, downloadFile: {} }, hostContext: { theme: 'light' } });
  } else if (message.method === 'ui/notifications/initialized') {
    window.smokeHost.initialized = true;
    event.source.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result',
      params: { content: [{ type: 'text', text: JSON.stringify(facts) }], structuredContent: facts,
        _meta: { 'ngini-image-bridge/card': result } } }, '*');
  } else if (message.method === 'tools/call') {
    if (message.params?.name === 'ngini_report_delivery') {
      window.smokeHost.reports.push(message.params.arguments?.evidence);
      reply({ content: [{ type: 'text', text: 'Synthetic evidence accepted.' }] });
    } else if (message.params?.name === 'ngini_read_image_chunk' && message.params.arguments?.image_id === result.image.image_id && message.params.arguments?.offset === 0) {
      window.smokeHost.original_reads.push(message.params.arguments.image_id);
      reply({ content: [{ type: 'text', text: 'Synthetic original chunk.' }], structuredContent: {
        image_id: result.image.image_id, total_bytes: result.image.bytes, offset: 0, next_offset: null,
        sha256: result.image.sha256, data: result.image.preview.data } });
    } else {
      event.source.postMessage({ jsonrpc: '2.0', id: message.id,
        error: { code: -32601, message: 'Synthetic host permits only this fixture and delivery reporting.' } }, '*');
    }
  } else if (message.method === 'ui/download-file') {
    window.smokeHost.downloads.push(message.params.contents);
    reply({});
  } else if (message.method === 'ui/notifications/size-changed') {
    const height = message.params?.height;
    window.smokeHost.resize_messages.push({ height, width: message.params?.width,
      after_initialized: window.smokeHost.initialized });
    if (${applySizeNotifications} && Number.isFinite(height) && height >= 0 && height <= 2000) {
      document.getElementById('card').style.height = height + 'px';
    }
  }
});
</script></body></html>`;
  const consoleMessages = [];
  const pageErrors = [];
  const abortedUrls = [];
  const startedAt = Date.now();
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'msedge', headless: true, viewport: { width: 800, height: 640 },
    serviceWorkers: 'block', timeout: 15_000,
  });
  try {
    await context.addInitScript(() => {
      window.smokeCspEvents = [];
      document.addEventListener('securitypolicyviolation', event => {
        window.smokeCspEvents.push({
          violatedDirective: event.violatedDirective,
          effectiveDirective: event.effectiveDirective,
          blockedURI: event.blockedURI,
          disposition: event.disposition,
          sourceFile: event.sourceFile,
          lineNumber: event.lineNumber,
          columnNumber: event.columnNumber,
        });
      });
    });
    await context.route('**/*', async route => {
      if (route.request().url() === HOST_URL) {
        await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: hostHtml,
          headers: { 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; form-action 'none'" } });
      } else if (route.request().url() === CARD_URL) {
        await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html,
          headers: { 'content-security-policy': STRICT_CARD_CSP } });
      } else {
        abortedUrls.push(route.request().url());
        await route.abort('blockedbyclient');
      }
    });
    const page = await context.newPage();
    page.on('console', message => {
      if (['warning', 'error'].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text().slice(0, 1200) });
    });
    page.on('pageerror', error => pageErrors.push(error.message.slice(0, 1200)));
    await page.goto(HOST_URL, { waitUntil: 'domcontentloaded', timeout: 10_000 });
    const iframe = page.frameLocator('#card');
    let renderError;
    let previewStatus;
    try {
      await iframe.locator('#preview').waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForFunction(() => window.smokeHost?.reports.includes('preview_visible'), undefined, { timeout: 1000 });
      previewStatus = await iframe.locator('#status').textContent();
      if (options.exerciseDownload !== false) {
        const originalDownload = iframe.getByRole('button', { name: '下載原圖', exact: true });
        if (await originalDownload.count() !== 1) throw new Error('Picture has no accessible original-download action');
        if (options.downloadViaKeyboard === true) {
          await originalDownload.focus();
          await originalDownload.press('Enter');
        } else await iframe.locator('#preview').click({ timeout: 2000 });
        await page.waitForFunction(() => window.smokeHost?.reports.includes('download_accepted'), undefined, { timeout: 5000 });
        await iframe.locator('#status').waitFor({ state: 'hidden', timeout: 1000 });
      }
    } catch (error) {
      renderError = error.message.slice(0, 800);
    }
    const card = page.frames().find(frame => frame.url() === CARD_URL);
    const cardState = card ? await card.evaluate(() => {
      const preview = document.getElementById('preview');
      const status = document.getElementById('status');
      const recovery = document.getElementById('recovery');
      const download = document.getElementById('download');
      const main = document.querySelector('main');
      const extraVerticalSpace = main.getBoundingClientRect().height - preview.getBoundingClientRect().height;
      return { status: document.getElementById('status')?.textContent,
        previewVisible: Boolean(preview && !preview.hidden && preview.naturalWidth > 0),
        previewWidth: preview?.naturalWidth ?? 0,
        previewRenderedHeight: preview.getBoundingClientRect().height,
        originalDownloadAccessibleLabel: download?.getAttribute('aria-label'),
        pictureIsDownloadAction: Boolean(download?.contains(preview)),
        imageOnlyReady: Boolean(status.hidden && recovery.hidden && document.getElementById('details').hidden &&
          !document.querySelector('h1') && download.contains(preview) && extraVerticalSpace <= 1),
        extraVerticalSpace,
        fixtureLabelVisible: !document.getElementById('fixture-label')?.hidden,
        cspEvents: window.smokeCspEvents ?? [] };
    }) : { previewVisible: false, cspEvents: [], status: 'CARD_FRAME_MISSING' };
    const host = await page.evaluate(() => window.smokeHost);
    const finalIframeHeight = await page.locator('#card').evaluate(element => element.clientHeight);
    const downloaded = host.downloads[0]?.[0];
    const expectedUri = `ngini-image://original/${imageId}/${fixture.image.filename}`;
    const downloadedBytes = downloaded?.type === 'resource' && typeof downloaded.resource?.blob === 'string'
      ? Buffer.from(downloaded.resource.blob, 'base64') : undefined;
    const downloadMatches = Boolean(host.downloads.length === 1 && host.downloads[0].length === 1 &&
      downloaded?.resource.uri === expectedUri && downloaded?.resource.mimeType === 'application/octet-stream' &&
      downloadedBytes?.equals(image));
    const report = {
      label, date: new Date().toISOString(), evidence_scope: 'synthetic strict-CSP host; not Claude Desktop acceptance',
      synthetic_source_marker: syntheticSource, synthetic_image_never_generated_by_ngini: true,
      html_sha256: createHash('sha256').update(html).digest('hex'),
      browser: context.browser()?.version() ?? 'unknown',
      live_submissions: 0, network_policy: 'only local route.fulfill; all other requests aborted',
      csp: STRICT_CARD_CSP, elapsed_ms: Date.now() - startedAt,
      initial_iframe_height: initialHeight, applied_size_notifications: applySizeNotifications,
      final_iframe_height: finalIframeHeight, resize_messages: host.resize_messages.slice(0, 20),
      initialized: host.initialized, host_methods: [...new Set(host.methods)], delivery_reports: host.reports,
      preview_status: previewStatus,
      original_reads: host.original_reads, synthetic_download_count: host.downloads.length,
      ...(downloaded ? { synthetic_download_transport_mime: downloaded.resource?.mimeType } : {}),
      synthetic_download_matches_original: downloadMatches,
      ...(downloadedBytes ? { synthetic_download_sha256: createHash('sha256').update(downloadedBytes).digest('hex'),
        original_sha256: fixture.image.sha256, synthetic_download_bytes: downloadedBytes.length } : {}),
      real_host_saved_original: false,
      ...cardState, console_messages: consoleMessages.slice(0, 20), page_errors: pageErrors.slice(0, 20),
      aborted_urls: [...new Set(abortedUrls)].slice(0, 20), ...(renderError ? { render_error: renderError } : {}),
    };
    if (options.reportPath) {
      const reportPath = path.resolve(options.reportPath);
      await mkdir(path.dirname(reportPath), { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    return report;
  } finally {
    await context.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runCardCspSmoke({ htmlPath: process.argv[2], label: process.argv[4] });
  if (!report.initialized || !report.previewVisible || !report.fixtureLabelVisible ||
      report.synthetic_download_count !== 1 || !report.synthetic_download_matches_original ||
      report.synthetic_download_sha256 !== report.original_sha256 ||
      report.cspEvents.length || report.page_errors.length || report.aborted_urls.length) {
    throw new Error('Strict-CSP card verification failed; no PASS evidence was written');
  }
  report.test_status = 'PASS';
  await writeFile(path.resolve(process.argv[3] ?? path.join(root, 'docs/card-csp-smoke.json')), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
