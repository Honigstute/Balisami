import { app, BrowserWindow, session } from 'electron';
import { tmpdir } from 'node:os';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import recoveryProbeContract from '../../recovery-probe-contract.json';
import smokeTestContract from '../../smoke-test-contract.json';
import { registerDesktopIpc } from './ipc';
import { createAppLogger, installProcessErrorLogging, type AppLogger } from './logging';
import { installNavigationPolicy } from './navigation-policy';
import { APP_ENTRY_URL, installAppProtocol, registerAppScheme } from './protocol';
import {
  preparePackagedRecoveryProbe,
  verifyPackagedRecoveryProbe,
} from './recovery/recovery-packaged-probe';
import {
  authorizeRecoveryProbeRoot,
  parseRecoveryProbeInvocation,
  type RecoveryProbeInvocation,
} from './recovery/recovery-probe-contract';
import { configureSessionSecurity } from './security';
import { captureSmokeScreenshot } from './smoke-test';
import { StartupHealthMonitor } from './startup-health';
import { installWindowDiagnostics, type WindowProblem } from './window-diagnostics';
import { createMainWindowOptions } from './window-options';

const isSmokeTest = process.argv.includes(smokeTestContract.argument);
const recoveryProbeInvocation = parseRecoveryProbeInvocation(process.argv, recoveryProbeContract);
const isRecoveryProbe = recoveryProbeInvocation.kind !== 'none';
const isAutomatedTest = isSmokeTest || isRecoveryProbe;

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

const writeStandardOutputLine = (line: string): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    process.stdout.write(`${line}\n`, (error) => {
      if (error === null || error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });

const waitForForcedTermination = (): Promise<never> =>
  new Promise<never>(() => {
    setInterval(() => undefined, 60_000);
  });

const runRecoveryProbe = async (
  invocation: Extract<RecoveryProbeInvocation, { readonly kind: 'probe' }>,
): Promise<void> => {
  if (invocation.mode === 'write') {
    await preparePackagedRecoveryProbe(invocation.root, invocation.contract.userFileName);
    await writeStandardOutputLine(invocation.contract.writerReadyMarker);
    await waitForForcedTermination();
  }

  await verifyPackagedRecoveryProbe(invocation.root, invocation.contract.userFileName);
  await writeStandardOutputLine(invocation.contract.verificationMarker);
  app.exit(0);
};

const startApplication = async (): Promise<void> => {
  if (recoveryProbeInvocation.kind === 'invalid') {
    throw new Error(recoveryProbeInvocation.message);
  }
  let activeRecoveryProbe: Extract<RecoveryProbeInvocation, { readonly kind: 'probe' }> | undefined;
  if (recoveryProbeInvocation.kind === 'probe') {
    const root = authorizeRecoveryProbeRoot(
      recoveryProbeInvocation.root,
      tmpdir(),
      recoveryProbeInvocation.contract.rootNamePrefix,
      recoveryProbeInvocation.mode === 'write',
    );
    if (root === undefined) {
      throw new Error('The recovery probe root is not an authorized temporary directory.');
    }
    activeRecoveryProbe = Object.freeze({ ...recoveryProbeInvocation, root });
    // The external harness creates this isolated path before launch. Setting it
    // before ready prevents a packaged probe from touching normal user data.
    app.setPath('userData', root);
  }
  await app.whenReady();

  if (activeRecoveryProbe !== undefined) {
    await runRecoveryProbe(activeRecoveryProbe);
    return;
  }

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
  if (logger === undefined || isAutomatedTest) {
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
