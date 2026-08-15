import {
  SNAP_AXES,
  SNAP_POLICY,
  type SnapActiveAxes,
  type SnapAxis,
  type SnapCandidate,
  type SnapGuideSegment,
} from './snap-engine';
import {
  createViewportZoom,
  createWorldRect,
  type ViewportZoom,
  type WorldRect,
} from './viewport-transform';

export interface EqualGapSnapSource {
  readonly bounds: WorldRect;
  readonly id: string;
  /** Canonical scene order among the bounded query results. */
  readonly sourceOrder: number;
}

export interface EqualGapSnapCandidateRequest {
  readonly activeAxes: SnapActiveAxes;
  /** Raw moved bounds for this pointer frame, before snap adjustment. */
  readonly movingBounds: WorldRect;
  readonly sources: readonly EqualGapSnapSource[];
  /** Acquire or release threshold already converted to world units. */
  readonly toleranceWorldUnits: number;
  readonly zoom: ViewportZoom;
}

type EqualGapRelation = 'bridge' | 'repeatAfter' | 'repeatBefore';

interface AxisSource extends EqualGapSnapSource {
  readonly end: number;
  readonly perpendicularEnd: number;
  readonly perpendicularStart: number;
  readonly start: number;
}

interface EqualGapGeometry {
  readonly gap: number;
  readonly relation: EqualGapRelation;
  readonly segments: readonly (readonly [number, number])[];
  readonly sources: readonly AxisSource[];
  readonly targetStart: number;
}

export const EQUAL_GAP_POLICY = Object.freeze({
  guideOffsetPixels: 8,
  maximumSourceIdCharacters: 80,
});

const requireTolerance = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('Equal-gap tolerance must be finite and positive.');
  }
  return value;
};

const getAxisStart = (bounds: WorldRect, axis: SnapAxis): number =>
  axis === 'x' ? bounds.x : bounds.y;

const getAxisSize = (bounds: WorldRect, axis: SnapAxis): number =>
  axis === 'x' ? bounds.width : bounds.height;

const getPerpendicularStart = (bounds: WorldRect, axis: SnapAxis): number =>
  axis === 'x' ? bounds.y : bounds.x;

const getPerpendicularSize = (bounds: WorldRect, axis: SnapAxis): number =>
  axis === 'x' ? bounds.height : bounds.width;

const compareText = (first: string, second: string): number =>
  first < second ? -1 : first > second ? 1 : 0;

const compareCanonical = (first: AxisSource, second: AxisSource): number =>
  first.sourceOrder - second.sourceOrder || compareText(first.id, second.id);

const createAxisSource = (source: EqualGapSnapSource, axis: SnapAxis): AxisSource => {
  const bounds = createWorldRect(
    source.bounds.x,
    source.bounds.y,
    source.bounds.width,
    source.bounds.height,
  );
  if (!Number.isSafeInteger(source.sourceOrder) || source.sourceOrder < 0) {
    throw new RangeError('Equal-gap source order must be a non-negative safe integer.');
  }
  if (
    typeof source.id !== 'string' ||
    source.id.length === 0 ||
    source.id.length > EQUAL_GAP_POLICY.maximumSourceIdCharacters
  ) {
    throw new TypeError('Equal-gap source ID must contain 1–80 characters.');
  }
  const start = getAxisStart(bounds, axis);
  const perpendicularStart = getPerpendicularStart(bounds, axis);
  return Object.freeze({
    bounds,
    end: start + getAxisSize(bounds, axis),
    id: source.id,
    perpendicularEnd: perpendicularStart + getPerpendicularSize(bounds, axis),
    perpendicularStart,
    sourceOrder: source.sourceOrder,
    start,
  });
};

const overlapsPerpendicularSpan = (
  source: AxisSource,
  movingBounds: WorldRect,
  axis: SnapAxis,
): boolean => {
  const movingStart = getPerpendicularStart(movingBounds, axis);
  const movingEnd = movingStart + getPerpendicularSize(movingBounds, axis);
  return (
    Math.max(source.perpendicularStart, movingStart) < Math.min(source.perpendicularEnd, movingEnd)
  );
};

