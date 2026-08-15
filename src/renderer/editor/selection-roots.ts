import {
  createElementLocationIndex,
  type ElementId,
  type ElementLocationIndex,
  type ProjectDocument,
} from '../../domain';

export interface SelectionRoots {
  readonly locations: ElementLocationIndex;
  /** Unique live IDs in the caller's stable selection order. */
  readonly selectedIds: readonly ElementId[];
  /** Selected IDs with every selected descendant removed. */
  readonly rootIds: readonly ElementId[];
}

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
