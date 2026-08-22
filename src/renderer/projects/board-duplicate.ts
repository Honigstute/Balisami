import {
  BoardSchema,
  CreateBoardCommandSchema,
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

export type BoardDuplicateElementIdAllocator = (
  sourceElementId: ElementId,
  sourceIndex: number,
) => ElementId | undefined;

export interface BoardDuplicatePlan {
  readonly cloneBoardId: BoardId;
  readonly cloneElementIds: readonly ElementId[];
  readonly commands: readonly DocumentCommand[];
  readonly sourceBoardId: BoardId;
  readonly sourceElementIds: readonly ElementId[];
}

const getDuplicateName = (document: ProjectDocument, sourceName: string): string => {
  const existingNames = new Set(Object.values(document.boardsById).map((board) => board.name));
  let copyNumber = 1;
  while (true) {
    const suffix = copyNumber === 1 ? ' copy' : ` copy ${String(copyNumber)}`;
    const base = sourceName.slice(0, 120 - suffix.length).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!existingNames.has(candidate)) {
      return candidate;
    }
    copyNumber += 1;
  }
};

/**
 * Plans a complete board clone in canonical pre-order. Parents are created
 * before children, allowing the ordinary validated element-create command to
 * remain the only ownership mutation boundary.
 */
export const planBoardDuplicate = (
  document: ProjectDocument,
  sourceBoardId: BoardId,
  cloneBoardId: BoardId,
  allocateElementId: BoardDuplicateElementIdAllocator,
): BoardDuplicatePlan | undefined => {
  const sourceBoard = document.boardsById[sourceBoardId];
  const sourceBoardIndex = document.boardIds.indexOf(sourceBoardId);
  if (
    sourceBoard === undefined ||
    sourceBoardIndex < 0 ||
    document.boardsById[cloneBoardId] !== undefined
  ) {
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

  const cloneBoard = BoardSchema.safeParse({
    ...sourceBoard,
    alternateIds: [],
    childIds: [],
    id: cloneBoardId,
    name: getDuplicateName(document, sourceBoard.name),
    selectedAlternateId: null,
  });
  const createBoard = CreateBoardCommandSchema.safeParse({
    type: DOCUMENT_COMMAND_TYPES.createBoard,
    board: cloneBoard.success ? cloneBoard.data : undefined,
    index: sourceBoardIndex + 1,
  });
  if (!createBoard.success) {
    return undefined;
  }

  const locationIndex = createElementLocationIndex(document);
  const commands: DocumentCommand[] = [createBoard.data];
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
        owner = Object.freeze({ kind: 'board', boardId: cloneBoardId });
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
    const createElement = CreateElementCommandSchema.safeParse({
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        ...sourceElement,
        childIds: [],
        id: cloneElementId,
        link:
          sourceElement.link?.kind === 'board' && sourceElement.link.boardId === sourceBoardId
            ? { kind: 'board', boardId: cloneBoardId }
            : sourceElement.link,
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
    cloneBoardId,
    cloneElementIds: Object.freeze(cloneElementIds),
    commands: Object.freeze(commands),
    sourceBoardId,
    sourceElementIds,
  });
};
