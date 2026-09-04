import { Buffer } from 'node:buffer';

import {
  DESKTOP_CLIPBOARD_LIMITS,
  type DesktopClipboardReadValue,
  type DesktopClipboardWriteRequest,
} from '../shared/desktop-api';

const PAYLOAD_ATTRIBUTE = 'data-balsamic-selection-v1';
const PAYLOAD_PATTERN = /data-balsamic-selection-v1="([A-Za-z0-9+/=]+)"/u;
const MAX_ENCODED_PAYLOAD_CHARACTERS =
  Math.ceil(DESKTOP_CLIPBOARD_LIMITS.payloadCharacters / 3) * 4;
const MAX_CLIPBOARD_HTML_CHARACTERS =
  MAX_ENCODED_PAYLOAD_CHARACTERS + DESKTOP_CLIPBOARD_LIMITS.textCharacters * 5 + 256;

export interface SystemClipboardPort {
  readonly readHTML: () => string;
  readonly readText: () => string;
  readonly write: (data: Readonly<{ html: string; text: string }>) => void;
}

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

export const readDesktopClipboard = (clipboard: SystemClipboardPort): DesktopClipboardReadValue =>
  Object.freeze({
    payload: decodeDesktopClipboardHtml(clipboard.readHTML()),
    text: clipboard.readText().slice(0, DESKTOP_CLIPBOARD_LIMITS.textCharacters),
  });
