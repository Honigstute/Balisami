import { describe, expect, it, vi } from 'vitest';

import {
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  createDocumentHistory,
  dispatchHistoryTransaction,
  parseProjectDocument,
  redoDocumentHistory,
  selectElementLockState,
  undoDocumentHistory,
  type DocumentHistoryState,
  type ElementId,
  type ProjectDocument,
} from '../src/domain';
import {
  lockSelectedElements,
  planBoardUnlockAll,
  planSelectionLock,
  unlockAllBoardElements,
} from '../src/renderer/editor/selection-locking';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const ROOT_ID = ElementIdSchema.parse('element_lockroot1');

const parseFixture = (input = createValidProjectDocumentInput()): ProjectDocument => {
  const result = parseProjectDocument(input);
  if (!result.ok) {
    throw new Error(`Invalid lock fixture: ${JSON.stringify(result.issues)}`);
  }
  return result.value;
};

const createCanonicalIds = (): readonly ElementId[] => [
  ROOT_ID,
  DOCUMENT_FIXTURE_IDS.group,
  DOCUMENT_FIXTURE_IDS.child,
];

const createLockFixture = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  input.elementsById[ROOT_ID] = {
    ...structuredClone(input.elementsById[DOCUMENT_FIXTURE_IDS.child]!),
    id: ROOT_ID,
    assetIds: [],
    link: null,
  };
  input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds.unshift(ROOT_ID);
  return parseFixture(input);
};

describe('selection locking', () => {
  it('locks canonical roots once and derives descendant lock state from the ancestor', () => {
    const document = createLockFixture();
    const plan = planSelectionLock(
      document,
      [DOCUMENT_FIXTURE_IDS.child, DOCUMENT_FIXTURE_IDS.group],
      createCanonicalIds(),
    );

    expect(plan?.rootIds).toEqual([DOCUMENT_FIXTURE_IDS.group]);
    expect(plan?.commands).toEqual([
      {
        type: DOCUMENT_COMMAND_TYPES.setElementLocked,
        elementId: DOCUMENT_FIXTURE_IDS.group,
        locked: true,
      },
    ]);
    if (plan === undefined) {
      throw new Error('Expected lock plan.');
    }
    const result = dispatchHistoryTransaction(createDocumentHistory(document), plan.commands, {
      label: 'Lock elements',
    });
    expect(result).toMatchObject({ ok: true, changed: true });
    if (!result.ok || !result.changed) {
      throw new Error('Expected lock transaction.');
    }
    expect(result.history.undoEntries).toHaveLength(1);
    expect(selectElementLockState(result.history.document, DOCUMENT_FIXTURE_IDS.child)).toEqual({
      directlyLocked: false,
      effectivelyLocked: true,
      lockingElementId: DOCUMENT_FIXTURE_IDS.group,
    });
    const undone = undoDocumentHistory(result.history);
    expect(undone.ok && undone.changed ? JSON.stringify(undone.history.document) : '').toBe(
      JSON.stringify(document),
    );
  });

  it('rejects stale, effectively locked, and malformed canonical selection atomically', () => {
    const input = createValidProjectDocumentInput();
    input.elementsById[DOCUMENT_FIXTURE_IDS.group]!.locked = true;
    const document = parseFixture(input);
    expect(
      planSelectionLock(document, [DOCUMENT_FIXTURE_IDS.child], createCanonicalIds()),
    ).toBeUndefined();
    expect(
      planSelectionLock(
        document,
        [ElementIdSchema.parse('element_missing01')],
        createCanonicalIds(),
      ),
    ).toBeUndefined();
    expect(
      planSelectionLock(
        createLockFixture(),
        [ROOT_ID],
        [ROOT_ID, ROOT_ID, DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child],
      ),
    ).toBeUndefined();
  });

  it('unlocks every direct bit on the active board in canonical order', () => {
    const input = createValidProjectDocumentInput();
    input.elementsById[DOCUMENT_FIXTURE_IDS.group]!.locked = true;
    input.elementsById[DOCUMENT_FIXTURE_IDS.child]!.locked = true;
    const document = parseFixture(input);
    const plan = planBoardUnlockAll(document, DOCUMENT_FIXTURE_IDS.board);

    expect(plan?.elementIds).toEqual([DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child]);
    expect(planBoardUnlockAll(parseFixture(), DOCUMENT_FIXTURE_IDS.board)).toBeUndefined();
    if (plan === undefined) {
      throw new Error('Expected unlock-all plan.');
    }
    const result = dispatchHistoryTransaction(createDocumentHistory(document), plan.commands, {
      label: 'Unlock elements',
    });
    expect(result).toMatchObject({ ok: true, changed: true });
    if (!result.ok || !result.changed) {
      throw new Error('Expected unlock transaction.');
    }
    expect(result.history.undoEntries).toHaveLength(1);
    expect(result.history.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.locked).toBe(false);
    expect(result.history.document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.locked).toBe(false);
  });

  it('crosses the commit boundary once and reconciles selection only after accepted output', () => {
    const document = createLockFixture();
    const selection = new SelectionStore();
    selection.replace([DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child]);
    let history: DocumentHistoryState = createDocumentHistory(document);
    const commit = vi.fn((commands: Parameters<typeof dispatchHistoryTransaction>[1]) => {
      const result = dispatchHistoryTransaction(history, commands, { label: 'Lock elements' });
      if (!result.ok || !result.changed) {
        return undefined;
      }
      history = result.history;
      return history.document;
    });

    expect(lockSelectedElements(document, selection, createCanonicalIds(), { commit })).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(history.undoEntries).toHaveLength(1);
    expect(selection.getSnapshot().selectedIds).toEqual([]);

    const unlockCommit = vi.fn((commands: Parameters<typeof dispatchHistoryTransaction>[1]) => {
      const result = dispatchHistoryTransaction(history, commands, { label: 'Unlock elements' });
      if (!result.ok || !result.changed) {
        return undefined;
      }
      history = result.history;
      return history.document;
    });
    expect(
      unlockAllBoardElements(history.document, DOCUMENT_FIXTURE_IDS.board, {
        commit: unlockCommit,
      }),
    ).toBe(true);
    expect(unlockCommit).toHaveBeenCalledTimes(1);
    expect(history.undoEntries).toHaveLength(2);
  });

  it('restores nested direct and inherited lock state across seeded undo/redo fixtures', () => {
    for (let fixture = 0; fixture < 200; fixture += 1) {
      const document = createLockFixture();
      const selectedIds =
        fixture % 3 === 0
          ? [DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child]
          : fixture % 3 === 1
            ? [DOCUMENT_FIXTURE_IDS.child]
            : [ROOT_ID, DOCUMENT_FIXTURE_IDS.child];
      const plan = planSelectionLock(document, selectedIds, createCanonicalIds());
      if (plan === undefined) {
        throw new Error('Seeded lock plan failed.');
      }
      const changed = dispatchHistoryTransaction(createDocumentHistory(document), plan.commands, {
        label: 'Lock elements',
      });
      if (!changed.ok || !changed.changed) {
        throw new Error('Seeded lock transaction failed.');
      }
      const finalJson = JSON.stringify(changed.history.document);
      const undone = undoDocumentHistory(changed.history);
      expect(undone.ok && undone.changed ? JSON.stringify(undone.history.document) : '').toBe(
        JSON.stringify(document),
      );
      if (!undone.ok || !undone.changed) {
        throw new Error('Seeded lock undo failed.');
      }
      const redone = redoDocumentHistory(undone.history);
      expect(redone.ok && redone.changed ? JSON.stringify(redone.history.document) : '').toBe(
        finalJson,
      );
    }
  });
});
