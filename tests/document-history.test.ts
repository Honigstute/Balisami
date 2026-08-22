import { describe, expect, it } from 'vitest';

import {
  EMPTY_ELEMENT_ROW_DATA,
  BoardIdSchema,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  ElementNodeSchema,
  FOUNDATION_CONTROL_TYPES,
  beginDocumentHistorySave,
  canRedoDocumentHistory,
  canUndoDocumentHistory,
  completeDocumentHistorySave,
  createDocumentHistory,
  dispatchHistoryCommand,
  dispatchHistoryTransaction,
  failDocumentHistorySave,
  isDocumentHistoryDirty,
  parseProjectDocument,
  redoDocumentHistory,
  selectRedoLabel,
  selectUndoLabel,
  undoDocumentHistory,
  type DocumentHistoryState,
  type DocumentCommand,
  type HistoryOperationResult,
  type ProjectDocument,
} from '../src/domain';
import {
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  getFixtureControlVersion,
} from './fixtures/project-document';

type ChangedHistory = Extract<
  HistoryOperationResult,
  { readonly changed: true; readonly ok: true }
>;
type FailedHistory = Extract<HistoryOperationResult, { readonly ok: false }>;

const HISTORY_ELEMENT_ID = ElementIdSchema.parse('element_history001');
const MISSING_BOARD_ID = BoardIdSchema.parse('board_missing01');

const parseFixture = (input: unknown): ProjectDocument => {
  const result = parseProjectDocument(input);
  if (!result.ok) {
    throw new Error(`Fixture is invalid: ${JSON.stringify(result.issues)}`);
  }
  return result.value;
};

const createHistory = (historyLimit = 200): DocumentHistoryState =>
  createDocumentHistory(parseFixture(createValidProjectDocumentInput()), { historyLimit });

const expectChanged = (result: HistoryOperationResult): ChangedHistory => {
  expect(result).toMatchObject({ ok: true, changed: true });
  if (!result.ok || !result.changed) {
    throw new Error(`Expected history to change: ${JSON.stringify(result)}`);
  }
  return result;
};

const expectFailure = (result: HistoryOperationResult): FailedHistory => {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error('Expected history operation to fail.');
  }
  return result;
};

const renameBoard = (name: string) => ({
  type: DOCUMENT_COMMAND_TYPES.renameBoard,
  boardId: DOCUMENT_FIXTURE_IDS.board,
  name,
});