const createBridgeGeometry = (
  before: AxisSource | undefined,
  after: AxisSource | undefined,
  movingSize: number,
): EqualGapGeometry | undefined => {
  if (before === undefined || after === undefined || before.id === after.id) {
    return undefined;
  }
  const available = after.start - before.end - movingSize;
  if (available < 0) {
    return undefined;
  }
  const gap = available / 2;
  const targetStart = before.end + gap;
  return Object.freeze({
    gap,
    relation: 'bridge',
    segments: Object.freeze([
      Object.freeze([before.end, targetStart] as const),
      Object.freeze([targetStart + movingSize, after.start] as const),
    ]),
    sources: Object.freeze([before, after]),
    targetStart,
  });
};

const createRepeatBeforeGeometry = (
  preceding: AxisSource | undefined,
  nearest: AxisSource | undefined,
): EqualGapGeometry | undefined => {
  if (
    nearest === undefined ||
    preceding === undefined ||
    preceding.id === nearest.id ||
    preceding.end > nearest.start
  ) {
    return undefined;
  }
  const gap = nearest.start - preceding.end;
  const targetStart = nearest.end + gap;
  return Object.freeze({
    gap,
    relation: 'repeatBefore',
    segments: Object.freeze([
      Object.freeze([preceding.end, nearest.start] as const),
      Object.freeze([nearest.end, targetStart] as const),
    ]),
    sources: Object.freeze([preceding, nearest]),
    targetStart,
  });
};

const createRepeatAfterGeometry = (
  nearest: AxisSource | undefined,
  following: AxisSource | undefined,
  movingSize: number,
): EqualGapGeometry | undefined => {
  if (
    nearest === undefined ||
    following === undefined ||
    nearest.id === following.id ||
    nearest.end > following.start
  ) {
    return undefined;
  }
  const gap = following.start - nearest.end;
  const targetStart = nearest.start - gap - movingSize;
  return Object.freeze({
    gap,
    relation: 'repeatAfter',
    segments: Object.freeze([
      Object.freeze([targetStart + movingSize, nearest.start] as const),
      Object.freeze([nearest.end, following.start] as const),
    ]),
    sources: Object.freeze([nearest, following]),
    targetStart,
  });
};

const createGuideSegments = (
  axis: SnapAxis,
  geometry: EqualGapGeometry,
  movingBounds: WorldRect,
  zoom: ViewportZoom,
): readonly SnapGuideSegment[] => {
  const perpendicularEnd = Math.max(
    getPerpendicularStart(movingBounds, axis) + getPerpendicularSize(movingBounds, axis),
    ...geometry.sources.map((source) => source.perpendicularEnd),
  );
  const guidePosition = perpendicularEnd + EQUAL_GAP_POLICY.guideOffsetPixels / zoom;
  return Object.freeze(
    geometry.segments.map(([start, end]) =>
      Object.freeze(
        axis === 'x'
          ? { endX: end, endY: guidePosition, startX: start, startY: guidePosition }
          : { endX: guidePosition, endY: end, startX: guidePosition, startY: start },
      ),
    ),
  );
};

const createCandidate = (
  axis: SnapAxis,
  geometry: EqualGapGeometry,
  movingBounds: WorldRect,
  zoom: ViewportZoom,
): SnapCandidate => {
  const sourceIds = [...geometry.sources].sort(compareCanonical).map((source) => source.id);
  const perpendicularStart = getPerpendicularStart(movingBounds, axis);
  const perpendicularEnd = perpendicularStart + getPerpendicularSize(movingBounds, axis);
  return Object.freeze({
    anchor: 'line',
    axis,
    gap: geometry.gap,
    guideSegments: createGuideSegments(axis, geometry, movingBounds, zoom),
    kind: 'equalGap',
    position: geometry.targetStart,
    requiredMovingAnchor: 'start',
    sourceId: `equal-gap:${axis}:${geometry.relation}:${sourceIds.join('|')}`,
    sourceOrder: Math.min(...geometry.sources.map((source) => source.sourceOrder)),
    spanEnd: perpendicularEnd,
    spanStart: perpendicularStart,
  });
};

