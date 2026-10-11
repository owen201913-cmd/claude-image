import type { RequestRecord } from '../jobs/state-machine.js';

export type DeliveryObservation = 'preview_visible' | 'download_accepted' | 'delivery_blocked';
type DeliveryRecord = Pick<RequestRecord, 'status' | 'image' | 'message'>;

const legacyBlockedMessage = 'DELIVERY_BLOCKED：圖片已保存，但 host 無法提供預覽或原圖下載。';
const historicalBlockedMessage = '前次圖片卡片回報交付問題；原圖已保存，可重取同一張圖片，不會重新生成。原檔下載尚未獨立驗證。';
const legacyPreviewMessage = '圖片卡片已回報預覽可見；原圖已保存，可下載同一張圖片。原檔下載尚未獨立驗證。';
const legacyDownloadMessage = '聊天客戶端已接受同一張原圖的下載；是否已保存原檔及雜湊尚未獨立驗證。';
const historicalPreviewMessage = '此任務曾由圖片卡片回報預覽可見；不代表目前對話的卡片已載入。原圖已保存，原檔下載尚未獨立驗證。';
const historicalDownloadMessage = '此任務曾由聊天客戶端回報已接受同一張原圖的下載；不代表目前對話已顯示圖片或保存原檔，雜湊尚未獨立驗證。';

function canObserveDelivery(record: DeliveryRecord): boolean {
  return Boolean(record.image && (record.status === 'image_ready' || record.status === 'presenting'));
}

/** A previous card's observation cannot establish this card/host's capabilities. */
export function deliveryMessageForClient(record: DeliveryRecord): string | undefined {
  if (!canObserveDelivery(record)) return record.message;
  if (record.message === legacyBlockedMessage) return historicalBlockedMessage;
  if (record.message === legacyPreviewMessage) return historicalPreviewMessage;
  if (record.message === legacyDownloadMessage) return historicalDownloadMessage;
  return record.message;
}

/** Card observations never establish an independently saved original or delivered state. */
export function deliveryObservationPatch(record: DeliveryRecord, observation: DeliveryObservation): {
  status: 'presenting'; message: string;
} | undefined {
  if (!canObserveDelivery(record)) return undefined;
  const messages: Record<DeliveryObservation, string> = {
    delivery_blocked: historicalBlockedMessage,
    preview_visible: historicalPreviewMessage,
    download_accepted: historicalDownloadMessage,
  };
  return { status: 'presenting', message: messages[observation] };
}
