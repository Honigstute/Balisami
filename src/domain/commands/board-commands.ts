import type { BoardId } from '../document/ids';
import type { Board } from '../document/schema';
import type { ProjectDocument } from '../document/validation';
import type { CommandApplication } from './application';
import {
  DOCUMENT_COMMAND_TYPES,
  type BoardCommand,
  type CreateAlternateCommand,
  type CreateBoardCommand,
  type DeleteAlternateCommand,
  type DeleteBoardCommand,
  type RestoreBoardCommand,
  type RenameBoardCommand,
  type ReorderBoardCommand,
  type SetBoardNoteCommand,
  type SelectBoardVersionCommand,
  type TrashBoardCommand,
} from './schema';

type BoardDocumentPatch = Partial<
  Pick<ProjectDocument, 'boardIds' | 'boardsById' | 'trashedBoardIds'>
>;

const createBoardRevision = (
  document: ProjectDocument,
  patch: BoardDocumentPatch,
): ProjectDocument => Object.freeze({ ...document, ...patch });

const getBoard = (document: ProjectDocument, boardId: BoardId): Board | undefined =>
  document.boardsById[boardId];

const getCanonicalBoard = (document: ProjectDocument, boardId: BoardId): Board | undefined =>
  document.boardIds.includes(boardId) || document.trashedBoardIds.includes(boardId)
    ? getBoard(document, boardId)
    : undefined;

const isValidSelectedAlternate = (
  alternateIds: readonly BoardId[],
  selectedAlternateId: BoardId | null,
): boolean => selectedAlternateId === null || alternateIds.includes(selectedAlternateId);

const applyCreateBoard = (
  document: ProjectDocument,
  command: CreateBoardCommand,
): CommandApplication => {
  if (Object.hasOwn(document.boardsById, command.board.id)) {
    return {
      ok: false,
      code: 'conflict',
      message: `Board '${command.board.id}' already exists.`,
    };
  }
  if (command.index > document.boardIds.length) {
    return {
      ok: false,
      code: 'out-of-range',
      message: `Board insertion index ${String(command.index)} exceeds ${String(document.boardIds.length)}.`,
    };
  }

  const boardIds = [...document.boardIds];
  boardIds.splice(command.index, 0, command.board.id);
  const boardsById = Object.freeze({
    ...document.boardsById,
    [command.board.id]: command.board,
  });

  return {
    ok: true,
    changed: true,
    candidate: createBoardRevision(document, {
      boardIds: Object.freeze(boardIds),
      boardsById,
    }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.deleteBoard,
      boardId: command.board.id,
    },
    label: `Create board “${command.board.name}”`,
  };
};

