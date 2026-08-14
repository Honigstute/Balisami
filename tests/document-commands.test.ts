import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  BoardSchema,
  DOCUMENT_COMMAND_TYPES,
  MAX_COMMAND_VALIDATION_ISSUES,
  dispatchDocumentCommand,
  parseProjectDocument,
  type Board,
  type DocumentCommandResult,
  type ProjectDocument,
} from '../src/domain';
import {
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  type ProjectDocumentInputFixture,
} from './fixtures/project-document';

type AppliedCommand = Extract<DocumentCommandResult, { readonly changed: true; readonly ok: true }>;
type FailedCommand = Extract<DocumentCommandResult, { readonly ok: false }>;
type UnchangedCommand = Extract<
  DocumentCommandResult,
  { readonly changed: false; readonly ok: true }
>;

const SECONDARY_BOARD_ID = BoardIdSchema.parse('board_secondary1');
const NEW_BOARD_ID = BoardIdSchema.parse('board_newboard01');

const parseFixture = (input: unknown): ProjectDocument => {
  const result = parseProjectDocument(input);
  if (!result.ok) {
    throw new Error(`Fixture is invalid: ${JSON.stringify(result.issues)}`);
  }
  return result.value;
};

const createEmptyDocument = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  input.boardIds = [];
  input.boardsById = {};
  input.elementsById = {};
  input.assetsById = {};
  return parseFixture(input);
};

const createBoard = (id = NEW_BOARD_ID, name = 'New wireframe'): Board =>
  BoardSchema.parse({
    id,
    name,
    note: { text: '' },
    childIds: [],
  });

const getFixtureElement = (input: ProjectDocumentInputFixture) => {
  const element = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
  if (element === undefined) {
    throw new Error('Fixture child element is missing.');
  }
  return element;
};

const createTwoBoardDocument = (linkToSecondary = false): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  input.boardIds.push(SECONDARY_BOARD_ID);
  const secondaryBoard = createBoard(SECONDARY_BOARD_ID, 'Secondary wireframe');
  input.boardsById[SECONDARY_BOARD_ID] = {
    ...secondaryBoard,
    note: { ...secondaryBoard.note },
    childIds: [...secondaryBoard.childIds],
  };
  if (linkToSecondary) {
    getFixtureElement(input).link = { kind: 'board', boardId: SECONDARY_BOARD_ID };
  }
  return parseFixture(input);
};

const expectApplied = (document: ProjectDocument, command: unknown): AppliedCommand => {
  const result = dispatchDocumentCommand(document, command);
  expect(result.ok).toBe(true);
  if (!result.ok || !result.changed) {
    throw new Error(`Expected command to apply: ${JSON.stringify(result)}`);
  }
  return result;
};

const expectFailure = (document: ProjectDocument, command: unknown): FailedCommand => {
  const result = dispatchDocumentCommand(document, command);
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error('Expected command to fail.');
  }
  return result;
};

const expectUnchanged = (document: ProjectDocument, command: unknown): UnchangedCommand => {
  const result = dispatchDocumentCommand(document, command);
  expect(result).toMatchObject({ ok: true, changed: false });
  if (!result.ok || result.changed) {
    throw new Error('Expected command to be unchanged.');
  }
  return result;
};

const expectInverseRestores = (before: ProjectDocument, applied: AppliedCommand): void => {
  const restored = expectApplied(applied.document, applied.inverse);
  expect(restored.document).toEqual(before);
  expect(JSON.stringify(restored.document)).toBe(JSON.stringify(before));
};

