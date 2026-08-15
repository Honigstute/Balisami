import {
  DOCUMENT_COMMAND_TYPES,
  ReorderElementSiblingsCommandSchema,
  selectElementLockState,
  selectOwnerChildIds,
  type ElementId,
  type ElementOwner,
  type ProjectDocument,
  type ReorderElementSiblingsCommand,
} from '../../domain';
import { resolveSelectionRoots, resolveSiblingSelectionRoots } from './selection-roots';
import type { SelectionStore } from './selection-store';

export const SELECTION_LAYER_ACTIONS = Object.freeze({
  bringForward: 'bring-forward',
  bringToFront: 'bring-to-front',
  sendBackward: 'send-backward',
  sendToBack: 'send-to-back',
} as const);
export type SelectionLayerAction =
  (typeof SELECTION_LAYER_ACTIONS)[keyof typeof SELECTION_LAYER_ACTIONS];

export interface SelectionLayerPlan {
  readonly action: SelectionLayerAction;
  readonly command: ReorderElementSiblingsCommand;
  readonly owner: ElementOwner;
  readonly rootIds: readonly ElementId[];
}

export interface SelectionLayerAvailability {
  readonly canBringForward: boolean;
  readonly canBringToFront: boolean;
  readonly canSendBackward: boolean;
  readonly canSendToBack: boolean;
}

export interface SelectionLayeringSource {
  /** Returns the accepted document, or undefined when the command did not commit. */
  readonly commit: (
    commands: readonly ReorderElementSiblingsCommand[],
    label: string,
  ) => ProjectDocument | undefined;
}

const ordersEqual = (left: readonly ElementId[], right: readonly ElementId[]): boolean =>
  left.length === right.length && left.every((elementId, index) => elementId === right[index]);

/** Preserves selected and unaffected relative order for every layer operation. */
const createTargetOrder = (
  childIds: readonly ElementId[],
  selectedIds: ReadonlySet<ElementId>,
  action: SelectionLayerAction,
): readonly ElementId[] => {
  const selected = childIds.filter((elementId) => selectedIds.has(elementId));
  const unaffected = childIds.filter((elementId) => !selectedIds.has(elementId));
  if (action === SELECTION_LAYER_ACTIONS.sendToBack) {
    return Object.freeze([...selected, ...unaffected]);
  }
  if (action === SELECTION_LAYER_ACTIONS.bringToFront) {
    return Object.freeze([...unaffected, ...selected]);
  }

  const result = [...childIds];
  if (action === SELECTION_LAYER_ACTIONS.sendBackward) {
    for (let index = 1; index < result.length; index += 1) {
      const current = result[index];
      const previous = result[index - 1];
      if (
        current !== undefined &&
        previous !== undefined &&
        selectedIds.has(current) &&
        !selectedIds.has(previous)
      ) {
        result[index - 1] = current;
        result[index] = previous;
      }
    }
  } else {
    for (let index = result.length - 2; index >= 0; index -= 1) {
      const current = result[index];
      const next = result[index + 1];
      if (
        current !== undefined &&
        next !== undefined &&
        selectedIds.has(current) &&
        !selectedIds.has(next)
      ) {
        result[index] = next;
        result[index + 1] = current;
      }
    }
  }
  return Object.freeze(result);
};

export const planSelectionLayer = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
  action: SelectionLayerAction,
): SelectionLayerPlan | undefined => {
  const roots = resolveSiblingSelectionRoots(document, selectedIds);
  if (roots === undefined) {
    return undefined;
  }
  if (
    roots.selectedIds.some(
      (elementId) =>
        selectElementLockState(document, elementId, roots.locations)?.effectivelyLocked !== false,
    )
  ) {
    return undefined;
  }
  const childIds = selectOwnerChildIds(document, roots.owner);
  if (childIds === undefined) {
    return undefined;
  }
  const rootSet = new Set(roots.rootIds);
  const targetOrder = createTargetOrder(childIds, rootSet, action);
  if (ordersEqual(childIds, targetOrder)) {
    return undefined;
  }
  const command = ReorderElementSiblingsCommandSchema.safeParse({
    type: DOCUMENT_COMMAND_TYPES.reorderElementSiblings,
    owner: roots.owner,
    childIds: targetOrder,
  });
  return command.success
    ? Object.freeze({
        action,
        command: command.data,
        owner: roots.owner,
        rootIds: roots.rootIds,
      })
    : undefined;
};

export const selectSelectionLayerAvailability = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
): SelectionLayerAvailability =>
  Object.freeze({
    canBringForward:
      planSelectionLayer(document, selectedIds, SELECTION_LAYER_ACTIONS.bringForward) !== undefined,
    canBringToFront:
      planSelectionLayer(document, selectedIds, SELECTION_LAYER_ACTIONS.bringToFront) !== undefined,
    canSendBackward:
      planSelectionLayer(document, selectedIds, SELECTION_LAYER_ACTIONS.sendBackward) !== undefined,
    canSendToBack:
      planSelectionLayer(document, selectedIds, SELECTION_LAYER_ACTIONS.sendToBack) !== undefined,
  });

const actionLabel = (action: SelectionLayerAction, count: number): string => {
  const noun = count === 1 ? 'element' : 'elements';
  switch (action) {
    case SELECTION_LAYER_ACTIONS.bringForward:
      return `Bring ${noun} forward`;
    case SELECTION_LAYER_ACTIONS.bringToFront:
      return `Bring ${noun} to front`;
    case SELECTION_LAYER_ACTIONS.sendBackward:
      return `Send ${noun} backward`;
    case SELECTION_LAYER_ACTIONS.sendToBack:
      return `Send ${noun} to back`;
  }
};

export const layerSelectedElements = (
  document: ProjectDocument,
  selection: SelectionStore,
  action: SelectionLayerAction,
  source: SelectionLayeringSource,
): boolean => {
  const selectionBefore = selection.getSnapshot();
  const plan = planSelectionLayer(document, selectionBefore.selectedIds, action);
  if (plan === undefined) {
    return false;
  }
  const acceptedDocument = source.commit([plan.command], actionLabel(action, plan.rootIds.length));
  const acceptedOrder =
    acceptedDocument === undefined ? undefined : selectOwnerChildIds(acceptedDocument, plan.owner);
  if (acceptedOrder === undefined || !ordersEqual(acceptedOrder, plan.command.childIds)) {
    return false;
  }

  const rootSet = new Set(plan.rootIds);
  let primaryId = selectionBefore.primaryId;
  if (primaryId === undefined || !rootSet.has(primaryId)) {
    const roots = resolveSelectionRoots(document, selectionBefore.selectedIds);
    let currentId = primaryId;
    while (currentId !== undefined && !rootSet.has(currentId)) {
      const location = roots?.locations.get(currentId);
      currentId = location?.owner.kind === 'element' ? location.owner.elementId : undefined;
    }
    primaryId = currentId ?? plan.rootIds.at(-1);
  }
  selection.replace(plan.rootIds, primaryId);
  return true;
};
