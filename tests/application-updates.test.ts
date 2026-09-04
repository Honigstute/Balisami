// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  installApplicationUpdates,
  shouldEnableApplicationUpdates,
  type ApplicationUpdateRuntime,
} from '../src/main/updates/application-updates';

const enabledEnvironment = Object.freeze({
  automated: false,
  packaged: true,
  platform: 'darwin' as const,
  squirrelFirstRun: false,
});

describe('application updates', () => {
  it('runs only in ordinary packaged macOS and Windows sessions', () => {
    expect(shouldEnableApplicationUpdates(enabledEnvironment)).toBe(true);
    expect(shouldEnableApplicationUpdates({ ...enabledEnvironment, platform: 'win32' })).toBe(true);
    expect(shouldEnableApplicationUpdates({ ...enabledEnvironment, packaged: false })).toBe(false);
    expect(shouldEnableApplicationUpdates({ ...enabledEnvironment, automated: true })).toBe(false);
    expect(shouldEnableApplicationUpdates({ ...enabledEnvironment, squirrelFirstRun: true })).toBe(
      false,
    );
    expect(shouldEnableApplicationUpdates({ ...enabledEnvironment, platform: 'linux' })).toBe(
      false,
    );
  });

  it('deduplicates the update-ready notice and leaves restart to the normal save flow', async () => {
    let notify: (() => void) | undefined;
    let resolveNotice: (() => void) | undefined;
    const stop = vi.fn();
    const runtime: ApplicationUpdateRuntime = {
      showReadyNotice: () =>
        new Promise((resolve) => {
          resolveNotice = resolve;
        }),
      start: (onDownloaded) => {
        notify = () =>
          onDownloaded({
            event: {} as never,
            releaseDate: new Date(0),
            releaseName: 'v0.2.0',
            releaseNotes: '',
            updateURL: '',
          });
        return { stop };
      },
    };
    const reportFailure = vi.fn();
    const installed = installApplicationUpdates(enabledEnvironment, runtime, reportFailure);

    notify?.();
    notify?.();
    expect(resolveNotice).toBeDefined();
    resolveNotice?.();
    await vi.waitFor(() => expect(reportFailure).not.toHaveBeenCalled());
    installed.stop();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('does not start or notify outside an eligible packaged session', () => {
    const start = vi.fn();
    const runtime: ApplicationUpdateRuntime = {
      showReadyNotice: vi.fn(),
      start,
    };

    installApplicationUpdates({ ...enabledEnvironment, automated: true }, runtime, vi.fn());
    expect(start).not.toHaveBeenCalled();
  });
});
