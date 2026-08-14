import type { BrowserWindow } from 'electron';

export interface WindowProblem {
  readonly cause?: unknown;
  readonly message: string;
  readonly scope: string;
}

type ReportWindowProblem = (problem: WindowProblem) => void;

const trimConsoleMessage = (message: string): string => message.slice(0, 500);

/**
 * Centralizes native renderer failure signals. The same reporter feeds bounded
 * production logs and the packaged smoke gate without exposing renderer APIs.
 */
export const installWindowDiagnostics = (
  window: BrowserWindow,
  reportProblem: ReportWindowProblem,
): void => {
  window.on('unresponsive', () => {
    reportProblem({ message: 'The renderer window became unresponsive.', scope: 'renderer' });
  });

  window.webContents.on('console-message', (event) => {
    if (event.level === 'warning' || event.level === 'error') {
      reportProblem({
        message: `Renderer console ${event.level}: ${trimConsoleMessage(event.message)}`,
        scope: 'renderer-console',
      });
    }
  });

  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
      if (isMainFrame) {
        reportProblem({
          message: `Renderer load failed (${String(errorCode)}): ${errorDescription}`,
          scope: 'renderer-load',
        });
      }
    },
  );

  window.webContents.on('preload-error', (_event, _preloadPath, error) => {
    reportProblem({
      cause: error,
      message: 'The preload bridge failed to start.',
      scope: 'preload',
    });
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    reportProblem({
      message: `Renderer process exited: ${details.reason}`,
      scope: 'renderer',
    });
  });
};
