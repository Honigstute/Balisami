// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...arguments_: unknown[]) => unknown>(),
  openExternal: vi.fn<(url: string) => Promise<void>>(),
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '0.1.0', isPackaged: true },
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
    registerDesktopIpc({ developmentServerUrl: 'http://localhost:5173' });
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
