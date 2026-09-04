// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  decodeDesktopClipboardHtml,
  encodeDesktopClipboardHtml,
  readDesktopClipboard,
  writeDesktopClipboard,
  type SystemClipboardPort,
} from '../src/main/desktop-clipboard';
import { DESKTOP_CLIPBOARD_LIMITS } from '../src/shared/desktop-api';

const createClipboard = (
  html = '',
  text = '',
  image: Readonly<{ bytes: Uint8Array; height: number; width: number }> | undefined = undefined,
): SystemClipboardPort => ({
  readHTML: () => html,
  readImage: () => ({
    getSize: () => ({ height: image?.height ?? 0, width: image?.width ?? 0 }),
    isEmpty: () => image === undefined,
    toPNG: () => image?.bytes ?? new Uint8Array(),
  }),
  readText: () => text,
  write: vi.fn(),
});

describe('desktop clipboard transport', () => {
  it('round-trips Unicode payloads through a standard HTML clipboard flavor', () => {
    const payload = JSON.stringify({ formatVersion: 1, text: 'Grüße 👋' });
    expect(decodeDesktopClipboardHtml(encodeDesktopClipboardHtml(payload, 'Grüße 👋'))).toBe(
      payload,
    );
  });

  it('writes useful plain text together with the opaque Balsamic payload', () => {
    const clipboard = createClipboard();
    const request = { payload: '{"formatVersion":1}', text: 'Button\nText input' };

    writeDesktopClipboard(clipboard, request);

    expect(clipboard.write).toHaveBeenCalledExactlyOnceWith({
      html: encodeDesktopClipboardHtml(request.payload, request.text),
      text: request.text,
    });
    expect(encodeDesktopClipboardHtml(request.payload, '<Button>\nInput')).toContain(
      '&lt;Button&gt;<br>Input',
    );
  });

  it('ignores malformed foreign HTML while retaining bounded plain text', () => {
    const clipboard = createClipboard(
      '<div data-balsamic-selection-v1="not base64"></div>',
      'External text',
    );
    expect(readDesktopClipboard(clipboard)).toEqual({
      imagePngBytes: null,
      payload: null,
      text: 'External text',
    });
  });

  it('rejects oversized plain text instead of silently truncating it into a valid paste', () => {
    const clipboard = createClipboard('', 'x'.repeat(DESKTOP_CLIPBOARD_LIMITS.textCharacters + 1));
    expect(readDesktopClipboard(clipboard)).toEqual({
      imagePngBytes: null,
      payload: null,
      text: '',
    });
  });

  it('copies a bounded native image into the validated clipboard response', () => {
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const value = readDesktopClipboard(createClipboard('', '', { bytes, height: 1, width: 1 }));
    expect(value).toEqual({ imagePngBytes: bytes, payload: null, text: '' });
    expect(value.imagePngBytes).not.toBe(bytes);
  });

  it('rejects native images whose decoded dimensions exceed the shared import budget', () => {
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(
      readDesktopClipboard(createClipboard('', '', { bytes, height: 40_000_001, width: 1 }))
        .imagePngBytes,
    ).toBeNull();
  });
});
