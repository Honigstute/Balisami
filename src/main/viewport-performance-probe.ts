import type { BrowserWindow } from 'electron';

import {
  getViewportPerformanceFailures,
  parseViewportPerformanceResult,
  type ViewportPerformanceBudgets,
  type ViewportPerformanceResult,
} from '../shared/viewport-performance';

const POLL_INTERVAL_MS = 25;

interface ViewportPerformanceProbeContract extends ViewportPerformanceBudgets {
  readonly processTimeoutMs: number;
  readonly resultAttribute: string;
}

/** Polls one fixed renderer-owned attribute; no project or filesystem data crosses this probe. */
export const runPackagedViewportPerformanceProbe = async (
  window: BrowserWindow,
  contract: ViewportPerformanceProbeContract,
): Promise<ViewportPerformanceResult> => {
  const attribute = JSON.stringify(contract.resultAttribute);
  const deadline = Date.now() + contract.processTimeoutMs;
  while (Date.now() <= deadline) {
    const rawResult: unknown = await window.webContents.executeJavaScript(
      `document.querySelector('.app-shell')?.getAttribute(${attribute}) ?? null`,
      true,
    );
    const result = parseViewportPerformanceResult(rawResult);
    if (result !== undefined) {
      const failures = getViewportPerformanceFailures(result, contract);
      if (failures.length > 0) {
        throw new Error(`Packaged viewport performance failed: ${failures.join(' ')}`);
      }
      return result;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('The packaged viewport performance result did not arrive in time.');
};
