// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  ElementIdSchema,
  createDocumentHistory,
  dispatchHistoryTransaction,
  parseProjectDocument,
  undoDocumentHistory,
  type DocumentHistoryState,
  type ElementId,
} from '../src/domain';
import {
  deleteSelectedElements,
  planSelectionDelete,
} from '../src/renderer/editor/selection-delete';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const SECOND_ID = ElementIdSchema.parse('element_deletesecond');
const THIRD_ID = ElementIdSchema.parse('element_deletethird1');
const STALE_ID = ElementIdSchema.parse('element_deletestale1');

const createDeleteFixture = () => {
  const input = createValidProjectDocumentInput();
  const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
  const group = input.elementsById[DOCUMENT_FIXTURE_IDS.group];
  if (child === undefined || group === undefined) {
    throw new Error('Selection delete fixture elements are missing.');
  }
  input.elementsById[SECOND_ID] = {
    ...structuredClone(child),
    id: SECOND_ID,
    frame: { ...child.frame, x: 180 },
    assetIds: [],
    link: null,
  };
  input.elementsById[THIRD_ID] = {
    ...structuredClone(child),
    id: THIRD_ID,
    frame: { ...child.frame, x: 340 },
    assetIds: [],
    link: null,
  };
  group.childIds = [DOCUMENT_FIXTURE_IDS.child, SECOND_ID, THIRD_ID];
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) {
    throw new Error('Selection delete fixture is invalid.');
  }
  return parsed.value;
};

const CANONICAL_IDS: readonly ElementId[] = Object.freeze([
  DOCUMENT_FIXTURE_IDS.group,
  DOCUMENT_FIXTURE_IDS.child,
  SECOND_ID,
  THIRD_ID,
]);

describe('selection delete planning', () => {
  it('deduplicates selection order into deterministic canonical delete commands', () => {
    const document = createDeleteFixture();
    const plan = planSelectionDelete(
      document,
      [THIRD_ID, DOCUMENT_FIXTURE_IDS.child, THIRD_ID],
      CANONICAL_IDS,
    );

    expect(plan).toEqual({
      commands: [
        { type: 'element.delete', elementId: DOCUMENT_FIXTURE_IDS.child },
        { type: 'element.delete', elementId: THIRD_ID },
        { type: 'asset.delete', assetId: DOCUMENT_FIXTURE_IDS.asset },
      ],
      elementIds: [DOCUMENT_FIXTURE_IDS.child, THIRD_ID],
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan?.commands)).toBe(true);
  });

  it('rejects the complete plan for empty, stale, locked, container, or invalid-order input', () => {
    const document = createDeleteFixture();
    const lockedInput = createValidProjectDocumentInput();
    lockedInput.elementsById[DOCUMENT_FIXTURE_IDS.child]!.locked = true;
    const locked = parseProjectDocument(lockedInput);
    if (!locked.ok) {
      throw new Error('Locked selection delete fixture is invalid.');
    }
    const ancestorLockedInput = createValidProjectDocumentInput();
    ancestorLockedInput.elementsById[DOCUMENT_FIXTURE_IDS.group]!.locked = true;
    const ancestorLocked = parseProjectDocument(ancestorLockedInput);
    if (!ancestorLocked.ok) {
      throw new Error('Ancestor-locked selection delete fixture is invalid.');
    }

    expect(planSelectionDelete(document, [], CANONICAL_IDS)).toBeUndefined();
    expect(planSelectionDelete(document, [STALE_ID], CANONICAL_IDS)).toBeUndefined();
    expect(
      planSelectionDelete(document, [DOCUMENT_FIXTURE_IDS.group], CANONICAL_IDS),
    ).toBeUndefined();
    expect(
      planSelectionDelete(
        locked.value,
        [DOCUMENT_FIXTURE_IDS.child],
        [DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child],
      ),
    ).toBeUndefined();
    expect(
      planSelectionDelete(
        ancestorLocked.value,
        [DOCUMENT_FIXTURE_IDS.child],
        [DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child],
      ),
    ).toBeUndefined();
    expect(
      planSelectionDelete(
        document,
        [DOCUMENT_FIXTURE_IDS.child],
        [DOCUMENT_FIXTURE_IDS.child, DOCUMENT_FIXTURE_IDS.child],
      ),
    ).toBeUndefined();
  });

  it('commits selected siblings once, reconciles afterward, and undoes exact document order', () => {
    const document = createDeleteFixture();
    let history: DocumentHistoryState = createDocumentHistory(document);
    const selection = new SelectionStore();
    selection.replace([THIRD_ID, DOCUMENT_FIXTURE_IDS.child], DOCUMENT_FIXTURE_IDS.child);
    const selectionBefore = selection.getSnapshot();

    expect(
      deleteSelectedElements(document, selection, CANONICAL_IDS, {
        commit: (commands) => {
          const result = dispatchHistoryTransaction(history, commands, {
            label: 'Delete elements',
          });
          if (!result.ok || !result.changed) {
            return undefined;
          }
          history = result.history;
          return history.document;
        },
      }),
    ).toBe(true);

    expect(history.undoEntries).toHaveLength(1);
    expect(history.undoEntries[0]).toMatchObject({
      forwardCommands: [
        { elementId: DOCUMENT_FIXTURE_IDS.child, type: 'element.delete' },
        { elementId: THIRD_ID, type: 'element.delete' },
        { assetId: DOCUMENT_FIXTURE_IDS.asset, type: 'asset.delete' },
      ],
      label: 'Delete elements',
    });
    expect(history.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.childIds).toEqual([
      SECOND_ID,
    ]);
    expect(selection.getSnapshot()).toMatchObject({ primaryId: undefined, selectedIds: [] });
    expect(selection.getSnapshot().revision).toBe(selectionBefore.revision + 1);

    const undone = undoDocumentHistory(history);
    expect(undone).toMatchObject({ changed: true, ok: true });
    expect(undone.history.document).toEqual(document);
  });

  it('preserves exact selection and document when planning or commit is unavailable', () => {
    const document = createDeleteFixture();
    const selection = new SelectionStore();
    selection.selectOnly(DOCUMENT_FIXTURE_IDS.group);
    const selectionBefore = selection.getSnapshot();
    const commit = vi.fn(() => document);

    expect(deleteSelectedElements(document, selection, CANONICAL_IDS, { commit })).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(selection.getSnapshot()).toBe(selectionBefore);

    selection.selectOnly(DOCUMENT_FIXTURE_IDS.child);
    const deletableSelection = selection.getSnapshot();
    expect(
      deleteSelectedElements(document, selection, CANONICAL_IDS, {
        commit: () => undefined,
      }),
    ).toBe(false);
    expect(selection.getSnapshot()).toBe(deletableSelection);
  });
});
