import {
  DOCUMENT_COMMAND_TYPES,
  SetElementLockedCommandSchema,
  selectBoardElementIds,
  selectElementLockState,
  type BoardId,
  type ElementId,
  type ProjectDocument,
  type SetElementLockedCommand,
} from '../../domain';
import { resolveSelectionRoots } from './selection-roots';
import type { SelectionStore } from './selection-store';

export interface SelectionLockPlan {
  readonly commands: readonly SetElementLockedCommand[];
  readonly rootIds: readonly ElementId[];
}

export interface BoardUnlockPlan {
  readonly commands: readonly SetElementLockedCommand[];
  readonly elementIds: readonly ElementId[];
}

export interface SelectionLockingSource {
  /** Returns the accepted document, or undefined when the transaction did not commit. */
  readonly commit: (
    commands: readonly SetElementLockedCommand[],
    label: string,
  ) => ProjectDocument | undefined;
}

/** Locks only canonical selection roots so descendants inherit one source of truth. */
export const planSelectionLock = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
  canonicalElementIds: readonly ElementId[],
): SelectionLockPlan | undefined => {
  const roots = resolveSelectionRoots(document, selectedIds);
  if (roots === undefined || new Set(canonicalElementIds).size !== canonicalElementIds.length) {
    return undefined;
  }
  const selectedSet = new Set(roots.selectedIds);
  const orderedIds = canonicalElementIds.filter((elementId) => selectedSet.has(elementId));
  if (orderedIds.length !== roots.selectedIds.length) {
    return undefined;
  }

  if (
    orderedIds.some(
      (elementId) =>
        selectElementLockState(document, elementId, roots.locations)?.effectivelyLocked !== false,
    )
  ) {
    return undefined;
  }
  const rootSet = new Set(roots.rootIds);
  const rootIds = orderedIds.filter((elementId) => rootSet.has(elementId));
  const commands: SetElementLockedCommand[] = [];
  for (const elementId of rootIds) {
    const command = SetElementLockedCommandSchema.safeParse({
      type: DOCUMENT_COMMAND_TYPES.setElementLocked,
      elementId,
      locked: true,
    });
    if (!command.success) {
      return undefined;
    }
    commands.push(command.data);
  }
  return commands.length === 0
    ? undefined
    : Object.freeze({ commands: Object.freeze(commands), rootIds: Object.freeze(rootIds) });
};

/** Unlock-all targets direct bits on the active board; inherited state is derived afterward. */
export const planBoardUnlockAll = (
  document: ProjectDocument,
  boardId: BoardId,
): BoardUnlockPlan | undefined => {
  const boardElementIds = selectBoardElementIds(document, boardId);
  if (boardElementIds === undefined) {
    return undefined;
  }
  const elementIds = boardElementIds.filter(
    (elementId) => document.elementsById[elementId]?.locked === true,
  );
  const commands = elementIds.map((elementId) =>
    SetElementLockedCommandSchema.parse({
      type: DOCUMENT_COMMAND_TYPES.setElementLocked,
      elementId,
      locked: false,
    }),
  );
  return commands.length === 0
    ? undefined
    : Object.freeze({ commands: Object.freeze(commands), elementIds: Object.freeze(elementIds) });
};

export const lockSelectedElements = (
  document: ProjectDocument,
  selection: SelectionStore,
  canonicalElementIds: readonly ElementId[],
  source: SelectionLockingSource,
): boolean => {
  const plan = planSelectionLock(
    document,
    selection.getSnapshot().selectedIds,
    canonicalElementIds,
  );
  if (plan === undefined) {
    return false;
  }
  const acceptedDocument = source.commit(
    plan.commands,
    plan.rootIds.length === 1 ? 'Lock element' : 'Lock elements',
  );
  if (
    acceptedDocument === undefined ||
    plan.rootIds.some(
      (elementId) => selectElementLockState(acceptedDocument, elementId)?.directlyLocked !== true,
    )
  ) {
    return false;
  }

  const selectableIds = new Set(
    selection
      .getSnapshot()
      .selectedIds.filter(
        (elementId) =>
          selectElementLockState(acceptedDocument, elementId)?.effectivelyLocked === false,
      ),
  );
  selection.reconcile(selectableIds);
  return true;
};

export const unlockAllBoardElements = (
  document: ProjectDocument,
  boardId: BoardId,
  source: SelectionLockingSource,
): boolean => {
  const plan = planBoardUnlockAll(document, boardId);
  if (plan === undefined) {
    return false;
  }
  const acceptedDocument = source.commit(
    plan.commands,
    plan.elementIds.length === 1 ? 'Unlock element' : 'Unlock elements',
  );
  return (
    acceptedDocument !== undefined &&
    plan.elementIds.every((elementId) => acceptedDocument.elementsById[elementId]?.locked === false)
  );
};
