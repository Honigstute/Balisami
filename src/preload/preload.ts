import { contextBridge, ipcRenderer } from 'electron';

import {
  DESKTOP_CHANNELS,
  type DesktopApi,
  type ProjectCloseOutcome,
  type ProjectCloseRequest,
  type ProjectCloseResponse,
  type ProjectCommand,
  type ProjectHistorySnapshotRequest,
  type ProjectOpenRecentRequest,
  type ProjectRecoveryChoiceRequest,
  type ProjectRecoverySnapshotRequest,
  type ProjectReplacementRequest,
  type ProjectStartRequest,
  isDesktopAcknowledgement,
  isProjectCloseOutcome,
  isProjectCloseRequest,
  isProjectCloseResponse,
  isProjectCommand,
  isProjectOpenRecentRequest,
  isProjectHistorySnapshotRequest,
  isProjectOpenedResult,
  isProjectRecoveryChoiceRequest,
  isProjectRecoveryDiscardedResult,
  isProjectRecoveryScheduledResult,
  isProjectRecoverySnapshotRequest,
  isProjectSavedResult,
  isProjectStartupOptionsResult,
  isProjectReplacementRequest,
  isRecentProjectsResult,
  isProjectStartRequest,
  isRuntimeInfo,
} from '../shared/desktop-api';

const createValidatedListener = <Value>(
  channel: string,
  isValue: (value: unknown) => value is Value,
  listener: (value: Value) => void,
): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
    if (isValue(value)) {
      listener(value);
    }
  };
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const desktopApi: DesktopApi = Object.freeze({
  async getRuntimeInfo() {
    const response: unknown = await ipcRenderer.invoke(DESKTOP_CHANNELS.getRuntimeInfo);
    if (!isRuntimeInfo(response)) {
      throw new Error('The desktop runtime returned an invalid response.');
    }

    return response;
  },
  onProjectCloseOutcome(listener: (outcome: ProjectCloseOutcome) => void) {
    return createValidatedListener(
      DESKTOP_CHANNELS.projectCloseOutcome,
      isProjectCloseOutcome,
      listener,
    );
  },
  onProjectCloseRequest(listener: (request: ProjectCloseRequest) => void) {
    return createValidatedListener(
      DESKTOP_CHANNELS.projectCloseRequest,
      isProjectCloseRequest,
      listener,
    );
  },
  onProjectCommand(listener: (command: ProjectCommand) => void) {
    return createValidatedListener(DESKTOP_CHANNELS.projectCommand, isProjectCommand, listener);
  },
  async discardProjectRecovery(request: ProjectRecoveryChoiceRequest) {
    if (!isProjectRecoveryChoiceRequest(request)) {
      throw new TypeError('The recovery discard request is invalid.');
    }
    const response: unknown = await ipcRenderer.invoke(
      DESKTOP_CHANNELS.projectDiscardRecovery,
      request,
    );
    if (!isProjectRecoveryDiscardedResult(response)) {
      throw new Error('The desktop runtime returned an invalid recovery discard result.');
    }
    return response;
  },
  async getProjectStartupOptions() {
    const response: unknown = await ipcRenderer.invoke(DESKTOP_CHANNELS.projectStartupOptions);
    if (!isProjectStartupOptionsResult(response)) {
      throw new Error('The desktop runtime returned invalid project startup options.');
    }
    return response;
  },
  async listRecentProjects() {
    const response: unknown = await ipcRenderer.invoke(DESKTOP_CHANNELS.projectListRecent);
    if (!isRecentProjectsResult(response)) {
      throw new Error('The desktop runtime returned an invalid recent-project result.');
    }
    return response;
  },
  async openProject(request: ProjectReplacementRequest) {
    if (!isProjectReplacementRequest(request)) {
      throw new TypeError('The current-project replacement request is invalid.');
    }
    const response: unknown = await ipcRenderer.invoke(DESKTOP_CHANNELS.projectOpen, request);
    if (!isProjectOpenedResult(response)) {
      throw new Error('The desktop runtime returned an invalid opened-project result.');
    }
    return response;
  },
  async openRecentProject(request: ProjectOpenRecentRequest) {
    if (!isProjectOpenRecentRequest(request)) {
      throw new TypeError('The recent-project replacement request is invalid.');
    }
    const response: unknown = await ipcRenderer.invoke(DESKTOP_CHANNELS.projectOpenRecent, request);
    if (!isProjectOpenedResult(response)) {
      throw new Error('The desktop runtime returned an invalid recent-project result.');
    }
    return response;
  },
  respondToProjectClose(response: ProjectCloseResponse) {
    if (!isProjectCloseResponse(response)) {
      throw new TypeError('The project close response is invalid.');
    }
    ipcRenderer.send(DESKTOP_CHANNELS.projectCloseResponse, response);
  },
  async restoreProjectRecovery(request: ProjectRecoveryChoiceRequest) {
    if (!isProjectRecoveryChoiceRequest(request)) {
      throw new TypeError('The recovery restore request is invalid.');
    }
    const response: unknown = await ipcRenderer.invoke(
      DESKTOP_CHANNELS.projectRestoreRecovery,
      request,
    );
    if (!isProjectOpenedResult(response)) {
      throw new Error('The desktop runtime returned an invalid recovered-project result.');
    }
    return response;
  },
  async saveProject(request: ProjectHistorySnapshotRequest) {
    if (!isProjectHistorySnapshotRequest(request)) {
      throw new TypeError('The project save request is invalid.');
    }
    const response: unknown = await ipcRenderer.invoke(DESKTOP_CHANNELS.projectSave, request);
    if (!isProjectSavedResult(response)) {
      throw new Error('The desktop runtime returned an invalid project save result.');
    }
    return response;
  },
  async saveProjectAs(request: ProjectHistorySnapshotRequest) {
    if (!isProjectHistorySnapshotRequest(request)) {
      throw new TypeError('The project Save As request is invalid.');
    }
    const response: unknown = await ipcRenderer.invoke(DESKTOP_CHANNELS.projectSaveAs, request);
    if (!isProjectSavedResult(response)) {
      throw new Error('The desktop runtime returned an invalid project Save As result.');
    }
    return response;
  },
  async scheduleProjectRecovery(request: ProjectRecoverySnapshotRequest) {
    if (!isProjectRecoverySnapshotRequest(request)) {
      throw new TypeError('The project recovery request is invalid.');
    }
    const response: unknown = await ipcRenderer.invoke(
      DESKTOP_CHANNELS.projectScheduleRecovery,
      request,
    );
    if (!isProjectRecoveryScheduledResult(response)) {
      throw new Error('The desktop runtime returned an invalid project recovery result.');
    }
    return response;
  },
  async startProject(request: ProjectStartRequest) {
    if (!isProjectStartRequest(request)) {
      throw new TypeError('The new project request is invalid.');
    }
    const response: unknown = await ipcRenderer.invoke(DESKTOP_CHANNELS.projectStart, request);
    if (!isProjectOpenedResult(response)) {
      throw new Error('The desktop runtime returned an invalid new project result.');
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
