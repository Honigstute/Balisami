import {
  createElementLocationIndex,
  selectOwnerChildIds,
  type ElementId,
  type ElementLocationIndex,
  type ElementOwner,
  type ProjectDocument,
} from '../../domain';

export interface SelectionRoots {
  readonly locations: ElementLocationIndex;
  /** Unique live IDs in the caller's stable selection order. */
  readonly selectedIds: readonly ElementId[];
  /** Selected IDs with every selected descendant removed. */
  readonly rootIds: readonly ElementId[];
}

export interface SiblingSelectionRoots extends SelectionRoots {
  /** The one canonical owner shared by every root. */
  readonly owner: ElementOwner;
}

const ownersEqual = (first: ElementOwner, second: ElementOwner): boolean =>
  first.kind === second.kind &&
  (first.kind === 'board'
    ? first.boardId === (second.kind === 'board' ? second.boardId : undefined)
    : first.elementId === (second.kind === 'element' ? second.elementId : undefined));

const hasSelectedAncestor = (
  elementId: ElementId,
  selectedIds: ReadonlySet<ElementId>,
  locations: ElementLocationIndex,
): boolean => {
  let location = locations.get(elementId);
  const visited = new Set<ElementId>();
  while (location?.owner.kind === 'element') {
    const parentId = location.owner.elementId;
    if (selectedIds.has(parentId)) {
      return true;
    }
    if (visited.has(parentId)) {
      return false;
    }
    visited.add(parentId);
    location = locations.get(parentId);
  }
  return false;
};

/** Resolves the canonical roots that may receive one transform or arrangement. */
export const resolveSelectionRoots = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
): SelectionRoots | undefined => {
  const uniqueSelectedIds = Object.freeze([...new Set(selectedIds)]);
  if (uniqueSelectedIds.length === 0) {
    return undefined;
  }
  const locations = createElementLocationIndex(document);
  if (
    uniqueSelectedIds.some(
      (elementId) =>
        document.elementsById[elementId] === undefined || locations.get(elementId) === undefined,
    )
  ) {
    return undefined;
  }
  const selectedSet = new Set(uniqueSelectedIds);
  return Object.freeze({
    locations,
    selectedIds: uniqueSelectedIds,
    rootIds: Object.freeze(
      uniqueSelectedIds.filter(
        (elementId) => !hasSelectedAncestor(elementId, selectedSet, locations),
      ),
    ),
  });
};

/** Resolves roots in their owner's canonical bottom-to-top order. */
export const resolveSiblingSelectionRoots = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
): SiblingSelectionRoots | undefined => {
  const roots = resolveSelectionRoots(document, selectedIds);
  if (roots === undefined) {
    return undefined;
  }
  const firstRootId = roots.rootIds[0];
  const firstLocation = firstRootId === undefined ? undefined : roots.locations.get(firstRootId);
  if (
    firstLocation === undefined ||
    roots.rootIds.some((elementId) => {
      const location = roots.locations.get(elementId);
      return location === undefined || !ownersEqual(location.owner, firstLocation.owner);
    })
  ) {
    return undefined;
  }

  const childIds = selectOwnerChildIds(document, firstLocation.owner);
  if (childIds === undefined) {
    return undefined;
  }
  const rootSet = new Set(roots.rootIds);
  const rootIds = Object.freeze(childIds.filter((elementId) => rootSet.has(elementId)));
  if (rootIds.length !== roots.rootIds.length) {
    return undefined;
  }
  return Object.freeze({
    locations: roots.locations,
    owner: firstLocation.owner,
    rootIds,
    selectedIds: roots.selectedIds,
  });
};
