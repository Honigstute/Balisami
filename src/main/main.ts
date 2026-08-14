import { app, BrowserWindow, session } from 'electron';
import { tmpdir } from 'node:os';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import recoveryProbeContract from '../../recovery-probe-contract.json';
import projectWorkflowProbeContract from '../../project-workflow-probe-contract.json';
import smokeTestContract from '../../smoke-test-contract.json';
import { DESKTOP_CHANNELS } from '../shared/desktop-api';
import type { NativeProjectDialogs } from './dialogs/project-dialogs';
import { registerDesktopIpc } from './ipc';
import { createElectronProjectDialogs } from './dialogs/electron-project-dialogs';
import { createAppLogger, installProcessErrorLogging, type AppLogger } from './logging';
import { installApplicationMenu } from './menus/application-menu';
import { installNavigationPolicy } from './navigation-policy';
import { APP_ENTRY_URL, installAppProtocol, registerAppScheme } from './protocol';
import {
  preparePackagedRecoveryProbe,
  verifyPackagedRecoveryThroughRenderer,
} from './recovery/recovery-packaged-probe';
import {
  authorizeRecoveryProbeRoot,
  parseRecoveryProbeInvocation,
  type RecoveryProbeInvocation,
} from './recovery/recovery-probe-contract';
import { configureSessionSecurity } from './security';
import { ProjectLifecycleController } from './projects/project-lifecycle-controller';
import { ProjectNativeWorkflow } from './projects/project-native-workflow';
import {
  createProjectWorkflowProbeDialogs,
  runPackagedProjectWorkflowProbe,
} from './projects/project-workflow-packaged-probe';
import {
  parseProjectWorkflowProbeInvocation,
  type ProjectWorkflowProbeInvocation,
} from './projects/project-workflow-probe-contract';
import { ProjectWindowController } from './projects/project-window-controller';
import { RecentProjectStore } from './recent/recent-project-store';
import { verifyPackagedShellGeometry } from './shell-geometry-check';
import { captureSmokeScreenshot } from './smoke-test';
import { StartupHealthMonitor } from './startup-health';
import { installWindowDiagnostics, type WindowProblem } from './window-diagnostics';
import { createMainWindowOptions } from './window-options';

const isSmokeTest = process.argv.includes(smokeTestContract.argument);
const recoveryProbeInvocation = parseRecoveryProbeInvocation(process.argv, recoveryProbeContract);
const projectWorkflowProbeInvocation = parseProjectWorkflowProbeInvocation(
  process.argv,
  projectWorkflowProbeContract,
);
const isRecoveryProbe = recoveryProbeInvocation.kind !== 'none';
const isProjectWorkflowProbe = projectWorkflowProbeInvocation.kind !== 'none';
const isAutomatedTest = isSmokeTest || isRecoveryProbe || isProjectWorkflowProbe;

registerAppScheme();
app.enableSandbox();

if (started) {
  app.quit();
}

let logger: AppLogger | undefined;
const projectControllers = new Map<number, ProjectWindowController>();
const startupHealth =
  isSmokeTest ||
  isProjectWorkflowProbe ||
  (recoveryProbeInvocation.kind === 'probe' && recoveryProbeInvocation.mode === 'verify')
    ? new StartupHealthMonitor()
    : undefined;

const developmentServerUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL;

const rendererRoot = path.join(__dirname, '..', 'renderer', MAIN_WINDOW_VITE_NAME);

const reportWindowProblem = ({ cause, message, scope }: WindowProblem): void => {
  logger?.error(scope, message, cause);
  startupHealth?.reportFailure(message, cause);
};

interface CreateWindowOptions {
  readonly projectDialogs?: NativeProjectDialogs;
  readonly rendererQuery?: string;
}

