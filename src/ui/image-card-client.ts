import './schema-config.js';
import { App, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { parseCardToolResult, assembleOriginalDownload, decodeBase64, type CardResult } from './card-contract.js';
import { ACTIVE_CARD_STATUSES, CardPoller, cardQueryErrorMessage, cardStatusMessage } from './card-polling.js';

const app = new App({ name: 'Ngini image card', version: '0.1.0' }, {}, { autoResize: true });
const main = document.querySelector<HTMLElement>('main')!;
const header = document.querySelector<HTMLElement>('header')!;
const status = document.querySelector<HTMLElement>('#status')!;
const preview = document.querySelector<HTMLImageElement>('#preview')!;
const previewLabel = document.querySelector<HTMLElement>('#preview-label')!;
const fixtureLabel = document.querySelector<HTMLElement>('#fixture-label')!;
const details = document.querySelector<HTMLElement>('#details')!;
const imageFrame = document.querySelector<HTMLElement>('#image-frame')!;
const downloadLabel = document.querySelector<HTMLElement>('#download-label')!;
const recovery = document.querySelector<HTMLElement>('#recovery')!;
const download = document.querySelector<HTMLButtonElement>('#download')!;
const refresh = document.querySelector<HTMLButtonElement>('#refresh')!;
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!;
let result: CardResult | undefined;
let connected = false;
let revision = 0;
let inFlight = false;
let downloadInFlight = false;
let awaitingHostDownload = false;
let downloadController: AbortController | undefined;
let previewReady = false;
let statusNeedsAttention = true;
let hostStopped = false;
let disposed = false;
let publishedPreviewKey: string | undefined;
const readyImageStatuses = new Set(['image_ready', 'presenting', 'delivered']);
// Download confirmation is a human action. The pinned MCP SDK defaults to
// 60 seconds and cancels the request on expiry; allow a bounded manual wait.
const HOST_DOWNLOAD_CONFIRMATION_TIMEOUT_MS = 10 * 60 * 1000;
const poller = new CardPoller({
  read: requestId => app.callServerTool({ name: 'ngini_get_result', arguments: { request_id: requestId } }, { timeout: 15_000 }),
  result: value => render(value),
  message: (message, isBlocked) => { setStatus(message, isBlocked); updateControls(); },
  settled: () => updateControls(),
});

function setStatus(message: string, blocked = false, needsAttention = true): void {
  status.textContent = message;
  status.dataset.state = blocked ? 'blocked' : 'normal';
  statusNeedsAttention = blocked || needsAttention;
  updateControls();
}

async function report(evidence: 'preview_visible' | 'download_accepted' | 'delivery_blocked', requestId: string): Promise<void> {
  if (hostStopped || disposed || !connected || !app.getHostCapabilities()?.serverTools) return;
  try {
    await app.callServerTool({ name: 'ngini_report_delivery', arguments: { request_id: requestId, evidence } });
  } catch {
    // A telemetry failure must not trigger a new generation or hide the real result.
  }
}

function blocked(message: string, requestId = result?.request_id): void {
  setStatus(`DELIVERY_BLOCKED：${message}`, true);
  if (requestId) void report('delivery_blocked', requestId);
}

async function publishModelPreview(next: CardResult): Promise<void> {
  const capabilities = app.getHostCapabilities()?.updateModelContext;
  const image = next.image;
  if (hostStopped || disposed || !connected || !capabilities?.image || !image?.preview ||
      (!capabilities.text && !capabilities.structuredContent)) return;
  try { decodeBase64(image.preview.data, 256 * 1024); } catch { return; }
  const key = `${next.request_id}:${image.image_id}:${image.sha256}`;
  if (publishedPreviewKey === key) return;
  publishedPreviewKey = key;
  const metadata = { request_id: next.request_id, image_id: image.image_id, image_sha256: image.sha256,
    status: next.status, source: next.source ?? image.source ?? 'unknown',
    ...(next.provider_image_count !== undefined ? { provider_image_count: next.provider_image_count } : {}),
    evidence: 'visible preview only; not verified content match or saved original', available_in: 'future_turn' };
  try {
    await app.updateModelContext({ content: [
      ...(capabilities.text ? [{ type: 'text' as const, text: JSON.stringify(metadata) }] : []),
      { type: 'image' as const, mimeType: image.preview.mime, data: image.preview.data },
    ], ...(capabilities.structuredContent ? { structuredContent: metadata } : {}) }, { timeout: 5000 });
  } catch {
    // A future-turn context update is optional. It never triggers a model message or a new generation.
  }
}

function updateControls(): void {
  const serverTools = Boolean(connected && app.getHostCapabilities()?.serverTools);
  main.dataset.serverTools = String(serverTools);
  main.dataset.downloadFile = String(Boolean(connected && app.getHostCapabilities()?.downloadFile));
  const stopped = hostStopped || disposed;
  const isFixture = result?.source === 'fixture' || result?.image?.source === 'fixture';
  const minimalReady = Boolean(!stopped && result?.image && previewReady &&
    readyImageStatuses.has(result.status) && !statusNeedsAttention && !downloadInFlight);
  main.dataset.display = minimalReady ? 'image' : 'status';
  header.hidden = !isFixture || !previewReady;
  status.hidden = minimalReady;
  details.hidden = true;
  imageFrame.hidden = !result?.image;
  downloadLabel.hidden = previewReady;
  download.disabled = stopped || !result?.image || !serverTools || downloadInFlight ||
    !app.getHostCapabilities()?.downloadFile;
  const active = Boolean(result && ACTIVE_CARD_STATUSES.has(result.status));
  refresh.hidden = stopped || !result || minimalReady || downloadInFlight;
  cancel.hidden = stopped || (!downloadInFlight && (Boolean(result?.image) || (!active && result?.status !== 'failed')));
  recovery.hidden = refresh.hidden && cancel.hidden;
  cancel.textContent = downloadInFlight && !awaitingHostDownload ? '停止取得原圖' : '停止本機等待';
  refresh.disabled = stopped || !serverTools || inFlight || poller.querying || downloadInFlight;
  cancel.disabled = stopped || (downloadInFlight ? false : !serverTools || inFlight);
}

function render(next: CardResult): void {
  if (hostStopped || disposed) return;
  if (downloadController && (next.request_id !== result?.request_id || next.image?.image_id !== result?.image?.image_id ||
      next.image?.sha256 !== result?.image?.sha256 || next.image?.bytes !== result?.image?.bytes || next.status === 'cancelled')) {
    downloadController.abort();
  }
  result = next;
  const currentRevision = ++revision;
  previewReady = false;
  preview.removeAttribute('src');
  preview.hidden = true;
  previewLabel.hidden = true;
  fixtureLabel.hidden = next.source !== 'fixture' && next.image?.source !== 'fixture';
  details.textContent = '';
  const deliveryIssue = next.message.includes('DELIVERY_BLOCKED') ||
    next.message.startsWith('前次圖片卡片回報交付問題');
  const multipleImages = Boolean(next.image && readyImageStatuses.has(next.status) &&
    next.provider_image_count !== undefined && next.provider_image_count > 1);
  const countMessage = `服務回傳 ${next.provider_image_count} 張；此處交付 1 張關聯圖片。`;
  setStatus(multipleImages && !deliveryIssue ? countMessage : cardStatusMessage(next), next.status === 'failed',
    !next.image || !readyImageStatuses.has(next.status) || deliveryIssue || multipleImages);
  const image = next.image;
  if (image) {
    if (image.preview) {
      preview.onload = () => {
        if (currentRevision !== revision || !result) return;
        previewReady = true;
        preview.hidden = false;
        previewLabel.hidden = false;
        if ((next.message?.includes('DELIVERY_BLOCKED') ||
             next.message?.startsWith('前次圖片卡片回報交付問題')) && readyImageStatuses.has(next.status) && connected &&
            app.getHostCapabilities()?.serverTools && app.getHostCapabilities()?.downloadFile) {
          setStatus(multipleImages ? countMessage : '預覽已顯示；可下載同一張原圖，保存結果尚待驗證。', false, multipleImages);
        }
        updateControls();
        void report('preview_visible', result.request_id);
        void publishModelPreview(next);
      };
      preview.onerror = () => {
        if (currentRevision === revision) blocked('無法顯示預覽；已保存的原圖仍可重取。', next.request_id);
      };
      preview.alt = fixtureLabel.hidden ? '本次圖片的預覽' : '測試圖片預覽，並非 Ngini 生成';
      preview.src = `data:${image.preview.mime};base64,${image.preview.data}`;
    } else {
      blocked('工具尚未提供可顯示的預覽。', next.request_id);
    }
    if (connected && !app.getHostCapabilities()?.downloadFile) {
      blocked('目前的聊天客戶端未宣告原圖下載能力。', next.request_id);
    } else if (connected && !app.getHostCapabilities()?.serverTools) {
      blocked('目前的聊天客戶端未宣告本機工具橋接能力。', next.request_id);
    }
  }
  updateControls();
  poller.update(next, connected, Boolean(app.getHostCapabilities()?.serverTools));
}

async function refreshResult(): Promise<void> {
  if (hostStopped || disposed || inFlight) return;
  await poller.refresh();
  updateControls();
}

download.addEventListener('click', async () => {
  if (hostStopped || disposed || downloadInFlight || !result?.image || !connected) return;
  const current = result;
  const image = current.image!;
  if (!app.getHostCapabilities()?.downloadFile || !app.getHostCapabilities()?.serverTools) {
    blocked('目前的聊天客戶端不支援原圖下載。', current.request_id);
    return;
  }
  downloadInFlight = true;
  awaitingHostDownload = false;
  const controller = new AbortController();
  downloadController = controller;
  const stillCurrent = () => !hostStopped && !disposed && result?.request_id === current.request_id
    && result.image?.image_id === image.image_id && result.image.sha256 === image.sha256 && result.image.bytes === image.bytes;
  setStatus('正在取得原圖…');
  try {
    const downloadable = await assembleOriginalDownload(image, (offset, signal) => app.callServerTool({
      name: 'ngini_read_image_chunk', arguments: { image_id: image.image_id, offset },
    }, { signal, timeout: 15_000 }), controller.signal);
    if (controller.signal.aborted) throw new Error('ORIGINAL_DOWNLOAD_CANCELLED');
    awaitingHostDownload = true;
    if (stillCurrent()) setStatus('原圖已驗證；請完成聊天客戶端的下載確認與保存。');
    const outcome = await app.downloadFile({ contents: [downloadable] }, {
      signal: controller.signal, timeout: HOST_DOWNLOAD_CONFIRMATION_TIMEOUT_MS,
    });
    if (controller.signal.aborted) throw new Error('ORIGINAL_DOWNLOAD_CANCELLED');
    if (outcome.isError) {
      // A returned denial is definite; a thrown timeout/connection loss below
      // does not establish whether the host already saved the original.
      if (stillCurrent()) blocked('聊天客戶端未接受這次下載請求；原圖仍可重取。', current.request_id);
      return;
    }
    await report('download_accepted', current.request_id);
    if (stillCurrent()) {
      const multipleImages = current.provider_image_count !== undefined && current.provider_image_count > 1;
      setStatus(multipleImages ? `服務回傳 ${current.provider_image_count} 張；此處交付 1 張關聯圖片。` :
        '已交給聊天客戶端下載，請依下載視窗保存。', false, multipleImages);
    }
  } catch {
    if (stillCurrent()) {
      if (awaitingHostDownload) {
        // Stopping local response waiting cannot undo a host save or establish
        // that its dialog closed. Never retry a host download automatically.
        setStatus(controller.signal.aborted
          ? '已停止本機下載回覆等待；是否已保存尚未確認，請先檢查原下載視窗或保存位置。'
          : '尚未收到聊天客戶端的下載回覆；是否已保存尚未確認，請先檢查下載視窗或保存位置，再決定是否重試。');
      } else if (controller.signal.aborted) {
        setStatus('已停止取得原圖；可重新下載同一張圖片，不會重新生圖。');
      } else {
        blocked('原圖讀取或驗證失敗；可重試取得同一張圖片，不會重新生圖。', current.request_id);
      }
    }
  } finally {
    if (downloadController === controller) downloadController = undefined;
    downloadInFlight = false;
    awaitingHostDownload = false;
    updateControls();
  }
});

refresh.addEventListener('click', () => { void refreshResult(); });
cancel.addEventListener('click', async () => {
  if (hostStopped || disposed) return;
  if (downloadInFlight) { downloadController?.abort(); return; }
  if (!result || inFlight || !connected || !app.getHostCapabilities()?.serverTools) return;
  poller.stop();
  const requestId = result.request_id;
  inFlight = true;
  updateControls();
  try {
    const response = await app.callServerTool({ name: 'ngini_cancel_generation', arguments: { request_id: requestId } });
    if (requestId === result?.request_id) render(parseCardToolResult(response));
  } catch {
    if (!hostStopped && !disposed) setStatus('未能確認本機等待是否已停止；不會重新提交。', true);
  } finally { inFlight = false; updateControls(); }
});

// Set handlers before the handshake so the initial result cannot be missed.
app.ontoolresult = (response) => {
  if (disposed) return;
  const queryError = cardQueryErrorMessage(response);
  if (queryError) { setStatus(queryError, true); return; }
  try {
    const next = parseCardToolResult(response);
    if (hostStopped) poller.resume();
    hostStopped = false;
    render(next);
  } catch { if (!hostStopped) blocked('收到的圖片卡片資料無效。'); }
};
app.ontoolcancelled = () => {
  if (disposed) return;
  hostStopped = true;
  ++revision;
  downloadController?.abort();
  poller.stop();
  setStatus('已停止本機處理；網站已使用的額度不一定返還。');
};
app.onhostcontextchanged = (context) => {
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.theme) document.documentElement.dataset.theme = context.theme;
};
app.onteardown = () => {
  disposed = true;
  ++revision;
  downloadController?.abort();
  poller.stop();
  return {};
};

async function connect(): Promise<void> {
  try {
    await app.connect();
    if (disposed) return;
    connected = true;
    const context = app.getHostContext();
    if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
    if (context?.theme) document.documentElement.dataset.theme = context.theme;
    if (hostStopped) updateControls();
    else if (result) render(result);
    else setStatus('等待本次圖片結果…');
  } catch {
    if (!hostStopped && !disposed) blocked('無法連接圖片卡片與聊天客戶端。');
  }
}
void connect();
