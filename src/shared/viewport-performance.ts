import { z } from 'zod';

import viewportPerformanceContract from '../../viewport-performance-contract.json';

export const ViewportPerformanceResultSchema = z
  .strictObject({
    addedNodeCount: z.number().int().nonnegative(),
    durationMs: z.number().finite().positive(),
    frameSampleCount: z.number().int().nonnegative(),
    frameWorkMaximumMs: z.number().finite().nonnegative(),
    frameWorkP95Ms: z.number().finite().nonnegative(),
    inputLatencyP95Ms: z.number().finite().nonnegative(),
    longTaskCount: z.number().int().nonnegative(),
    maximumLongTaskMs: z.number().finite().nonnegative(),
    reactCommitsDuringRun: z.number().int().nonnegative(),
    removedNodeCount: z.number().int().nonnegative(),
  })
  .readonly();

export type ViewportPerformanceResult = z.infer<typeof ViewportPerformanceResultSchema>;

export interface ViewportPerformanceBudgets {
  readonly durationMs: number;
  readonly maximumFrameWorkMs: number;
  readonly maximumFrameWorkP95Ms: number;
  readonly maximumInputLatencyP95Ms: number;
  readonly minimumFrameSamples: number;
}

export const isViewportPerformanceProbeRequested = (search: string): boolean =>
  new URLSearchParams(search).get(viewportPerformanceContract.queryKey) ===
  viewportPerformanceContract.queryValue;

export const parseViewportPerformanceResult = (
  input: unknown,
): ViewportPerformanceResult | undefined => {
  if (typeof input !== 'string' || input.length > 4_096) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(input);
    const result = ViewportPerformanceResultSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
};

/** Returns bounded, plain-language failures for the native packaged gate. */
export const getViewportPerformanceFailures = (
  result: ViewportPerformanceResult,
  budgets: ViewportPerformanceBudgets,
): readonly string[] => {
  const failures: string[] = [];
  if (result.durationMs < budgets.durationMs) {
    failures.push('The measured gesture ended before the required duration.');
  }
  if (result.frameSampleCount < budgets.minimumFrameSamples) {
    failures.push('The measured gesture produced too few camera frames.');
  }
  if (result.frameWorkP95Ms > budgets.maximumFrameWorkP95Ms) {
    failures.push('The p95 camera frame work exceeded its budget.');
  }
  if (result.frameWorkMaximumMs > budgets.maximumFrameWorkMs) {
    failures.push('A camera frame task exceeded the maximum task budget.');
  }
  if (result.inputLatencyP95Ms > budgets.maximumInputLatencyP95Ms) {
    failures.push('The p95 input-to-visible-update latency exceeded its budget.');
  }
  if (result.reactCommitsDuringRun !== 0) {
    failures.push('Camera motion caused React commits during the measured gesture.');
  }
  return Object.freeze(failures.slice(0, 6));
};