const createWindow = async (options: CreateWindowOptions = {}): Promise<BrowserWindow> => {
  const window = new BrowserWindow(
    createMainWindowOptions(path.join(__dirname, 'preload.js'), app.isPackaged),
  );

  installNavigationPolicy(window, developmentServerUrl);
  installWindowDiagnostics(window, reportWindowProblem);

  const lifecycle = new ProjectLifecycleController({ recoveryRoot: app.getPath('userData') });
  const workflow = new ProjectNativeWorkflow({
    dialogs: options.projectDialogs ?? createElectronProjectDialogs(window),
    lifecycle,
    recentProjects: new RecentProjectStore(app.getPath('userData')),
    reportFailure: (scope, error) => {
      logger?.error(`project-${scope}`, 'Native project operation failed.', error);
    },
  });
  const projectController = new ProjectWindowController({
    lifecycle,
    workflow,
    events: {
      closeWindow: () => {
        if (!window.isDestroyed()) {
          window.close();
        }
      },
      sendCloseOutcome: (outcome) => {
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
          window.webContents.send(DESKTOP_CHANNELS.projectCloseOutcome, outcome);
        }
      },
      sendCloseRequest: (request) => {
        if (window.isDestroyed() || window.webContents.isDestroyed()) {
          return false;
        }
        try {
          window.webContents.send(DESKTOP_CHANNELS.projectCloseRequest, request);
          return true;
        } catch (error) {
          logger?.error('project-close', 'Failed to request renderer close state.', error);
          return false;
        }
      },
    },
    reportRejectedTransport: (scope) => {
      logger?.error('project-bridge', `Rejected renderer project transport: ${scope}.`);
    },
  });
  const webContentsId = window.webContents.id;
  projectControllers.set(webContentsId, projectController);
  window.on('close', (event) => {
    const rendererAvailable = !window.webContents.isDestroyed();
    if (projectController.handleWindowCloseAttempt(rendererAvailable)) {
      return;
    }
    event.preventDefault();
    if (!rendererAvailable) {
      void projectController.handleRendererUnavailable().catch((error: unknown) => {
        logger?.error('project-close', 'Failed to retain recovery before close.', error);
      });
    }
  });
  window.webContents.once('destroyed', () => {
    projectControllers.delete(webContentsId);
  });
  window.webContents.once('render-process-gone', () => {
    void projectController.handleRendererUnavailable().catch((error: unknown) => {
      logger?.error('project-close', 'Failed to retain recovery after renderer loss.', error);
    });
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  if (developmentServerUrl === undefined) {
    await window.loadURL(
      options.rendererQuery === undefined
        ? APP_ENTRY_URL
        : `${APP_ENTRY_URL}?${options.rendererQuery}`,
    );
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
  await verifyPackagedShellGeometry(window);
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
  await preparePackagedRecoveryProbe(invocation.root, invocation.contract.userFileName);
  await writeStandardOutputLine(invocation.contract.writerReadyMarker);
  await waitForForcedTermination();
};

const startApplication = async (): Promise<void> => {
  if (recoveryProbeInvocation.kind === 'invalid') {
    throw new Error(recoveryProbeInvocation.message);
  }
  if (projectWorkflowProbeInvocation.kind === 'invalid') {
    throw new Error(projectWorkflowProbeInvocation.message);
  }
  if (recoveryProbeInvocation.kind === 'probe' && projectWorkflowProbeInvocation.kind === 'probe') {
    throw new Error('Only one packaged project probe may run at a time.');
  }
  let activeRecoveryProbe: Extract<RecoveryProbeInvocation, { readonly kind: 'probe' }> | undefined;
  let activeProjectWorkflowProbe:
    Extract<ProjectWorkflowProbeInvocation, { readonly kind: 'probe' }> | undefined;
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
  if (projectWorkflowProbeInvocation.kind === 'probe') {
    const root = authorizeRecoveryProbeRoot(
      projectWorkflowProbeInvocation.root,
      tmpdir(),
      projectWorkflowProbeInvocation.contract.rootNamePrefix,
      true,
    );
    if (root === undefined) {
      throw new Error('The project-workflow probe root is not an authorized temporary directory.');
    }
    activeProjectWorkflowProbe = Object.freeze({ ...projectWorkflowProbeInvocation, root });
    app.setPath('userData', root);
  }
  await app.whenReady();

  if (activeRecoveryProbe?.mode === 'write') {
    await runRecoveryProbe(activeRecoveryProbe);
    return;
  }

  logger = await createAppLogger(app.getPath('logs'), app.getPath('home'));
  installProcessErrorLogging(logger, () => app.exit(1));
  configureSessionSecurity(session.defaultSession);
  installApplicationMenu();

  if (developmentServerUrl === undefined) {
    installAppProtocol(rendererRoot);
  }

  registerDesktopIpc({
    ...(developmentServerUrl === undefined ? {} : { developmentServerUrl }),
    ...(startupHealth === undefined
      ? {}
      : { onRendererReady: () => startupHealth.reportRendererReady() }),
    onProjectBridgeFailure: (error) => {
      logger?.error('project-bridge', 'Project IPC failed.', error);
    },
    resolveProjectController: (webContentsId) => projectControllers.get(webContentsId),
  });
  const window = await createWindow(
    activeProjectWorkflowProbe !== undefined
      ? {
          projectDialogs: createProjectWorkflowProbeDialogs(
            activeProjectWorkflowProbe.root,
            activeProjectWorkflowProbe.contract.userFileName,
          ),
          rendererQuery: `${activeProjectWorkflowProbe.contract.queryKey}=${activeProjectWorkflowProbe.contract.queryValue}`,
        }
      : activeRecoveryProbe?.mode === 'verify'
        ? {
            rendererQuery: `${activeRecoveryProbe.contract.rendererQueryKey}=${activeRecoveryProbe.contract.rendererQueryValue}`,
          }
        : {},
  );
  if (activeProjectWorkflowProbe !== undefined) {
    if (startupHealth === undefined) {
      throw new Error('The project-workflow probe health monitor is unavailable.');
    }
    await startupHealth.waitForRendererReady(activeProjectWorkflowProbe.contract.processTimeoutMs);
    startupHealth.assertHealthy();
    await runPackagedProjectWorkflowProbe(
      window,
      activeProjectWorkflowProbe.root,
      activeProjectWorkflowProbe.contract,
    );
    startupHealth.assertHealthy();
    await writeStandardOutputLine(activeProjectWorkflowProbe.contract.marker);
    app.exit(0);
    return;
  }
  if (activeRecoveryProbe?.mode === 'verify') {
    if (startupHealth === undefined) {
      throw new Error('The recovery verifier health monitor is unavailable.');
    }
    await startupHealth.waitForRendererReady(activeRecoveryProbe.contract.processTimeoutMs);
    startupHealth.assertHealthy();
    await verifyPackagedRecoveryThroughRenderer(
      window,
      activeRecoveryProbe.root,
      activeRecoveryProbe.contract.userFileName,
      activeRecoveryProbe.contract,
    );
    startupHealth.assertHealthy();
    await writeStandardOutputLine(activeRecoveryProbe.contract.verificationMarker);
    app.exit(0);
    return;
  }
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
  if (process.platform !== 'darwin' && !isProjectWorkflowProbe) {
    app.quit();
  }
});
