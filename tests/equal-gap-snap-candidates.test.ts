// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createEqualGapQueryRegions,
  createEqualGapSnapCandidates,
  type EqualGapSnapSource,
} from '../src/renderer/editor/equal-gap-snap-candidates';
import { resolveSnap } from '../src/renderer/editor/snap-engine';
import {
  createViewportZoom,
  createWorldRect,
  createWorldVector,
} from '../src/renderer/editor/viewport-transform';

const X_ONLY = Object.freeze({ x: true, y: false });

const createSource = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  sourceOrder: number,
): EqualGapSnapSource =>
  Object.freeze({ bounds: createWorldRect(x, y, width, height), id, sourceOrder });

describe('equal-gap snap candidate generation', () => {
  it('centers a moving bound between the nearest sources and describes both equal gaps', () => {
    const candidates = createEqualGapSnapCandidates({
      activeAxes: X_ONLY,
      movingBounds: createWorldRect(58, 10, 20, 20),
      sources: [
        createSource('element_before001', 0, 0, 40, 40, 0),
        createSource('element_after0001', 100, 0, 40, 40, 1),
      ],
      toleranceWorldUnits: 9,
      zoom: createViewportZoom(1),
    });

    expect(candidates).toEqual([
      {
        anchor: 'line',
        axis: 'x',
        gap: 20,
        guideSegments: [
          { endX: 60, endY: 48, startX: 40, startY: 48 },
          { endX: 100, endY: 48, startX: 80, startY: 48 },
        ],
        kind: 'equalGap',
        position: 60,
        requiredMovingAnchor: 'start',
        sourceId: 'equal-gap:x:bridge:element_before001|element_after0001',
        sourceOrder: 0,
        spanEnd: 30,
        spanStart: 10,
      },
    ]);
    expect(Object.isFrozen(candidates)).toBe(true);
    expect(candidates.every(Object.isFrozen)).toBe(true);
    expect(candidates[0]?.guideSegments?.every(Object.isFrozen)).toBe(true);
  });

  it('repeats the nearest established gap before or after the moving bound', () => {
    const repeatBefore = createEqualGapSnapCandidates({
      activeAxes: X_ONLY,
      movingBounds: createWorldRect(58, 0, 20, 20),
      sources: [
        createSource('element_first0001', 0, 0, 20, 20, 0),
        createSource('element_second001', 30, 0, 20, 20, 1),
      ],
      toleranceWorldUnits: 9,
      zoom: createViewportZoom(1),
    });
    expect(repeatBefore).toEqual([
      expect.objectContaining({
        gap: 10,
        position: 60,
        sourceId: 'equal-gap:x:repeatBefore:element_first0001|element_second001',
      }),
    ]);
    expect(repeatBefore[0]?.guideSegments).toEqual([
      { endX: 30, endY: 28, startX: 20, startY: 28 },
      { endX: 60, endY: 28, startX: 50, startY: 28 },
    ]);

    const repeatAfter = createEqualGapSnapCandidates({
      activeAxes: X_ONLY,
      movingBounds: createWorldRect(72, 0, 20, 20),
      sources: [
        createSource('element_second001', 100, 0, 20, 20, 1),
        createSource('element_third0001', 130, 0, 20, 20, 2),
      ],
      toleranceWorldUnits: 9,
      zoom: createViewportZoom(1),
    });
    expect(repeatAfter).toEqual([
      expect.objectContaining({
        gap: 10,
        position: 70,
        sourceId: 'equal-gap:x:repeatAfter:element_second001|element_third0001',
      }),
    ]);
    expect(repeatAfter[0]?.guideSegments).toEqual([
      { endX: 100, endY: 28, startX: 90, startY: 28 },
      { endX: 130, endY: 28, startX: 120, startY: 28 },
    ]);
  });

  it('uses strict row or column overlap and does not invent negative established gaps', () => {
    expect(
      createEqualGapSnapCandidates({
        activeAxes: X_ONLY,
        movingBounds: createWorldRect(58, 100, 20, 20),
        sources: [
          createSource('element_first0001', 0, 0, 20, 20, 0),
          createSource('element_second001', 30, 0, 20, 20, 1),
        ],
        toleranceWorldUnits: 9,
        zoom: createViewportZoom(1),
      }),
    ).toEqual([]);

    expect(
      createEqualGapSnapCandidates({
        activeAxes: X_ONLY,
        movingBounds: createWorldRect(56, 0, 20, 20),
        sources: [
          createSource('element_first0001', 0, 0, 40, 20, 0),
          createSource('element_second001', 30, 0, 20, 20, 1),
        ],
        toleranceWorldUnits: 9,
        zoom: createViewportZoom(1),
      }),
    ).toEqual([]);
  });

  it('keeps acquisition and release in the shared resolver with an edge-constrained lock', () => {
    const movingBounds = createWorldRect(0, 10, 20, 20);
    const createCandidates = (rawX: number, toleranceWorldUnits: number) =>
      createEqualGapSnapCandidates({
        activeAxes: X_ONLY,
        movingBounds: createWorldRect(rawX, 10, 20, 20),
        sources: [
          createSource('element_before001', 0, 0, 40, 40, 0),
          createSource('element_after0001', 100, 0, 40, 40, 1),
        ],
        toleranceWorldUnits,
        zoom: createViewportZoom(1),
      });
    const acquired = resolveSnap({
      activeAxes: X_ONLY,
      bypass: false,
      candidates: createCandidates(55, 9),
      movingBounds,
      rawDelta: createWorldVector(55, 0),
      zoom: createViewportZoom(1),
    });
    expect(acquired.adjustedDelta.x).toBe(60);
    expect(acquired.locks.x?.candidate.kind).toBe('equalGap');
    expect(acquired.guides[0]?.gap).toBe(20);

    const held = resolveSnap({
      activeAxes: X_ONLY,
      bypass: false,
      candidates: createCandidates(68, 9),
      movingBounds,
      previousLocks: acquired.locks,
      rawDelta: createWorldVector(68, 0),
      zoom: createViewportZoom(1),
    });
    expect(held.adjustedDelta.x).toBe(60);

    const released = resolveSnap({
      activeAxes: X_ONLY,
      bypass: false,
      candidates: createCandidates(70, 9),
      movingBounds,
      previousLocks: held.locks,
      rawDelta: createWorldVector(70, 0),
      zoom: createViewportZoom(1),
    });
    expect(released.adjustedDelta.x).toBe(70);
    expect(released.locks).toEqual({});
  });

  it('creates zoom-bounded row and column corridors for only active axes', () => {
    expect(
      createEqualGapQueryRegions(createWorldRect(100, 200, 40, 20), createViewportZoom(2), {
        x: true,
        y: true,
      }),
    ).toEqual([
      { x: -500, y: 200, width: 1_240, height: 20 },
      { x: 100, y: -400, width: 40, height: 1_220 },
    ]);
    expect(
      createEqualGapQueryRegions(createWorldRect(100, 200, 40, 20), createViewportZoom(2), {
        x: false,
        y: true,
      }),
    ).toHaveLength(1);
  });

  it.each([
    ['zero tolerance', { toleranceWorldUnits: 0 }],
    [
      'negative source order',
      {
        sources: [
          {
            bounds: createWorldRect(0, 0, 20, 20),
            id: 'element_invalidorder',
            sourceOrder: -1,
          },
        ],
      },
    ],
    [
      'oversized source ID',
      {
        sources: [{ bounds: createWorldRect(0, 0, 20, 20), id: 'x'.repeat(81), sourceOrder: 0 }],
      },
    ],
  ])('rejects invalid candidate input: %s', (_label, overrides) => {
    expect(() =>
      createEqualGapSnapCandidates({
        activeAxes: X_ONLY,
        movingBounds: createWorldRect(50, 0, 20, 20),
        sources: [],
        toleranceWorldUnits: 9,
        zoom: createViewportZoom(1),
        ...overrides,
      }),
    ).toThrow();
  });

  it('preserves exact equal spacing across seeded axes, zooms, sizes, and negative coordinates', () => {
    let seed = 0x7e91_42ab;
    const next = (): number => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const between = (minimum: number, maximum: number): number =>
      minimum + next() * (maximum - minimum);

    for (let sample = 0; sample < 300; sample += 1) {
      const axis = sample % 2 === 0 ? ('x' as const) : ('y' as const);
      const zoom = createViewportZoom([0.1, 0.25, 1, 2, 4][sample % 5] ?? 1);
      const beforeStart = between(-1_000, 1_000);
      const minimumSize = 8 + 12 / zoom;
      const beforeSize = between(minimumSize, minimumSize + 240);
      const movingSize = between(minimumSize, minimumSize + 240);
      const afterSize = between(minimumSize, minimumSize + 240);
      const gap = between(0, 160);
      const targetStart = beforeStart + beforeSize + gap;
      const afterStart = targetStart + movingSize + gap;
      const jitterWorld = between(-5.5, 5.5) / zoom;
      const rawStart = targetStart + jitterWorld;
      const createAxisBounds = (start: number, size: number) =>
        axis === 'x'
          ? createWorldRect(start, -20, size, 40)
          : createWorldRect(-20, start, 40, size);
      const candidates = createEqualGapSnapCandidates({
        activeAxes: axis === 'x' ? { x: true, y: false } : { x: false, y: true },
        movingBounds: createAxisBounds(rawStart, movingSize),
        sources: [
          {
            bounds: createAxisBounds(beforeStart, beforeSize),
            id: 'element_seedbefore',
            sourceOrder: 0,
          },
          {
            bounds: createAxisBounds(afterStart, afterSize),
            id: 'element_seedafter0',
            sourceOrder: 1,
          },
        ],
        toleranceWorldUnits: 9 / zoom,
        zoom,
      });
      const bridge = candidates.find((candidate) => candidate.sourceId.includes(':bridge:'));
      expect(bridge, `missing bridge candidate for sample ${String(sample)}`).toBeDefined();
      const result = resolveSnap({
        activeAxes: axis === 'x' ? { x: true, y: false } : { x: false, y: true },
        bypass: false,
        candidates,
        movingBounds: createAxisBounds(rawStart, movingSize),
        rawDelta: createWorldVector(0, 0),
        zoom,
      });
      const resolvedStart = axis === 'x' ? result.snappedBounds.x : result.snappedBounds.y;
      expect(resolvedStart).toBeCloseTo(targetStart, 9);
      expect(result.guides[0]?.gap).toBeCloseTo(gap, 9);
      for (const segment of result.guides[0]?.segments ?? []) {
        const segmentLength =
          axis === 'x'
            ? Math.abs(segment.endX - segment.startX)
            : Math.abs(segment.endY - segment.startY);
        expect(segmentLength).toBeCloseTo(gap, 9);
      }
    }
  });
});
