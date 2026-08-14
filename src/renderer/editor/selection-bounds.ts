import type { ElementId } from '../../domain';
import type { DocumentSceneModel } from './document-scene-model';
import { createWorldRect, type WorldRect } from './viewport-transform';

/** Union of live derived scene items; stale session IDs are ignored. */
export const getSceneSelectionWorldBounds = (
  model: DocumentSceneModel,
  selectedIds: readonly ElementId[],
): WorldRect | undefined => {
  const firstItem = selectedIds.flatMap((id) => {
    const item = model.getItem(id);
    return item === undefined ? [] : [item];
  })[0];
  if (firstItem === undefined) {
    return undefined;
  }

  let left = firstItem.bounds.x;
  let top = firstItem.bounds.y;
  let right = firstItem.bounds.x + firstItem.bounds.width;
  let bottom = firstItem.bounds.y + firstItem.bounds.height;
  for (const id of selectedIds) {
    const item = model.getItem(id);
    if (item === undefined || item.id === firstItem.id) {
      continue;
    }
    left = Math.min(left, item.bounds.x);
    top = Math.min(top, item.bounds.y);
    right = Math.max(right, item.bounds.x + item.bounds.width);
    bottom = Math.max(bottom, item.bounds.y + item.bounds.height);
  }
  return createWorldRect(left, top, right - left, bottom - top);
};
