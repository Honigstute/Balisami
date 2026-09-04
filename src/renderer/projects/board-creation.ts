import {
  BoardSchema,
  DOCUMENT_COMMAND_TYPES,
  type BoardId,
  type CreateBoardCommand,
  type ProjectDocument,
} from '../../domain';

const DEFAULT_BOARD_NAME_PREFIX = 'Wireframe';

/** Derives the first unused default title without making board names globally unique. */
export const getNextDefaultBoardName = (document: ProjectDocument): string => {
  const existingNames = new Set(Object.values(document.boardsById).map((board) => board.name));
  let suffix = 1;
  while (existingNames.has(`${DEFAULT_BOARD_NAME_PREFIX} ${String(suffix)}`)) {
    suffix += 1;
  }
  return `${DEFAULT_BOARD_NAME_PREFIX} ${String(suffix)}`;
};

/** Builds one validated empty-board command; ID allocation remains at the app edge. */
export const createBoardCreationCommand = (
  document: ProjectDocument,
  boardId: BoardId,
): CreateBoardCommand | undefined => {
  if (document.boardsById[boardId] !== undefined) {
    return undefined;
  }
  const board = BoardSchema.safeParse({
    alternateIds: [],
    childIds: [],
    id: boardId,
    name: getNextDefaultBoardName(document),
    note: { text: '' },
    selectedAlternateId: null,
  });
  return board.success
    ? Object.freeze({
        type: DOCUMENT_COMMAND_TYPES.createBoard,
        board: board.data,
        index: document.boardIds.length,
      })
    : undefined;
};
