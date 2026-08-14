import type { BrowserWindow } from 'electron';

import { APP_HOST, APP_SCHEME } from '../shared/app-protocol';

export const isTrustedRendererUrl = (rawUrl: string, developmentServerUrl?: string): boolean => {
  try {
    const candidate = new URL(rawUrl);

    if (developmentServerUrl !== undefined) {
      return candidate.origin === new URL(developmentServerUrl).origin;
    }

    return candidate.protocol === `${APP_SCHEME}:` && candidate.hostname === APP_HOST;
  } catch {
    return false;
  }
};

export const installNavigationPolicy = (
  window: BrowserWindow,
  developmentServerUrl?: string,
): void => {
  window.webContents.on('will-navigate', (event, destinationUrl) => {
    if (!isTrustedRendererUrl(destinationUrl, developmentServerUrl)) {
      event.preventDefault();
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
};
