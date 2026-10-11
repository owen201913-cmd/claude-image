import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** The card accepts identifiers and data supplied by this bridge, never a URL or file path. */
export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 1024 * 1024;
export const ORIGINAL_CHUNK_BYTES = 256 * 1024;
export const CARD_RESULT_META_KEY = 'ngini-image-bridge/card';
const identifier = /^[A-Za-z0-9_-]{1,128}$/;
const requestIdentifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const filename = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const supportedMimes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const imageOnlyReplyContract = 'For an image-only request, the attached image card is the response. Finish that turn without an additional assistant message.';

export interface CardImage {
  image_id: string;
  filename: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  source?: 'fixture' | 'ngini';
  preview?: { mime: string; data: string };
}

export interface CardResult {
  request_id: string;
  status: string;
  message: string;
  source?: 'fixture' | 'ngini';
  image?: CardImage;
  provider_image_count?: number;
}

export interface OriginalImageResource {
  type: 'resource';
  resource: { uri: string; mimeType: string; blob: string };
}

export interface BinaryDownloadResource {
  type: 'resource';
  resource: { uri: string; mimeType: 'application/octet-stream'; blob: string };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only a valid ready App image receives the bridge-owned reply contract. */
function hasReadyAppImage(card: Record<string, unknown>, quotaExhausted: boolean): boolean {
  if (card.delivery_mode !== 'app_poll' ||
      !['image_ready', 'presenting', 'delivered'].includes(card.status as string) ||
      card.error !== undefined || (card.query_error !== undefined && card.query_error !== false) || quotaExhausted ||
      (card.provider_image_count !== undefined && card.provider_image_count !== 1)) return false;
  try { return parseCardResult(card).image !== undefined; }
  catch { return false; }
}

/** Full card data is App metadata; public facts retain their original identity contract. */
export function imageCardToolResult(card: Record<string, unknown>): CallToolResult {
  const facts: Record<string, unknown> = {
    request_id: card.request_id, status: card.status, delivery_mode: card.delivery_mode,
    ...(typeof card.provider_image_count === 'number' && card.provider_image_count > 1
      ? { provider_image_count: card.provider_image_count } : {}),
    ...(card.error !== undefined ? { error: card.error } : {}),
    ...(card.query_error === true ? { query_error: true } : {}),
  };
  const quotaExhausted = record(card.quota) && card.quota.availability === 'exhausted';
  if (card.error !== undefined || card.query_error === true || card.status === 'failed' || card.status === 'cancelled' || quotaExhausted) {
    facts.message = card.message;
    facts.source = card.source ?? 'unknown';
    if (card.quota !== undefined) facts.quota = card.quota;
  }
  const content: CallToolResult['content'] = [{ type: 'text', text: JSON.stringify(facts) }];
  // A model instruction hypothesis, not proof of host rendering, file saving, or silence.
  // Never interpolate provider text into this server-owned reply contract.
  if (hasReadyAppImage(card, quotaExhausted)) content.push({ type: 'text', text: imageOnlyReplyContract });
  return { content, structuredContent: facts,
    _meta: { [CARD_RESULT_META_KEY]: card }, isError: card.status === 'failed' };
}

/** A malformed new payload cannot silently downgrade to the legacy structured shape. */
export function parseCardToolResult(response: unknown): CardResult {
  if (!record(response)) throw new Error('INVALID_CARD_RESULT');
  const metadata = response._meta;
  if (metadata !== undefined && !record(metadata)) throw new Error('INVALID_CARD_METADATA');
  if (record(metadata) && Object.prototype.hasOwnProperty.call(metadata, CARD_RESULT_META_KEY)) {
    const card = parseCardResult(metadata[CARD_RESULT_META_KEY]);
    const facts = response.structuredContent;
    if (!record(facts) || facts.request_id !== card.request_id || facts.status !== card.status) {
      throw new Error('CARD_PUBLIC_IDENTITY_MISMATCH');
    }
    return card;
  }
  return parseCardResult(response.structuredContent);
}

export function decodeBase64(data: string, maxBytes: number): Uint8Array<ArrayBuffer> {
  if (!data || data.length > Math.ceil(maxBytes / 3) * 4 || data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error('INVALID_IMAGE_DATA');
  }
  const decoded = atob(data);
  if (decoded.length === 0 || decoded.length > maxBytes) throw new Error('INVALID_IMAGE_SIZE');
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export function parseCardResult(value: unknown): CardResult {
  if (!record(value) || typeof value.request_id !== 'string' || !requestIdentifier.test(value.request_id) ||
      typeof value.status !== 'string' || !/^[A-Za-z_]{1,64}$/.test(value.status) ||
      typeof value.message !== 'string' || value.message.length > 2000) {
    throw new Error('INVALID_CARD_RESULT');
  }
  const result: CardResult = {
    request_id: value.request_id, status: value.status, message: value.message,
  };
  if (value.source === 'fixture' || value.source === 'ngini') result.source = value.source;
  if (Number.isSafeInteger(value.provider_image_count) && (value.provider_image_count as number) >= 1 &&
      (value.provider_image_count as number) <= 1000) result.provider_image_count = value.provider_image_count as number;
  if (value.image === undefined) return result;
  const image = value.image;
  if (!record(image) || typeof image.image_id !== 'string' || !identifier.test(image.image_id) ||
      typeof image.filename !== 'string' || !filename.test(image.filename) || image.filename.includes('..') ||
      typeof image.mime !== 'string' || !supportedMimes.has(image.mime) ||
      !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) ||
      (image.width as number) < 1 || (image.height as number) < 1 ||
      (image.width as number) * (image.height as number) > 64_000_000 ||
      !Number.isSafeInteger(image.bytes) || (image.bytes as number) < 1 ||
      (image.bytes as number) > MAX_ORIGINAL_BYTES ||
      typeof image.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(image.sha256)) {
    throw new Error('INVALID_CARD_IMAGE');
  }
  result.image = {
    image_id: image.image_id, filename: image.filename, mime: image.mime,
    width: image.width as number, height: image.height as number,
    bytes: image.bytes as number, sha256: image.sha256,
  };
  if (image.source === 'fixture' || image.source === 'ngini') result.image.source = image.source;
  if (image.preview !== undefined) {
    if (!record(image.preview) || typeof image.preview.mime !== 'string' ||
        !supportedMimes.has(image.preview.mime) || typeof image.preview.data !== 'string') {
      throw new Error('INVALID_PREVIEW');
    }
    decodeBase64(image.preview.data, MAX_PREVIEW_BYTES);
    result.image.preview = { mime: image.preview.mime, data: image.preview.data };
  }
  return result;
}

/** Virtual resource identity. The host receives embedded bytes and does not fetch this URI. */
export function imageResourceUri(image: Pick<CardImage, 'image_id' | 'filename'>): string {
  if (!identifier.test(image.image_id) || !filename.test(image.filename) || image.filename.includes('..')) {
    throw new Error('INVALID_IMAGE_IDENTIFIER');
  }
  return `ngini-image://original/${image.image_id}/${image.filename}`;
}

export function selectOriginalResource(content: unknown, image: CardImage): OriginalImageResource {
  if (!Array.isArray(content) || content.length > 8) throw new Error('INVALID_ORIGINAL_RESULT');
  const resources = content.filter((item) => record(item) && item.type === 'resource');
  if (resources.length !== 1 || !record(resources[0]) || !record(resources[0].resource)) {
    throw new Error('INVALID_ORIGINAL_RESULT');
  }
  const resource = resources[0].resource;
  if (resource.uri !== imageResourceUri(image) || resource.mimeType !== image.mime ||
      typeof resource.blob !== 'string' || resource.text !== undefined) {
    throw new Error('ORIGINAL_IDENTITY_MISMATCH');
  }
  return { type: 'resource', resource: {
    uri: resource.uri as string, mimeType: resource.mimeType as string, blob: resource.blob,
  } };
}

export async function verifyOriginal(resource: { resource: { blob: string } }, image: CardImage): Promise<void> {
  const data = decodeBase64(resource.resource.blob, MAX_ORIGINAL_BYTES);
  await verifyOriginalBytes(data, image);
}

async function verifyOriginalBytes(data: Uint8Array<ArrayBuffer>, image: CardImage): Promise<void> {
  if (data.byteLength !== image.bytes) throw new Error('ORIGINAL_SIZE_MISMATCH');
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== image.sha256) throw new Error('ORIGINAL_HASH_MISMATCH');
}

function checkDownloadAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('ORIGINAL_DOWNLOAD_CANCELLED');
}

function encodeBase64(data: Uint8Array): string {
  const parts: string[] = [];
  for (let offset = 0; offset < data.length; offset += 32768) {
    parts.push(String.fromCharCode(...data.subarray(offset, offset + 32768)));
  }
  return btoa(parts.join(''));
}

/** Sequential bounded tool responses; only the final download bridge receives the full original. */
export async function assembleOriginalDownload(
  image: CardImage,
  readChunk: (offset: number, signal?: AbortSignal) => Promise<unknown>,
  signal?: AbortSignal,
): Promise<BinaryDownloadResource> {
  const uri = imageResourceUri(image);
  if (!Number.isSafeInteger(image.bytes) || image.bytes < 1 || image.bytes > MAX_ORIGINAL_BYTES ||
      !/^[a-f0-9]{64}$/.test(image.sha256) || !supportedMimes.has(image.mime)) {
    throw new Error('INVALID_CARD_IMAGE');
  }
  checkDownloadAbort(signal);
  const original = new Uint8Array(image.bytes);
  for (let offset = 0; offset < original.length;) {
    checkDownloadAbort(signal);
    const response = await readChunk(offset, signal);
    checkDownloadAbort(signal);
    if (!record(response) || response.isError === true || !record(response.structuredContent)) {
      throw new Error('ORIGINAL_CHUNK_READ_FAILED');
    }
    const chunk = response.structuredContent;
    if (chunk.image_id !== image.image_id || chunk.total_bytes !== image.bytes ||
        chunk.sha256 !== image.sha256 || chunk.offset !== offset || typeof chunk.data !== 'string') {
      throw new Error('ORIGINAL_CHUNK_IDENTITY_MISMATCH');
    }
    const data = decodeBase64(chunk.data, ORIGINAL_CHUNK_BYTES);
    const expectedLength = Math.min(ORIGINAL_CHUNK_BYTES, original.length - offset);
    const nextOffset = offset + expectedLength;
    if (data.byteLength !== expectedLength ||
        chunk.next_offset !== (nextOffset === original.length ? null : nextOffset)) {
      throw new Error('ORIGINAL_CHUNK_BOUNDARY_MISMATCH');
    }
    original.set(data, offset);
    offset = nextOffset;
  }
  checkDownloadAbort(signal);
  await verifyOriginalBytes(original, image);
  checkDownloadAbort(signal);
  return { type: 'resource', resource: { uri, mimeType: 'application/octet-stream', blob: encodeBase64(original) } };
}

/**
 * The read tool retains the image's canonical MIME. Only the host download request
 * uses binary transport as a candidate to avoid host-added image metadata;
 * URI and bytes stay exact before transmission.
 * This prepares a request, not evidence that the host saved an unchanged file.
 */
export async function prepareOriginalDownload(
  resource: OriginalImageResource, image: CardImage,
): Promise<BinaryDownloadResource> {
  const original = selectOriginalResource([resource], image);
  await verifyOriginal(original, image);
  return { type: 'resource', resource: {
    uri: original.resource.uri,
    mimeType: 'application/octet-stream',
    blob: original.resource.blob,
  } };
}
