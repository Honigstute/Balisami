import {
  CreateElementCommandSchema,
  DOCUMENT_COMMAND_TYPES,
  createElementLocationIndex,
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

    const link =
      sourceElement.link?.kind === 'board' && options.remapBoardLink !== undefined
        ? Object.freeze({
            kind: 'board' as const,
            boardId: options.remapBoardLink(sourceElement.link.boardId),
          })
        : sourceElement.link;
    const createElement = CreateElementCommandSchema.safeParse({
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        ...sourceElement,
        childIds: [],
        id: cloneElementId,
        link,
      },
      owner,
      index: location.index,
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
