import type { ElementId } from '../../domain';
import type { DocumentSceneModel } from './document-scene-model';
import {
  SNAP_POLICY,
  createBoundsSnapCandidates,
  createSnapCandidateQueryRegions,
  type SnapCandidate,
} from './snap-engine';
import {
  createWorldRect,
  type ViewportZoom,
  type WorldRect,
  type WorldVector,
} from './viewport-transform';

export interface SceneSnapCandidateRequest {
  /** Moved roots plus descendants that follow them in world space. */
  readonly excludedIds: readonly ElementId[];
  readonly movingBounds: WorldRect;
  readonly rawDelta: WorldVector;
  readonly tolerancePixels?: number;
  readonly zoom: ViewportZoom;
}

const getMovingAnchorPositions = (
  bounds: WorldRect,
  axis: SnapCandidate['axis'],
): readonly number[] => {
  const start = axis === 'x' ? bounds.x : bounds.y;
  const size = axis === 'x' ? bounds.width : bounds.height;
  return Object.freeze([start, start + size / 2, start + size]);
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
  const queryRegions = createSnapCandidateQueryRegions(
    request.movingBounds,
    request.rawDelta,
    request.zoom,
    tolerancePixels,
  );
  const rawBounds = createWorldRect(
    request.movingBounds.x + request.rawDelta.x,
    request.movingBounds.y + request.rawDelta.y,
    request.movingBounds.width,
    request.movingBounds.height,
  );
  const retentionTolerance =
    (tolerancePixels * SNAP_POLICY.releaseToleranceMultiplier) / request.zoom;
  const movingAnchors = Object.freeze({
    x: getMovingAnchorPositions(rawBounds, 'x'),
    y: getMovingAnchorPositions(rawBounds, 'y'),
  });
  return Object.freeze(
    model.querySnapItems(queryRegions, request.excludedIds).flatMap((item, sourceOrder) =>
      createBoundsSnapCandidates({
        bounds: item.bounds,
        kind: 'object',
        sourceId: item.id,
        sourceOrder,
      }).filter((candidate) =>
        movingAnchors[candidate.axis].some(
          (position) => Math.abs(candidate.position - position) <= retentionTolerance,
        ),
      ),
    ),
  );
};
