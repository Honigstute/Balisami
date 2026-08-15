import {
  createViewportZoom,
  createWorldRect,
  createWorldVector,
  type ViewportZoom,
  type WorldRect,
  type WorldVector,
} from './viewport-transform';

export const SNAP_POLICY = Object.freeze({
  candidateSearchRadiusPixels: 1_200,
  releaseToleranceMultiplier: 1.5,
  tolerancePixels: 6,
});

export const SNAP_AXES = Object.freeze(['x', 'y'] as const);
export type SnapAxis = (typeof SNAP_AXES)[number];

export const SNAP_ANCHORS = Object.freeze(['start', 'center', 'end'] as const);
export type SnapAnchor = (typeof SNAP_ANCHORS)[number];

export const SNAP_CANDIDATE_KINDS = Object.freeze(['object', 'container', 'grid'] as const);
export type SnapCandidateKind = (typeof SNAP_CANDIDATE_KINDS)[number];
export type SnapTargetAnchor = SnapAnchor | 'line';

export interface SnapCandidate {
  readonly anchor: SnapTargetAnchor;
  readonly axis: SnapAxis;
  readonly kind: SnapCandidateKind;
  readonly position: number;
  /** Canonical order within the candidate source, used only after geometric ties. */
  readonly sourceOrder: number;
  readonly sourceId: string;
  /** Perpendicular world-space extent used later by the guide overlay. */
  readonly spanEnd: number;
  readonly spanStart: number;
}

export interface BoundsSnapCandidateInput {
  readonly bounds: WorldRect;
  readonly kind: Exclude<SnapCandidateKind, 'grid'>;
  readonly sourceId: string;
  readonly sourceOrder: number;
}

export interface SnapGrid {
  readonly originX: number;
  readonly originY: number;
  readonly spacing: number;
}

export interface SnapActiveAxes {
  readonly x: boolean;
  readonly y: boolean;
}

export interface SnapAxisLock {
  readonly candidate: SnapCandidate;
  readonly movingAnchor: SnapAnchor;
}

export interface SnapLocks {
  readonly x?: SnapAxisLock;
  readonly y?: SnapAxisLock;
}

export interface SnapGuideDescriptor {
  readonly axis: SnapAxis;
  readonly end: number;
  readonly kind: SnapCandidateKind;
  readonly movingAnchor: SnapAnchor;
  readonly position: number;
  readonly sourceId: string;
  readonly start: number;
  readonly targetAnchor: SnapTargetAnchor;
}

export interface SnapResolutionInput {
  readonly activeAxes: SnapActiveAxes;
  readonly bypass: boolean;
  readonly candidates: readonly SnapCandidate[];
  readonly grid?: SnapGrid;
  readonly movingBounds: WorldRect;
  readonly previousLocks?: SnapLocks;
  readonly rawDelta: WorldVector;
  readonly tolerancePixels?: number;
  readonly zoom: ViewportZoom;
}

export interface SnapResolution {
  readonly adjustedDelta: WorldVector;
  readonly guides: readonly SnapGuideDescriptor[];
  readonly locks: SnapLocks;
  readonly snappedBounds: WorldRect;
}

interface AxisProposal {
  readonly adjustment: number;
  readonly candidate: SnapCandidate;
  readonly movingAnchor: SnapAnchor;
}

const AXIS_SET = new Set<string>(SNAP_AXES);
const ANCHOR_SET = new Set<string>(SNAP_ANCHORS);
const CANDIDATE_KIND_SET = new Set<string>(SNAP_CANDIDATE_KINDS);
const ANCHOR_ORDER: Readonly<Record<SnapAnchor, number>> = Object.freeze({
  start: 0,
  center: 1,
  end: 2,
});
const TARGET_ANCHOR_ORDER: Readonly<Record<SnapTargetAnchor, number>> = Object.freeze({
  start: 0,
  center: 1,
  end: 2,
  line: 3,
});
const CANDIDATE_KIND_PRIORITY: Readonly<Record<SnapCandidateKind, number>> = Object.freeze({
  object: 0,
  container: 1,
  grid: 2,
});

const requireFinite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`);
  }
  return value;
};

const requirePositive = (value: number, label: string): number => {
  requireFinite(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be positive.`);
  }
  return value;
};

const requireSourceId = (sourceId: string): string => {
  if (typeof sourceId !== 'string' || sourceId.length === 0 || sourceId.length > 200) {
    throw new TypeError('Snap candidate source ID must contain 1–200 characters.');
  }
  return sourceId;
};

