import { app, ipcMain } from 'electron';

import {
  DESKTOP_ACKNOWLEDGEMENT,
  DESKTOP_CHANNELS,
  type RuntimeInfo,
  type RuntimePlatform,
} from '../shared/desktop-api';
import { isTrustedRendererUrl } from './navigation-policy';

interface RegisterDesktopIpcOptions {
  readonly developmentServerUrl?: string;
  readonly onRendererReady?: () => void;
}

const getSupportedPlatform = (): RuntimePlatform => {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return process.platform;
  }

  throw new Error(`Unsupported desktop platform: ${process.platform}`);
};

const assertTrustedRenderer = (
  senderUrl: string | undefined,
  developmentServerUrl?: string,
): void => {
  if (senderUrl === undefined || !isTrustedRendererUrl(senderUrl, developmentServerUrl)) {
    throw new Error('Rejected IPC request from an untrusted renderer.');
  }
};

export const registerDesktopIpc = ({
  developmentServerUrl,
  onRendererReady,
}: RegisterDesktopIpcOptions = {}): void => {
  ipcMain.handle(DESKTOP_CHANNELS.getRuntimeInfo, (event): RuntimeInfo => {
    assertTrustedRenderer(event.senderFrame?.url, developmentServerUrl);

    return {
      appVersion: app.getVersion(),
      arch: process.arch,
      isPackaged: app.isPackaged,
      platform: getSupportedPlatform(),
    };
  });

  ipcMain.handle(DESKTOP_CHANNELS.reportRendererReady, (event) => {
    assertTrustedRenderer(event.senderFrame?.url, developmentServerUrl);
    onRendererReady?.();
    return DESKTOP_ACKNOWLEDGEMENT;
  });
};
