import {
  containsControlHitPoint,
  getControlHitShapePadding,
  getControlSpec,
  type BoardId,
  type ControlDefinition,
  type ControlTypeId,
  type ControlVisualKind,
  type ElementId,
  type ElementLink,
  type ElementOwner,
  type ElementProperties,
  type ProjectDocument,
} from '../../domain';
import { createControlSceneOutlinePath } from '../controls/control-scene-geometry';
import { WorldSpatialIndex } from './spatial-index';
import { getVisibleWorldRange } from './visible-world-range';
import {
  createWorldRect,
  type ViewportSize,
  type ViewportTransform,
  type WorldPoint,
  type WorldRect,
} from './viewport-transform';

export interface DocumentSceneItem {
  readonly bounds: WorldRect;
  readonly controlType: ControlTypeId;
  readonly id: ElementId;
  readonly kind: 'container' | 'object';
  readonly locked: boolean;
  readonly link: ElementLink | null;
  /** Disposable ownership metadata for sibling-scoped editor geometry. */
  readonly owner: ElementOwner;
  readonly path: string;
  readonly properties: ElementProperties;
  readonly revision: string;
  readonly visualKind: ControlVisualKind;
}

export interface DocumentSceneHitTestOptions {
  /** Locked controls are normally click-through; explicit tooling may inspect them. */
  readonly includeLocked?: boolean;
}

export type DocumentSceneSelectionRegionMode = 'contained' | 'intersecting';

export interface DocumentSceneReconcileResult {
  readonly changed: boolean;
  readonly removedItemCount: number;
  readonly revision: number;
  readonly updatedItemCount: number;
}

export interface BoardSceneItem {
  readonly bounds: WorldRect;
  readonly controlType: ControlTypeId;
  readonly id: ElementId;
  readonly kind: 'container' | 'object';
  readonly locked: boolean;
  readonly link: ElementLink | null;
  readonly owner: ElementOwner;
  readonly properties: ElementProperties;
  readonly visualKind: ControlVisualKind;
}

export type ControlDefinitionResolver = (type: string) => ControlDefinition | undefined;

export interface DocumentSceneModelOptions {
  /** Explicit test seam; production always resolves the canonical registry. */
  readonly resolveControlDefinition?: ControlDefinitionResolver;
}

const boundsEqual = (first: WorldRect, second: WorldRect): boolean =>
  first.x === second.x &&
  first.y === second.y &&
  first.width === second.width &&
  first.height === second.height;