const requireSourceOrder = (sourceOrder: number): number => {
  if (!Number.isSafeInteger(sourceOrder) || sourceOrder < 0) {
    throw new RangeError('Snap candidate source order must be a non-negative safe integer.');
  }
  return sourceOrder;
};

const normalizeCandidate = (candidate: SnapCandidate): SnapCandidate => {
  if (!AXIS_SET.has(candidate.axis)) {
    throw new TypeError('Snap candidate axis is unsupported.');
  }
  if (candidate.anchor !== 'line' && !ANCHOR_SET.has(candidate.anchor)) {
    throw new TypeError('Snap candidate anchor is unsupported.');
  }
  if (!CANDIDATE_KIND_SET.has(candidate.kind)) {
    throw new TypeError('Snap candidate kind is unsupported.');
  }
  const spanStart = requireFinite(candidate.spanStart, 'Snap candidate span start');
  const spanEnd = requireFinite(candidate.spanEnd, 'Snap candidate span end');
  if (spanEnd < spanStart) {
    throw new RangeError('Snap candidate span must be ordered.');
  }
  return Object.freeze({
    anchor: candidate.anchor,
    axis: candidate.axis,
    kind: candidate.kind,
    position: requireFinite(candidate.position, 'Snap candidate position'),
    sourceId: requireSourceId(candidate.sourceId),
    sourceOrder: requireSourceOrder(candidate.sourceOrder),
    spanEnd,
    spanStart,
  });
};

const createCandidate = (candidate: SnapCandidate): SnapCandidate => normalizeCandidate(candidate);

/** Creates left/center/right and top/middle/bottom lines from one canonical bound. */
export const createBoundsSnapCandidates = ({
  bounds: boundsInput,
  kind,
  sourceId,
  sourceOrder,
}: BoundsSnapCandidateInput): readonly SnapCandidate[] => {
  const bounds = createWorldRect(
    boundsInput.x,
    boundsInput.y,
    boundsInput.width,
    boundsInput.height,
  );
  if (kind !== 'object' && kind !== 'container') {
    throw new TypeError('Bounds snap candidates must be objects or containers.');
  }
  const normalizedSourceId = requireSourceId(sourceId);
  const normalizedSourceOrder = requireSourceOrder(sourceOrder);
  const xPositions: Readonly<Record<SnapAnchor, number>> = Object.freeze({
    start: bounds.x,
    center: bounds.x + bounds.width / 2,
    end: bounds.x + bounds.width,
  });
  const yPositions: Readonly<Record<SnapAnchor, number>> = Object.freeze({
    start: bounds.y,
    center: bounds.y + bounds.height / 2,
    end: bounds.y + bounds.height,
  });
  return Object.freeze([
    ...SNAP_ANCHORS.map((anchor) =>
      createCandidate({
        anchor,
        axis: 'x',
        kind,
        position: xPositions[anchor],
        sourceId: normalizedSourceId,
        sourceOrder: normalizedSourceOrder,
        spanEnd: bounds.y + bounds.height,
        spanStart: bounds.y,
      }),
    ),
    ...SNAP_ANCHORS.map((anchor) =>
      createCandidate({
        anchor,
        axis: 'y',
        kind,
        position: yPositions[anchor],
        sourceId: normalizedSourceId,
        sourceOrder: normalizedSourceOrder,
        spanEnd: bounds.x + bounds.width,
        spanStart: bounds.x,
      }),
    ),
  ]);
};

const getAnchorPosition = (bounds: WorldRect, axis: SnapAxis, anchor: SnapAnchor): number => {
  const start = axis === 'x' ? bounds.x : bounds.y;
  const size = axis === 'x' ? bounds.width : bounds.height;
  switch (anchor) {
    case 'start':
      return start;
    case 'center':
      return start + size / 2;
    case 'end':
      return start + size;
  }
};

const normalizeGrid = (grid: SnapGrid): SnapGrid =>
  Object.freeze({
    originX: requireFinite(grid.originX, 'Snap grid X origin'),
    originY: requireFinite(grid.originY, 'Snap grid Y origin'),
    spacing: requirePositive(grid.spacing, 'Snap grid spacing'),
  });

const listSurroundingGridPositions = (
  position: number,
  origin: number,
  spacing: number,
): readonly number[] => {
  const lower = origin + Math.floor((position - origin) / spacing) * spacing;
  const upper = lower + spacing;
  return lower === upper ? Object.freeze([lower]) : Object.freeze([lower, upper]);
};

