import {
  RESIZE_INTERACTION_POLICY,
  resolveAspectLockedResizeScale,
  resolveResizeFrame,
  type ResolvedResizeFrame,
  type ResizeHandle,
  type ResizeTargetCapture,
} from './resize-geometry';
import {
  SNAP_AXES,
  createSnapGuidesForLocks,
  resolveSnap,
  type SnapActiveAxes,
  type SnapAxis,
  type SnapAxisLock,
  type SnapCandidate,
  type SnapGuideDescriptor,
  type SnapLocks,
  type SnapMovingAnchors,
} from './snap-engine';
import {
  createWorldPoint,
  createWorldVector,
  type ViewportZoom,
  type WorldPoint,
} from './viewport-transform';

export interface ResizeSnapProfile {
  readonly activeAxes: SnapActiveAxes;
  readonly movingAnchors: SnapMovingAnchors;
}

export interface ResizeSnapResolutionInput {
  readonly aspectLocked: boolean;
  readonly bypass: boolean;
  readonly candidates: readonly SnapCandidate[];
  readonly capture: ResizeTargetCapture;
  readonly currentWorldPoint: WorldPoint;
  readonly handle: ResizeHandle;
  readonly previousLocks: SnapLocks;
  readonly raw: ResolvedResizeFrame;
  readonly startWorldPoint: WorldPoint;
  readonly zoom: ViewportZoom;
}

export interface ResolvedResizeSnap extends ResolvedResizeFrame {
  readonly guides: readonly SnapGuideDescriptor[];
  readonly locks: SnapLocks;
}

const EMPTY_ANCHORS = Object.freeze([]);
const START_ANCHOR = Object.freeze(['start'] as const);
const END_ANCHOR = Object.freeze(['end'] as const);
const EMPTY_GUIDES: readonly SnapGuideDescriptor[] = Object.freeze([]);
const EMPTY_LOCKS: SnapLocks = Object.freeze({});
const ALIGNMENT_EPSILON = 1e-9;

const RESIZE_SNAP_PROFILES: Readonly<Record<ResizeHandle, ResizeSnapProfile>> = Object.freeze({
  northWest: Object.freeze({
    activeAxes: Object.freeze({ x: true, y: true }),
    movingAnchors: Object.freeze({ x: START_ANCHOR, y: START_ANCHOR }),
  }),
  north: Object.freeze({
    activeAxes: Object.freeze({ x: false, y: true }),
    movingAnchors: Object.freeze({ x: EMPTY_ANCHORS, y: START_ANCHOR }),
  }),
  northEast: Object.freeze({
    activeAxes: Object.freeze({ x: true, y: true }),
    movingAnchors: Object.freeze({ x: END_ANCHOR, y: START_ANCHOR }),
  }),
  east: Object.freeze({
    activeAxes: Object.freeze({ x: true, y: false }),
    movingAnchors: Object.freeze({ x: END_ANCHOR, y: EMPTY_ANCHORS }),
  }),
  southEast: Object.freeze({
    activeAxes: Object.freeze({ x: true, y: true }),
    movingAnchors: Object.freeze({ x: END_ANCHOR, y: END_ANCHOR }),
  }),
  south: Object.freeze({
    activeAxes: Object.freeze({ x: false, y: true }),
    movingAnchors: Object.freeze({ x: EMPTY_ANCHORS, y: END_ANCHOR }),
  }),
  southWest: Object.freeze({
    activeAxes: Object.freeze({ x: true, y: true }),
    movingAnchors: Object.freeze({ x: START_ANCHOR, y: END_ANCHOR }),
  }),
  west: Object.freeze({
    activeAxes: Object.freeze({ x: true, y: false }),
    movingAnchors: Object.freeze({ x: START_ANCHOR, y: EMPTY_ANCHORS }),
  }),
});

export const getResizeSnapProfile = (handle: ResizeHandle): ResizeSnapProfile =>
  RESIZE_SNAP_PROFILES[handle];

const isCornerHandle = (handle: ResizeHandle): boolean =>
  handle === 'northWest' ||
  handle === 'northEast' ||
  handle === 'southEast' ||
  handle === 'southWest';

const getActiveEdgeSize = (
  capture: ResizeTargetCapture,
  profile: ResizeSnapProfile,
  axis: SnapAxis,
  position: number,
): number => {
  const bounds = capture.worldBounds;
  if (axis === 'x') {
    return profile.movingAnchors.x[0] === 'start'
      ? bounds.x + bounds.width - position
      : position - bounds.x;
  }
  return profile.movingAnchors.y[0] === 'start'
    ? bounds.y + bounds.height - position
    : position - bounds.y;
};

const isReachableLock = (
  capture: ResizeTargetCapture,
  profile: ResizeSnapProfile,
  axis: SnapAxis,
  lock: SnapAxisLock,
  aspectLocked: boolean,
): boolean => {
  const size = getActiveEdgeSize(capture, profile, axis, lock.candidate.position);
  if (!aspectLocked) {
    const minimum =
      axis === 'x'
        ? RESIZE_INTERACTION_POLICY.minimumWidthWorldUnits
        : RESIZE_INTERACTION_POLICY.minimumHeightWorldUnits;
    return size + ALIGNMENT_EPSILON >= minimum;
  }
  const scale = size / (axis === 'x' ? capture.frame.width : capture.frame.height);
  const minimumScale = Math.max(
    RESIZE_INTERACTION_POLICY.minimumWidthWorldUnits / capture.frame.width,
    RESIZE_INTERACTION_POLICY.minimumHeightWorldUnits / capture.frame.height,
  );
  return scale + ALIGNMENT_EPSILON >= minimumScale;
};

