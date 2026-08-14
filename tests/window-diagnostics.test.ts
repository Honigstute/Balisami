// @vitest-environment node

import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { installWindowDiagnostics, type WindowProblem } from '../src/main/window-diagnostics';

type RecordedListener = (...arguments_: ReadonlyArray<unknown>) => void;

const createWindowHarness = () => {
  const windowListeners = new Map<string, RecordedListener>();
  const webContentsListeners = new Map<string, RecordedListener>();

  const capture = (listeners: Map<string, RecordedListener>) =>
    vi.fn((eventName: string, listener: unknown) => {
      if (typeof listener !== 'function') {
        throw new TypeError(`Listener for ${eventName} is not callable.`);
      }
      listeners.set(eventName, listener as RecordedListener);
    });

  const window = {
    on: capture(windowListeners),
    webContents: { on: capture(webContentsListeners) },
  } as unknown as BrowserWindow;

  return { webContentsListeners, window, windowListeners };
};

describe('window diagnostics', () => {
  it('reports renderer warnings and errors but ignores informational messages', () => {
    const { webContentsListeners, window } = createWindowHarness();
    const problems: WindowProblem[] = [];
    installWindowDiagnostics(window, (problem) => problems.push(problem));

    const consoleListener = webContentsListeners.get('console-message');
    consoleListener?.({ level: 'info', message: 'ordinary information' });
    consoleListener?.({ level: 'warning', message: 'unexpected warning' });
    consoleListener?.({ level: 'error', message: 'unexpected error' });

    expect(problems).toEqual([
      {
        message: 'Renderer console warning: unexpected warning',
        scope: 'renderer-console',
      },
      {
        message: 'Renderer console error: unexpected error',
        scope: 'renderer-console',
      },
    ]);
  });

  it('reports only main-frame load failures', () => {
    const { webContentsListeners, window } = createWindowHarness();
    const problems: WindowProblem[] = [];
    installWindowDiagnostics(window, (problem) => problems.push(problem));

    const loadListener = webContentsListeners.get('did-fail-load');
    loadListener?.({}, -3, 'aborted subframe', 'balsamic://app/frame', false);
    loadListener?.({}, -105, 'name not resolved', 'balsamic://app/index.html', true);

    expect(problems).toEqual([
      {
        message: 'Renderer load failed (-105): name not resolved',
        scope: 'renderer-load',
      },
    ]);
  });

  it('reports preload, renderer-process, and unresponsive failures', () => {
    const { webContentsListeners, window, windowListeners } = createWindowHarness();
    const problems: WindowProblem[] = [];
    installWindowDiagnostics(window, (problem) => problems.push(problem));
    const preloadError = new Error('preload exploded');

    webContentsListeners.get('preload-error')?.({}, '/private/preload.js', preloadError);
    webContentsListeners.get('render-process-gone')?.({}, { reason: 'crashed' });
    windowListeners.get('unresponsive')?.();

    expect(problems).toEqual([
      {
        cause: preloadError,
        message: 'The preload bridge failed to start.',
        scope: 'preload',
      },
      { message: 'Renderer process exited: crashed', scope: 'renderer' },
      { message: 'The renderer window became unresponsive.', scope: 'renderer' },
    ]);
  });

  it('caps renderer console content before recording it', () => {
    const { webContentsListeners, window } = createWindowHarness();
    const problems: WindowProblem[] = [];
    installWindowDiagnostics(window, (problem) => problems.push(problem));

    webContentsListeners.get('console-message')?.({ level: 'error', message: 'x'.repeat(2_000) });

    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toHaveLength('Renderer console error: '.length + 500);
  });
});