const createGridCandidates = (bounds: WorldRect, gridInput: SnapGrid): readonly SnapCandidate[] => {
  const grid = normalizeGrid(gridInput);
  const candidates: SnapCandidate[] = [];
  for (const axis of SNAP_AXES) {
    const origin = axis === 'x' ? grid.originX : grid.originY;
    const positions = new Set<number>();
    for (const anchor of SNAP_ANCHORS) {
      for (const position of listSurroundingGridPositions(
        getAnchorPosition(bounds, axis, anchor),
        origin,
        grid.spacing,
      )) {
        positions.add(position);
      }
    }
    for (const position of [...positions].sort((first, second) => first - second)) {
      candidates.push(
        createCandidate({
          anchor: 'line',
          axis,
          kind: 'grid',
          position,
          sourceId: `grid:${axis}:${String(position)}`,
          sourceOrder: 0,
          spanEnd: axis === 'x' ? bounds.y + bounds.height : bounds.x + bounds.width,
          spanStart: axis === 'x' ? bounds.y : bounds.x,
        }),
      );
    }
  }
  return Object.freeze(candidates);
};

const candidateIdentityEqual = (first: SnapCandidate, second: SnapCandidate): boolean =>
  first.axis === second.axis &&
  first.anchor === second.anchor &&
  first.kind === second.kind &&
  first.sourceId === second.sourceId;

const getAnchorAffinity = (movingAnchor: SnapAnchor, targetAnchor: SnapTargetAnchor): number => {
  if (movingAnchor === targetAnchor) {
    return 0;
  }
  if (
    (movingAnchor === 'start' && targetAnchor === 'end') ||
    (movingAnchor === 'end' && targetAnchor === 'start')
  ) {
    return 1;
  }
  return 2;
};

const compareText = (first: string, second: string): number =>
  first < second ? -1 : first > second ? 1 : 0;

const compareProposals = (first: AxisProposal, second: AxisProposal): number =>
  Math.abs(first.adjustment) - Math.abs(second.adjustment) ||
  CANDIDATE_KIND_PRIORITY[first.candidate.kind] - CANDIDATE_KIND_PRIORITY[second.candidate.kind] ||
  getAnchorAffinity(first.movingAnchor, first.candidate.anchor) -
    getAnchorAffinity(second.movingAnchor, second.candidate.anchor) ||
  first.candidate.sourceOrder - second.candidate.sourceOrder ||
  first.candidate.position - second.candidate.position ||
  compareText(first.candidate.sourceId, second.candidate.sourceId) ||
  TARGET_ANCHOR_ORDER[first.candidate.anchor] - TARGET_ANCHOR_ORDER[second.candidate.anchor] ||
  ANCHOR_ORDER[first.movingAnchor] - ANCHOR_ORDER[second.movingAnchor];

const createProposal = (
  bounds: WorldRect,
  axis: SnapAxis,
  movingAnchor: SnapAnchor,
  candidate: SnapCandidate,
): AxisProposal =>
  Object.freeze({
    adjustment: candidate.position - getAnchorPosition(bounds, axis, movingAnchor),
    candidate,
    movingAnchor,
  });

const resolveAxis = (
  axis: SnapAxis,
  movedBounds: WorldRect,
  candidates: readonly SnapCandidate[],
  toleranceWorldUnits: number,
  previousLock: SnapAxisLock | undefined,
): AxisProposal | undefined => {
  if (previousLock !== undefined) {
    const currentCandidate = candidates.find((candidate) =>
      candidateIdentityEqual(candidate, previousLock.candidate),
    );
    if (currentCandidate !== undefined) {
      const held = createProposal(movedBounds, axis, previousLock.movingAnchor, currentCandidate);
      if (
        Math.abs(held.adjustment) <=
        toleranceWorldUnits * SNAP_POLICY.releaseToleranceMultiplier
      ) {
        return held;
      }
    }
  }

  const proposals: AxisProposal[] = [];
  for (const candidate of candidates) {
    if (candidate.axis !== axis) {
      continue;
    }
    for (const movingAnchor of SNAP_ANCHORS) {
      const proposal = createProposal(movedBounds, axis, movingAnchor, candidate);
      if (Math.abs(proposal.adjustment) <= toleranceWorldUnits) {
        proposals.push(proposal);
      }
    }
  }
  return proposals.sort(compareProposals)[0];
};

