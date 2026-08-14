import type { ElementId } from '../../domain';
import type { DocumentSceneModel } from './document-scene-model';
import { createWorldRect, type WorldRect, type WorldVector } from './viewport-transform';

export interface SceneSelectionOffset {
  readonly affectedIds: readonly ElementId[];
  readonly delta: WorldVector;
}

export interface SceneSelectionFrameOverride {
  readonly bounds: WorldRect;
  readonly elementId: ElementId;
}

/** Union of live derived scene items; stale session IDs are ignored. */
export const getSceneSelectionWorldBounds = (
  model: DocumentSceneModel,
  selectedIds: readonly ElementId[],
  offset?: SceneSelectionOffset,
  frameOverride?: SceneSelectionFrameOverride,
): WorldRect | undefined => {
  const firstItem = selectedIds.flatMap((id) => {
    const item = model.getItem(id);
    return item === undefined ? [] : [item];
  })[0];
  if (firstItem === undefined) {
    return undefined;
  }

  const offsetIds = offset === undefined ? undefined : new Set(offset.affectedIds);
  const getOffset = (id: ElementId): WorldVector | undefined =>
    offset !== undefined && offsetIds?.has(id) === true ? offset.delta : undefined;
  const getBounds = (id: ElementId, bounds: WorldRect): WorldRect =>
    frameOverride?.elementId === id ? frameOverride.bounds : bounds;
  const firstBounds = getBounds(firstItem.id, firstItem.bounds);
  const firstOffset = getOffset(firstItem.id);
  let left = firstBounds.x + (firstOffset?.x ?? 0);
  let top = firstBounds.y + (firstOffset?.y ?? 0);
  let right = left + firstBounds.width;
  let bottom = top + firstBounds.height;
  for (const id of selectedIds) {
    const item = model.getItem(id);
    if (item === undefined || item.id === firstItem.id) {
      continue;
    }
    const itemBounds = getBounds(item.id, item.bounds);
    const itemOffset = getOffset(item.id);
    const x = itemBounds.x + (itemOffset?.x ?? 0);
    const y = itemBounds.y + (itemOffset?.y ?? 0);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + itemBounds.width);
    bottom = Math.max(bottom, y + itemBounds.height);
  }
  return createWorldRect(left, top, right - left, bottom - top);
};
