import type { ElementId } from '../../domain';
import type { DocumentSceneModel } from './document-scene-model';
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
  /** Moved roots plus descendants that follow them in world space. */
  readonly excludedIds: readonly ElementId[];
  readonly movingBounds: WorldRect;
  readonly movingAnchors?: SnapMovingAnchors;
  readonly rawDelta: WorldVector;
  readonly tolerancePixels?: number;
  readonly zoom: ViewportZoom;
}

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
  const movingAnchorPositions = Object.freeze({
    x: movingAnchors.x.map((anchor) => getMovingAnchorPosition(rawBounds, 'x', anchor)),
    y: movingAnchors.y.map((anchor) => getMovingAnchorPosition(rawBounds, 'y', anchor)),
  });
  return Object.freeze(
    model.querySnapItems(queryRegions, request.excludedIds).flatMap((item, sourceOrder) =>
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
    ),
  );
};
