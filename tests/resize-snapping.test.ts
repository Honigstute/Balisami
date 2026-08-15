// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';
import {
  RESIZE_HANDLES,
  resolveResizeFrame,
  type ResizeHandle,
  type ResizeTargetCapture,
} from '../src/renderer/editor/resize-geometry';
import { getResizeSnapProfile, resolveResizeSnap } from '../src/renderer/editor/resize-snapping';
import type { SnapAxis, SnapCandidate, SnapLocks } from '../src/renderer/editor/snap-engine';
import {
  createViewportZoom,
  createWorldPoint,
  createWorldRect,
  type WorldPoint,
} from '../src/renderer/editor/viewport-transform';

const CAPTURE: ResizeTargetCapture = Object.freeze({
  elementId: DOCUMENT_FIXTURE_IDS.child,
  frame: Object.freeze({ x: 10, y: 20, width: 100, height: 50 }),
  worldBounds: createWorldRect(210, 320, 100, 50),
});
const START = createWorldPoint(0, 0);
const EMPTY_LOCKS: SnapLocks = Object.freeze({});

const createLineCandidate = (
  axis: SnapAxis,
  position: number,
  sourceId: string = `element_${axis}_target`,
): SnapCandidate =>
  Object.freeze({
    anchor: 'start',
    axis,
    kind: 'object',
    position,
    sourceId,
    sourceOrder: 0,
    spanEnd: 500,
    spanStart: 0,
  });

const getActivePosition = (
  handle: ResizeHandle,
  axis: SnapAxis,
  bounds: ReturnType<typeof createWorldRect>,
): number => {
  const anchor = getResizeSnapProfile(handle).movingAnchors[axis][0];
  const start = axis === 'x' ? bounds.x : bounds.y;
  const size = axis === 'x' ? bounds.width : bounds.height;
  return start + (anchor === 'start' ? 0 : anchor === 'center' ? size / 2 : size);
};

const resolve = ({
  aspectLocked = false,
  bypass = false,
  candidates,
  current,
  handle,
  previousLocks = EMPTY_LOCKS,
  zoom = 1,
}: {
  readonly aspectLocked?: boolean;
  readonly bypass?: boolean;
  readonly candidates: readonly SnapCandidate[];
  readonly current: WorldPoint;
  readonly handle: ResizeHandle;
  readonly previousLocks?: SnapLocks;
  readonly zoom?: number;
}) => {
  const raw = resolveResizeFrame(CAPTURE, handle, START, current, aspectLocked);
  return {
    raw,
    snapped: resolveResizeSnap({
      aspectLocked,
      bypass,
      candidates,
      capture: CAPTURE,
      currentWorldPoint: current,
      handle,
      previousLocks,
      raw,
      startWorldPoint: START,
      zoom: createViewportZoom(zoom),
    }),
  };
};

describe('resize snap profiles', () => {
  it('exposes only the moving edges for all eight clockwise handles', () => {
    expect(RESIZE_HANDLES.map((handle) => [handle, getResizeSnapProfile(handle)])).toEqual([
      [
        'northWest',
        { activeAxes: { x: true, y: true }, movingAnchors: { x: ['start'], y: ['start'] } },
      ],
      ['north', { activeAxes: { x: false, y: true }, movingAnchors: { x: [], y: ['start'] } }],
      [
        'northEast',
        { activeAxes: { x: true, y: true }, movingAnchors: { x: ['end'], y: ['start'] } },
      ],
      ['east', { activeAxes: { x: true, y: false }, movingAnchors: { x: ['end'], y: [] } }],
      [
        'southEast',
        { activeAxes: { x: true, y: true }, movingAnchors: { x: ['end'], y: ['end'] } },
      ],
      ['south', { activeAxes: { x: false, y: true }, movingAnchors: { x: [], y: ['end'] } }],
      [
        'southWest',
        { activeAxes: { x: true, y: true }, movingAnchors: { x: ['start'], y: ['end'] } },
      ],
      ['west', { activeAxes: { x: true, y: false }, movingAnchors: { x: ['start'], y: [] } }],
    ]);
  });
});

