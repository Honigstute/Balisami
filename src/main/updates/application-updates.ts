import { app, dialog } from 'electron';
import { updateElectronApp, UpdateSourceType, type IUpdateInfo } from 'update-electron-app';

import type { AppLogger } from '../logging';

const UPDATE_REPOSITORY = 'Honigstute/Balisami';
const UPDATE_INTERVAL = '6 hours';

export interface ApplicationUpdateRuntime {
  readonly showReadyNotice: () => Promise<void>;
  readonly start: (onDownloaded: (info: IUpdateInfo) => void) => Readonly<{
    stop: () => void;
  }>;
}

export interface ApplicationUpdateEnvironment {
  readonly automated: boolean;
  readonly packaged: boolean;
  readonly platform: NodeJS.Platform;
  readonly squirrelFirstRun: boolean;
}

export const shouldEnableApplicationUpdates = (
  environment: ApplicationUpdateEnvironment,
): boolean =>
  environment.packaged &&
  !environment.automated &&
  !environment.squirrelFirstRun &&
  (environment.platform === 'darwin' || environment.platform === 'win32');

export const createElectronUpdateRuntime = (logger: AppLogger): ApplicationUpdateRuntime => ({
  showReadyNotice: async () => {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Balsamic Update Ready',
      message: 'A signed Balsamic update is ready to install.',
      detail:
        'Keep working normally. Balsamic will apply the update after you quit through the usual save flow and launch the app again.',
      buttons: ['Continue Working'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
  },
  start: (onDownloaded) => {
    const updates = updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: UPDATE_REPOSITORY,
      },
      updateInterval: UPDATE_INTERVAL,
      logger: {
        error: (message: string) => logger.error('updates', String(message)),
        info: (message: string) => logger.info('updates', String(message)),
        log: (message: string) => logger.info('updates', String(message)),
        warn: (message: string) => logger.info('updates', String(message)),
      },
      notifyUser: true,
      onNotifyUser: onDownloaded,
    });
    return { stop: () => updates.stopUpdates() };
  },
});

/** Owns one deduplicated update-ready notice outside project/document state. */
export const installApplicationUpdates = (
  environment: ApplicationUpdateEnvironment,
  runtime: ApplicationUpdateRuntime,
  reportFailure: (error: unknown) => void,
): Readonly<{ stop: () => void }> => {
  if (!shouldEnableApplicationUpdates(environment)) return Object.freeze({ stop: () => undefined });
  let promptOpen = false;
  const running = runtime.start(() => {
    if (promptOpen) return;
    promptOpen = true;
    void runtime
      .showReadyNotice()
      .catch(reportFailure)
      .finally(() => {
        promptOpen = false;
      });
  });
  return Object.freeze({ stop: running.stop });
};

export const createApplicationUpdateEnvironment = (
  automated: boolean,
): ApplicationUpdateEnvironment => ({
  automated,
  packaged: app.isPackaged,
  platform: process.platform,
  squirrelFirstRun: process.argv.includes('--squirrel-firstrun'),
});
