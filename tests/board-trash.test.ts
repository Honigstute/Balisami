import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  DOCUMENT_COMMAND_TYPES,
  dispatchDocumentCommand,
  parseProjectDocument,
  type ProjectDocument,
} from '../src/domain';
import {
  createBoardRestoreCommand,
  createBoardTrashCommand,
  selectBoardAfterTrash,
} from '../src/renderer/projects/board-trash';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const SECOND_BOARD_ID = BoardIdSchema.parse('board_trashsecond');

const createTwoBoardDocument = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  input.boardIds.push(SECOND_BOARD_ID);
  input.boardsById[SECOND_BOARD_ID] = {
    id: SECOND_BOARD_ID,
    name: 'Second board',
    note: { text: '' },
    childIds: [],
    alternateIds: [],
    selectedAlternateId: null,
  };
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) {
    throw new Error('Trash planner fixture is invalid.');
  }
  return parsed.value;
};

describe('board trash planning', () => {
  it('plans append-only trash and restore commands at canonical order boundaries', () => {
    const document = createTwoBoardDocument();
    const trash = createBoardTrashCommand(document, DOCUMENT_FIXTURE_IDS.board);
    expect(trash).toEqual({
      type: DOCUMENT_COMMAND_TYPES.trashBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      toIndex: 0,
    });
    if (trash === undefined) {
      throw new Error('Expected a trash command.');
    }
    const trashed = dispatchDocumentCommand(document, trash);
    if (!trashed.ok || !trashed.changed) {
      throw new Error('Expected trash command to apply.');
    }
    expect(createBoardRestoreCommand(trashed.document, DOCUMENT_FIXTURE_IDS.board)).toEqual({
      type: DOCUMENT_COMMAND_TYPES.restoreBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      toIndex: 1,
    });
  });

  it('rejects stale/final targets and chooses the nearest surviving active row', () => {
    const document = createTwoBoardDocument();
    expect(selectBoardAfterTrash(document, DOCUMENT_FIXTURE_IDS.board)).toBe(SECOND_BOARD_ID);
    expect(selectBoardAfterTrash(document, SECOND_BOARD_ID)).toBe(DOCUMENT_FIXTURE_IDS.board);
    expect(createBoardRestoreCommand(document, DOCUMENT_FIXTURE_IDS.board)).toBeUndefined();

    const oneBoard = createValidProjectDocumentInput();
    const parsed = parseProjectDocument(oneBoard);
    if (!parsed.ok) {
      throw new Error('One-board fixture is invalid.');
    }
    expect(createBoardTrashCommand(parsed.value, DOCUMENT_FIXTURE_IDS.board)).toBeUndefined();
    expect(selectBoardAfterTrash(parsed.value, DOCUMENT_FIXTURE_IDS.board)).toBeUndefined();
  });
});
