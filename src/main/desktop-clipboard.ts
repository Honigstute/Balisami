import { Buffer } from 'node:buffer';

import {
  DESKTOP_CLIPBOARD_LIMITS,
  type DesktopClipboardReadValue,
  type DesktopClipboardWriteRequest,
} from '../shared/desktop-api';
import {
  MAX_IMPORTED_IMAGE_DIMENSION,
  MAX_IMPORTED_IMAGE_PIXELS,
} from '../shared/image-import-limits';
import { MAX_PROJECT_ASSET_BYTES } from '../shared/project-file-limits';

const PAYLOAD_ATTRIBUTE = 'data-balsamic-selection-v1';
const PAYLOAD_PATTERN = /data-balsamic-selection-v1="([A-Za-z0-9+/=]+)"/u;
const MAX_ENCODED_PAYLOAD_CHARACTERS =
  Math.ceil(DESKTOP_CLIPBOARD_LIMITS.payloadCharacters / 3) * 4;
const MAX_CLIPBOARD_HTML_CHARACTERS =
  MAX_ENCODED_PAYLOAD_CHARACTERS + DESKTOP_CLIPBOARD_LIMITS.textCharacters * 5 + 256;

export interface SystemClipboardPort {
  readonly readHTML: () => string;
  readonly readImage: () => Readonly<{
    getSize: () => Readonly<{ height: number; width: number }>;
    isEmpty: () => boolean;
    toPNG: () => Uint8Array;
  }>;
  readonly readText: () => string;
  readonly write: (data: Readonly<{ html: string; text: string }>) => void;
}

const readBoundedPng = (clipboard: SystemClipboardPort): Uint8Array | null => {
  const image = clipboard.readImage();
  if (image.isEmpty()) return null;
  const size = image.getSize();
  if (
    !Number.isSafeInteger(size.width) ||
    !Number.isSafeInteger(size.height) ||
    size.width <= 0 ||
    size.height <= 0 ||
    size.width > MAX_IMPORTED_IMAGE_DIMENSION ||
    size.height > MAX_IMPORTED_IMAGE_DIMENSION ||
    size.width * size.height > MAX_IMPORTED_IMAGE_PIXELS
  ) {
    return null;
  }
  const bytes = image.toPNG();
  return bytes.byteLength > 0 && bytes.byteLength <= MAX_PROJECT_ASSET_BYTES
    ? Uint8Array.from(bytes)
    : null;
};

/**
 * Uses standard HTML + plain-text clipboard flavors atomically. Other apps see
 * only useful text; Balsamic can recover its opaque payload from the data
 * attribute without exposing Electron or Node APIs to the renderer.
 */
const escapeHtmlText = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', '<br>');

export const encodeDesktopClipboardHtml = (payload: string, text: string): string => {
  const encoded = Buffer.from(payload, 'utf8').toString('base64');
  return `<div ${PAYLOAD_ATTRIBUTE}="${encoded}">${escapeHtmlText(text)}</div>`;
};

export const decodeDesktopClipboardHtml = (html: string): string | null => {
  if (html.length === 0 || html.length > MAX_CLIPBOARD_HTML_CHARACTERS) {
    return null;
  }
  const encoded = PAYLOAD_PATTERN.exec(html)?.[1];
  if (encoded === undefined || encoded.length > MAX_ENCODED_PAYLOAD_CHARACTERS) {
    return null;
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) {
    return null;
  }
  const payload = bytes.toString('utf8');
  return payload.length > 0 && payload.length <= DESKTOP_CLIPBOARD_LIMITS.payloadCharacters
    ? payload
    : null;
};

export const writeDesktopClipboard = (
  clipboard: SystemClipboardPort,
  request: DesktopClipboardWriteRequest,
): void => {
  clipboard.write({
    html: encodeDesktopClipboardHtml(request.payload, request.text),
    text: request.text,
  });
};

export const readDesktopClipboard = (clipboard: SystemClipboardPort): DesktopClipboardReadValue => {
  const text = clipboard.readText();
  return Object.freeze({
    imagePngBytes: readBoundedPng(clipboard),
    payload: decodeDesktopClipboardHtml(clipboard.readHTML()),
    text: text.length <= DESKTOP_CLIPBOARD_LIMITS.textCharacters ? text : '',
  });
};
