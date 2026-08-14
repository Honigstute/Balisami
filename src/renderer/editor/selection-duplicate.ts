import {
  CreateElementCommandSchema,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  createElementLocationIndex,
  type CreateElementCommand,
  type ElementId,
  type ElementLocation,
  type ElementNode,
  type ProjectDocument,
} from '../../domain';
import type { SelectionStore } from './selection-store';

export const SELECTION_DUPLICATE_POLICY = Object.freeze({
  offsetWorldUnits: 10,
});

export type SelectionDuplicateIdAllocator = (
  sourceId: ElementId,
  sourceIndex: number,
) => ElementId | undefined;

export interface SelectionDuplicatePlan {
  readonly cloneIds: readonly ElementId[];
  readonly commands: readonly CreateElementCommand[];
  readonly sourceIds: readonly ElementId[];
}

export interface SelectionDuplicateSource {
  /** Returns the accepted document, or undefined when the transaction did not commit. */
  readonly commit: (commands: readonly CreateElementCommand[]) => ProjectDocument | undefined;
}

interface DuplicateCandidate {
  readonly element: ElementNode;
  readonly location: ElementLocation;
}

const getOwnerKey = (location: ElementLocation): string =>
  location.owner.kind === 'board'
    ? `board:${location.owner.boardId}`
    : `element:${location.owner.elementId}`;

/**
 * Plans the complete childless selection before emitting a command. Subtree
 * cloning remains an M7 decision, so any locked, stale, or non-empty item
 * rejects the entire operation.
 */
export const planSelectionDuplicate = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
  canonicalElementIds: readonly ElementId[],
  allocateId: SelectionDuplicateIdAllocator,
): SelectionDuplicatePlan | undefined => {
  const uniqueSelectedIds = [...new Set(selectedIds)];
  if (uniqueSelectedIds.length === 0) {
    return undefined;
  }

  const selectedSet = new Set(uniqueSelectedIds);
  const sourceIds = canonicalElementIds.filter((id) => selectedSet.has(id));
  if (
    new Set(canonicalElementIds).size !== canonicalElementIds.length ||
    sourceIds.length !== uniqueSelectedIds.length
  ) {
    return undefined;
  }

  const locationIndex = createElementLocationIndex(document);
  const candidates: DuplicateCandidate[] = [];
  for (const sourceId of sourceIds) {
    const element = document.elementsById[sourceId];
    const location = locationIndex.get(sourceId);
    if (
      element === undefined ||
      location === undefined ||
      element.locked ||
      element.childIds.length > 0
    ) {
      return undefined;
    }
    candidates.push(Object.freeze({ element, location }));
  }

  const cloneIds: ElementId[] = [];
  const allocatedIds = new Set<ElementId>();
  for (const [sourceIndex, candidate] of candidates.entries()) {
    const cloneIdInput = allocateId(candidate.element.id, sourceIndex);
    const parsedId = ElementIdSchema.safeParse(cloneIdInput);
    if (
      !parsedId.success ||
      Object.hasOwn(document.elementsById, parsedId.data) ||
      allocatedIds.has(parsedId.data)
    ) {
      return undefined;
    }
    allocatedIds.add(parsedId.data);
    cloneIds.push(parsedId.data);
  }

  const commands: CreateElementCommand[] = [];
  const insertedSourceIndexesByOwner = new Map<string, number[]>();
  for (const [sourceIndex, candidate] of candidates.entries()) {
    const ownerKey = getOwnerKey(candidate.location);
    const priorSourceIndexes = insertedSourceIndexesByOwner.get(ownerKey) ?? [];
    const earlierInsertions = priorSourceIndexes.filter(
      (priorIndex) => priorIndex <= candidate.location.index,
    ).length;
    const cloneId = cloneIds[sourceIndex];
    if (cloneId === undefined) {
      return undefined;
    }
    const cloneX = candidate.element.frame.x + SELECTION_DUPLICATE_POLICY.offsetWorldUnits;
    const cloneY = candidate.element.frame.y + SELECTION_DUPLICATE_POLICY.offsetWorldUnits;
    if (
      !Number.isFinite(cloneX) ||
      !Number.isFinite(cloneY) ||
      cloneX - candidate.element.frame.x !== SELECTION_DUPLICATE_POLICY.offsetWorldUnits ||
      cloneY - candidate.element.frame.y !== SELECTION_DUPLICATE_POLICY.offsetWorldUnits
    ) {
      return undefined;
    }
    const parsedCommand = CreateElementCommandSchema.safeParse({
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        ...candidate.element,
        id: cloneId,
        frame: {
          ...candidate.element.frame,
          x: cloneX,
          y: cloneY,
        },
        childIds: [],
      },
      owner: candidate.location.owner,
      index: candidate.location.index + 1 + earlierInsertions,
    });
    if (!parsedCommand.success) {
      return undefined;
    }
    commands.push(parsedCommand.data);
    priorSourceIndexes.push(candidate.location.index);
    insertedSourceIndexesByOwner.set(ownerKey, priorSourceIndexes);
  }

  return Object.freeze({
    cloneIds: Object.freeze(cloneIds),
    commands: Object.freeze(commands),
    sourceIds: Object.freeze(sourceIds),
  });
};

/** Commits once, then selects only clone IDs proven present in the accepted document. */
export const duplicateSelectedElements = (
  document: ProjectDocument,
  selection: SelectionStore,
  canonicalElementIds: readonly ElementId[],
  allocateId: SelectionDuplicateIdAllocator,
  source: SelectionDuplicateSource,
): boolean => {
  const selectionBefore = selection.getSnapshot();
  const plan = planSelectionDuplicate(
    document,
    selectionBefore.selectedIds,
    canonicalElementIds,
    allocateId,
  );
  if (plan === undefined) {
    return false;
  }
  const acceptedDocument = source.commit(plan.commands);
  if (
    acceptedDocument === undefined ||
    plan.cloneIds.some((id) => !Object.hasOwn(acceptedDocument.elementsById, id))
  ) {
    return false;
  }
  const primaryIndex =
    selectionBefore.primaryId === undefined
      ? -1
      : plan.sourceIds.indexOf(selectionBefore.primaryId);
  selection.replace(plan.cloneIds, plan.cloneIds[primaryIndex]);
  return true;
};
