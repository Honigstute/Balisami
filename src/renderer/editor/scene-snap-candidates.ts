import type { ElementId } from '../../domain';
import type { DocumentSceneModel } from './document-scene-model';
import {
  createBoundsSnapCandidates,
  createSnapCandidateQueryBounds,
  type SnapCandidate,
} from './snap-engine';
import type { ViewportZoom, WorldRect, WorldVector } from './viewport-transform';

export interface SceneSnapCandidateRequest {
  /** Moved roots plus descendants that follow them in world space. */
  readonly excludedIds: readonly ElementId[];
  readonly movingBounds: WorldRect;
  readonly rawDelta: WorldVector;
  readonly zoom: ViewportZoom;
}

/**
 * Adapts the disposable scene index to the pure resolver vocabulary. The
 * model retains stacking/order authority; candidate geometry retains none.
 */
export const createSceneSnapCandidates = (
  model: DocumentSceneModel,
  request: SceneSnapCandidateRequest,
): readonly SnapCandidate[] => {
  const queryBounds = createSnapCandidateQueryBounds(
    request.movingBounds,
    request.rawDelta,
    request.zoom,
  );
  return Object.freeze(
    model.querySnapItems(queryBounds, request.excludedIds).flatMap((item, sourceOrder) =>
      createBoundsSnapCandidates({
        bounds: item.bounds,
        kind: 'object',
        sourceId: item.id,
        sourceOrder,
      }),
    ),
  );
};
