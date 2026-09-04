import {
  DOCUMENT_COMMAND_TYPES,
  createElementLocationIndex,
  selectElementCommandAvailability,
  selectElementLockState,
  type DocumentCommand,
  type DeleteElementCommand,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import { planCommandsWithUnusedAssetCleanup } from '../projects/unused-asset-cleanup';
import type { SelectionStore } from './selection-store';

export interface SelectionDeletePlan {
  readonly commands: readonly DocumentCommand[];
  readonly elementIds: readonly ElementId[];
}

export interface SelectionDeleteSource {
  /** Returns the accepted document, or undefined when the transaction did not commit. */
  readonly commit: (commands: readonly DocumentCommand[]) => ProjectDocument | undefined;
}

export interface SelectionDeleteOptions {
  /** Cut keeps assets available for the same-project clipboard payload. */
  readonly retainReferencedAssets?: boolean;
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
  options: SelectionDeleteOptions = {},
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
    if (
      element === undefined ||
      selectElementLockState(document, id, locationIndex)?.effectivelyLocked !== false ||
      availability?.canDelete !== true
    ) {
      return undefined;
    }
  }

  const deleteCommands = Object.freeze(
    orderedIds.map((elementId): DeleteElementCommand =>
      Object.freeze({ type: DOCUMENT_COMMAND_TYPES.deleteElement, elementId }),
    ),
  );
  const commands = options.retainReferencedAssets
    ? deleteCommands
    : planCommandsWithUnusedAssetCleanup(document, deleteCommands);
  if (commands === undefined) {
    return undefined;
  }

  return Object.freeze({
    commands,
    elementIds: Object.freeze(orderedIds),
  });
};

/** Commits once, then reconciles session selection from the accepted document only. */
export const deleteSelectedElements = (
  document: ProjectDocument,
  selection: SelectionStore,
  canonicalElementIds: readonly ElementId[],
  source: SelectionDeleteSource,
  options: SelectionDeleteOptions = {},
): boolean => {
  const plan = planSelectionDelete(
    document,
    selection.getSnapshot().selectedIds,
    canonicalElementIds,
    options,
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
