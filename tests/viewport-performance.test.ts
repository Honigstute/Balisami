// @vitest-environment node

import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';

import { WorldSpatialIndex } from '../src/renderer/editor/spatial-index';
import { createWorldRect } from '../src/renderer/editor/viewport-transform';
import { createEditorSpatialFixture } from './fixtures/editor-spatial-fixture';

const percentile95 = (samples: readonly number[]): number => {
  const ordered = [...samples].sort((first, second) => first - second);
  return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
};

describe('viewport algorithm performance fixtures', () => {
  it('keeps 1,000-element visible-range query work inside one frame budget', () => {
    const index = new WorldSpatialIndex<string>();
    index.rebuild(createEditorSpatialFixture(1_000));
    const durations: number[] = [];

    for (let frame = 0; frame < 600; frame += 1) {
      const start = performance.now();
      index.query(createWorldRect(frame * 4 - 400, frame * 2 - 300, 1_200, 800));
      durations.push(performance.now() - start);
    }

    expect(percentile95(durations)).toBeLessThanOrEqual(16.7);
  });

  it('keeps a 5,000-element point-region broad-phase query below the hit-test budget', () => {
    const index = new WorldSpatialIndex<string>();
    index.rebuild(createEditorSpatialFixture(5_000));
    const durations: number[] = [];

    for (let sample = 0; sample < 250; sample += 1) {
      const start = performance.now();
      index.query(createWorldRect(sample * 13 - 400, sample * 7 - 300, 2, 2));
      durations.push(performance.now() - start);
    }

    expect(percentile95(durations)).toBeLessThanOrEqual(20);
  });
});
