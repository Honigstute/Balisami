// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...arguments_: unknown[]) => unknown>(),
  openExternal: vi.fn<(url: string) => Promise<void>>(),
  readHTML: vi.fn<() => string>(),
  readImage: vi.fn(),
  readText: vi.fn<() => string>(),
  write: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '0.1.0', isPackaged: true },
  clipboard: {
    readHTML: electron.readHTML,
    readImage: electron.readImage,
    readText: electron.readText,
    write: electron.write,
  },
  ipcMain: {
    handle: (channel: string, handler: (...arguments_: unknown[]) => unknown) => {
      electron.handlers.set(channel, handler);
    },
    on: vi.fn(),
  },
  shell: { openExternal: electron.openExternal },
}));

import { registerDesktopIpc } from '../src/main/ipc';
import { DESKTOP_ACKNOWLEDGEMENT, DESKTOP_CHANNELS } from '../src/shared/desktop-api';

const TRUSTED_URL = 'http://localhost:5173/editor';
const createEvent = (url: string) => ({ sender: { id: 1 }, senderFrame: { url } });

describe('desktop external URL IPC', () => {
  beforeEach(() => {
    electron.handlers.clear();
    electron.openExternal.mockReset().mockResolvedValue(undefined);
    electron.readHTML.mockReset().mockReturnValue('');
    electron.readImage.mockReset().mockReturnValue({
      getSize: () => ({ height: 0, width: 0 }),
      isEmpty: () => true,
      toPNG: () => new Uint8Array(),
    });
    electron.readText.mockReset().mockReturnValue('');
    electron.write.mockReset();
    registerDesktopIpc({ developmentServerUrl: 'http://localhost:5173' });
  });

  it('reads and writes clipboard flavors only for trusted validated requests', () => {
    const writeHandler = electron.handlers.get(DESKTOP_CHANNELS.clipboardWrite);
    const readHandler = electron.handlers.get(DESKTOP_CHANNELS.clipboardRead);
    const request = { payload: '{"formatVersion":1}', text: 'Button' };

    expect(writeHandler?.(createEvent(TRUSTED_URL), request)).toEqual(DESKTOP_ACKNOWLEDGEMENT);
    const written = electron.write.mock.calls[0]?.[0] as { html?: string; text?: string };
    expect(written.text).toBe('Button');
    expect(written.html).toContain('data-balsamic-selection-v1');

    electron.readHTML.mockReturnValue(written.html ?? '');
    electron.readText.mockReturnValue('Button');
    expect(readHandler?.(createEvent(TRUSTED_URL))).toEqual({
      imagePngBytes: null,
      payload: request.payload,
      text: 'Button',
    });

    expect(() => writeHandler?.(createEvent(TRUSTED_URL), { payload: '', text: 'Button' })).toThrow(
      'invalid clipboard write request',
    );
    expect(() => writeHandler?.(createEvent('https://attacker.example'), request)).toThrow(
      'untrusted renderer',
    );
  });

  it('opens a validated HTTP(S) URL through the operating system shell', async () => {
    const handler = electron.handlers.get(DESKTOP_CHANNELS.openExternalUrl);
    expect(handler).toBeDefined();

    await expect(
      handler?.(createEvent(TRUSTED_URL), { url: 'https://example.com/demo' }),
    ).resolves.toEqual(DESKTOP_ACKNOWLEDGEMENT);
    expect(electron.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/demo');
  });

  it('rejects malformed requests and untrusted renderers before opening anything', async () => {
    const handler = electron.handlers.get(DESKTOP_CHANNELS.openExternalUrl);

    await expect(
      handler?.(createEvent(TRUSTED_URL), { url: 'file:///private/project' }),
    ).rejects.toThrow('invalid external URL');
    await expect(
      handler?.(createEvent('https://attacker.example'), { url: 'https://example.com' }),
    ).rejects.toThrow('untrusted renderer');
    expect(electron.openExternal).not.toHaveBeenCalled();
  });
});
