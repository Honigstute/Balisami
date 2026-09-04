import {
  CreateElementCommandSchema,
  DeleteElementCommandSchema,
  DOCUMENT_COMMAND_TYPES,
  createElementLocationIndex,
  getControlSpec,
  mapElementLinks,
  rekeyControlRowState,
  selectBoardElementIds,
  type BoardId,
  type DocumentCommand,
  type ElementId,
  type ElementOwner,
  type ProjectDocument,
} from '../../domain';

export type BoardContentCloneElementIdAllocator = (
  sourceElementId: ElementId,
  sourceIndex: number,
) => ElementId | undefined;

export interface BoardContentClonePlan {
  readonly cloneElementIds: readonly ElementId[];
  readonly commands: readonly DocumentCommand[];
  readonly sourceBoardId: BoardId;
  readonly sourceElementIds: readonly ElementId[];
  readonly targetBoardId: BoardId;
}

export interface BoardContentCloneOptions {
  readonly remapBoardLink?: (boardId: BoardId) => BoardId;
  /** Appends source roots after existing target roots without changing nested child order. */
  readonly targetRootIndexOffset?: number;
}

/**
 * Clones one board-shaped record's complete element tree in canonical pre-order.
 * The target board may be introduced by an earlier command in the same transaction.
 */
export const planBoardContentClone = (
  document: ProjectDocument,
  sourceBoardId: BoardId,
  targetBoardId: BoardId,
  allocateElementId: BoardContentCloneElementIdAllocator,
  options: BoardContentCloneOptions = {},
): BoardContentClonePlan | undefined => {
  if (document.boardsById[sourceBoardId] === undefined) {
    return undefined;
  }
  const sourceElementIds = selectBoardElementIds(document, sourceBoardId);
  if (sourceElementIds === undefined) {
    return undefined;
  }

  const cloneElementIds: ElementId[] = [];
  const cloneIdBySource = new Map<ElementId, ElementId>();
  for (const [sourceIndex, sourceElementId] of sourceElementIds.entries()) {
    const cloneElementId = allocateElementId(sourceElementId, sourceIndex);
    if (
      cloneElementId === undefined ||
      document.elementsById[cloneElementId] !== undefined ||
      cloneElementIds.includes(cloneElementId)
    ) {
      return undefined;
    }
    cloneElementIds.push(cloneElementId);
    cloneIdBySource.set(sourceElementId, cloneElementId);
  }

  const locationIndex = createElementLocationIndex(document);
  const commands: DocumentCommand[] = [];
  for (const sourceElementId of sourceElementIds) {
    const sourceElement = document.elementsById[sourceElementId];
    const cloneElementId = cloneIdBySource.get(sourceElementId);
    const location = locationIndex.get(sourceElementId);
    if (sourceElement === undefined || cloneElementId === undefined || location === undefined) {
      return undefined;
    }

    let owner: ElementOwner | undefined;
    if (location.owner.kind === 'board') {
      if (location.owner.boardId === sourceBoardId) {
        owner = Object.freeze({ kind: 'board', boardId: targetBoardId });
      }
    } else {
      const cloneParentId = cloneIdBySource.get(location.owner.elementId);
      if (cloneParentId !== undefined) {
        owner = Object.freeze({ kind: 'element', elementId: cloneParentId });
      }
    }
    if (owner === undefined) {
      return undefined;
    }

    const remappedElement =
      options.remapBoardLink === undefined
        ? sourceElement
        : mapElementLinks(sourceElement, (link) =>
            link.kind === 'board'
              ? Object.freeze({
                  kind: 'board' as const,
                  boardId: options.remapBoardLink!(link.boardId),
                })
              : link,
          );
    const definition = getControlSpec(remappedElement.controlType);
    const rowState =
      definition === undefined
        ? undefined
        : rekeyControlRowState(
            definition,
            remappedElement.properties,
            remappedElement.rowData,
            cloneElementId,
          );
    if (rowState === undefined) return undefined;
    const createElement = CreateElementCommandSchema.safeParse({
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        ...remappedElement,
        childIds: [],
        id: cloneElementId,
        properties: rowState.properties,
        rowData: rowState.rowData,
      },
      owner,
      index:
        location.owner.kind === 'board'
          ? location.index + (options.targetRootIndexOffset ?? 0)
          : location.index,
    });
    if (!createElement.success) {
      return undefined;
    }
    commands.push(createElement.data);
  }

  return Object.freeze({
    cloneElementIds: Object.freeze(cloneElementIds),
    commands: Object.freeze(commands),
    sourceBoardId,
    sourceElementIds,
    targetBoardId,
  });
};

/** Deletes one board's tree child-first so every ordinary delete command remains valid. */
export const planBoardContentDelete = (
  document: ProjectDocument,
  boardId: BoardId,
): readonly DocumentCommand[] | undefined => {
  const elementIds = selectBoardElementIds(document, boardId);
  if (elementIds === undefined) {
    return undefined;
  }
  const commands: DocumentCommand[] = [];
  for (const elementId of [...elementIds].reverse()) {
    const command = DeleteElementCommandSchema.safeParse({
      type: DOCUMENT_COMMAND_TYPES.deleteElement,
      elementId,
    });
    if (!command.success) {
      return undefined;
    }
    commands.push(command.data);
  }
  return Object.freeze(commands);
};
