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
  SELECTION_DUPLICATE_POLICY,
  duplicateSelectedElements,
  planSelectionDuplicate,
} from '../src/renderer/editor/selection-duplicate';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const SECOND_ID = ElementIdSchema.parse('element_dupsecond1');
const THIRD_ID = ElementIdSchema.parse('element_dupthird01');
const FIRST_CLONE_ID = ElementIdSchema.parse('element_dupclone001');
const SECOND_CLONE_ID = ElementIdSchema.parse('element_dupclone002');
const STALE_ID = ElementIdSchema.parse('element_dupstale001');

const createDuplicateFixture = () => {
  const input = createValidProjectDocumentInput();
  const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
  const group = input.elementsById[DOCUMENT_FIXTURE_IDS.group];
  if (child === undefined || group === undefined) {
    throw new Error('Selection duplicate fixture elements are missing.');
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
    throw new Error('Selection duplicate fixture is invalid.');
  }
  return parsed.value;
};

const CANONICAL_IDS: readonly ElementId[] = Object.freeze([
  DOCUMENT_FIXTURE_IDS.group,
  DOCUMENT_FIXTURE_IDS.child,
  SECOND_ID,
  THIRD_ID,
]);

const createAllocator = (ids: readonly ElementId[]) =>
  vi.fn((_sourceId: ElementId, index: number) => ids[index]);