const applyDeleteBoard = (
  document: ProjectDocument,
  command: DeleteBoardCommand,
): CommandApplication => {
  const board = getBoard(document, command.boardId);
  if (board === undefined) {
    return {
      ok: false,
      code: 'not-found',
      message: `Board '${command.boardId}' does not exist.`,
    };
  }
  if (board.childIds.length > 0) {
    return {
      ok: false,
      code: 'conflict',
      message: `Board '${command.boardId}' must be empty before it can be deleted.`,
    };
  }
  if (board.alternateIds.length > 0) {
    return {
      ok: false,
      code: 'conflict',
      message: `Board '${command.boardId}' must have no alternates before it can be deleted.`,
    };
  }

  const linkingElement = Object.values(document.elementsById).find(
    (element) => element.link?.kind === 'board' && element.link.boardId === command.boardId,
  );
  if (linkingElement !== undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Board '${command.boardId}' is linked from element '${linkingElement.id}'.`,
    };
  }

  const index = document.boardIds.indexOf(command.boardId);
  if (index < 0) {
    return {
      ok: false,
      code: 'conflict',
      message: `Board '${command.boardId}' is missing from board order.`,
    };
  }

  const mutableBoardsById: Record<string, Board> = { ...document.boardsById };
  delete mutableBoardsById[command.boardId];
  const boardsById = Object.freeze(mutableBoardsById);

  return {
    ok: true,
    changed: true,
    candidate: createBoardRevision(document, {
      boardIds: Object.freeze(document.boardIds.filter((boardId) => boardId !== command.boardId)),
      boardsById,
    }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.createBoard,
      board,
      index,
    },
    label: `Delete board “${board.name}”`,
  };
};

const applyCreateAlternate = (
  document: ProjectDocument,
  command: CreateAlternateCommand,
): CommandApplication => {
  const canonicalBoard = getCanonicalBoard(document, command.canonicalBoardId);
  if (canonicalBoard === undefined) {
    return {
      ok: false,
      code: 'not-found',
      message: `Canonical board '${command.canonicalBoardId}' does not exist.`,
    };
  }
  if (Object.hasOwn(document.boardsById, command.alternate.id)) {
    return {
      ok: false,
      code: 'conflict',
      message: `Board '${command.alternate.id}' already exists.`,
    };
  }
  if (command.index > canonicalBoard.alternateIds.length) {
    return {
      ok: false,
      code: 'out-of-range',
      message: `Alternate insertion index ${String(command.index)} exceeds ${String(canonicalBoard.alternateIds.length)}.`,
    };
  }

  const alternateIds = [...canonicalBoard.alternateIds];
  alternateIds.splice(command.index, 0, command.alternate.id);
  if (!isValidSelectedAlternate(alternateIds, command.selectAfterCreate)) {
    return {
      ok: false,
      code: 'conflict',
      message: `Selected alternate '${String(command.selectAfterCreate)}' is not in the resulting board family.`,
    };
  }

  const updatedCanonicalBoard = Object.freeze({
    ...canonicalBoard,
    alternateIds: Object.freeze(alternateIds),
    selectedAlternateId: command.selectAfterCreate,
  });
  const boardsById = Object.freeze({
    ...document.boardsById,
    [canonicalBoard.id]: updatedCanonicalBoard,
    [command.alternate.id]: command.alternate,
  });

  return {
    ok: true,
    changed: true,
    candidate: createBoardRevision(document, { boardsById }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.deleteAlternate,
      canonicalBoardId: canonicalBoard.id,
      alternateId: command.alternate.id,
      selectAfterDelete: canonicalBoard.selectedAlternateId,
    },
    label: `Create alternate “${command.alternate.name}”`,
  };
};

const applyDeleteAlternate = (
  document: ProjectDocument,
  command: DeleteAlternateCommand,
): CommandApplication => {
  const canonicalBoard = getCanonicalBoard(document, command.canonicalBoardId);
  const alternate = getBoard(document, command.alternateId);
  const index = canonicalBoard?.alternateIds.indexOf(command.alternateId) ?? -1;
  if (canonicalBoard === undefined || alternate === undefined || index < 0) {
    return {
      ok: false,
      code: 'not-found',
      message: `Alternate '${command.alternateId}' does not belong to canonical board '${command.canonicalBoardId}'.`,
    };
  }
  if (alternate.childIds.length > 0) {
    return {
      ok: false,
      code: 'conflict',
      message: `Alternate '${command.alternateId}' must be empty before it can be deleted.`,
    };
  }

  const alternateIds = canonicalBoard.alternateIds.filter(
    (alternateId) => alternateId !== command.alternateId,
  );
  if (!isValidSelectedAlternate(alternateIds, command.selectAfterDelete)) {
    return {
      ok: false,
      code: 'conflict',
      message: `Selected alternate '${String(command.selectAfterDelete)}' is not in the resulting board family.`,
    };
  }

  const updatedCanonicalBoard = Object.freeze({
    ...canonicalBoard,
    alternateIds: Object.freeze(alternateIds),
    selectedAlternateId: command.selectAfterDelete,
  });
  const mutableBoardsById: Record<string, Board> = {
    ...document.boardsById,
    [canonicalBoard.id]: updatedCanonicalBoard,
  };
  delete mutableBoardsById[alternate.id];

  return {
    ok: true,
    changed: true,
    candidate: createBoardRevision(document, {
      boardsById: Object.freeze(mutableBoardsById),
    }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.createAlternate,
      canonicalBoardId: canonicalBoard.id,
      alternate,
      index,
      selectAfterCreate: canonicalBoard.selectedAlternateId,
    },
    label: `Delete alternate “${alternate.name}”`,
  };
};

const applyTrashBoard = (
  document: ProjectDocument,
  command: TrashBoardCommand,
): CommandApplication => {
  const board = getBoard(document, command.boardId);
  const activeIndex = document.boardIds.indexOf(command.boardId);
  if (board === undefined || activeIndex < 0) {
    return {
      ok: false,
      code: 'not-found',
      message: `Active board '${command.boardId}' does not exist.`,
    };
  }
  if (document.boardIds.length <= 1) {
    return {
      ok: false,
      code: 'conflict',
      message: 'The final active board cannot be moved to trash.',
    };
  }
  if (command.toIndex > document.trashedBoardIds.length) {
    return {
      ok: false,
      code: 'out-of-range',
      message: `Trash insertion index ${String(command.toIndex)} exceeds ${String(document.trashedBoardIds.length)}.`,
    };
  }

  const boardIds = document.boardIds.filter((boardId) => boardId !== command.boardId);
  const trashedBoardIds = [...document.trashedBoardIds];
  trashedBoardIds.splice(command.toIndex, 0, command.boardId);

  return {
    ok: true,
    changed: true,
    candidate: createBoardRevision(document, {
      boardIds: Object.freeze(boardIds),
      trashedBoardIds: Object.freeze(trashedBoardIds),
    }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.restoreBoard,
      boardId: command.boardId,
      toIndex: activeIndex,
    },
    label: `Move board “${board.name}” to trash`,
  };
};

const applyRestoreBoard = (
  document: ProjectDocument,
  command: RestoreBoardCommand,
): CommandApplication => {
  const board = getBoard(document, command.boardId);
  const trashIndex = document.trashedBoardIds.indexOf(command.boardId);
  if (board === undefined || trashIndex < 0) {
    return {
      ok: false,
      code: 'not-found',
      message: `Trashed board '${command.boardId}' does not exist.`,
    };
  }
  if (command.toIndex > document.boardIds.length) {
    return {
      ok: false,
      code: 'out-of-range',
      message: `Board restore index ${String(command.toIndex)} exceeds ${String(document.boardIds.length)}.`,
    };
  }

  const boardIds = [...document.boardIds];
  boardIds.splice(command.toIndex, 0, command.boardId);
  const trashedBoardIds = document.trashedBoardIds.filter((boardId) => boardId !== command.boardId);

  return {
    ok: true,
    changed: true,
    candidate: createBoardRevision(document, {
      boardIds: Object.freeze(boardIds),
      trashedBoardIds: Object.freeze(trashedBoardIds),
    }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.trashBoard,
      boardId: command.boardId,
      toIndex: trashIndex,
    },
    label: `Restore board “${board.name}”`,
  };
};

const applyReorderBoard = (
  document: ProjectDocument,
  command: ReorderBoardCommand,
): CommandApplication => {
  const fromIndex = document.boardIds.indexOf(command.boardId);
  if (fromIndex < 0 || getBoard(document, command.boardId) === undefined) {
    return {
      ok: false,
      code: 'not-found',
      message: `Board '${command.boardId}' does not exist.`,
    };
  }
  if (command.toIndex >= document.boardIds.length) {
    return {
      ok: false,
      code: 'out-of-range',
      message: `Board destination index ${String(command.toIndex)} exceeds ${String(document.boardIds.length - 1)}.`,
    };
  }
  if (fromIndex === command.toIndex) {
    return { ok: true, changed: false, label: 'Reorder board' };
  }

  const boardIds = [...document.boardIds];
  boardIds.splice(fromIndex, 1);
  boardIds.splice(command.toIndex, 0, command.boardId);

  return {
    ok: true,
    changed: true,
    candidate: createBoardRevision(document, {
      boardIds: Object.freeze(boardIds),
    }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.reorderBoard,
      boardId: command.boardId,
      toIndex: fromIndex,
    },
    label: 'Reorder board',
  };
};

const applyRenameBoard = (
  document: ProjectDocument,
  command: RenameBoardCommand,
): CommandApplication => {
  const board = getBoard(document, command.boardId);
  if (board === undefined) {
    return {
      ok: false,
      code: 'not-found',
      message: `Board '${command.boardId}' does not exist.`,
    };
  }
  if (board.name === command.name) {
    return { ok: true, changed: false, label: 'Rename board' };
  }

  const renamedBoard = Object.freeze({ ...board, name: command.name });
  const boardsById = Object.freeze({
    ...document.boardsById,
    [command.boardId]: renamedBoard,
  });

  return {
    ok: true,
    changed: true,
    candidate: createBoardRevision(document, { boardsById }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.renameBoard,
      boardId: command.boardId,
      name: board.name,
    },
    label: `Rename board to “${command.name}”`,
  };
};

const applySetBoardNote = (
  document: ProjectDocument,
  command: SetBoardNoteCommand,
): CommandApplication => {
  const board = getBoard(document, command.boardId);
  if (board === undefined) {
    return {
      ok: false,
      code: 'not-found',
      message: `Board '${command.boardId}' does not exist.`,
    };
  }
  if (board.note.text === command.note.text) {
    return { ok: true, changed: false, label: 'Edit board note' };
  }

  const updatedBoard = Object.freeze({ ...board, note: command.note });
  const boardsById = Object.freeze({
    ...document.boardsById,
    [command.boardId]: updatedBoard,
  });

  return {
    ok: true,
    changed: true,
    candidate: createBoardRevision(document, { boardsById }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.setBoardNote,
      boardId: command.boardId,
      note: board.note,
    },
    label: 'Edit board note',
  };
};

const applySelectBoardVersion = (
  document: ProjectDocument,
  command: SelectBoardVersionCommand,
): CommandApplication => {
  const canonicalBoard = getCanonicalBoard(document, command.canonicalBoardId);
  if (canonicalBoard === undefined) {
    return {
      ok: false,
      code: 'not-found',
      message: `Canonical board '${command.canonicalBoardId}' does not exist.`,
    };
  }
  if (!isValidSelectedAlternate(canonicalBoard.alternateIds, command.alternateId)) {
    return {
      ok: false,
      code: 'not-found',
      message: `Alternate '${String(command.alternateId)}' does not belong to canonical board '${command.canonicalBoardId}'.`,
    };
  }
  if (canonicalBoard.selectedAlternateId === command.alternateId) {
    return { ok: true, changed: false, label: 'Select board version' };
  }

  const updatedCanonicalBoard = Object.freeze({
    ...canonicalBoard,
    selectedAlternateId: command.alternateId,
  });
  const boardsById = Object.freeze({
    ...document.boardsById,
    [canonicalBoard.id]: updatedCanonicalBoard,
  });

  return {
    ok: true,
    changed: true,
    candidate: createBoardRevision(document, { boardsById }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.selectBoardVersion,
      canonicalBoardId: canonicalBoard.id,
      alternateId: canonicalBoard.selectedAlternateId,
    },
    label: 'Select board version',
  };
};

const assertNever = (command: never): never => {
  throw new Error(`Unhandled document command: ${JSON.stringify(command)}`);
};

export const applyBoardCommand = (
  document: ProjectDocument,
  command: BoardCommand,
): CommandApplication => {
  switch (command.type) {
    case DOCUMENT_COMMAND_TYPES.createBoard:
      return applyCreateBoard(document, command);
    case DOCUMENT_COMMAND_TYPES.createAlternate:
      return applyCreateAlternate(document, command);
    case DOCUMENT_COMMAND_TYPES.deleteBoard:
      return applyDeleteBoard(document, command);
    case DOCUMENT_COMMAND_TYPES.deleteAlternate:
      return applyDeleteAlternate(document, command);
    case DOCUMENT_COMMAND_TYPES.restoreBoard:
      return applyRestoreBoard(document, command);
    case DOCUMENT_COMMAND_TYPES.reorderBoard:
      return applyReorderBoard(document, command);
    case DOCUMENT_COMMAND_TYPES.renameBoard:
      return applyRenameBoard(document, command);
    case DOCUMENT_COMMAND_TYPES.setBoardNote:
      return applySetBoardNote(document, command);
    case DOCUMENT_COMMAND_TYPES.selectBoardVersion:
      return applySelectBoardVersion(document, command);
    case DOCUMENT_COMMAND_TYPES.trashBoard:
      return applyTrashBoard(document, command);
    default:
      return assertNever(command);
  }
};