describe('document history', () => {
  it('starts with one clean identity and validates its bounded capacity', () => {
    const history = createHistory();

    expect(history.currentStateId).toBe(0);
    expect(history.savedStateId).toBe(0);
    expect(history.nextStateId).toBe(1);
    expect(history.undoEntries).toEqual([]);
    expect(history.redoEntries).toEqual([]);
    expect(isDocumentHistoryDirty(history)).toBe(false);
    expect(canUndoDocumentHistory(history)).toBe(false);
    expect(canRedoDocumentHistory(history)).toBe(false);
    expect(selectUndoLabel(history)).toBeUndefined();
    expect(selectRedoLabel(history)).toBeUndefined();
    expect(Object.isFrozen(history)).toBe(true);
    expect(Object.isFrozen(history.undoEntries)).toBe(true);

    const unsaved = createDocumentHistory(history.document, { initiallySaved: false });
    expect(unsaved.savedStateId).toBeNull();
    expect(isDocumentHistoryDirty(unsaved)).toBe(true);

    expect(() => createDocumentHistory(history.document, { historyLimit: 0 })).toThrow(RangeError);
    expect(() =>
      createDocumentHistory(history.document, { historyLimit: Number.POSITIVE_INFINITY }),
    ).toThrow(RangeError);
  });

  it('dispatches, undoes, and redoes while restoring exact state identities', () => {
    const initial = createHistory();
    const renamed = expectChanged(dispatchHistoryCommand(initial, renameBoard('Checkout')));

    expect(renamed.history.currentStateId).toBe(1);
    expect(renamed.history.nextStateId).toBe(2);
    expect(renamed.history.document.boardsById[DOCUMENT_FIXTURE_IDS.board]?.name).toBe('Checkout');
    expect(renamed.entry.label).toBe('Rename board to “Checkout”');
    expect(selectUndoLabel(renamed.history)).toBe(renamed.entry.label);
    expect(isDocumentHistoryDirty(renamed.history)).toBe(true);
    expect(Object.isFrozen(renamed.entry)).toBe(true);
    expect(Object.isFrozen(renamed.entry.forwardCommands)).toBe(true);

    const undone = expectChanged(undoDocumentHistory(renamed.history));
    expect(undone.history.currentStateId).toBe(0);
    expect(undone.history.nextStateId).toBe(2);
    expect(undone.history.document).toEqual(initial.document);
    expect(JSON.stringify(undone.history.document)).toBe(JSON.stringify(initial.document));
    expect(isDocumentHistoryDirty(undone.history)).toBe(false);
    expect(selectRedoLabel(undone.history)).toBe(renamed.entry.label);

    const redone = expectChanged(redoDocumentHistory(undone.history));
    expect(redone.history.currentStateId).toBe(1);
    expect(redone.history.nextStateId).toBe(2);
    expect(redone.history.document).toEqual(renamed.history.document);
    expect(JSON.stringify(redone.history.document)).toBe(JSON.stringify(renamed.history.document));

    const noUndo = undoDocumentHistory(initial);
    expect(noUndo).toEqual({ ok: true, changed: false, history: initial });
    expect(noUndo.history).toBe(initial);
  });

  it('keeps failures and no-ops out of history without allocating state IDs', () => {
    const history = createHistory();

    const noOp = dispatchHistoryCommand(history, renameBoard('Main wireframe'));
    expect(noOp).toEqual({ ok: true, changed: false, history });
    expect(noOp.history).toBe(history);

    const invalid = expectFailure(dispatchHistoryCommand(history, renameBoard('')));
    expect(invalid.error.code).toBe('command-failed');
    expect(invalid.error.commandError?.code).toBe('invalid-command');
    expect(invalid.error.commandIndex).toBe(0);
    expect(invalid.history).toBe(history);
    expect(history.nextStateId).toBe(1);
  });

  it('bounds retained undo entries and never reuses abandoned branch identities', () => {
    let history = createHistory(2);
    for (const name of ['One', 'Two', 'Three']) {
      history = expectChanged(dispatchHistoryCommand(history, renameBoard(name))).history;
    }

    expect(history.currentStateId).toBe(3);
    expect(history.undoEntries).toHaveLength(2);
    expect(history.undoEntries.map((entry) => entry.afterStateId)).toEqual([2, 3]);

    const undone = expectChanged(undoDocumentHistory(history));
    expect(undone.history.currentStateId).toBe(2);
    expect(canRedoDocumentHistory(undone.history)).toBe(true);

    const branched = expectChanged(dispatchHistoryCommand(undone.history, renameBoard('Branched')));
    expect(branched.history.currentStateId).toBe(4);
    expect(branched.history.nextStateId).toBe(5);
    expect(branched.history.redoEntries).toEqual([]);
    expect(canRedoDocumentHistory(branched.history)).toBe(false);

    const firstUndo = expectChanged(undoDocumentHistory(branched.history));
    const secondUndo = expectChanged(undoDocumentHistory(firstUndo.history));
    expect(secondUndo.history.currentStateId).toBe(1);
    expect(secondUndo.history.document.boardsById[DOCUMENT_FIXTURE_IDS.board]?.name).toBe('One');
    expect(undoDocumentHistory(secondUndo.history)).toMatchObject({
      ok: true,
      changed: false,
    });
  });

  it('groups a transaction atomically and reverses commands in exact inverse order', () => {
    const initial = createHistory();
    const transaction = expectChanged(
      dispatchHistoryTransaction(
        initial,
        [
          renameBoard('Checkout'),
          {
            type: DOCUMENT_COMMAND_TYPES.setBoardNote,
            boardId: DOCUMENT_FIXTURE_IDS.board,
            note: { text: 'Review this flow.' },
          },
          {
            type: DOCUMENT_COMMAND_TYPES.setElementFrame,
            elementId: DOCUMENT_FIXTURE_IDS.child,
            frame: { x: 80, y: 96, width: 240, height: 72 },
          },
        ],
        { label: '  Update checkout flow  ' },
      ),
    );

    expect(transaction.history.undoEntries).toHaveLength(1);
    expect(transaction.entry.label).toBe('Update checkout flow');
    expect(transaction.entry.forwardCommands).toHaveLength(3);
    expect(transaction.entry.inverseCommands).toHaveLength(3);
    expect(transaction.history.document.boardsById[DOCUMENT_FIXTURE_IDS.board]).toMatchObject({
      name: 'Checkout',
      note: { text: 'Review this flow.' },
    });
    expectInverseTransactionRestores(initial, transaction);

    const failed = expectFailure(
      dispatchHistoryTransaction(initial, [renameBoard('Temporary'), renameBoard('')]),
    );
    expect(failed.error).toMatchObject({ code: 'command-failed', commandIndex: 1 });
    expect(failed.history).toBe(initial);
    expect(failed.history.document.boardsById[DOCUMENT_FIXTURE_IDS.board]?.name).toBe(
      'Main wireframe',
    );

    const invalidLabel = expectFailure(
      dispatchHistoryTransaction(initial, [renameBoard('Valid')], { label: '   ' }),
    );
    expect(invalidLabel.error.code).toBe('invalid-transaction');
    expect(invalidLabel.history).toBe(initial);
  });

  it('coalesces only explicit matching edits and preserves their earliest inverse', () => {
    const initial = createHistory();
    const first = expectChanged(
      dispatchHistoryCommand(initial, renameBoard('Checkout'), {
        coalesceKey: 'board-name:primary',
      }),
    );
    const second = expectChanged(
      dispatchHistoryCommand(first.history, renameBoard('Checkout final'), {
        coalesceKey: 'board-name:primary',
      }),
    );

    expect(first.history.currentStateId).toBe(1);
    expect(second.history.currentStateId).toBe(2);
    expect(second.history.undoEntries).toHaveLength(1);
    expect(second.entry.beforeStateId).toBe(0);
    expect(second.entry.afterStateId).toBe(2);
    expect(second.entry.forwardCommands).toHaveLength(2);
    expect(second.entry.inverseCommands).toHaveLength(2);
    expect(second.entry.label).toBe(first.entry.label);

    const undone = expectChanged(undoDocumentHistory(second.history));
    expect(undone.history.document).toEqual(initial.document);
    expect(undone.history.currentStateId).toBe(0);

    const branched = expectChanged(
      dispatchHistoryCommand(undone.history, renameBoard('New branch'), {
        coalesceKey: 'board-name:primary',
      }),
    );
    expect(branched.history.currentStateId).toBe(3);
    expect(branched.history.undoEntries).toHaveLength(1);
    expect(branched.entry.forwardCommands).toHaveLength(1);
  });

  it('leaves the complete state untouched when stored history cannot replay', () => {
    const initial = createHistory();
    const applied = expectChanged(dispatchHistoryCommand(initial, renameBoard('Checkout')));
    const invalidInverse: DocumentCommand = {
      type: DOCUMENT_COMMAND_TYPES.renameBoard,
      boardId: MISSING_BOARD_ID,
      name: 'Missing',
    };
    const corruptedEntry = Object.freeze({
      ...applied.entry,
      inverseCommands: Object.freeze([invalidInverse]),
    });
    const corruptedHistory: DocumentHistoryState = Object.freeze({
      ...applied.history,
      undoEntries: Object.freeze([corruptedEntry]),
    });

    const result = expectFailure(undoDocumentHistory(corruptedHistory));
    expect(result.error.code).toBe('history-corrupt');
    expect(result.error.commandError?.code).toBe('not-found');
    expect(result.history).toBe(corruptedHistory);
    expect(result.history.document).toBe(applied.history.document);
  });

  it('protects in-flight save identities from coalescing and tracks async saves exactly', () => {
    const initial = createHistory();
    const firstEdit = expectChanged(
      dispatchHistoryCommand(initial, renameBoard('First save candidate'), {
        coalesceKey: 'board-name:primary',
      }),
    );
    const saveStarted = beginDocumentHistorySave(firstEdit.history);
    expect(saveStarted.ok).toBe(true);
    if (!saveStarted.ok) {
      throw new Error(saveStarted.error.message);
    }
    expect(saveStarted.snapshot.document).toBe(firstEdit.history.document);
    expect(saveStarted.snapshot.stateId).toBe(1);
    expect(Object.isFrozen(saveStarted.snapshot)).toBe(true);

    const editedDuringSave = expectChanged(
      dispatchHistoryCommand(saveStarted.history, renameBoard('Edited during save'), {
        coalesceKey: 'board-name:primary',
      }),
    );
    expect(editedDuringSave.history.undoEntries).toHaveLength(2);

    const mismatchedSnapshot = Object.freeze({
      ...saveStarted.snapshot,
      document: initial.document,
    });
    const mismatchedCompletion = completeDocumentHistorySave(
      editedDuringSave.history,
      mismatchedSnapshot,
    );
    expect(mismatchedCompletion).toMatchObject({
      ok: false,
      error: { code: 'save-token-not-found' },
    });
    expect(mismatchedCompletion.history).toBe(editedDuringSave.history);

    const saveCompleted = completeDocumentHistorySave(
      editedDuringSave.history,
      saveStarted.snapshot,
    );
    expect(saveCompleted.ok).toBe(true);
    if (!saveCompleted.ok) {
      throw new Error(saveCompleted.error.message);
    }
    expect(saveCompleted.history.savedStateId).toBe(1);
    expect(saveCompleted.history.currentStateId).toBe(2);
    expect(isDocumentHistoryDirty(saveCompleted.history)).toBe(true);

    const backToSaved = expectChanged(undoDocumentHistory(saveCompleted.history));
    expect(backToSaved.history.currentStateId).toBe(1);
    expect(backToSaved.history.document).toEqual(saveStarted.snapshot.document);
    expect(JSON.stringify(backToSaved.history.document)).toBe(
      JSON.stringify(saveStarted.snapshot.document),
    );
    expect(isDocumentHistoryDirty(backToSaved.history)).toBe(false);

    const duplicatedCompletion = completeDocumentHistorySave(
      backToSaved.history,
      saveStarted.snapshot,
    );
    expect(duplicatedCompletion).toMatchObject({
      ok: false,
      error: { code: 'save-token-not-found' },
    });
    expect(duplicatedCompletion.history).toBe(backToSaved.history);

    const failedSaveStarted = beginDocumentHistorySave(backToSaved.history);
    if (!failedSaveStarted.ok) {
      throw new Error(failedSaveStarted.error.message);
    }
    const failedSave = failDocumentHistorySave(
      failedSaveStarted.history,
      failedSaveStarted.snapshot,
    );
    expect(failedSave.ok).toBe(true);
    if (failedSave.ok) {
      expect(failedSave.history.savedStateId).toBe(1);
    }
  });
});