const createGuide = (proposal: AxisProposal, snappedBounds: WorldRect): SnapGuideDescriptor => {
  const movingStart = proposal.candidate.axis === 'x' ? snappedBounds.y : snappedBounds.x;
  const movingEnd =
    movingStart + (proposal.candidate.axis === 'x' ? snappedBounds.height : snappedBounds.width);
  return Object.freeze({
    axis: proposal.candidate.axis,
    end: Math.max(proposal.candidate.spanEnd, movingEnd),
    kind: proposal.candidate.kind,
    movingAnchor: proposal.movingAnchor,
    position: proposal.candidate.position,
    sourceId: proposal.candidate.sourceId,
    start: Math.min(proposal.candidate.spanStart, movingStart),
    targetAnchor: proposal.candidate.anchor,
  });
};

const createLocks = (
  xProposal: AxisProposal | undefined,
  yProposal: AxisProposal | undefined,
): SnapLocks =>
  Object.freeze({
    ...(xProposal === undefined
      ? {}
      : {
          x: Object.freeze({
            candidate: xProposal.candidate,
            movingAnchor: xProposal.movingAnchor,
          }),
        }),
    ...(yProposal === undefined
      ? {}
      : {
          y: Object.freeze({
            candidate: yProposal.candidate,
            movingAnchor: yProposal.movingAnchor,
          }),
        }),
  });

const createResolution = (
  movingBounds: WorldRect,
  adjustedDelta: WorldVector,
  xProposal?: AxisProposal,
  yProposal?: AxisProposal,
): SnapResolution => {
  const snappedBounds = createWorldRect(
    movingBounds.x + adjustedDelta.x,
    movingBounds.y + adjustedDelta.y,
    movingBounds.width,
    movingBounds.height,
  );
  const guides = [xProposal, yProposal].flatMap((proposal) =>
    proposal === undefined ? [] : [createGuide(proposal, snappedBounds)],
  );
  return Object.freeze({
    adjustedDelta,
    guides: Object.freeze(guides),
    locks: createLocks(xProposal, yProposal),
    snappedBounds,
  });
};

/**
 * Pure per-axis resolver. Screen-pixel tolerance is converted exactly once by
 * zoom; device scale never enters world geometry. Previous locks use a wider
 * release threshold so raw pointer jitter cannot switch guides every frame.
 */
export const resolveSnap = (input: SnapResolutionInput): SnapResolution => {
  const movingBounds = createWorldRect(
    input.movingBounds.x,
    input.movingBounds.y,
    input.movingBounds.width,
    input.movingBounds.height,
  );
  const rawDelta = createWorldVector(input.rawDelta.x, input.rawDelta.y);
  const zoom = createViewportZoom(input.zoom);
  const tolerancePixels = requirePositive(
    input.tolerancePixels ?? SNAP_POLICY.tolerancePixels,
    'Snap tolerance',
  );
  const rawBounds = createWorldRect(
    movingBounds.x + rawDelta.x,
    movingBounds.y + rawDelta.y,
    movingBounds.width,
    movingBounds.height,
  );
  if (input.bypass) {
    return createResolution(movingBounds, rawDelta);
  }
  const candidates = [
    ...input.candidates.map(normalizeCandidate),
    ...(input.grid === undefined ? [] : createGridCandidates(rawBounds, input.grid)),
  ];
  const toleranceWorldUnits = tolerancePixels / zoom;
  const xProposal = input.activeAxes.x
    ? resolveAxis('x', rawBounds, candidates, toleranceWorldUnits, input.previousLocks?.x)
    : undefined;
  const yProposal = input.activeAxes.y
    ? resolveAxis('y', rawBounds, candidates, toleranceWorldUnits, input.previousLocks?.y)
    : undefined;
  const adjustedDelta = createWorldVector(
    rawDelta.x + (xProposal?.adjustment ?? 0),
    rawDelta.y + (yProposal?.adjustment ?? 0),
  );
  return createResolution(movingBounds, adjustedDelta, xProposal, yProposal);
};

/** Produces a zoom-stable broad-phase region around the raw moved bounds. */
export const createSnapCandidateQueryBounds = (
  movingBoundsInput: WorldRect,
  rawDeltaInput: WorldVector,
  zoomInput: ViewportZoom,
): WorldRect => {
  const movingBounds = createWorldRect(
    movingBoundsInput.x,
    movingBoundsInput.y,
    movingBoundsInput.width,
    movingBoundsInput.height,
  );
  const rawDelta = createWorldVector(rawDeltaInput.x, rawDeltaInput.y);
  const zoom = createViewportZoom(zoomInput);
  const radius = SNAP_POLICY.candidateSearchRadiusPixels / zoom;
  return createWorldRect(
    movingBounds.x + rawDelta.x - radius,
    movingBounds.y + rawDelta.y - radius,
    movingBounds.width + radius * 2,
    movingBounds.height + radius * 2,
  );
};
