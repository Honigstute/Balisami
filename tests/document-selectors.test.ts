import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  ElementIdSchema,
  createElementLocationIndex,
  parseProjectDocument,
  selectBoardElementIds,
  selectBoardCommandAvailability,
  selectBoardRootElements,
  selectElementCommandAvailability,
  selectElementLockState,
  selectElementLocation,
  selectElementWorldBounds,
  selectOrderedBoards,
  selectOrderedChildren,
  selectOwnerChildIds,
  selectSelectionWorldBounds,
  type ProjectDocument,
} from '../src/domain';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const SECONDARY_BOARD_ID = BoardIdSchema.parse('board_secondary1');

const parseFixture = (input: unknown): ProjectDocument => {
  const result = parseProjectDocument(input);
  if (!result.ok) {
    throw new Error(`Fixture is invalid: ${JSON.stringify(result.issues)}`);
  }
  return result.value;
};

describe('project document selectors', () => {
  it('derives each element owner and sibling index only from canonical child order', () => {
    const document = parseFixture(createValidProjectDocumentInput());
    const index = createElementLocationIndex(document);

    expect(index.size).toBe(2);
    expect(index.get(DOCUMENT_FIXTURE_IDS.group)).toEqual({
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      index: 0,
    });
    expect(selectElementLocation(document, DOCUMENT_FIXTURE_IDS.child, index)).toEqual({
      owner: { kind: 'element', elementId: DOCUMENT_FIXTURE_IDS.group },
      index: 0,
    });
    expect(Object.isFrozen(index.get(DOCUMENT_FIXTURE_IDS.child))).toBe(true);
  });

  it('returns canonical board and child records in their stored order', () => {
    const input = createValidProjectDocumentInput();
    input.boardIds.push(SECONDARY_BOARD_ID);
    input.boardsById[SECONDARY_BOARD_ID] = {
      id: SECONDARY_BOARD_ID,
      name: 'Secondary',
      note: { text: '' },
      childIds: [],
    };
    const document = parseFixture(input);

    const boards = selectOrderedBoards(document);
    const boardChildren = selectBoardRootElements(document, DOCUMENT_FIXTURE_IDS.board);
    const groupChildren = selectOrderedChildren(document, {
      kind: 'element',
      elementId: DOCUMENT_FIXTURE_IDS.group,
    });

    expect(boards.map((board) => board.id)).toEqual([
      DOCUMENT_FIXTURE_IDS.board,
      SECONDARY_BOARD_ID,
    ]);
    expect(boards[0]).toBe(document.boardsById[DOCUMENT_FIXTURE_IDS.board]);
    expect(boardChildren?.[0]).toBe(document.elementsById[DOCUMENT_FIXTURE_IDS.group]);
    expect(groupChildren?.[0]).toBe(document.elementsById[DOCUMENT_FIXTURE_IDS.child]);
    expect(Object.isFrozen(boards)).toBe(true);
    expect(Object.isFrozen(groupChildren)).toBe(true);
  });

  it('distinguishes an absent owner from an existing owner with no children', () => {
    const document = parseFixture(createValidProjectDocumentInput());

    expect(
      selectOwnerChildIds(document, {
        kind: 'element',
        elementId: DOCUMENT_FIXTURE_IDS.child,
      }),
    ).toEqual([]);
    expect(
      selectOrderedChildren(document, {
        kind: 'board',
        boardId: SECONDARY_BOARD_ID,
      }),
    ).toBeUndefined();
  });

  it('derives nested world bounds without changing local document geometry', () => {
    const document = parseFixture(createValidProjectDocumentInput());
    const index = createElementLocationIndex(document);

    const groupBounds = selectElementWorldBounds(document, DOCUMENT_FIXTURE_IDS.group, index);
    const childBounds = selectElementWorldBounds(document, DOCUMENT_FIXTURE_IDS.child, index);
    const selectionBounds = selectSelectionWorldBounds(
      document,
      [DOCUMENT_FIXTURE_IDS.child, DOCUMENT_FIXTURE_IDS.group],
      index,
    );

    expect(groupBounds).toEqual({ x: -20, y: 12.5, width: 320, height: 180 });
    expect(childBounds).toEqual({ x: -4, y: 36.5, width: 120, height: 48 });
    expect(selectionBounds).toEqual(groupBounds);
    expect(document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.frame).toEqual({
      x: 16,
      y: 24,
      width: 120,
      height: 48,
    });
    expect(Object.isFrozen(childBounds)).toBe(true);
    expect(selectSelectionWorldBounds(document, [])).toBeUndefined();
  });

  it('derives canonical board traversal and direct versus inherited lock state', () => {
    const input = createValidProjectDocumentInput();
    input.elementsById[DOCUMENT_FIXTURE_IDS.group]!.locked = true;
    const document = parseFixture(input);
    const index = createElementLocationIndex(document);

    expect(selectBoardElementIds(document, DOCUMENT_FIXTURE_IDS.board)).toEqual([
      DOCUMENT_FIXTURE_IDS.group,
      DOCUMENT_FIXTURE_IDS.child,
    ]);
    expect(selectElementLockState(document, DOCUMENT_FIXTURE_IDS.group, index)).toEqual({
      directlyLocked: true,
      effectivelyLocked: true,
      lockingElementId: DOCUMENT_FIXTURE_IDS.group,
    });
    expect(selectElementLockState(document, DOCUMENT_FIXTURE_IDS.child, index)).toEqual({
      directlyLocked: false,
      effectivelyLocked: true,
      lockingElementId: DOCUMENT_FIXTURE_IDS.group,
    });
    expect(
      selectElementLockState(document, ElementIdSchema.parse('element_missing01')),
    ).toBeUndefined();
    expect(selectBoardElementIds(document, SECONDARY_BOARD_ID)).toBeUndefined();
  });

  it('derives board and element command availability from current order and references', () => {
    const document = parseFixture(createValidProjectDocumentInput());

    expect(selectBoardCommandAvailability(document, DOCUMENT_FIXTURE_IDS.board)).toEqual({
      canDelete: false,
      canMoveBackward: false,
      canMoveForward: false,
    });
    expect(selectElementCommandAvailability(document, DOCUMENT_FIXTURE_IDS.group)).toEqual({
      canCreateChild: true,
      canDelete: false,
      canMoveBackward: false,
      canMoveForward: false,
    });
    expect(selectElementCommandAvailability(document, DOCUMENT_FIXTURE_IDS.child)).toEqual({
      canCreateChild: false,
      canDelete: true,
      canMoveBackward: false,
      canMoveForward: false,
    });
    expect(selectBoardCommandAvailability(document, SECONDARY_BOARD_ID)).toBeUndefined();
  });
});
