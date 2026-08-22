import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  BoardSchema,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  ElementNodeSchema,
  FOUNDATION_CONTROL_TYPES,
  MAX_COMMAND_VALIDATION_ISSUES,
  dispatchDocumentCommand,
  parseProjectDocument,
  type Board,
  type DocumentCommandResult,
  type ElementNode,
  type ProjectDocument,
} from '../src/domain';
import {
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  getFixtureControlVersion,
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
const NEW_ELEMENT_ID = ElementIdSchema.parse('element_newnode01');
const SECOND_NEW_ELEMENT_ID = ElementIdSchema.parse('element_newnode02');
const MISSING_ELEMENT_ID = ElementIdSchema.parse('element_missing01');

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

const createElement = (
  id = NEW_ELEMENT_ID,
  controlType: string = FOUNDATION_CONTROL_TYPES.rectangle,
): ElementNode =>
  ElementNodeSchema.parse({
    id,
    controlType,
    controlVersion:
      controlType === 'foundation.unknown' ? 1 : getFixtureControlVersion(controlType),
    frame: { x: 40, y: 60, width: 160, height: 80 },
    locked: false,
    properties: { label: 'New element' },
    childIds: [],
    assetIds: [],
    link: null,
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

  it('moves a complete board to durable trash and restores its exact active position', () => {
    const document = createTwoBoardDocument();

    const trashed = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.trashBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      toIndex: 0,
    });

    expect(trashed.document.boardIds).toEqual([SECONDARY_BOARD_ID]);
    expect(trashed.document.trashedBoardIds).toEqual([DOCUMENT_FIXTURE_IDS.board]);
    expect(trashed.document.boardsById).toBe(document.boardsById);
    expect(trashed.document.elementsById).toBe(document.elementsById);
    expect(trashed.document.assetsById).toBe(document.assetsById);
    expect(trashed.document.boardsById[DOCUMENT_FIXTURE_IDS.board]).toEqual(
      document.boardsById[DOCUMENT_FIXTURE_IDS.board],
    );
    expect(trashed.label).toBe('Move board “Main wireframe” to trash');
    expect(trashed.inverse).toEqual({
      type: DOCUMENT_COMMAND_TYPES.restoreBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      toIndex: 0,
    });
    expectInverseRestores(document, trashed);

    const restored = expectApplied(trashed.document, trashed.inverse);
    expect(restored.label).toBe('Restore board “Main wireframe”');
    expect(restored.inverse).toEqual({
      type: DOCUMENT_COMMAND_TYPES.trashBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      toIndex: 0,
    });
  });

  it('protects the final active board and validates both trash insertion orders', () => {
    const oneBoard = parseFixture(createValidProjectDocumentInput());
    const finalBoard = expectFailure(oneBoard, {
      type: DOCUMENT_COMMAND_TYPES.trashBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      toIndex: 0,
    });
    expect(finalBoard.error).toMatchObject({ code: 'conflict' });

    const twoBoards = createTwoBoardDocument();
    expectFailure(twoBoards, {
      type: DOCUMENT_COMMAND_TYPES.trashBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      toIndex: 1,
    });
    expectFailure(twoBoards, {
      type: DOCUMENT_COMMAND_TYPES.restoreBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      toIndex: 0,
    });

    const trashed = expectApplied(twoBoards, {
      type: DOCUMENT_COMMAND_TYPES.trashBoard,
      boardId: SECONDARY_BOARD_ID,
      toIndex: 0,
    });
    const invalidRestore = expectFailure(trashed.document, {
      type: DOCUMENT_COMMAND_TYPES.restoreBoard,
      boardId: SECONDARY_BOARD_ID,
      toIndex: 2,
    });
    expect(invalidRestore.error).toMatchObject({ code: 'out-of-range' });
  });

  it('returns not-found without mutation for commands targeting an absent board', () => {
    const document = parseFixture(createValidProjectDocumentInput());

    for (const command of [
      {
        type: DOCUMENT_COMMAND_TYPES.deleteBoard,
        boardId: SECONDARY_BOARD_ID,
      },
      {
        type: DOCUMENT_COMMAND_TYPES.trashBoard,
        boardId: SECONDARY_BOARD_ID,
        toIndex: 0,
      },
      {
        type: DOCUMENT_COMMAND_TYPES.restoreBoard,
        boardId: SECONDARY_BOARD_ID,
        toIndex: 0,
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

describe('element document commands', () => {
  it('creates root and nested elements at explicit local order positions', () => {
    const document = parseFixture(createValidProjectDocumentInput());
    const rootElement = createElement();

    const rootCreated = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: rootElement,
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      index: 1,
    });

    expect(rootCreated.document.boardsById[DOCUMENT_FIXTURE_IDS.board]?.childIds).toEqual([
      DOCUMENT_FIXTURE_IDS.group,
      NEW_ELEMENT_ID,
    ]);
    expect(rootCreated.document.elementsById[NEW_ELEMENT_ID]).toEqual(rootElement);
    expect(rootCreated.document.elementsById[DOCUMENT_FIXTURE_IDS.group]).toBe(
      document.elementsById[DOCUMENT_FIXTURE_IDS.group],
    );
    expect(rootCreated.document.boardIds).toBe(document.boardIds);
    expect(rootCreated.document.assetsById).toBe(document.assetsById);
    expect(Object.isFrozen(rootCreated.document.elementsById)).toBe(true);
    expect(
      Object.isFrozen(rootCreated.document.boardsById[DOCUMENT_FIXTURE_IDS.board]?.childIds),
    ).toBe(true);
    expect(rootCreated.inverse).toEqual({
      type: DOCUMENT_COMMAND_TYPES.deleteElement,
      elementId: NEW_ELEMENT_ID,
    });
    expectInverseRestores(document, rootCreated);

    const nestedElement = createElement(SECOND_NEW_ELEMENT_ID);
    const nestedCreated = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: nestedElement,
      owner: { kind: 'element', elementId: DOCUMENT_FIXTURE_IDS.group },
      index: 1,
    });

    expect(nestedCreated.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.childIds).toEqual([
      DOCUMENT_FIXTURE_IDS.child,
      SECOND_NEW_ELEMENT_ID,
    ]);
    expect(nestedCreated.document.boardsById).toBe(document.boardsById);
    expect(nestedCreated.document.elementsById[DOCUMENT_FIXTURE_IDS.child]).toBe(
      document.elementsById[DOCUMENT_FIXTURE_IDS.child],
    );
    expectInverseRestores(document, nestedCreated);
  });

  it('rejects invalid, duplicate, unsupported, or illegally owned element creation', () => {
    const document = parseFixture(createValidProjectDocumentInput());

    const duplicate = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: createElement(DOCUMENT_FIXTURE_IDS.child),
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      index: 0,
    });
    expect(duplicate.error.code).toBe('conflict');

    const nonEmpty = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        ...createElement(),
        childIds: [DOCUMENT_FIXTURE_IDS.child],
      },
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      index: 0,
    });
    expect(nonEmpty.error.code).toBe('invalid-command');
    expect(nonEmpty.error.issues.map((issue) => issue.path.join('.'))).toContain(
      'element.childIds',
    );

    const missingOwner = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: createElement(),
      owner: { kind: 'element', elementId: MISSING_ELEMENT_ID },
      index: 0,
    });
    expect(missingOwner.error.code).toBe('not-found');

    const leafOwner = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: createElement(),
      owner: { kind: 'element', elementId: DOCUMENT_FIXTURE_IDS.child },
      index: 0,
    });
    expect(leafOwner.error.code).toBe('conflict');

    const unsupported = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: createElement(NEW_ELEMENT_ID, 'foundation.unknown'),
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      index: 0,
    });
    expect(unsupported.error.code).toBe('conflict');

    const staleVersion = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: { ...createElement(), controlVersion: 2 },
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      index: 0,
    });
    expect(staleVersion.error.code).toBe('conflict');

    const outOfRange = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: createElement(),
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      index: 2,
    });
    expect(outOfRange.error.code).toBe('out-of-range');

    for (const failure of [
      duplicate,
      nonEmpty,
      missingOwner,
      leafOwner,
      unsupported,
      staleVersion,
      outOfRange,
    ]) {
      expect(failure.document).toBe(document);
    }
  });

  it('rejects a structurally valid create command when references violate the document', () => {
    const document = parseFixture(createValidProjectDocumentInput());
    const invalidElement = {
      ...createElement(),
      link: { kind: 'board', boardId: 'board_missing01' },
    };

    const result = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: invalidElement,
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      index: 1,
    });

    expect(result.error.code).toBe('document-invalid');
    expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain(
      `elementsById.${NEW_ELEMENT_ID}.link.boardId`,
    );
    expect(result.document).toBe(document);
  });

  it('deletes a childless element and recreates its exact record and nested position', () => {
    const document = parseFixture(createValidProjectDocumentInput());

    const deleted = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.deleteElement,
      elementId: DOCUMENT_FIXTURE_IDS.child,
    });

    expect(deleted.document.elementsById[DOCUMENT_FIXTURE_IDS.child]).toBeUndefined();
    expect(deleted.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.childIds).toEqual([]);
    expect(deleted.document.boardsById).toBe(document.boardsById);
    expect(deleted.document.assetsById).toBe(document.assetsById);
    expect(deleted.inverse).toMatchObject({
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: document.elementsById[DOCUMENT_FIXTURE_IDS.child],
      owner: { kind: 'element', elementId: DOCUMENT_FIXTURE_IDS.group },
      index: 0,
    });
    expectInverseRestores(document, deleted);

    const nonEmpty = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.deleteElement,
      elementId: DOCUMENT_FIXTURE_IDS.group,
    });
    expect(nonEmpty.error.code).toBe('conflict');

    const missing = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.deleteElement,
      elementId: MISSING_ELEMENT_ID,
    });
    expect(missing.error.code).toBe('not-found');
  });

  it('changes local geometry through one invertible command and rejects invalid frames', () => {
    const document = parseFixture(createValidProjectDocumentInput());
    const frame = { x: -42.25, y: 9.5, width: 240, height: 72 };

    const changed = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementFrame,
      elementId: DOCUMENT_FIXTURE_IDS.child,
      frame,
    });

    expect(changed.document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.frame).toEqual(frame);
    expect(changed.document.elementsById[DOCUMENT_FIXTURE_IDS.group]).toBe(
      document.elementsById[DOCUMENT_FIXTURE_IDS.group],
    );
    expect(changed.document.boardsById).toBe(document.boardsById);
    expect(changed.document.assetsById).toBe(document.assetsById);
    expect(Object.isFrozen(changed.document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.frame)).toBe(
      true,
    );
    expectInverseRestores(document, changed);

    const unchanged = expectUnchanged(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementFrame,
      elementId: DOCUMENT_FIXTURE_IDS.child,
      frame: document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.frame,
    });
    expect(unchanged.document).toBe(document);

    const invalid = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementFrame,
      elementId: DOCUMENT_FIXTURE_IDS.child,
      frame: { x: Number.NaN, y: 0, width: 0, height: 20 },
    });
    expect(invalid.error.code).toBe('invalid-command');
    expect(invalid.document).toBe(document);
  });

  it('replaces JSON-safe properties, detects deep no-ops, and restores prior values', () => {
    const document = parseFixture(createValidProjectDocumentInput());
    const properties = {
      label: 'Checkout card',
      state: { disabled: false, variants: ['desktop', 'mobile'] },
    };

    const changed = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: DOCUMENT_FIXTURE_IDS.child,
      properties,
    });

    expect(changed.document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.properties).toEqual(
      properties,
    );
    expect(changed.document.elementsById[DOCUMENT_FIXTURE_IDS.group]).toBe(
      document.elementsById[DOCUMENT_FIXTURE_IDS.group],
    );
    expect(changed.document.boardsById).toBe(document.boardsById);
    expectInverseRestores(document, changed);

    const unchanged = expectUnchanged(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: DOCUMENT_FIXTURE_IDS.child,
      properties: { tags: ['example', true, null], opacity: 0.75 },
    });
    expect(unchanged.document).toBe(document);

    const invalid = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: DOCUMENT_FIXTURE_IDS.child,
      properties: { 'Unsafe key': Number.NaN },
    });
    expect(invalid.error.code).toBe('invalid-command');
  });

  it('sets validated board and HTTP(S) links with exact inverse and capability checks', () => {
    const document = createTwoBoardDocument();
    const boardLink = { kind: 'board' as const, boardId: SECONDARY_BOARD_ID };
    const linkedToBoard = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementLink,
      elementId: DOCUMENT_FIXTURE_IDS.child,
      link: boardLink,
    });
    expect(linkedToBoard.document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.link).toEqual(
      boardLink,
    );
    expect(linkedToBoard.document.boardsById).toBe(document.boardsById);
    expectInverseRestores(document, linkedToBoard);

    const externalLink = { kind: 'external' as const, url: 'https://example.com/checkout' };
    const linkedExternally = expectApplied(linkedToBoard.document, {
      type: DOCUMENT_COMMAND_TYPES.setElementLink,
      elementId: DOCUMENT_FIXTURE_IDS.child,
      link: externalLink,
    });
    expect(linkedExternally.document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.link).toEqual(
      externalLink,
    );
    expectInverseRestores(linkedToBoard.document, linkedExternally);

    const unchanged = expectUnchanged(linkedExternally.document, {
      type: DOCUMENT_COMMAND_TYPES.setElementLink,
      elementId: DOCUMENT_FIXTURE_IDS.child,
      link: { ...externalLink },
    });
    expect(unchanged.document).toBe(linkedExternally.document);

    const unsupported = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementLink,
      elementId: DOCUMENT_FIXTURE_IDS.group,
      link: boardLink,
    });
    expect(unsupported.error).toMatchObject({ code: 'conflict' });

    const missingBoard = expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementLink,
      elementId: DOCUMENT_FIXTURE_IDS.child,
      link: { kind: 'board', boardId: 'board_missing01' },
    });
    expect(missingBoard.error).toMatchObject({ code: 'not-found' });

    for (const invalidUrl of ['javascript:alert(1)', 'ftp://example.com', 'not a URL']) {
      const invalid = expectFailure(document, {
        type: DOCUMENT_COMMAND_TYPES.setElementLink,
        elementId: DOCUMENT_FIXTURE_IDS.child,
        link: { kind: 'external', url: invalidUrl },
      });
      expect(invalid.error.code).toBe('invalid-command');
    }
  });

  it('reorders root and nested siblings without changing element records', () => {
    const document = parseFixture(createValidProjectDocumentInput());
    const rootCreated = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: createElement(),
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      index: 1,
    });

    const rootReordered = expectApplied(rootCreated.document, {
      type: DOCUMENT_COMMAND_TYPES.reorderElement,
      elementId: NEW_ELEMENT_ID,
      toIndex: 0,
    });

    expect(rootReordered.document.boardsById[DOCUMENT_FIXTURE_IDS.board]?.childIds).toEqual([
      NEW_ELEMENT_ID,
      DOCUMENT_FIXTURE_IDS.group,
    ]);
    expect(rootReordered.document.elementsById).toBe(rootCreated.document.elementsById);
    expectInverseRestores(rootCreated.document, rootReordered);

    const nestedCreated = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: createElement(SECOND_NEW_ELEMENT_ID),
      owner: { kind: 'element', elementId: DOCUMENT_FIXTURE_IDS.group },
      index: 1,
    });
    const nestedReordered = expectApplied(nestedCreated.document, {
      type: DOCUMENT_COMMAND_TYPES.reorderElement,
      elementId: SECOND_NEW_ELEMENT_ID,
      toIndex: 0,
    });

    expect(nestedReordered.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.childIds).toEqual([
      SECOND_NEW_ELEMENT_ID,
      DOCUMENT_FIXTURE_IDS.child,
    ]);
    expect(nestedReordered.document.boardsById).toBe(nestedCreated.document.boardsById);
    expect(nestedReordered.document.elementsById[DOCUMENT_FIXTURE_IDS.child]).toBe(
      nestedCreated.document.elementsById[DOCUMENT_FIXTURE_IDS.child],
    );
    expectInverseRestores(nestedCreated.document, nestedReordered);

    const unchanged = expectUnchanged(rootCreated.document, {
      type: DOCUMENT_COMMAND_TYPES.reorderElement,
      elementId: DOCUMENT_FIXTURE_IDS.group,
      toIndex: 0,
    });
    expect(unchanged.document).toBe(rootCreated.document);

    const outOfRange = expectFailure(rootCreated.document, {
      type: DOCUMENT_COMMAND_TYPES.reorderElement,
      elementId: DOCUMENT_FIXTURE_IDS.group,
      toIndex: 2,
    });
    expect(outOfRange.error.code).toBe('out-of-range');
  });

  it('replaces a complete sibling permutation atomically and restores exact order', () => {
    const document = parseFixture(createValidProjectDocumentInput());
    const firstCreated = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: createElement(),
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      index: 1,
    });
    const secondCreated = expectApplied(firstCreated.document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: createElement(SECOND_NEW_ELEMENT_ID),
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      index: 2,
    });
    const reordered = expectApplied(secondCreated.document, {
      type: DOCUMENT_COMMAND_TYPES.reorderElementSiblings,
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      childIds: [SECOND_NEW_ELEMENT_ID, DOCUMENT_FIXTURE_IDS.group, NEW_ELEMENT_ID],
    });

    expect(reordered.document.boardsById[DOCUMENT_FIXTURE_IDS.board]?.childIds).toEqual([
      SECOND_NEW_ELEMENT_ID,
      DOCUMENT_FIXTURE_IDS.group,
      NEW_ELEMENT_ID,
    ]);
    expect(reordered.document.elementsById).toBe(secondCreated.document.elementsById);
    expectInverseRestores(secondCreated.document, reordered);

    expectUnchanged(secondCreated.document, {
      type: DOCUMENT_COMMAND_TYPES.reorderElementSiblings,
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      childIds: secondCreated.document.boardsById[DOCUMENT_FIXTURE_IDS.board]?.childIds,
    });
    expectFailure(secondCreated.document, {
      type: DOCUMENT_COMMAND_TYPES.reorderElementSiblings,
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      childIds: [DOCUMENT_FIXTURE_IDS.group, NEW_ELEMENT_ID],
    });
    expectFailure(secondCreated.document, {
      type: DOCUMENT_COMMAND_TYPES.reorderElementSiblings,
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      childIds: [DOCUMENT_FIXTURE_IDS.group, NEW_ELEMENT_ID, NEW_ELEMENT_ID],
    });
  });

  it('sets the direct lock bit with structural sharing, no-op detection, and exact inverse', () => {
    const document = parseFixture(createValidProjectDocumentInput());
    const locked = expectApplied(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementLocked,
      elementId: DOCUMENT_FIXTURE_IDS.group,
      locked: true,
    });

    expect(locked.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.locked).toBe(true);
    expect(locked.document.elementsById[DOCUMENT_FIXTURE_IDS.child]).toBe(
      document.elementsById[DOCUMENT_FIXTURE_IDS.child],
    );
    expect(locked.document.boardsById).toBe(document.boardsById);
    expectInverseRestores(document, locked);
    expectUnchanged(locked.document, {
      type: DOCUMENT_COMMAND_TYPES.setElementLocked,
      elementId: DOCUMENT_FIXTURE_IDS.group,
      locked: true,
    });
    expectFailure(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementLocked,
      elementId: MISSING_ELEMENT_ID,
      locked: true,
    });
  });

  it('returns not-found without mutation for edit commands targeting a missing element', () => {
    const document = parseFixture(createValidProjectDocumentInput());

    for (const command of [
      {
        type: DOCUMENT_COMMAND_TYPES.reorderElement,
        elementId: MISSING_ELEMENT_ID,
        toIndex: 0,
      },
      {
        type: DOCUMENT_COMMAND_TYPES.setElementFrame,
        elementId: MISSING_ELEMENT_ID,
        frame: { x: 0, y: 0, width: 100, height: 50 },
      },
      {
        type: DOCUMENT_COMMAND_TYPES.setElementLocked,
        elementId: MISSING_ELEMENT_ID,
        locked: true,
      },
      {
        type: DOCUMENT_COMMAND_TYPES.setElementProperties,
        elementId: MISSING_ELEMENT_ID,
        properties: {},
      },
    ]) {
      const result = expectFailure(document, command);
      expect(result.error.code).toBe('not-found');
      expect(result.document).toBe(document);
    }
  });
});
