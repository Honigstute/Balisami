import { getControlSpec } from '../controls/control-spec';
import type { BoardId, ElementId } from './ids';
import type { ElementOwner } from './owner';
import type { Board, ElementNode, WorldRect } from './schema';
import type { ProjectDocument } from './validation';

export interface ElementLocation {
  readonly index: number;
  readonly owner: ElementOwner;
}

export type ElementLocationIndex = ReadonlyMap<ElementId, ElementLocation>;

export interface BoardCommandAvailability {
  readonly canDelete: boolean;
  readonly canMoveBackward: boolean;
  readonly canMoveForward: boolean;
}

export interface ElementCommandAvailability {
  readonly canCreateChild: boolean;
  readonly canDelete: boolean;
  readonly canMoveBackward: boolean;
  readonly canMoveForward: boolean;
}

const addOwnerLocations = (
  locations: Map<ElementId, ElementLocation>,
  childIds: readonly ElementId[],
  owner: ElementOwner,
): void => {
  childIds.forEach((elementId, index) => {
    locations.set(elementId, Object.freeze({ index, owner }));
  });
};

/**
 * Rebuilds the disposable owner/order index from canonical childIds arrays.
 * Valid ProjectDocument values guarantee exactly one entry per element.
 */
export const createElementLocationIndex = (document: ProjectDocument): ElementLocationIndex => {
  const locations = new Map<ElementId, ElementLocation>();

  for (const board of Object.values(document.boardsById)) {
    addOwnerLocations(
      locations,
      board.childIds,
      Object.freeze({ kind: 'board', boardId: board.id }),
    );
  }

  for (const element of Object.values(document.elementsById)) {
    addOwnerLocations(
      locations,
      element.childIds,
      Object.freeze({ kind: 'element', elementId: element.id }),
    );
  }

  return locations;
};

export const selectElementLocation = (
  document: ProjectDocument,
  elementId: ElementId,
  index: ElementLocationIndex = createElementLocationIndex(document),
): ElementLocation | undefined => index.get(elementId);

export const selectOwnerChildIds = (
  document: ProjectDocument,
  owner: ElementOwner,
): readonly ElementId[] | undefined => {
  if (owner.kind === 'board') {
    return document.boardsById[owner.boardId]?.childIds;
  }
  return document.elementsById[owner.elementId]?.childIds;
};

export const selectOrderedBoards = (document: ProjectDocument): readonly Board[] =>
  Object.freeze(
    document.boardIds.flatMap((boardId) => {
      const board = document.boardsById[boardId];
      return board === undefined ? [] : [board];
    }),
  );

export const selectOrderedChildren = (
  document: ProjectDocument,
  owner: ElementOwner,
): readonly ElementNode[] | undefined => {
  const childIds = selectOwnerChildIds(document, owner);
  if (childIds === undefined) {
    return undefined;
  }

  return Object.freeze(
    childIds.flatMap((elementId) => {
      const element = document.elementsById[elementId];
      return element === undefined ? [] : [element];
    }),
  );
};

export const selectBoardRootElements = (
  document: ProjectDocument,
  boardId: BoardId,
): readonly ElementNode[] | undefined =>
  selectOrderedChildren(document, { kind: 'board', boardId });

/**
 * Resolves local frames into world space by accumulating owner origins.
 * Container size does not scale child geometry in the foundation model.
 */
export const selectElementWorldBounds = (
  document: ProjectDocument,
  elementId: ElementId,
  index: ElementLocationIndex = createElementLocationIndex(document),
): WorldRect | undefined => {
  const element = document.elementsById[elementId];
  if (element === undefined) {
    return undefined;
  }

  let x = element.frame.x;
  let y = element.frame.y;
  let currentId = elementId;
  const visited = new Set<ElementId>();

  while (!visited.has(currentId)) {
    visited.add(currentId);
    const location = index.get(currentId);
    if (location === undefined) {
      return undefined;
    }
    if (location.owner.kind === 'board') {
      return Object.freeze({
        x,
        y,
        width: element.frame.width,
        height: element.frame.height,
      });
    }

    const parent = document.elementsById[location.owner.elementId];
    if (parent === undefined) {
      return undefined;
    }
    x += parent.frame.x;
    y += parent.frame.y;
    currentId = parent.id;
  }

  return undefined;
};

/** Stale selection IDs are ignored; no live bounds yields undefined. */
export const selectSelectionWorldBounds = (
  document: ProjectDocument,
  elementIds: readonly ElementId[],
  index: ElementLocationIndex = createElementLocationIndex(document),
): WorldRect | undefined => {
  let bounds: WorldRect | undefined;

  for (const elementId of new Set(elementIds)) {
    const elementBounds = selectElementWorldBounds(document, elementId, index);
    if (elementBounds === undefined) {
      continue;
    }
    if (bounds === undefined) {
      bounds = elementBounds;
      continue;
    }

    const right = Math.max(bounds.x + bounds.width, elementBounds.x + elementBounds.width);
    const bottom = Math.max(bounds.y + bounds.height, elementBounds.y + elementBounds.height);
    const x = Math.min(bounds.x, elementBounds.x);
    const y = Math.min(bounds.y, elementBounds.y);
    bounds = Object.freeze({ x, y, width: right - x, height: bottom - y });
  }

  return bounds;
};

export const selectBoardCommandAvailability = (
  document: ProjectDocument,
  boardId: BoardId,
): BoardCommandAvailability | undefined => {
  const board = document.boardsById[boardId];
  const index = document.boardIds.indexOf(boardId);
  if (board === undefined || index < 0) {
    return undefined;
  }

  const isLinked = Object.values(document.elementsById).some(
    (element) => element.link?.kind === 'board' && element.link.boardId === boardId,
  );
  return Object.freeze({
    canDelete: board.childIds.length === 0 && !isLinked,
    canMoveBackward: index > 0,
    canMoveForward: index < document.boardIds.length - 1,
  });
};

export const selectElementCommandAvailability = (
  document: ProjectDocument,
  elementId: ElementId,
  index: ElementLocationIndex = createElementLocationIndex(document),
): ElementCommandAvailability | undefined => {
  const element = document.elementsById[elementId];
  const location = index.get(elementId);
  if (element === undefined || location === undefined) {
    return undefined;
  }
  const siblings = selectOwnerChildIds(document, location.owner);
  if (siblings === undefined) {
    return undefined;
  }

  return Object.freeze({
    canCreateChild: getControlSpec(element.controlType)?.canOwnChildren === true,
    canDelete: element.childIds.length === 0,
    canMoveBackward: location.index > 0,
    canMoveForward: location.index < siblings.length - 1,
  });
};
