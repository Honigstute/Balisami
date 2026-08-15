// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  SNAP_POLICY,
  createBoundsSnapCandidates,
  createSnapCandidateQueryBounds,
  resolveSnap,
  type SnapCandidate,
  type SnapResolutionInput,
} from '../src/renderer/editor/snap-engine';
import {
  createViewportZoom,
  createWorldRect,
  createWorldVector,
} from '../src/renderer/editor/viewport-transform';

const MOVING_BOUNDS = createWorldRect(0, 0, 100, 50);
const ACTIVE_AXES = Object.freeze({ x: true, y: true });

const createLineCandidate = (overrides: Partial<SnapCandidate> = {}): SnapCandidate => ({
  anchor: 'start',
  axis: 'x',
  kind: 'object',
  position: 100,
  sourceId: 'element_target',
  sourceOrder: 0,
  spanEnd: 100,
  spanStart: 0,
  ...overrides,
});

const resolve = (overrides: Partial<SnapResolutionInput> = {}) =>
  resolveSnap({
    activeAxes: ACTIVE_AXES,
    bypass: false,
    candidates: [],
    movingBounds: MOVING_BOUNDS,
    rawDelta: createWorldVector(0, 0),
    zoom: createViewportZoom(1),
    ...overrides,
  });

describe('snap candidate generation', () => {
  it('creates six immutable object or container anchors from one canonical bound', () => {
    const candidates = createBoundsSnapCandidates({
      bounds: createWorldRect(-20, 10, 120, 60),
      kind: 'object',
      sourceId: 'element_candidate',
      sourceOrder: 4,
    });

    expect(candidates).toEqual([
      {
        anchor: 'start',
        axis: 'x',
        kind: 'object',
        position: -20,
        sourceId: 'element_candidate',
        sourceOrder: 4,
        spanEnd: 70,
        spanStart: 10,
      },
      expect.objectContaining({ anchor: 'center', axis: 'x', position: 40 }),
      expect.objectContaining({ anchor: 'end', axis: 'x', position: 100 }),
      expect.objectContaining({ anchor: 'start', axis: 'y', position: 10 }),
      expect.objectContaining({ anchor: 'center', axis: 'y', position: 40 }),
      expect.objectContaining({ anchor: 'end', axis: 'y', position: 70 }),
    ]);
    expect(Object.isFrozen(candidates)).toBe(true);
    expect(candidates.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    ['grid kind', { kind: 'grid' as 'object' }],
    ['empty source ID', { sourceId: '' }],
    ['unsafe source order', { sourceOrder: Number.MAX_SAFE_INTEGER + 1 }],
    ['negative source order', { sourceOrder: -1 }],
  ])('rejects invalid bounds candidate metadata: %s', (_label, overrides) => {
    expect(() =>
      createBoundsSnapCandidates({
        bounds: MOVING_BOUNDS,
        kind: 'object',
        sourceId: 'element_candidate',
        sourceOrder: 0,
        ...overrides,
      }),
    ).toThrow();
  });

  it('creates a zoom-stable broad-phase query around the raw moved bounds', () => {
    expect(
      createSnapCandidateQueryBounds(
        createWorldRect(-10, 20, 100, 50),
        createWorldVector(30, -5),
        createViewportZoom(2),
      ),
    ).toEqual({
      x: -580,
      y: -585,
      width: 1_300,
      height: 1_250,
    });
    expect(SNAP_POLICY.candidateSearchRadiusPixels).toBe(1_200);
  });
});

describe('pure snap resolution', () => {
  it('resolves X and Y independently across object edge anchors and returns guide extents', () => {
    const candidates = createBoundsSnapCandidates({
      bounds: createWorldRect(200, 100, 100, 50),
      kind: 'object',
      sourceId: 'element_target',
      sourceOrder: 0,
    });
    const result = resolve({ candidates, rawDelta: createWorldVector(94, 47) });

    expect(result.adjustedDelta).toEqual({ x: 100, y: 50 });
    expect(result.snappedBounds).toEqual({ height: 50, width: 100, x: 100, y: 50 });
    expect(result.guides).toEqual([
      {
        axis: 'x',
        end: 150,
        kind: 'object',
        movingAnchor: 'end',
        position: 200,
        sourceId: 'element_target',
        start: 50,
        targetAnchor: 'start',
      },
      {
        axis: 'y',
        end: 300,
        kind: 'object',
        movingAnchor: 'end',
        position: 100,
        sourceId: 'element_target',
        start: 100,
        targetAnchor: 'start',
      },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.guides)).toBe(true);
    expect(Object.isFrozen(result.locks.x)).toBe(true);
  });

  it('uses distance, candidate kind, canonical source order, and stable position for ties', () => {
    const movingBounds = createWorldRect(100, 0, 20, 20);
    const container = createLineCandidate({
      kind: 'container',
      position: 96,
      sourceId: 'container',
      sourceOrder: 0,
    });
    const laterObject = createLineCandidate({
      position: 104,
      sourceId: 'object-later',
      sourceOrder: 8,
    });
    const earlierObject = createLineCandidate({
      position: 96,
      sourceId: 'object-earlier',
      sourceOrder: 2,
    });

    const kindResult = resolve({
      candidates: [container, laterObject],
      movingBounds,
      rawDelta: createWorldVector(0, 0),
    });
    expect(kindResult.adjustedDelta.x).toBe(4);
    expect(kindResult.guides[0]?.sourceId).toBe('object-later');

    const orderResult = resolve({
      candidates: [laterObject, earlierObject],
      movingBounds,
      rawDelta: createWorldVector(0, 0),
    });
    expect(orderResult.adjustedDelta.x).toBe(-4);
    expect(orderResult.guides[0]?.sourceId).toBe('object-earlier');
  });

  it('converts CSS-pixel tolerance exactly once and ignores device scale', () => {
    for (const zoomValue of [0.1, 0.25, 1, 2, 4]) {
      const zoom = createViewportZoom(zoomValue);
      const screenOffsetPixels = 4;
      const rawX = 100 - screenOffsetPixels / zoom;
      const result = resolve({
        candidates: [createLineCandidate()],
        movingBounds: createWorldRect(0, 0, 1_000, 20),
        rawDelta: createWorldVector(rawX, 0),
        zoom,
      });
      expect(result.snappedBounds.x).toBeCloseTo(100, 12);
      expect((result.adjustedDelta.x - rawX) * zoom).toBeCloseTo(screenOffsetPixels, 12);
    }
  });

  it('acquires at the tolerance boundary, holds through release hysteresis, then releases', () => {
    const movingBounds = createWorldRect(0, 0, 100, 20);
    const candidate = createLineCandidate();
    const acquired = resolve({
      candidates: [candidate],
      movingBounds,
      rawDelta: createWorldVector(94, 0),
    });
    expect(acquired.adjustedDelta.x).toBe(100);

    const held = resolve({
      candidates: [candidate],
      movingBounds,
      previousLocks: acquired.locks,
      rawDelta: createWorldVector(108, 0),
    });
    expect(held.adjustedDelta.x).toBe(100);
    expect(held.guides[0]?.sourceId).toBe('element_target');

    const released = resolve({
      candidates: [candidate],
      movingBounds,
      previousLocks: held.locks,
      rawDelta: createWorldVector(110, 0),
    });
    expect(released.adjustedDelta.x).toBe(110);
    expect(released.guides).toEqual([]);
    expect(released.locks).toEqual({});
  });

  it('does not hold a lock whose candidate disappeared and may acquire a replacement', () => {
    const movingBounds = createWorldRect(0, 0, 20, 20);
    const first = resolve({
      candidates: [createLineCandidate()],
      movingBounds,
      rawDelta: createWorldVector(95, 0),
    });
    const replacement = createLineCandidate({ position: 104, sourceId: 'replacement' });
    const next = resolve({
      candidates: [replacement],
      movingBounds,
      previousLocks: first.locks,
      rawDelta: createWorldVector(100, 0),
    });
    expect(next.adjustedDelta.x).toBe(104);
    expect(next.guides[0]?.sourceId).toBe('replacement');
  });

  it('returns the exact raw delta and clears locks while the bypass modifier is active', () => {
    const acquired = resolve({
      candidates: [createLineCandidate()],
      movingBounds: createWorldRect(0, 0, 20, 20),
      rawDelta: createWorldVector(95, 3),
    });
    const bypassed = resolve({
      bypass: true,
      candidates: [createLineCandidate()],
      movingBounds: createWorldRect(0, 0, 20, 20),
      previousLocks: acquired.locks,
      rawDelta: createWorldVector(97.25, -4.5),
    });
    expect(bypassed.adjustedDelta).toEqual({ x: 97.25, y: -4.5 });
    expect(bypassed.guides).toEqual([]);
    expect(bypassed.locks).toEqual({});
  });

  it('never reintroduces motion on an inactive Shift-locked axis', () => {
    const result = resolve({
      activeAxes: { x: true, y: false },
      candidates: [createLineCandidate({ axis: 'y', position: 5 })],
      rawDelta: createWorldVector(20, 0),
    });
    expect(result.adjustedDelta).toEqual({ x: 20, y: 0 });
    expect(result.guides).toEqual([]);
  });

  it('generates deterministic negative grid lines and uses object guides before grid ties', () => {
    const gridOnly = resolve({
      grid: { originX: 0, originY: 0, spacing: 10 },
      movingBounds: createWorldRect(-6, 23, 2, 2),
    });
    expect(gridOnly.adjustedDelta).toEqual({ x: -4, y: -3 });
    expect(gridOnly.snappedBounds).toEqual({ height: 2, width: 2, x: -10, y: 20 });
    expect(gridOnly.guides.map((guide) => guide.kind)).toEqual(['grid', 'grid']);

    const objectFirst = resolve({
      candidates: [createLineCandidate({ position: -10, sourceId: 'object-at-grid' })],
      grid: { originX: 0, originY: 0, spacing: 10 },
      movingBounds: createWorldRect(-6, 23, 2, 2),
    });
    expect(objectFirst.guides[0]).toMatchObject({
      kind: 'object',
      sourceId: 'object-at-grid',
    });
  });

  it.each([
    ['axis', createLineCandidate({ axis: 'z' as 'x' })],
    ['anchor', createLineCandidate({ anchor: 'quarter' as 'start' })],
    ['kind', createLineCandidate({ kind: 'unknown' as 'object' })],
    ['position', createLineCandidate({ position: Number.NaN })],
    ['source ID', createLineCandidate({ sourceId: '' })],
    ['source order', createLineCandidate({ sourceOrder: -1 })],
    ['span order', createLineCandidate({ spanEnd: -1, spanStart: 1 })],
  ])('rejects an invalid candidate %s', (_label, candidate) => {
    expect(() => resolve({ candidates: [candidate] })).toThrow();
  });

  it.each([
    ['zero zoom', { zoom: 0 as ReturnType<typeof createViewportZoom> }],
    ['zero tolerance', { tolerancePixels: 0 }],
    ['invalid grid spacing', { grid: { originX: 0, originY: 0, spacing: 0 } }],
    ['invalid grid origin', { grid: { originX: Number.NaN, originY: 0, spacing: 10 } }],
  ])('rejects invalid resolver input: %s', (_label, overrides) => {
    expect(() => resolve(overrides)).toThrow();
  });
});
