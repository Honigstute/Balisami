import {
  FOUNDATION_CONTROL_TYPES,
  type BoardId,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import { createSeededSketchRectPath } from './seeded-sketch';
import { WorldSpatialIndex } from './spatial-index';
import { getVisibleWorldRange } from './visible-world-range';
import {
  createWorldRect,
  type ViewportSize,
  type ViewportTransform,
  type WorldRect,
} from './viewport-transform';

export interface DocumentSceneItem {
  readonly bounds: WorldRect;
  readonly id: ElementId;
  readonly path: string;
  readonly revision: string;
}

export interface DocumentSceneReconcileResult {
  readonly changed: boolean;
  readonly removedItemCount: number;
  readonly revision: number;
  readonly updatedItemCount: number;
}

interface DerivedSceneItem {
  readonly bounds: WorldRect;
  readonly id: ElementId;
}

const boundsEqual = (first: WorldRect, second: WorldRect): boolean =>
  first.x === second.x &&
  first.y === second.y &&
  first.width === second.width &&
  first.height === second.height;

const orderEqual = (first: readonly ElementId[], second: readonly ElementId[]): boolean =>
  first.length === second.length && first.every((id, index) => id === second[index]);

const createItemRevision = (item: DerivedSceneItem): string =>
  `${item.id}|${String(item.bounds.x)}|${String(item.bounds.y)}|${String(item.bounds.width)}|${String(item.bounds.height)}`;

/** Flattens canonical childIds order while accumulating local container origins once. */
const deriveBoardSceneItems = (
  document: ProjectDocument,
  boardId: BoardId | undefined,
): readonly DerivedSceneItem[] => {
  if (boardId === undefined) {
    return Object.freeze([]);
  }
  const board = document.boardsById[boardId];
  if (board === undefined) {
    return Object.freeze([]);
  }
  const items: DerivedSceneItem[] = [];
  const visited = new Set<ElementId>();
  const visit = (elementId: ElementId, parentX: number, parentY: number): void => {
    if (visited.has(elementId)) {
      throw new Error('Document scene received duplicate or cyclic element ownership.');
    }
    visited.add(elementId);
    const element = document.elementsById[elementId];
    if (element === undefined) {
      throw new Error('Document scene received a missing canonical child element.');
    }
    const bounds = createWorldRect(
      parentX + element.frame.x,
      parentY + element.frame.y,
      element.frame.width,
      element.frame.height,
    );
    if (element.controlType === FOUNDATION_CONTROL_TYPES.rectangle) {
      items.push(Object.freeze({ bounds, id: element.id }));
    }
    for (const childId of element.childIds) {
      visit(childId, bounds.x, bounds.y);
    }
  };

  for (const elementId of board.childIds) {
    visit(elementId, 0, 0);
  }
  return Object.freeze(items);
};

export const countRenderableBoardElements = (
  document: ProjectDocument,
  boardId: BoardId | undefined,
): number => deriveBoardSceneItems(document, boardId).length;

export const getRenderableBoardWorldBounds = (
  document: ProjectDocument,
  boardId: BoardId | undefined,
): WorldRect | undefined => {
  const items = deriveBoardSceneItems(document, boardId);
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

/** Incrementally reconciles render geometry while leaving document state immutable. */
export class DocumentSceneModel {
  readonly #index = new WorldSpatialIndex<ElementId>();
  readonly #itemsById = new Map<ElementId, DocumentSceneItem>();
  #lastBoardId: BoardId | undefined;
  #lastDocument: ProjectDocument | undefined;
  #order: readonly ElementId[] = Object.freeze([]);
  #orderById = new Map<ElementId, number>();
  #revision = 0;

  getItem(id: ElementId): DocumentSceneItem | undefined {
    return this.#itemsById.get(id);
  }

  reconcile(document: ProjectDocument, boardId: BoardId | undefined): DocumentSceneReconcileResult {
    if (this.#lastDocument === document && this.#lastBoardId === boardId) {
      return Object.freeze({
        changed: false,
        removedItemCount: 0,
        revision: this.#revision,
        updatedItemCount: 0,
      });
    }
    const derivedItems = deriveBoardSceneItems(document, boardId);
    const nextIds = new Set(derivedItems.map((item) => item.id));
    let removedItemCount = 0;
    let updatedItemCount = 0;

    for (const existingId of this.#itemsById.keys()) {
      if (!nextIds.has(existingId)) {
        this.#itemsById.delete(existingId);
        this.#index.remove(existingId);
        removedItemCount += 1;
      }
    }
    for (const derivedItem of derivedItems) {
      const existing = this.#itemsById.get(derivedItem.id);
      if (existing !== undefined && boundsEqual(existing.bounds, derivedItem.bounds)) {
        continue;
      }
      const item = Object.freeze({
        bounds: derivedItem.bounds,
        id: derivedItem.id,
        path: createSeededSketchRectPath(derivedItem.bounds, derivedItem.id),
        revision: createItemRevision(derivedItem),
      });
      this.#itemsById.set(item.id, item);
      this.#index.upsert(item);
      updatedItemCount += 1;
    }

    const nextOrder = Object.freeze(derivedItems.map((item) => item.id));
    const changed =
      removedItemCount > 0 || updatedItemCount > 0 || !orderEqual(this.#order, nextOrder);
    if (changed) {
      this.#order = nextOrder;
      this.#orderById = new Map(nextOrder.map((id, index) => [id, index]));
      this.#revision += 1;
    }
    this.#lastDocument = document;
    this.#lastBoardId = boardId;
    return Object.freeze({ changed, removedItemCount, revision: this.#revision, updatedItemCount });
  }

  queryVisible(transform: ViewportTransform, viewport: ViewportSize): readonly DocumentSceneItem[] {
    const ids = this.#index.query(getVisibleWorldRange(transform, viewport));
    return Object.freeze(
      [...ids]
        .sort(
          (first, second) =>
            (this.#orderById.get(first) ?? Number.MAX_SAFE_INTEGER) -
            (this.#orderById.get(second) ?? Number.MAX_SAFE_INTEGER),
        )
        .flatMap((id) => {
          const item = this.#itemsById.get(id);
          return item === undefined ? [] : [item];
        }),
    );
  }
}