describe('pure resize snapping', () => {
  it.each(RESIZE_HANDLES)('snaps only the exposed moving edges for %s', (handle) => {
    const current = createWorldPoint(20, 10);
    const raw = resolveResizeFrame(CAPTURE, handle, START, current, false);
    const profile = getResizeSnapProfile(handle);
    const candidates = (['x', 'y'] as const).flatMap((axis) =>
      profile.activeAxes[axis]
        ? [
            createLineCandidate(
              axis,
              getActivePosition(handle, axis, raw.worldBounds) + (axis === 'x' ? 4 : -3),
            ),
          ]
        : [],
    );
    const { snapped } = resolve({ candidates, current, handle });

    for (const axis of ['x', 'y'] as const) {
      if (profile.activeAxes[axis]) {
        const candidate = candidates.find((entry) => entry.axis === axis);
        expect(getActivePosition(handle, axis, snapped.worldBounds)).toBe(candidate?.position);
        expect(snapped.locks[axis]?.movingAnchor).toBe(profile.movingAnchors[axis][0]);
      } else {
        expect(snapped.locks[axis]).toBeUndefined();
      }
    }
    expect(snapped.guides).toHaveLength(candidates.length);
  });

  it('preserves Shift ratio and the opposite-edge midpoint for edge handles', () => {
    const current = createWorldPoint(20, 999);
    const { snapped } = resolve({
      aspectLocked: true,
      candidates: [createLineCandidate('x', 334)],
      current,
      handle: 'east',
    });

    expect(snapped.worldBounds.x + snapped.worldBounds.width).toBe(334);
    expect(snapped.worldBounds.y + snapped.worldBounds.height / 2).toBe(345);
    expect(snapped.frame.width / snapped.frame.height).toBe(2);
    expect(snapped.guides).toHaveLength(1);
  });

  it.each(RESIZE_HANDLES)('preserves Shift ratio and anchors while snapping %s', (handle) => {
    const current = createWorldPoint(20, 10);
    const raw = resolveResizeFrame(CAPTURE, handle, START, current, true);
    const profile = getResizeSnapProfile(handle);
    const axis: SnapAxis = profile.activeAxes.x ? 'x' : 'y';
    const target = getActivePosition(handle, axis, raw.worldBounds) + 4;
    const { snapped } = resolve({
      aspectLocked: true,
      candidates: [createLineCandidate(axis, target)],
      current,
      handle,
    });

    expect(getActivePosition(handle, axis, snapped.worldBounds)).toBeCloseTo(target, 12);
    expect(snapped.frame.width / snapped.frame.height).toBeCloseTo(2, 12);
    expect(snapped.guides).toHaveLength(1);
    if (handle.includes('West') || handle === 'west') {
      expect(snapped.worldBounds.x + snapped.worldBounds.width).toBe(310);
    }
    if (handle.includes('East') || handle === 'east') {
      expect(snapped.worldBounds.x).toBe(210);
    }
    if (handle.startsWith('north')) {
      expect(snapped.worldBounds.y + snapped.worldBounds.height).toBe(370);
    }
    if (handle.startsWith('south')) {
      expect(snapped.worldBounds.y).toBe(320);
    }
    if (handle === 'north' || handle === 'south') {
      expect(snapped.worldBounds.x + snapped.worldBounds.width / 2).toBe(260);
    }
    if (handle === 'east' || handle === 'west') {
      expect(snapped.worldBounds.y + snapped.worldBounds.height / 2).toBe(345);
    }
  });

  it('uses one deterministic Shift-corner scale driver and retains it through hysteresis', () => {
    const current = createWorldPoint(20, 10);
    const nearestY = resolve({
      aspectLocked: true,
      candidates: [createLineCandidate('x', 334), createLineCandidate('y', 379)],
      current,
      handle: 'southEast',
    }).snapped;
    expect(nearestY.worldBounds.y + nearestY.worldBounds.height).toBe(379);
    expect(nearestY.frame.width / nearestY.frame.height).toBe(2);
    expect(nearestY.locks.x).toBeUndefined();
    expect(nearestY.locks.y).toBeDefined();

    const xCandidate = createLineCandidate('x', 338, 'element_held_x');
    const heldX = resolve({
      aspectLocked: true,
      candidates: [xCandidate, createLineCandidate('y', 379)],
      current,
      handle: 'southEast',
      previousLocks: Object.freeze({
        x: Object.freeze({ candidate: xCandidate, movingAnchor: 'end' }),
      }),
    }).snapped;
    expect(heldX.worldBounds.x + heldX.worldBounds.width).toBe(338);
    expect(heldX.frame.width / heldX.frame.height).toBe(2);
    expect(heldX.locks.x).toBeDefined();
    expect(heldX.locks.y).toBeUndefined();
  });

  it('recomposes live Shift changes from raw geometry without retaining a conflicting axis', () => {
    const candidates = [createLineCandidate('x', 334), createLineCandidate('y', 384)];
    const ordinary = resolve({
      candidates,
      current: createWorldPoint(20, 10),
      handle: 'southEast',
    }).snapped;
    expect(ordinary.locks.x).toBeDefined();
    expect(ordinary.locks.y).toBeDefined();

    const aspectLocked = resolve({
      aspectLocked: true,
      candidates,
      current: createWorldPoint(20, 10),
      handle: 'southEast',
      previousLocks: ordinary.locks,
    }).snapped;
    expect(aspectLocked.frame.width / aspectLocked.frame.height).toBe(2);
    expect(Object.keys(aspectLocked.locks)).toHaveLength(1);

    const unlocked = resolve({
      candidates,
      current: createWorldPoint(20, 10),
      handle: 'southEast',
      previousLocks: aspectLocked.locks,
    }).snapped;
    expect(unlocked.locks.x).toBeDefined();
    expect(unlocked.locks.y).toBeDefined();
  });

  it('drops unreachable minimum-size matches instead of showing a false guide', () => {
    const current = createWorldPoint(500, 0);
    const { raw, snapped } = resolve({
      candidates: [createLineCandidate('x', 306)],
      current,
      handle: 'west',
    });

    expect(raw.worldBounds).toEqual({ x: 302, y: 320, width: 8, height: 50 });
    expect(snapped.worldBounds).toEqual(raw.worldBounds);
    expect(snapped.guides).toEqual([]);
    expect(snapped.locks).toEqual({});
  });

  it('acquires and releases at a zoom-independent screen tolerance', () => {
    for (const zoom of [0.1, 0.25, 1, 2, 4]) {
      const screenOffset = 4;
      const target = 330;
      const current = createWorldPoint(20 - screenOffset / zoom, 0);
      const first = resolve({
        candidates: [createLineCandidate('x', target)],
        current,
        handle: 'east',
        zoom,
      }).snapped;
      expect(first.worldBounds.x + first.worldBounds.width).toBeCloseTo(target, 12);

      const held = resolve({
        candidates: [createLineCandidate('x', target)],
        current: createWorldPoint(20 + 8 / zoom, 0),
        handle: 'east',
        previousLocks: first.locks,
        zoom,
      }).snapped;
      expect(held.worldBounds.x + held.worldBounds.width).toBeCloseTo(target, 12);

      const released = resolve({
        candidates: [createLineCandidate('x', target)],
        current: createWorldPoint(20 + 10 / zoom, 0),
        handle: 'east',
        previousLocks: held.locks,
        zoom,
      }).snapped;
      expect(released.locks).toEqual({});
    }
  });

  it('returns exact raw geometry and clears locks while bypassed', () => {
    const candidate = createLineCandidate('x', 334);
    const { raw, snapped } = resolve({
      bypass: true,
      candidates: [candidate],
      current: createWorldPoint(20, 10),
      handle: 'southEast',
      previousLocks: Object.freeze({
        x: Object.freeze({ candidate, movingAnchor: 'end' }),
      }),
    });
    expect(snapped.frame).toBe(raw.frame);
    expect(snapped.worldBounds).toBe(raw.worldBounds);
    expect(snapped.guides).toEqual([]);
    expect(snapped.locks).toEqual({});
  });
});
