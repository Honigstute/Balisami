import {
  BoardSchema,
  CreateBoardCommandSchema,
  DOCUMENT_COMMAND_TYPES,
  selectBoardPresentationId,
  type BoardId,
  type DocumentCommand,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import {
  planBoardContentClone,
  type BoardContentCloneElementIdAllocator,
} from './board-content-clone';

export type BoardDuplicateElementIdAllocator = BoardContentCloneElementIdAllocator;

export interface BoardDuplicatePlan {
  readonly cloneBoardId: BoardId;
  readonly cloneElementIds: readonly ElementId[];
  readonly commands: readonly DocumentCommand[];
  readonly sourceBoardId: BoardId;
  readonly sourceElementIds: readonly ElementId[];
  readonly sourceVersionId: BoardId;
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

/** Plans a new canonical board from the source family's currently selected version. */
export const planBoardDuplicate = (
  document: ProjectDocument,
  sourceBoardId: BoardId,
  cloneBoardId: BoardId,
  allocateElementId: BoardDuplicateElementIdAllocator,
): BoardDuplicatePlan | undefined => {
  const canonicalBoard = document.boardsById[sourceBoardId];
  const sourceBoardIndex = document.boardIds.indexOf(sourceBoardId);
  const sourceVersionId = selectBoardPresentationId(document, sourceBoardId);
  if (
    canonicalBoard === undefined ||
    sourceVersionId === undefined ||
    sourceBoardIndex < 0 ||
    document.boardsById[cloneBoardId] !== undefined
  ) {
    return undefined;
  }
  const sourceVersion = document.boardsById[sourceVersionId];
  if (sourceVersion === undefined) {
    return undefined;
  }

  const cloneBoard = BoardSchema.safeParse({
    ...sourceVersion,
    alternateIds: [],
    childIds: [],
    id: cloneBoardId,
    name: getDuplicateName(document, canonicalBoard.name),
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

  const content = planBoardContentClone(
    document,
    sourceVersionId,
    cloneBoardId,
    allocateElementId,
    {
      remapBoardLink: (linkedBoardId) =>
        linkedBoardId === sourceBoardId ? cloneBoardId : linkedBoardId,
    },
  );
  if (content === undefined) {
    return undefined;
  }

  return Object.freeze({
    cloneBoardId,
    cloneElementIds: content.cloneElementIds,
    commands: Object.freeze([createBoard.data, ...content.commands]),
    sourceBoardId,
    sourceElementIds: content.sourceElementIds,
    sourceVersionId,
  });
};
