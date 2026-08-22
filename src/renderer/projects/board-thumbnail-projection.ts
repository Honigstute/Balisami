import {
  getControlSpec,
  type BoardId,
  type ControlTypeId,
  type ControlVisualKind,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import { controlSceneHasFill, controlSceneHasOutline } from '../controls/control-scene-geometry';
import {
  createControlSceneProjection,
  type ControlSceneProjection,
} from '../controls/control-scene-projection';
import type { ControlTextMeasurementService } from '../controls/control-text-measurement';
import { createBoardSceneItems } from '../editor/document-scene-model';
import { createWorldRect, type WorldRect } from '../editor/viewport-transform';

export const BOARD_THUMBNAIL_POLICY = Object.freeze({
  /** Bounds include every element, while SVG complexity keeps only the topmost canonical items. */
  maximumRenderedElements: 200,
  paddingRatio: 0.08,
});

export interface BoardThumbnailItem extends ControlSceneProjection {
  readonly controlType: ControlTypeId;
  readonly hasFill: boolean;
  readonly hasOutline: boolean;
  readonly id: ElementId;
  readonly strokeStyle: string | undefined;
  readonly visualKind: ControlVisualKind;
}

export interface BoardThumbnailProjection {
  readonly boardId: BoardId;
  readonly items: readonly BoardThumbnailItem[];
  readonly omittedItemCount: number;
  readonly viewBox: WorldRect;
}

const getItemsBounds = (items: ReturnType<typeof createBoardSceneItems>): WorldRect | undefined => {
  const first = items[0];
  if (first === undefined) {
    return undefined;
  }
  let left = first.bounds.x;
  let top = first.bounds.y;
  let right = first.bounds.x + first.bounds.width;
  let bottom = first.bounds.y + first.bounds.height;
  for (const item of items.slice(1)) {
    left = Math.min(left, item.bounds.x);
    top = Math.min(top, item.bounds.y);
    right = Math.max(right, item.bounds.x + item.bounds.width);
    bottom = Math.max(bottom, item.bounds.y + item.bounds.height);
  }
  return createWorldRect(left, top, right - left, bottom - top);
};

/** Pure, registry-backed scene projection; scheduling and caching are owned by the store. */
export const createBoardThumbnailProjection = (
  document: ProjectDocument,
  boardId: BoardId,
  textMeasurementService?: ControlTextMeasurementService,
): BoardThumbnailProjection | undefined => {
  const isActivePresentationBoard =
    document.boardIds.includes(boardId) ||
    document.boardIds.some(
      (canonicalBoardId) => document.boardsById[canonicalBoardId]?.selectedAlternateId === boardId,
    );
  if (!isActivePresentationBoard || document.boardsById[boardId] === undefined) {
    return undefined;
  }
  const sceneItems = createBoardSceneItems(document, boardId).filter(
    (item) => item.kind === 'object',
  );
  const contentBounds = getItemsBounds(sceneItems);
  const viewBox =
    contentBounds === undefined
      ? createWorldRect(0, 0, 4, 3)
      : (() => {
          const padding =
            Math.max(contentBounds.width, contentBounds.height) *
            BOARD_THUMBNAIL_POLICY.paddingRatio;
          return createWorldRect(
            contentBounds.x - padding,
            contentBounds.y - padding,
            contentBounds.width + padding * 2,
            contentBounds.height + padding * 2,
          );
        })();
  const renderableItems = sceneItems.slice(-BOARD_THUMBNAIL_POLICY.maximumRenderedElements);
  const items = renderableItems.map((item): BoardThumbnailItem => {
    const definition = getControlSpec(item.controlType);
    if (definition === undefined) {
      throw new Error(`Board thumbnail received unknown control '${item.controlType}'.`);
    }
    const projection = createControlSceneProjection({
      bounds: item.bounds,
      definition,
      identity: item.id,
      properties: item.properties,
      textMeasurementService,
    });
    const strokeStyle = item.properties.strokeStyle;
    return Object.freeze({
      ...projection,
      controlType: item.controlType,
      hasFill: controlSceneHasFill(definition),
      hasOutline: controlSceneHasOutline(definition),
      id: item.id,
      strokeStyle: typeof strokeStyle === 'string' ? strokeStyle : undefined,
      visualKind: item.visualKind,
    });
  });
  return Object.freeze({
    boardId,
    items: Object.freeze(items),
    omittedItemCount: sceneItems.length - renderableItems.length,
    viewBox,
  });
};
