import { contextBridge, ipcRenderer } from 'electron';

import {
  DESKTOP_CHANNELS,
  type DesktopApi,
  isDesktopAcknowledgement,
  isRuntimeInfo,
} from '../shared/desktop-api';

const desktopApi: DesktopApi = Object.freeze({
  async getRuntimeInfo() {
    const response: unknown = await ipcRenderer.invoke(DESKTOP_CHANNELS.getRuntimeInfo);
    if (!isRuntimeInfo(response)) {
      throw new Error('The desktop runtime returned an invalid response.');
    }

    return response;
  },
  async reportRendererReady() {
    const response: unknown = await ipcRenderer.invoke(DESKTOP_CHANNELS.reportRendererReady);
    if (!isDesktopAcknowledgement(response)) {
      throw new Error('The desktop runtime did not acknowledge renderer readiness.');
    }
  },
});

contextBridge.exposeInMainWorld('balsamicDesktop', desktopApi);
