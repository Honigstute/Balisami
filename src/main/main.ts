import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import smokeTestContract from '../../smoke-test-contract.json';
import { registerDesktopIpc } from './ipc';
import { createAppLogger, installProcessErrorLogging, type AppLogger } from './logging';
import { installNavigationPolicy } from './navigation-policy';
import { APP_ENTRY_URL, installAppProtocol, registerAppScheme } from './protocol';
import { configureSessionSecurity } from './security';
import { captureSmokeScreenshot } from './smoke-test';
import { StartupHealthMonitor } from './startup-health';
import { installWindowDiagnostics, type WindowProblem } from './window-diagnostics';
import { createMainWindowOptions } from './window-options';

const isSmokeTest = process.argv.includes(smokeTestContract.argument);

registerAppScheme();
app.enableSandbox();

if (started) {
  app.quit();
}

let logger: AppLogger | undefined;
const startupHealth = isSmokeTest ? new StartupHealthMonitor() : undefined;

const developmentServerUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL;

const rendererRoot = path.join(__dirname, '..', 'renderer', MAIN_WINDOW_VITE_NAME);

const reportWindowProblem = ({ cause, message, scope }: WindowProblem): void => {
  logger?.error(scope, message, cause);
  startupHealth?.reportFailure(message, cause);
};

const createWindow = async (): Promise<BrowserWindow> => {
  const window = new BrowserWindow(
    createMainWindowOptions(path.join(__dirname, 'preload.js'), app.isPackaged),
  );

  installNavigationPolicy(window, developmentServerUrl);
  installWindowDiagnostics(window, reportWindowProblem);

  window.once('ready-to-show', () => {
    window.show();
  });

  if (developmentServerUrl === undefined) {
    await window.loadURL(APP_ENTRY_URL);
  } else {
    await window.loadURL(developmentServerUrl);
  }

  return window;
};

const runSmokeTest = async (window: BrowserWindow): Promise<void> => {
  if (startupHealth === undefined) {
    return;
  }

  await startupHealth.waitForRendererReady(smokeTestContract.readyTimeoutMs);
  await new Promise<void>((resolve) => setTimeout(resolve, smokeTestContract.settleMs));
  startupHealth.assertHealthy();
  const screenshotPath = await captureSmokeScreenshot(window, app.getPath('temp'));
  process.stdout.write(
    `${smokeTestContract.screenshotMarker}${screenshotPath}\n${smokeTestContract.marker}\n`,
  );
  app.exit(0);
};

const startApplication = async (): Promise<void> => {
  await app.whenReady();

  logger = await createAppLogger(app.getPath('logs'), app.getPath('home'));
  installProcessErrorLogging(logger, () => app.exit(1));
  configureSessionSecurity(session.defaultSession);

  if (developmentServerUrl === undefined) {
    installAppProtocol(rendererRoot);
  }

  registerDesktopIpc({
    ...(developmentServerUrl === undefined ? {} : { developmentServerUrl }),
    ...(startupHealth === undefined
      ? {}
      : { onRendererReady: () => startupHealth.reportRendererReady() }),
  });
  const window = await createWindow();
  await runSmokeTest(window);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch((error: unknown) => {
        logger?.error('window', 'Failed to recreate the main window.', error);
      });
    }
  });
};

void startApplication().catch((error: unknown) => {
  if (logger === undefined || isSmokeTest) {
    process.stderr.write(`Balsamic failed to start: ${String(error)}\n`);
  }
  if (logger !== undefined) {
    logger.error('startup', 'Application startup failed.', error);
  }
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