describe('document command dispatcher', () => {
  it('creates an empty board at an explicit order index and produces an exact inverse', () => {
    const document = createEmptyDocument();
    const board = createBoard();

    const result = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.createBoard,
      board,
      index: 0,
    });

    expect(result.document.boardIds).toEqual([NEW_BOARD_ID]);
    expect(result.document.boardsById[NEW_BOARD_ID]).toEqual(board);
    expect(result.label).toBe('Create board “New wireframe”');
    expect(result.inverse).toEqual({
      type: DOCUMENT_COMMAND_TYPES.deleteBoard,
      boardId: NEW_BOARD_ID,
    });
    expect(Object.isFrozen(result.command)).toBe(true);
    expect(Object.isFrozen(result.inverse)).toBe(true);
    expect(Object.isFrozen(result.document)).toBe(true);
    expectInverseRestores(document, result);
  });

  it('rejects duplicate IDs, non-empty create payloads, and out-of-range insertion', () => {
    const document = parseFixture(createValidProjectDocumentInput());
    const originalJson = JSON.stringify(document);

    const duplicate = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.createBoard,
      board: createBoard(DOCUMENT_FIXTURE_IDS.board),
      index: 1,
    });
    expect(duplicate.error.code).toBe('conflict');

    const nonEmpty = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.createBoard,
      board: {
        ...createBoard(),
        childIds: [DOCUMENT_FIXTURE_IDS.child],
      },
      index: 1,
    });
    expect(nonEmpty.error.code).toBe('invalid-command');
    expect(nonEmpty.error.issues.map((issue) => issue.path.join('.'))).toContain('board.childIds');

    const outOfRange = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.createBoard,
      board: createBoard(),
      index: 2,
    });
    expect(outOfRange.error.code).toBe('out-of-range');

    for (const failure of [duplicate, nonEmpty, outOfRange]) {
      expect(failure.document).toBe(document);
    }
    expect(JSON.stringify(document)).toBe(originalJson);
  });

  it('renames a board with normalized input, reports no-ops, and restores the prior name', () => {
    const document = parseFixture(createValidProjectDocumentInput());

    const renamed = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.renameBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      name: '  Checkout flow  ',
    });

    expect(renamed.document.boardsById[DOCUMENT_FIXTURE_IDS.board]?.name).toBe('Checkout flow');
    expect(renamed.command).toMatchObject({ name: 'Checkout flow' });
    expect(renamed.label).toBe('Rename board to “Checkout flow”');
    expect(renamed.document.boardIds).toBe(document.boardIds);
    expect(renamed.document.elementsById).toBe(document.elementsById);
    expect(renamed.document.assetsById).toBe(document.assetsById);
    expect(Object.isFrozen(renamed.document.boardsById)).toBe(true);
    expectInverseRestores(document, renamed);

    const unchanged = expectUnchanged(document, {
      type: DOCUMENT_COMMAND_TYPES.renameBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      name: 'Main wireframe',
    });
    expect(unchanged.document).toBe(document);
  });

  it('edits board notes through an invertible command', () => {
    const document = parseFixture(createValidProjectDocumentInput());

    const edited = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.setBoardNote,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      note: { text: 'Review with the client.' },
    });

    expect(edited.document.boardsById[DOCUMENT_FIXTURE_IDS.board]?.note.text).toBe(
      'Review with the client.',
    );
    expect(edited.label).toBe('Edit board note');
    expect(edited.document.elementsById).toBe(document.elementsById);
    expect(edited.document.assetsById).toBe(document.assetsById);
    expectInverseRestores(document, edited);
  });

  it('reorders boards without changing their records and produces an exact inverse', () => {
    const document = createTwoBoardDocument();

    const reordered = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.reorderBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      toIndex: 1,
    });

    expect(reordered.document.boardIds).toEqual([SECONDARY_BOARD_ID, DOCUMENT_FIXTURE_IDS.board]);
    expect(reordered.document.boardsById).toBe(document.boardsById);
    expectInverseRestores(document, reordered);

    const unchanged = expectUnchanged(document, {
      type: DOCUMENT_COMMAND_TYPES.reorderBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      toIndex: 0,
    });
    expect(unchanged.document).toBe(document);

    const outOfRange = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.reorderBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      toIndex: 2,
    });
    expect(outOfRange.error.code).toBe('out-of-range');
  });

  it('deletes only empty, unlinked boards and restores their exact record and position', () => {
    const document = createTwoBoardDocument();

    const deleted = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.deleteBoard,
      boardId: SECONDARY_BOARD_ID,
    });

    expect(deleted.document.boardIds).toEqual([DOCUMENT_FIXTURE_IDS.board]);
    expect(deleted.document.boardsById[SECONDARY_BOARD_ID]).toBeUndefined();
    expect(deleted.label).toBe('Delete board “Secondary wireframe”');
    expect(deleted.document.elementsById).toBe(document.elementsById);
    expect(deleted.document.assetsById).toBe(document.assetsById);
    expectInverseRestores(document, deleted);

    const nonEmpty = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.deleteBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
    });
    expect(nonEmpty.error).toMatchObject({ code: 'conflict' });

    const linkedDocument = createTwoBoardDocument(true);
    const linked = expectFailure(linkedDocument, {
      type: DOCUMENT_COMMAND_TYPES.deleteBoard,
      boardId: SECONDARY_BOARD_ID,
    });
    expect(linked.error).toMatchObject({ code: 'conflict' });
    expect(linked.error.message).toContain(DOCUMENT_FIXTURE_IDS.child);
  });

  it('returns not-found without mutation for commands targeting an absent board', () => {
    const document = parseFixture(createValidProjectDocumentInput());

    for (const command of [
      {
        type: DOCUMENT_COMMAND_TYPES.deleteBoard,
        boardId: SECONDARY_BOARD_ID,
      },
      {
        type: DOCUMENT_COMMAND_TYPES.renameBoard,
        boardId: SECONDARY_BOARD_ID,
        name: 'Missing',
      },
      {
        type: DOCUMENT_COMMAND_TYPES.reorderBoard,
        boardId: SECONDARY_BOARD_ID,
        toIndex: 0,
      },
      {
        type: DOCUMENT_COMMAND_TYPES.setBoardNote,
        boardId: SECONDARY_BOARD_ID,
        note: { text: 'Missing' },
      },
    ]) {
      const result = expectFailure(document, command);
      expect(result.error.code).toBe('not-found');
      expect(result.document).toBe(document);
    }
  });

  it('caps malformed command feedback and never returns a candidate document', () => {
    const document = createEmptyDocument();
    const invalidChildIds = Array.from({ length: 25 }, (_, index) => `invalid-${String(index)}`);

    const result = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.createBoard,
      board: {
        id: NEW_BOARD_ID,
        name: '',
        note: { text: '' },
        childIds: invalidChildIds,
      },
      index: 0,
    });

    expect(result.error.code).toBe('invalid-command');
    expect(result.error.issues).toHaveLength(MAX_COMMAND_VALIDATION_ISSUES);
    expect(result.error.omittedIssueCount).toBeGreaterThan(0);
    expect(result.document).toBe(document);
  });
});
