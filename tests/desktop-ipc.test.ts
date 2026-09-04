// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...arguments_: unknown[]) => unknown>(),
  openExternal: vi.fn<(url: string) => Promise<void>>(),
  showSaveDialog: vi.fn(),
  readHTML: vi.fn<() => string>(),
  readImage: vi.fn(),
  readText: vi.fn<() => string>(),
  write: vi.fn(),
  copy: vi.fn(),
  cut: vi.fn(),
  delete: vi.fn(),
  paste: vi.fn(),
  redo: vi.fn(),
  selectAll: vi.fn(),
  undo: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '0.1.0', isPackaged: true },
  clipboard: {
    readHTML: electron.readHTML,
    readImage: electron.readImage,
    readText: electron.readText,
    write: electron.write,
  },
  dialog: { showSaveDialog: electron.showSaveDialog },
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
const createEvent = (url: string) => ({
  sender: {
    id: 1,
    copy: electron.copy,
    cut: electron.cut,
    delete: electron.delete,
    paste: electron.paste,
    redo: electron.redo,
    selectAll: electron.selectAll,
    undo: electron.undo,
  },
  senderFrame: { url },
});

describe('desktop external URL IPC', () => {
  beforeEach(() => {
    electron.handlers.clear();
    electron.openExternal.mockReset().mockResolvedValue(undefined);
    electron.showSaveDialog.mockReset().mockResolvedValue({ canceled: true });
    electron.readHTML.mockReset().mockReturnValue('');
    electron.readImage.mockReset().mockReturnValue({
      getSize: () => ({ height: 0, width: 0 }),
      isEmpty: () => true,
      toPNG: () => new Uint8Array(),
    });
    electron.readText.mockReset().mockReturnValue('');
    electron.write.mockReset();
    electron.copy.mockReset();
    electron.cut.mockReset();
    electron.delete.mockReset();
    electron.paste.mockReset();
    electron.redo.mockReset();
    electron.selectAll.mockReset();
    electron.undo.mockReset();
    registerDesktopIpc({ developmentServerUrl: 'http://localhost:5173' });
  });

  it('executes validated native text-edit commands only for the trusted sender', () => {
    const handler = electron.handlers.get(DESKTOP_CHANNELS.editCommandNative);
    expect(handler?.(createEvent(TRUSTED_URL), 'copy')).toEqual(DESKTOP_ACKNOWLEDGEMENT);
    expect(electron.copy).toHaveBeenCalledOnce();
    expect(() => handler?.(createEvent(TRUSTED_URL), 'duplicate')).toThrow(
      'invalid native edit command',
    );
    expect(() => handler?.(createEvent('https://attacker.example'), 'copy')).toThrow(
      'untrusted renderer',
    );
  });

  it('offers a validated export through a native save dialog', async () => {
    const handler = electron.handlers.get(DESKTOP_CHANNELS.exportFile);
    const request = {
      bytes: Uint8Array.from([137, 80, 78, 71]),
      format: 'png',
      suggestedBaseName: 'Checkout / Final',
    };

    await expect(handler?.(createEvent(TRUSTED_URL), request)).resolves.toEqual({
      status: 'cancelled',
    });
    expect(electron.showSaveDialog).toHaveBeenCalledOnce();
    expect(electron.showSaveDialog.mock.calls[0]?.[0]).toMatchObject({
      defaultPath: 'Checkout Final.png',
      filters: [{ extensions: ['png'], name: 'PNG Image' }],
    });
    expect(() =>
      handler?.(createEvent(TRUSTED_URL), { ...request, bytes: new Uint8Array() }),
    ).toThrow('invalid export file request');
    expect(() => handler?.(createEvent('https://attacker.example'), request)).toThrow(
      'untrusted renderer',
    );
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