describe('selection duplicate planning', () => {
  it('deduplicates selection into canonical commands with adjacent sibling insertion', () => {
    const document = createDuplicateFixture();
    const allocateId = createAllocator([FIRST_CLONE_ID, SECOND_CLONE_ID]);
    const plan = planSelectionDuplicate(
      document,
      [THIRD_ID, DOCUMENT_FIXTURE_IDS.child, THIRD_ID],
      CANONICAL_IDS,
      allocateId,
    );

    expect(plan?.sourceIds).toEqual([DOCUMENT_FIXTURE_IDS.child, THIRD_ID]);
    expect(plan?.cloneIds).toEqual([FIRST_CLONE_ID, SECOND_CLONE_ID]);
    expect(
      plan?.commands.map(({ element, index, owner, type }) => ({
        elementId: element.id,
        frame: element.frame,
        index,
        owner,
        type,
      })),
    ).toEqual([
      {
        elementId: FIRST_CLONE_ID,
        frame: { x: 26, y: 34, width: 120, height: 48 },
        index: 1,
        owner: { kind: 'element', elementId: DOCUMENT_FIXTURE_IDS.group },
        type: 'element.create',
      },
      {
        elementId: SECOND_CLONE_ID,
        frame: { x: 350, y: 34, width: 120, height: 48 },
        index: 4,
        owner: { kind: 'element', elementId: DOCUMENT_FIXTURE_IDS.group },
        type: 'element.create',
      },
    ]);
    expect(plan?.commands[0]?.element).toMatchObject({
      assetIds: [DOCUMENT_FIXTURE_IDS.asset],
      childIds: [],
      link: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      properties: document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.properties,
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan?.commands)).toBe(true);
  });

  it('rejects empty, stale, locked, container, inconsistent-order, and ID collision input', () => {
    const document = createDuplicateFixture();
    const lockedInput = createValidProjectDocumentInput();
    lockedInput.elementsById[DOCUMENT_FIXTURE_IDS.child]!.locked = true;
    const locked = parseProjectDocument(lockedInput);
    if (!locked.ok) {
      throw new Error('Locked selection duplicate fixture is invalid.');
    }
    const allocateFirst = createAllocator([FIRST_CLONE_ID]);

    expect(planSelectionDuplicate(document, [], CANONICAL_IDS, allocateFirst)).toBeUndefined();
    expect(
      planSelectionDuplicate(document, [STALE_ID], CANONICAL_IDS, allocateFirst),
    ).toBeUndefined();
    expect(
      planSelectionDuplicate(document, [DOCUMENT_FIXTURE_IDS.group], CANONICAL_IDS, allocateFirst),
    ).toBeUndefined();
    expect(
      planSelectionDuplicate(
        locked.value,
        [DOCUMENT_FIXTURE_IDS.child],
        [DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child],
        allocateFirst,
      ),
    ).toBeUndefined();
    expect(
      planSelectionDuplicate(
        document,
        [DOCUMENT_FIXTURE_IDS.child],
        [DOCUMENT_FIXTURE_IDS.child, DOCUMENT_FIXTURE_IDS.child],
        allocateFirst,
      ),
    ).toBeUndefined();
    expect(
      planSelectionDuplicate(
        document,
        [DOCUMENT_FIXTURE_IDS.child],
        CANONICAL_IDS,
        createAllocator([DOCUMENT_FIXTURE_IDS.child]),
      ),
    ).toBeUndefined();
    expect(
      planSelectionDuplicate(
        document,
        [DOCUMENT_FIXTURE_IDS.child, SECOND_ID],
        CANONICAL_IDS,
        createAllocator([FIRST_CLONE_ID, FIRST_CLONE_ID]),
      ),
    ).toBeUndefined();
    expect(
      planSelectionDuplicate(
        document,
        [DOCUMENT_FIXTURE_IDS.child],
        CANONICAL_IDS,
        () => 'invalid' as ElementId,
      ),
    ).toBeUndefined();
  });

  it('rejects a frame whose deterministic offset would stop being finite', () => {
    const input = createValidProjectDocumentInput();
    input.elementsById[DOCUMENT_FIXTURE_IDS.child]!.frame.x = Number.MAX_VALUE;
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) {
      throw new Error('Large-frame duplicate fixture is invalid.');
    }

    expect(
      planSelectionDuplicate(
        parsed.value,
        [DOCUMENT_FIXTURE_IDS.child],
        [DOCUMENT_FIXTURE_IDS.child],
        createAllocator([FIRST_CLONE_ID]),
      ),
    ).toBeUndefined();
  });

  it('commits siblings once, selects clones, and undoes exact local geometry and order', () => {
    const document = createDuplicateFixture();
    let history: DocumentHistoryState = createDocumentHistory(document);
    const selection = new SelectionStore();
    selection.replace([THIRD_ID, DOCUMENT_FIXTURE_IDS.child], DOCUMENT_FIXTURE_IDS.child);

    expect(
      duplicateSelectedElements(
        document,
        selection,
        CANONICAL_IDS,
        createAllocator([FIRST_CLONE_ID, SECOND_CLONE_ID]),
        {
          commit: (commands) => {
            const result = dispatchHistoryTransaction(history, commands, {
              label: 'Duplicate elements',
            });
            if (!result.ok || !result.changed) {
              return undefined;
            }
            history = result.history;
            return history.document;
          },
        },
      ),
    ).toBe(true);

    expect(history.undoEntries).toHaveLength(1);
    expect(history.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.childIds).toEqual([
      DOCUMENT_FIXTURE_IDS.child,
      FIRST_CLONE_ID,
      SECOND_ID,
      THIRD_ID,
      SECOND_CLONE_ID,
    ]);
    expect(history.document.elementsById[FIRST_CLONE_ID]?.frame).toEqual({
      x: 16 + SELECTION_DUPLICATE_POLICY.offsetWorldUnits,
      y: 24 + SELECTION_DUPLICATE_POLICY.offsetWorldUnits,
      width: 120,
      height: 48,
    });
    expect(selection.getSnapshot()).toMatchObject({
      primaryId: FIRST_CLONE_ID,
      selectedIds: [FIRST_CLONE_ID, SECOND_CLONE_ID],
    });

    const undone = undoDocumentHistory(history);
    expect(undone).toMatchObject({ changed: true, ok: true });
    expect(undone.history.document).toEqual(document);
  });

  it('preserves exact selection when planning, commit, or accepted output is unavailable', () => {
    const document = createDuplicateFixture();
    const selection = new SelectionStore();
    selection.selectOnly(DOCUMENT_FIXTURE_IDS.group);
    const selectionBefore = selection.getSnapshot();
    const commit = vi.fn(() => document);

    expect(
      duplicateSelectedElements(
        document,
        selection,
        CANONICAL_IDS,
        createAllocator([FIRST_CLONE_ID]),
        { commit },
      ),
    ).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(selection.getSnapshot()).toBe(selectionBefore);

    selection.selectOnly(DOCUMENT_FIXTURE_IDS.child);
    const duplicableSelection = selection.getSnapshot();
    expect(
      duplicateSelectedElements(
        document,
        selection,
        CANONICAL_IDS,
        createAllocator([FIRST_CLONE_ID]),
        { commit: () => undefined },
      ),
    ).toBe(false);
    expect(selection.getSnapshot()).toBe(duplicableSelection);
    expect(
      duplicateSelectedElements(
        document,
        selection,
        CANONICAL_IDS,
        createAllocator([FIRST_CLONE_ID]),
        { commit: () => document },
      ),
    ).toBe(false);
    expect(selection.getSnapshot()).toBe(duplicableSelection);
  });
});
