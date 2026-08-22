import {
  DOCUMENT_COMMAND_TYPES,
  type BoardId,
  type ProjectDocument,
  type RestoreBoardCommand,
  type TrashBoardCommand,
} from '../../domain';

/** Plans the only user-facing delete path: retain the complete board in durable trash. */
export const createBoardTrashCommand = (
  document: ProjectDocument,
  boardId: BoardId,
): TrashBoardCommand | undefined =>
  document.boardIds.includes(boardId) && document.boardIds.length > 1
    ? Object.freeze({
        type: DOCUMENT_COMMAND_TYPES.trashBoard,
        boardId,
        toIndex: document.trashedBoardIds.length,
      })
    : undefined;

export const createBoardRestoreCommand = (
  document: ProjectDocument,
  boardId: BoardId,
): RestoreBoardCommand | undefined =>
  document.trashedBoardIds.includes(boardId)
    ? Object.freeze({
        type: DOCUMENT_COMMAND_TYPES.restoreBoard,
        boardId,
        toIndex: document.boardIds.length,
      })
    : undefined;

/** Keeps selection near the removed row while always returning an active canonical board. */
export const selectBoardAfterTrash = (
  document: ProjectDocument,
  boardId: BoardId,
): BoardId | undefined => {
  const index = document.boardIds.indexOf(boardId);
  if (index < 0 || document.boardIds.length <= 1) {
    return undefined;
  }
  return document.boardIds[index + 1] ?? document.boardIds[index - 1];
};
