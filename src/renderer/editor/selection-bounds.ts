import type { ElementId } from '../../domain';
import type { DocumentSceneModel } from './document-scene-model';
import { createWorldRect, type WorldRect, type WorldVector } from './viewport-transform';

export interface SceneSelectionOffset {
  readonly affectedIds: readonly ElementId[];
  readonly delta: WorldVector;
}

/** Union of live derived scene items; stale session IDs are ignored. */
export const getSceneSelectionWorldBounds = (
  model: DocumentSceneModel,
  selectedIds: readonly ElementId[],
  offset?: SceneSelectionOffset,
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
  const firstOffset = getOffset(firstItem.id);
  let left = firstItem.bounds.x + (firstOffset?.x ?? 0);
  let top = firstItem.bounds.y + (firstOffset?.y ?? 0);
  let right = left + firstItem.bounds.width;
  let bottom = top + firstItem.bounds.height;
  for (const id of selectedIds) {
    const item = model.getItem(id);
    if (item === undefined || item.id === firstItem.id) {
      continue;
    }
    const itemOffset = getOffset(item.id);
    const x = item.bounds.x + (itemOffset?.x ?? 0);
    const y = item.bounds.y + (itemOffset?.y ?? 0);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + item.bounds.width);
    bottom = Math.max(bottom, y + item.bounds.height);
  }
  return createWorldRect(left, top, right - left, bottom - top);
};