const containsBounds = (outer: WorldRect, inner: WorldRect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

const orderEqual = (first: readonly ElementId[], second: readonly ElementId[]): boolean =>
  first.length === second.length && first.every((id, index) => id === second[index]);

const ownersEqual = (first: ElementOwner, second: ElementOwner): boolean =>
  first.kind === second.kind &&
  (first.kind === 'board'
    ? first.boardId === (second.kind === 'board' ? second.boardId : undefined)
    : first.elementId === (second.kind === 'element' ? second.elementId : undefined));

const getOwnerKey = (owner: ElementOwner): string =>
  owner.kind === 'board' ? `board:${owner.boardId}` : `element:${owner.elementId}`;

const createItemRevision = (
  item: BoardSceneItem,
  resolveControlDefinition: ControlDefinitionResolver = getControlSpec,
): string => {
  const spec = resolveControlDefinition(item.controlType);
  if (spec === undefined) {
    throw new Error(`Document scene received unknown control type '${item.controlType}'.`);
  }
  const presentationPropertyKeys = new Set([
    ...spec.scene.propertyKeys,
    ...(spec.accessibility.nameProperty === null ? [] : [spec.accessibility.nameProperty]),
    ...(spec.accessibility.checkedProperty === null ? [] : [spec.accessibility.checkedProperty]),
  ]);
  const renderProperties = [...presentationPropertyKeys].map((key) => item.properties[key]);
  return `${item.id}|${item.controlType}|${item.kind}|${item.visualKind}|${getOwnerKey(item.owner)}|${String(item.bounds.x)}|${String(item.bounds.y)}|${String(item.bounds.width)}|${String(item.bounds.height)}|${JSON.stringify(renderProperties)}|${JSON.stringify(item.link)}`;
};

/** Flattens canonical childIds order while accumulating local container origins once. */
export const createBoardSceneItems = (
  document: ProjectDocument,
  boardId: BoardId | undefined,
  resolveControlDefinition: ControlDefinitionResolver = getControlSpec,
): readonly BoardSceneItem[] => {
  if (boardId === undefined) {
    return Object.freeze([]);
  }
  const board = document.boardsById[boardId];
  if (board === undefined) {
    return Object.freeze([]);
  }
  const items: BoardSceneItem[] = [];
  const visited = new Set<ElementId>();
  const visit = (
    elementId: ElementId,
    parentX: number,
    parentY: number,
    ancestorLocked: boolean,
    owner: ElementOwner,
  ): void => {
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
    // `locked` on a scene item is effective interaction state. The persisted
    // direct bit remains owned only by the element record.
    const effectivelyLocked = ancestorLocked || element.locked;
    const spec = resolveControlDefinition(element.controlType);
    if (spec === undefined) {
      throw new Error(`Document scene received unknown control type '${element.controlType}'.`);
    }
    // Transparent structural controls participate in editor geometry without
    // inventing visible chrome. Every visible control uses registry metadata.
    items.push(
      Object.freeze({
        bounds,
        controlType: element.controlType,
        id: element.id,
        kind: spec.scene.kind === 'transparent' ? 'container' : 'object',
        link: element.link,
        locked: effectivelyLocked,
        owner,
        properties: element.properties,
        visualKind: spec.scene.kind,
      }),
    );
    for (const childId of element.childIds) {
      visit(
        childId,
        bounds.x,
        bounds.y,
        effectivelyLocked,
        Object.freeze({ kind: 'element', elementId: element.id }),
      );
    }
  };

  for (const elementId of board.childIds) {
    visit(elementId, 0, 0, false, Object.freeze({ kind: 'board', boardId: board.id }));
  }
  return Object.freeze(items);
};

export const countRenderableBoardElements = (
  document: ProjectDocument,
  boardId: BoardId | undefined,
): number =>
  createBoardSceneItems(document, boardId).filter((item) => item.kind === 'object').length;

export const getRenderableBoardWorldBounds = (
  document: ProjectDocument,
  boardId: BoardId | undefined,
): WorldRect | undefined => {
  const items = createBoardSceneItems(document, boardId).filter((item) => item.kind === 'object');
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
  readonly #listeners = new Set<() => void>();
  readonly #resolveControlDefinition: ControlDefinitionResolver;
  #lastBoardId: BoardId | undefined;
  #lastDocument: ProjectDocument | undefined;
  #maximumHitShapePadding = 0;
  #order: readonly ElementId[] = Object.freeze([]);
  #orderById = new Map<ElementId, number>();
  #revision = 0;

  constructor(options: DocumentSceneModelOptions = {}) {
    this.#resolveControlDefinition = options.resolveControlDefinition ?? getControlSpec;
  }

  getItem(id: ElementId): DocumentSceneItem | undefined {
    return this.#itemsById.get(id);
  }

  getRevisionSnapshot = (): number => this.#revision;

  listItemIds(): readonly ElementId[] {
    return this.#order;
  }

  listSelectableItemIds(options: DocumentSceneHitTestOptions = {}): readonly ElementId[] {
    return Object.freeze(
      this.#order.filter((id) => {
        const item = this.#itemsById.get(id);
        return item !== undefined && (!item.locked || options.includeLocked === true);
      }),
    );
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  reconcile(document: ProjectDocument, boardId: BoardId | undefined): DocumentSceneReconcileResult {
    if (this.#lastDocument === document && this.#lastBoardId === boardId) {
      return Object.freeze({
        changed: false,
        removedItemCount: 0,
        revision: this.#revision,
        updatedItemCount: 0,
      });
    }
    const derivedItems = createBoardSceneItems(document, boardId, this.#resolveControlDefinition);
    this.#maximumHitShapePadding = derivedItems.reduce((maximum, item) => {
      const definition = this.#resolveControlDefinition(item.controlType);
      return definition === undefined
        ? maximum
        : Math.max(maximum, getControlHitShapePadding(definition));
    }, 0);
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
      const revision = createItemRevision(derivedItem, this.#resolveControlDefinition);
      const geometryChanged =
        existing === undefined ||
        existing.kind !== derivedItem.kind ||
        existing.controlType !== derivedItem.controlType ||
        !boundsEqual(existing.bounds, derivedItem.bounds);
      const presentationChanged = existing === undefined || existing.revision !== revision;
      if (
        !geometryChanged &&
        existing.locked === derivedItem.locked &&
        ownersEqual(existing.owner, derivedItem.owner) &&
        existing.revision === revision
      ) {
        continue;
      }
      const item = Object.freeze({
        bounds: derivedItem.bounds,
        controlType: derivedItem.controlType,
        id: derivedItem.id,
        kind: derivedItem.kind,
        link: derivedItem.link,
        locked: derivedItem.locked,
        owner: derivedItem.owner,
        path:
          derivedItem.kind === 'container' || derivedItem.visualKind === 'text'
            ? ''
            : geometryChanged || presentationChanged
              ? createControlSceneOutlinePath(
                  derivedItem.controlType,
                  derivedItem.bounds,
                  derivedItem.id,
                  derivedItem.properties,
                )
              : existing.path,
        properties: derivedItem.properties,
        revision,
        visualKind: derivedItem.visualKind,
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
    if (changed) {
      for (const listener of this.#listeners) {
        listener();
      }
    }
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

  /** Returns exact hits from visually topmost to bottommost canonical order. */
  queryHitStack(
    point: WorldPoint,
    options: DocumentSceneHitTestOptions = {},
  ): readonly DocumentSceneItem[] {
    return Object.freeze(
      (this.#maximumHitShapePadding === 0
        ? this.#index.queryPoint(point)
        : this.#index.query(
            createWorldRect(
              point.x - this.#maximumHitShapePadding,
              point.y - this.#maximumHitShapePadding,
              this.#maximumHitShapePadding * 2,
              this.#maximumHitShapePadding * 2,
            ),
          )
      )
        .flatMap((id) => {
          const item = this.#itemsById.get(id);
          if (item === undefined || (item.locked && options.includeLocked !== true)) {
            return [];
          }
          const definition = this.#resolveControlDefinition(item.controlType);
          if (
            definition === undefined ||
            !containsControlHitPoint(definition, item.bounds, item.properties, point)
          ) {
            return [];
          }
          return [item];
        })
        .sort(
          (first, second) =>
            (this.#orderById.get(second.id) ?? Number.MIN_SAFE_INTEGER) -
            (this.#orderById.get(first.id) ?? Number.MIN_SAFE_INTEGER),
        ),
    );
  }

  hitTestTopmost(
    point: WorldPoint,
    options: DocumentSceneHitTestOptions = {},
  ): DocumentSceneItem | undefined {
    return this.queryHitStack(point, options)[0];
  }

  /** Restores canonical bottom-to-top order after a spatial region query. */
  querySelectionRegion(
    bounds: WorldRect,
    mode: DocumentSceneSelectionRegionMode,
    options: DocumentSceneHitTestOptions = {},
  ): readonly ElementId[] {
    return Object.freeze(
      this.#index
        .query(bounds)
        .flatMap((id) => {
          const item = this.#itemsById.get(id);
          if (
            item === undefined ||
            (item.locked && options.includeLocked !== true) ||
            (mode === 'contained' && !containsBounds(bounds, item.bounds))
          ) {
            return [];
          }
          return [id];
        })
        .sort(
          (first, second) =>
            (this.#orderById.get(first) ?? Number.MAX_SAFE_INTEGER) -
            (this.#orderById.get(second) ?? Number.MAX_SAFE_INTEGER),
        ),
    );
  }

  /**
   * Returns nearby snap sources in canonical order. Locked items remain valid
   * alignment geometry; moved roots and every following descendant are
   * excluded by the interaction capture rather than by selection state here.
   */
  querySnapItems(
    regions: readonly WorldRect[],
    excludedIds: readonly ElementId[],
  ): readonly DocumentSceneItem[] {
    const excluded = new Set(excludedIds);
    const nearbyIds = new Set(regions.flatMap((region) => this.#index.query(region)));
    return Object.freeze(
      [...nearbyIds]
        .flatMap((id) => {
          const item = this.#itemsById.get(id);
          return item === undefined || excluded.has(id) ? [] : [item];
        })
        .sort(
          (first, second) =>
            (this.#orderById.get(first.id) ?? Number.MAX_SAFE_INTEGER) -
            (this.#orderById.get(second.id) ?? Number.MAX_SAFE_INTEGER),
        ),
    );
  }
}
