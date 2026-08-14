import { app, ipcMain } from 'electron';

import {
  DESKTOP_ACKNOWLEDGEMENT,
  DESKTOP_CHANNELS,
  type RuntimeInfo,
  type RuntimePlatform,
} from '../shared/desktop-api';
import { isTrustedRendererUrl } from './navigation-policy';
import type { ProjectWindowController } from './projects/project-window-controller';

interface RegisterDesktopIpcOptions {
  readonly developmentServerUrl?: string;
  readonly onProjectBridgeFailure?: (error: unknown) => void;
  readonly onRendererReady?: () => void;
  readonly resolveProjectController?: (
    webContentsId: number,
  ) => ProjectWindowController | undefined;
}

const PROJECT_BRIDGE_UNAVAILABLE_RESULT = Object.freeze({
  status: 'failed' as const,
  problem: Object.freeze({
    code: 'unexpected-native-failure' as const,
    title: 'The desktop project service is unavailable',
    message: 'No project data changed. Keep the app open and retry.',
  }),
});

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
  onProjectBridgeFailure,
  onRendererReady,
  resolveProjectController,
}: RegisterDesktopIpcOptions = {}): void => {
  const getProjectController = (webContentsId: number): ProjectWindowController | undefined =>
    resolveProjectController?.(webContentsId);

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

  ipcMain.handle(DESKTOP_CHANNELS.projectStart, (event, input: unknown) => {
    assertTrustedRenderer(event.senderFrame?.url, developmentServerUrl);
    return (
      getProjectController(event.sender.id)?.startProject(input) ??
      PROJECT_BRIDGE_UNAVAILABLE_RESULT
    );
  });

  ipcMain.handle(DESKTOP_CHANNELS.projectStartupOptions, (event) => {
    assertTrustedRenderer(event.senderFrame?.url, developmentServerUrl);
    return (
      getProjectController(event.sender.id)?.getStartupOptions() ??
      PROJECT_BRIDGE_UNAVAILABLE_RESULT
    );
  });

  ipcMain.handle(DESKTOP_CHANNELS.projectRestoreRecovery, (event, input: unknown) => {
    assertTrustedRenderer(event.senderFrame?.url, developmentServerUrl);
    return (
      getProjectController(event.sender.id)?.restoreRecovery(input) ??
      PROJECT_BRIDGE_UNAVAILABLE_RESULT
    );
  });

  ipcMain.handle(DESKTOP_CHANNELS.projectDiscardRecovery, (event, input: unknown) => {
    assertTrustedRenderer(event.senderFrame?.url, developmentServerUrl);
    return (
      getProjectController(event.sender.id)?.discardRecovery(input) ??
      PROJECT_BRIDGE_UNAVAILABLE_RESULT
    );
  });

  ipcMain.handle(DESKTOP_CHANNELS.projectOpen, (event, input: unknown) => {
    assertTrustedRenderer(event.senderFrame?.url, developmentServerUrl);
    return (
      getProjectController(event.sender.id)?.openProject(input) ?? PROJECT_BRIDGE_UNAVAILABLE_RESULT
    );
  });

  ipcMain.handle(DESKTOP_CHANNELS.projectOpenRecent, (event, input: unknown) => {
    assertTrustedRenderer(event.senderFrame?.url, developmentServerUrl);
    return (
      getProjectController(event.sender.id)?.openRecentProject(input) ??
      PROJECT_BRIDGE_UNAVAILABLE_RESULT
    );
  });

  ipcMain.handle(DESKTOP_CHANNELS.projectListRecent, (event) => {
    assertTrustedRenderer(event.senderFrame?.url, developmentServerUrl);
    return (
      getProjectController(event.sender.id)?.listRecentProjects() ??
      PROJECT_BRIDGE_UNAVAILABLE_RESULT
    );
  });

  ipcMain.handle(DESKTOP_CHANNELS.projectSave, (event, input: unknown) => {
    assertTrustedRenderer(event.senderFrame?.url, developmentServerUrl);
    return (
      getProjectController(event.sender.id)?.saveProject(input) ?? PROJECT_BRIDGE_UNAVAILABLE_RESULT
    );
  });

  ipcMain.handle(DESKTOP_CHANNELS.projectSaveAs, (event, input: unknown) => {
    assertTrustedRenderer(event.senderFrame?.url, developmentServerUrl);
    return (
      getProjectController(event.sender.id)?.saveProject(input, true) ??
      PROJECT_BRIDGE_UNAVAILABLE_RESULT
    );
  });

  ipcMain.handle(DESKTOP_CHANNELS.projectScheduleRecovery, (event, input: unknown) => {
    assertTrustedRenderer(event.senderFrame?.url, developmentServerUrl);
    return (
      getProjectController(event.sender.id)?.scheduleRecovery(input) ??
      PROJECT_BRIDGE_UNAVAILABLE_RESULT
    );
  });

  ipcMain.on(DESKTOP_CHANNELS.projectCloseResponse, (event, input: unknown) => {
    try {
      assertTrustedRenderer(event.senderFrame?.url, developmentServerUrl);
      const controller = getProjectController(event.sender.id);
      if (controller === undefined) {
        onProjectBridgeFailure?.(new Error('Project close response has no window controller.'));
        return;
      }
      void controller.handleCloseResponse(input).catch((error: unknown) => {
        onProjectBridgeFailure?.(error);
      });
    } catch (error) {
      onProjectBridgeFailure?.(error);
    }
  });
};
