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

const createClipboard = (html = '', text = ''): SystemClipboardPort => ({
  readHTML: () => html,
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
    expect(readDesktopClipboard(clipboard)).toEqual({ payload: null, text: 'External text' });
  });

  it('rejects oversized plain text instead of silently truncating it into a valid paste', () => {
    const clipboard = createClipboard('', 'x'.repeat(DESKTOP_CLIPBOARD_LIMITS.textCharacters + 1));
    expect(readDesktopClipboard(clipboard)).toEqual({ payload: null, text: '' });
  });
});