const createAxisCandidates = (
  axis: SnapAxis,
  request: EqualGapSnapCandidateRequest,
  movingBounds: WorldRect,
  toleranceWorldUnits: number,
): readonly SnapCandidate[] => {
  if (!request.activeAxes[axis]) {
    return Object.freeze([]);
  }
  const movingStart = getAxisStart(movingBounds, axis);
  const sources = request.sources
    .map((source) => createAxisSource(source, axis))
    .filter((source) => overlapsPerpendicularSpan(source, movingBounds, axis))
    .sort(
      (first, second) =>
        first.start - second.start || first.end - second.end || compareCanonical(first, second),
    );
  const geometries = sources.slice(0, -1).flatMap((source, index) => {
    const next = sources[index + 1];
    if (next === undefined || source.end > next.start) {
      return [];
    }
    return [
      createBridgeGeometry(source, next, getAxisSize(movingBounds, axis)),
      createRepeatBeforeGeometry(source, next),
      createRepeatAfterGeometry(source, next, getAxisSize(movingBounds, axis)),
    ];
  });
  return Object.freeze(
    geometries.flatMap((geometry) =>
      geometry !== undefined && Math.abs(geometry.targetStart - movingStart) <= toleranceWorldUnits
        ? [createCandidate(axis, geometry, movingBounds, request.zoom)]
        : [],
    ),
  );
};

/**
 * Creates bounded same-row/column equal-spacing relations. Only adjacent
 * stationary sources participate, so one pointer frame remains O(k) in its
 * indexed corridor rather than becoming a pairwise dense-board scan.
 */
export const createEqualGapSnapCandidates = (
  request: EqualGapSnapCandidateRequest,
): readonly SnapCandidate[] => {
  if (
    typeof request.activeAxes.x !== 'boolean' ||
    typeof request.activeAxes.y !== 'boolean' ||
    !Array.isArray(request.sources)
  ) {
    throw new TypeError('Equal-gap axes and source collection are invalid.');
  }
  const movingBounds = createWorldRect(
    request.movingBounds.x,
    request.movingBounds.y,
    request.movingBounds.width,
    request.movingBounds.height,
  );
  const toleranceWorldUnits = requireTolerance(request.toleranceWorldUnits);
  const zoom = createViewportZoom(request.zoom);
  const normalizedRequest = Object.freeze({ ...request, movingBounds, zoom });
  return Object.freeze(
    SNAP_AXES.flatMap((axis) =>
      createAxisCandidates(axis, normalizedRequest, movingBounds, toleranceWorldUnits),
    ),
  );
};

/** Row/column corridors complement the alignment bands without a square scan. */
export const createEqualGapQueryRegions = (
  movingBoundsInput: WorldRect,
  zoomInput: ViewportZoom,
  activeAxes: SnapActiveAxes,
): readonly WorldRect[] => {
  if (typeof activeAxes.x !== 'boolean' || typeof activeAxes.y !== 'boolean') {
    throw new TypeError('Equal-gap query axes are invalid.');
  }
  const movingBounds = createWorldRect(
    movingBoundsInput.x,
    movingBoundsInput.y,
    movingBoundsInput.width,
    movingBoundsInput.height,
  );
  const zoom = createViewportZoom(zoomInput);
  const radius = SNAP_POLICY.candidateSearchRadiusPixels / zoom;
  return Object.freeze(
    SNAP_AXES.flatMap((axis) => {
      if (!activeAxes[axis]) {
        return [];
      }
      return [
        axis === 'x'
          ? createWorldRect(
              movingBounds.x - radius,
              movingBounds.y,
              movingBounds.width + radius * 2,
              movingBounds.height,
            )
          : createWorldRect(
              movingBounds.x,
              movingBounds.y - radius,
              movingBounds.width,
              movingBounds.height + radius * 2,
            ),
      ];
    }),
  );
};
