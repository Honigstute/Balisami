// @vitest-environment node

import { describe, expect, it } from 'vitest';

import viewportPerformanceContract from '../viewport-performance-contract.json';
import {
  getViewportPerformanceFailures,
  isViewportPerformanceProbeRequested,
  parseViewportPerformanceResult,
  type ViewportPerformanceResult,
} from '../src/shared/viewport-performance';

const passingResult = (): ViewportPerformanceResult =>
  Object.freeze({
    addedNodeCount: 320,
    durationMs: viewportPerformanceContract.durationMs + 20,
    frameSampleCount: 600,
    frameWorkMaximumMs: 9,
    frameWorkP95Ms: 2.5,
    inputLatencyP95Ms: 18,
    longTaskCount: 0,
    maximumLongTaskMs: 0,
    reactCommitsDuringRun: 0,
    removedNodeCount: 300,
  });

describe('viewport performance packaged contract', () => {
  it('recognizes only the exact renderer query value', () => {
    expect(
      isViewportPerformanceProbeRequested(
        `?${viewportPerformanceContract.queryKey}=${viewportPerformanceContract.queryValue}`,
      ),
    ).toBe(true);
    expect(
      isViewportPerformanceProbeRequested(`?${viewportPerformanceContract.queryKey}=other`),
    ).toBe(false);
    expect(isViewportPerformanceProbeRequested('')).toBe(false);
  });

  it('parses one strict bounded renderer result', () => {
    const result = passingResult();
    expect(parseViewportPerformanceResult(JSON.stringify(result))).toEqual(result);
    expect(
      parseViewportPerformanceResult(JSON.stringify({ ...result, extra: true })),
    ).toBeUndefined();
    expect(parseViewportPerformanceResult('{')).toBeUndefined();
    expect(parseViewportPerformanceResult('x'.repeat(4_097))).toBeUndefined();
  });

  it('accepts a passing result and reports each hard-budget regression once', () => {
    expect(getViewportPerformanceFailures(passingResult(), viewportPerformanceContract)).toEqual(
      [],
    );
    const failures = getViewportPerformanceFailures(
      {
        ...passingResult(),
        durationMs: viewportPerformanceContract.durationMs - 1,
        frameSampleCount: 1,
        frameWorkMaximumMs: viewportPerformanceContract.maximumFrameWorkMs + 1,
        frameWorkP95Ms: viewportPerformanceContract.maximumFrameWorkP95Ms + 1,
        inputLatencyP95Ms: viewportPerformanceContract.maximumInputLatencyP95Ms + 1,
        reactCommitsDuringRun: 1,
      },
      viewportPerformanceContract,
    );

    expect(failures).toHaveLength(6);
    expect(new Set(failures).size).toBe(failures.length);
  });
});
