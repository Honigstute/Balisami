// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  BoardSchema,
  DOCUMENT_COMMAND_TYPES,
  ProjectIdSchema,
  createEmptyProjectDocument,
  dispatchDocumentCommand,
} from '../src/domain';
import {
  createBoardCreationCommand,
  getNextDefaultBoardName,
} from '../src/renderer/projects/board-creation';

const FIRST_BOARD_ID = BoardIdSchema.parse('board_create001');
const SECOND_BOARD_ID = BoardIdSchema.parse('board_create002');
const THIRD_BOARD_ID = BoardIdSchema.parse('board_create003');

const createDocument = () => {
  const initial = createEmptyProjectDocument({
    boardId: FIRST_BOARD_ID,
    projectId: ProjectIdSchema.parse('project_create001'),
  });
  if (!initial.ok) {
    throw new Error('Board creation fixture is invalid.');
  }
  return initial.value;
};

describe('board creation', () => {
  it('creates an empty board at the end through the validated command boundary', () => {
    const document = createDocument();
    const command = createBoardCreationCommand(document, SECOND_BOARD_ID);

    expect(command).toEqual({
      type: DOCUMENT_COMMAND_TYPES.createBoard,
      board: {
        childIds: [],
        id: SECOND_BOARD_ID,
        name: 'Wireframe 2',
        note: { text: '' },
      },
      index: 1,
    });
    if (command === undefined) {
      throw new Error('Expected a board creation command.');
    }
    const result = dispatchDocumentCommand(document, command);
    expect(result.ok && result.changed ? result.document.boardIds : undefined).toEqual([
      FIRST_BOARD_ID,
      SECOND_BOARD_ID,
    ]);
  });

  it('chooses the first unused default title and rejects colliding IDs', () => {
    const document = createDocument();
    const withGap = dispatchDocumentCommand(document, {
      type: DOCUMENT_COMMAND_TYPES.createBoard,
      board: BoardSchema.parse({
        childIds: [],
        id: SECOND_BOARD_ID,
        name: 'Wireframe 3',
        note: { text: '' },
      }),
      index: 1,
    });
    if (!withGap.ok || !withGap.changed) {
      throw new Error('Board creation fixture could not add its second board.');
    }

    expect(getNextDefaultBoardName(withGap.document)).toBe('Wireframe 2');
    expect(createBoardCreationCommand(withGap.document, FIRST_BOARD_ID)).toBeUndefined();
    expect(createBoardCreationCommand(withGap.document, THIRD_BOARD_ID)?.board.name).toBe(
      'Wireframe 2',
    );
  });
});