const copyReachableLocks = (
  locks: SnapLocks,
  capture: ResizeTargetCapture,
  profile: ResizeSnapProfile,
  aspectLocked: boolean,
): SnapLocks =>
  Object.freeze(
    Object.fromEntries(
      SNAP_AXES.flatMap((axis) => {
        const lock = locks[axis];
        return lock !== undefined && isReachableLock(capture, profile, axis, lock, aspectLocked)
          ? [[axis, lock]]
          : [];
      }),
    ),
  );

const lockIdentityEquals = (first: SnapAxisLock, second: SnapAxisLock): boolean =>
  first.movingAnchor === second.movingAnchor &&
  first.candidate.axis === second.candidate.axis &&
  first.candidate.anchor === second.candidate.anchor &&
  first.candidate.kind === second.candidate.kind &&
  first.candidate.sourceId === second.candidate.sourceId;

const chooseAspectCornerAxis = (
  locks: SnapLocks,
  previousLocks: SnapLocks,
  adjustments: Readonly<Record<SnapAxis, number>>,
): SnapAxis | undefined => {
  const available = SNAP_AXES.filter((axis) => locks[axis] !== undefined);
  const held = available.filter((axis) => {
    const lock = locks[axis];
    const previousLock = previousLocks[axis];
    return (
      lock !== undefined && previousLock !== undefined && lockIdentityEquals(lock, previousLock)
    );
  });
  return [...(held.length > 0 ? held : available)].sort(
    (first, second) =>
      Math.abs(adjustments[first]) - Math.abs(adjustments[second]) ||
      SNAP_AXES.indexOf(first) - SNAP_AXES.indexOf(second),
  )[0];
};

const selectAxisLock = (locks: SnapLocks, axis: SnapAxis | undefined): SnapLocks =>
  axis === undefined || locks[axis] === undefined
    ? EMPTY_LOCKS
    : Object.freeze({ [axis]: locks[axis] });

const getAnchorPosition = (
  resolved: ResolvedResizeFrame,
  axis: SnapAxis,
  lock: SnapAxisLock,
): number => {
  const bounds = resolved.worldBounds;
  const start = axis === 'x' ? bounds.x : bounds.y;
  const size = axis === 'x' ? bounds.width : bounds.height;
  return (
    start + (lock.movingAnchor === 'start' ? 0 : lock.movingAnchor === 'center' ? size / 2 : size)
  );
};

const retainSatisfiedLocks = (locks: SnapLocks, resolved: ResolvedResizeFrame): SnapLocks =>
  Object.freeze(
    Object.fromEntries(
      SNAP_AXES.flatMap((axis) => {
        const lock = locks[axis];
        return lock !== undefined &&
          Math.abs(getAnchorPosition(resolved, axis, lock) - lock.candidate.position) <=
            ALIGNMENT_EPSILON
          ? [[axis, lock]]
          : [];
      }),
    ),
  );

const createResult = (resolved: ResolvedResizeFrame, locks: SnapLocks): ResolvedResizeSnap =>
  Object.freeze({
    frame: resolved.frame,
    guides: createSnapGuidesForLocks(resolved.worldBounds, locks),
    locks,
    worldBounds: resolved.worldBounds,
  });

/**
 * Applies shared snap matches to the active resize edges. Shift-corners choose
 * one guide as the aspect-scale driver because their axes are not independent.
 */
export const resolveResizeSnap = (input: ResizeSnapResolutionInput): ResolvedResizeSnap => {
  const profile = getResizeSnapProfile(input.handle);
  if (input.bypass) {
    return Object.freeze({
      frame: input.raw.frame,
      guides: EMPTY_GUIDES,
      locks: EMPTY_LOCKS,
      worldBounds: input.raw.worldBounds,
    });
  }
  const match = resolveSnap({
    activeAxes: profile.activeAxes,
    bypass: false,
    candidates: input.candidates,
    movingAnchors: profile.movingAnchors,
    movingBounds: input.raw.worldBounds,
    previousLocks: input.previousLocks,
    rawDelta: createWorldVector(0, 0),
    zoom: input.zoom,
  });
  let locks = copyReachableLocks(match.locks, input.capture, profile, input.aspectLocked);
  if (input.aspectLocked && isCornerHandle(input.handle)) {
    const axis = chooseAspectCornerAxis(
      locks,
      input.previousLocks,
      Object.freeze({ x: match.adjustedDelta.x, y: match.adjustedDelta.y }),
    );
    locks = selectAxisLock(locks, axis);
    const lock = axis === undefined ? undefined : locks[axis];
    if (axis === undefined || lock === undefined) {
      return createResult(input.raw, EMPTY_LOCKS);
    }
    const activeSize = getActiveEdgeSize(input.capture, profile, axis, lock.candidate.position);
    const scale =
      activeSize / (axis === 'x' ? input.capture.frame.width : input.capture.frame.height);
    const resolved = resolveAspectLockedResizeScale(input.capture, input.handle, scale);
    const satisfiedLocks = retainSatisfiedLocks(locks, resolved);
    return Object.keys(satisfiedLocks).length === 0
      ? createResult(input.raw, EMPTY_LOCKS)
      : createResult(resolved, satisfiedLocks);
  }

  const adjustedPoint = createWorldPoint(
    input.currentWorldPoint.x + (locks.x === undefined ? 0 : match.adjustedDelta.x),
    input.currentWorldPoint.y + (locks.y === undefined ? 0 : match.adjustedDelta.y),
  );
  const resolved = resolveResizeFrame(
    input.capture,
    input.handle,
    input.startWorldPoint,
    adjustedPoint,
    input.aspectLocked,
  );
  locks = retainSatisfiedLocks(locks, resolved);
  return createResult(resolved, locks);
};
