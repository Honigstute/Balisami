import type { BoardId } from '../document/ids';
import type { Board } from '../document/schema';
import type { ProjectDocument } from '../document/validation';
import type { CommandApplication } from './application';
import {
  DOCUMENT_COMMAND_TYPES,
  type BoardCommand,
  type CreateBoardCommand,
  type DeleteBoardCommand,
  type RenameBoardCommand,
  type ReorderBoardCommand,
  type SetBoardNoteCommand,
} from './schema';

type BoardDocumentPatch = Partial<Pick<ProjectDocument, 'boardIds' | 'boardsById'>>;

const createBoardRevision = (
  document: ProjectDocument,
  patch: BoardDocumentPatch,
): ProjectDocument => Object.freeze({ ...document, ...patch });

const getBoard = (document: ProjectDocument, boardId: BoardId): Board | undefined =>
  document.boardsById[boardId];

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
    case DOCUMENT_COMMAND_TYPES.deleteBoard:
      return applyDeleteBoard(document, command);
    case DOCUMENT_COMMAND_TYPES.reorderBoard:
      return applyReorderBoard(document, command);
    case DOCUMENT_COMMAND_TYPES.renameBoard:
      return applyRenameBoard(document, command);
    case DOCUMENT_COMMAND_TYPES.setBoardNote:
      return applySetBoardNote(document, command);
    default:
      return assertNever(command);
  }
};
