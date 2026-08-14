// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

import { StartupHealthMonitor } from '../src/main/startup-health';

describe('startup health monitor', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves only after renderer readiness is reported', async () => {
    const monitor = new StartupHealthMonitor();
    monitor.reportRendererReady();

    await expect(monitor.waitForRendererReady(100)).resolves.toBeUndefined();
    expect(() => monitor.assertHealthy()).not.toThrow();
  });

  it('preserves and reports the first startup failure', async () => {
    const monitor = new StartupHealthMonitor();
    monitor.reportFailure('Preload failed');
    monitor.reportFailure('Later renderer failure');

    await expect(monitor.waitForRendererReady(100)).rejects.toThrow('Preload failed');
    expect(() => monitor.assertHealthy()).toThrow('Preload failed');
  });

  it('detects a failure that arrives after readiness', async () => {
    const monitor = new StartupHealthMonitor();
    monitor.reportRendererReady();
    await monitor.waitForRendererReady(100);

    monitor.reportFailure('Renderer console error');
    expect(() => monitor.assertHealthy()).toThrow('Renderer console error');
  });

  it('times out when the renderer never reports readiness', async () => {
    vi.useFakeTimers();
    const monitor = new StartupHealthMonitor();
    const readiness = expect(monitor.waitForRendererReady(25)).rejects.toThrow(
      'Renderer did not report readiness within 25 ms.',
    );

    await vi.advanceTimersByTimeAsync(25);
    await readiness;
  });

  it('rejects invalid timeout values', async () => {
    const monitor = new StartupHealthMonitor();
    await expect(monitor.waitForRendererReady(0)).rejects.toThrow(RangeError);
    await expect(monitor.waitForRendererReady(Number.NaN)).rejects.toThrow(RangeError);
  });
});
