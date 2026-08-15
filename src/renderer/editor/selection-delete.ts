import {
  DOCUMENT_COMMAND_TYPES,
  createElementLocationIndex,
  selectElementCommandAvailability,
  type DeleteElementCommand,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import type { SelectionStore } from './selection-store';

export interface SelectionDeletePlan {
  readonly commands: readonly DeleteElementCommand[];
  readonly elementIds: readonly ElementId[];
}

export interface SelectionDeleteSource {
  /** Returns the accepted document, or undefined when the transaction did not commit. */
  readonly commit: (commands: readonly DeleteElementCommand[]) => ProjectDocument | undefined;
}

/**
 * Plans against the starting document only. A non-empty container, stale ID,
 * or locked item makes the complete selection unavailable; recursive deletion
 * remains an explicit M7 grouping decision.
 */
export const planSelectionDelete = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
  canonicalElementIds: readonly ElementId[],
): SelectionDeletePlan | undefined => {
  const uniqueSelectedIds = [...new Set(selectedIds)];
  if (uniqueSelectedIds.length === 0) {
    return undefined;
  }

  const selectedSet = new Set(uniqueSelectedIds);
  const orderedIds = canonicalElementIds.filter((id) => selectedSet.has(id));
  if (
    new Set(canonicalElementIds).size !== canonicalElementIds.length ||
    orderedIds.length !== uniqueSelectedIds.length
  ) {
    return undefined;
  }

  const locationIndex = createElementLocationIndex(document);
  for (const id of orderedIds) {
    const element = document.elementsById[id];
    const availability = selectElementCommandAvailability(document, id, locationIndex);
    if (element === undefined || element.locked || availability?.canDelete !== true) {
      return undefined;
    }
  }

  return Object.freeze({
    commands: Object.freeze(
      orderedIds.map((elementId) =>
        Object.freeze({ type: DOCUMENT_COMMAND_TYPES.deleteElement, elementId }),
      ),
    ),
    elementIds: Object.freeze(orderedIds),
  });
};

/** Commits once, then reconciles session selection from the accepted document only. */
export const deleteSelectedElements = (
  document: ProjectDocument,
  selection: SelectionStore,
  canonicalElementIds: readonly ElementId[],
  source: SelectionDeleteSource,
): boolean => {
  const plan = planSelectionDelete(
    document,
    selection.getSnapshot().selectedIds,
    canonicalElementIds,
  );
  if (plan === undefined) {
    return false;
  }
  const acceptedDocument = source.commit(plan.commands);
  if (acceptedDocument === undefined) {
    return false;
  }
  selection.reconcile(
    new Set(Object.values(acceptedDocument.elementsById).map((element) => element.id)),
  );
  return true;
};