const expectInverseTransactionRestores = (
  initial: DocumentHistoryState,
  transaction: ChangedHistory,
): void => {
  const undone = expectChanged(undoDocumentHistory(transaction.history));
  expect(undone.history.document).toEqual(initial.document);
  expect(JSON.stringify(undone.history.document)).toBe(JSON.stringify(initial.document));
};

const nextRandom = (state: { value: number }): number => {
  state.value = (Math.imul(state.value, 1_664_525) + 1_013_904_223) >>> 0;
  return state.value;
};

const createHistoryElement = () =>
  ElementNodeSchema.parse({
    id: HISTORY_ELEMENT_ID,
    controlType: FOUNDATION_CONTROL_TYPES.group,
    controlVersion: getFixtureControlVersion(FOUNDATION_CONTROL_TYPES.group),
    frame: { x: 40, y: 40, width: 180, height: 80 },
    locked: false,
    properties: { label: 'History fixture' },
    childIds: [],
    assetIds: [],
    link: null,
    rowData: EMPTY_ELEMENT_ROW_DATA,
  });

it('undoes and redoes a deterministic randomized sequence of 10,000 valid commands exactly', () => {
  const commandCount = 10_000;
  const initial = createHistory(commandCount);
  const initialJson = JSON.stringify(initial.document);
  let history = expectChanged(
    dispatchHistoryCommand(initial, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: createHistoryElement(),
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      index: 1,
    }),
  ).history;
  const random = { value: 0x5eed_1234 };

  for (let index = 1; index < commandCount; index += 1) {
    const randomValue = nextRandom(random);
    let command: unknown;
    switch (randomValue % 6) {
      case 0: {
        const board = history.document.boardsById[DOCUMENT_FIXTURE_IDS.board];
        const currentIndex = board?.childIds.indexOf(HISTORY_ELEMENT_ID) ?? -1;
        command = {
          type: DOCUMENT_COMMAND_TYPES.reorderElement,
          elementId: HISTORY_ELEMENT_ID,
          toIndex: currentIndex === 0 ? 1 : 0,
        };
        break;
      }
      case 1:
        command = {
          type: DOCUMENT_COMMAND_TYPES.setElementFrame,
          elementId: HISTORY_ELEMENT_ID,
          frame: {
            x: index + (randomValue % 100) / 100,
            y: (randomValue % 2_000) - 1_000,
            width: 80 + (randomValue % 320),
            height: 40 + (randomValue % 180),
          },
        };
        break;
      case 2:
        command = {
          type: DOCUMENT_COMMAND_TYPES.setElementFrame,
          elementId: DOCUMENT_FIXTURE_IDS.child,
          frame: {
            x: -index - (randomValue % 100) / 100,
            y: randomValue % 1_000,
            width: 60 + (randomValue % 240),
            height: 30 + (randomValue % 120),
          },
        };
        break;
      case 3:
        command = {
          type: DOCUMENT_COMMAND_TYPES.setElementProperties,
          elementId: HISTORY_ELEMENT_ID,
          properties: {
            iteration: index,
            seed: randomValue,
            flags: [randomValue % 2 === 0, `step-${String(index)}`],
          },
        };
        break;
      case 4:
        command = renameBoard(`Board ${String(index)}-${String(randomValue)}`);
        break;
      default:
        command = {
          type: DOCUMENT_COMMAND_TYPES.setBoardNote,
          boardId: DOCUMENT_FIXTURE_IDS.board,
          note: { text: `Note ${String(index)}-${String(randomValue)}` },
        };
    }

    const result = dispatchHistoryCommand(history, command);
    if (!result.ok || !result.changed) {
      throw new Error(`Random command ${String(index)} did not apply: ${JSON.stringify(result)}`);
    }
    history = result.history;
  }

  expect(history.undoEntries).toHaveLength(commandCount);
  expect(history.currentStateId).toBe(commandCount);
  expect(history.nextStateId).toBe(commandCount + 1);
  const finalDocument = history.document;
  const finalJson = JSON.stringify(finalDocument);

  for (let index = 0; index < commandCount; index += 1) {
    const result = undoDocumentHistory(history);
    if (!result.ok || !result.changed) {
      throw new Error(`Undo ${String(index)} failed: ${JSON.stringify(result)}`);
    }
    history = result.history;
  }

  expect(history.currentStateId).toBe(0);
  expect(history.document).toEqual(initial.document);
  expect(JSON.stringify(history.document)).toBe(initialJson);
  expect(isDocumentHistoryDirty(history)).toBe(false);

  for (let index = 0; index < commandCount; index += 1) {
    const result = redoDocumentHistory(history);
    if (!result.ok || !result.changed) {
      throw new Error(`Redo ${String(index)} failed: ${JSON.stringify(result)}`);
    }
    history = result.history;
  }

  expect(history.currentStateId).toBe(commandCount);
  expect(history.document).toEqual(finalDocument);
  expect(JSON.stringify(history.document)).toBe(finalJson);
  expect(history.redoEntries).toHaveLength(0);
}, 60_000);
