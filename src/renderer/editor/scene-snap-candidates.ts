import type { ElementId, ElementOwner } from '../../domain';
import type { DocumentSceneModel } from './document-scene-model';
import {
  createEqualGapQueryRegions,
  createEqualGapSnapCandidates,
} from './equal-gap-snap-candidates';
import {
  SNAP_ANCHORS,
  SNAP_POLICY,
  createBoundsSnapCandidates,
  createSnapCandidateQueryRegions,
  type SnapActiveAxes,
  type SnapAnchor,
  type SnapCandidate,
  type SnapMovingAnchors,
} from './snap-engine';
import {
  createWorldRect,
  type ViewportZoom,
  type WorldRect,
  type WorldVector,
} from './viewport-transform';

export interface SceneSnapCandidateRequest {
  readonly activeAxes?: SnapActiveAxes;
  /** Enables sibling-only equal-gap relations for whole-selection moves. */
  readonly equalGapOwner?: ElementOwner;
  /** Moved roots plus descendants that follow them in world space. */
  readonly excludedIds: readonly ElementId[];
  readonly movingBounds: WorldRect;
  readonly movingAnchors?: SnapMovingAnchors;
  readonly rawDelta: WorldVector;
  readonly tolerancePixels?: number;
  readonly zoom: ViewportZoom;
}

const ownersEqual = (first: ElementOwner, second: ElementOwner): boolean =>
  first.kind === second.kind &&
  (first.kind === 'board'
    ? first.boardId === (second.kind === 'board' ? second.boardId : undefined)
    : first.elementId === (second.kind === 'element' ? second.elementId : undefined));

const getMovingAnchorPosition = (
  bounds: WorldRect,
  axis: SnapCandidate['axis'],
  anchor: SnapAnchor,
): number => {
  const start = axis === 'x' ? bounds.x : bounds.y;
  const size = axis === 'x' ? bounds.width : bounds.height;
  return start + (anchor === 'start' ? 0 : anchor === 'center' ? size / 2 : size);
};

/**
 * Adapts the disposable scene index to the pure resolver vocabulary. The
 * model retains stacking/order authority; candidate geometry retains none.
 */
export const createSceneSnapCandidates = (
  model: DocumentSceneModel,
  request: SceneSnapCandidateRequest,
): readonly SnapCandidate[] => {
  const tolerancePixels = request.tolerancePixels ?? SNAP_POLICY.tolerancePixels;
  const activeAxes = request.activeAxes ?? Object.freeze({ x: true, y: true });
  const movingAnchors =
    request.movingAnchors ?? Object.freeze({ x: SNAP_ANCHORS, y: SNAP_ANCHORS });
  const queryRegions = createSnapCandidateQueryRegions(
    request.movingBounds,
    request.rawDelta,
    request.zoom,
    tolerancePixels,
    activeAxes,
    movingAnchors,
  );
  const rawBounds = createWorldRect(
    request.movingBounds.x + request.rawDelta.x,
    request.movingBounds.y + request.rawDelta.y,
    request.movingBounds.width,
    request.movingBounds.height,
  );
  const retentionTolerance =
    (tolerancePixels * SNAP_POLICY.releaseToleranceMultiplier) / request.zoom;
  const equalGapOwner = request.equalGapOwner;
  const allQueryRegions =
    equalGapOwner === undefined
      ? queryRegions
      : Object.freeze([
          ...queryRegions,
          ...createEqualGapQueryRegions(rawBounds, request.zoom, activeAxes),
        ]);
  const nearbyItems = model.querySnapItems(allQueryRegions, request.excludedIds);
  const movingAnchorPositions = Object.freeze({
    x: movingAnchors.x.map((anchor) => getMovingAnchorPosition(rawBounds, 'x', anchor)),
    y: movingAnchors.y.map((anchor) => getMovingAnchorPosition(rawBounds, 'y', anchor)),
  });
  const alignmentCandidates = nearbyItems.flatMap((item, sourceOrder) =>
    createBoundsSnapCandidates({
      bounds: item.bounds,
      kind: item.kind,
      sourceId: item.id,
      sourceOrder,
    }).filter(
      (candidate) =>
        activeAxes[candidate.axis] &&
        movingAnchorPositions[candidate.axis].some(
          (position) => Math.abs(candidate.position - position) <= retentionTolerance,
        ),
    ),
  );
  const equalGapCandidates =
    equalGapOwner === undefined
      ? []
      : createEqualGapSnapCandidates({
          activeAxes,
          movingBounds: rawBounds,
          sources: nearbyItems.flatMap((item, sourceOrder) =>
            ownersEqual(item.owner, equalGapOwner)
              ? [{ bounds: item.bounds, id: item.id, sourceOrder }]
              : [],
          ),
          toleranceWorldUnits: retentionTolerance,
          zoom: request.zoom,
        });
  return Object.freeze([...alignmentCandidates, ...equalGapCandidates]);
};
