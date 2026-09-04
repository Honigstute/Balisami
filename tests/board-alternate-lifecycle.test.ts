// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  createDocumentHistory,
  dispatchHistoryTransaction,
  selectBoardElementIds,
  selectElementWorldBounds,
  selectSelectionWorldBounds,
  undoDocumentHistory,
  type ElementId,
  type ProjectDocument,
} from '../src/domain';
import {
  BOARD_ALTERNATE_MERGE_GAP,
  planBoardAlternateDiscard,
  planBoardAlternateMerge,
  planBoardAlternatePromote,
} from '../src/renderer/projects/board-alternate-lifecycle';
import { parseProjectFileFixture } from './fixtures/project-file';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const ALTERNATE_ID = BoardIdSchema.parse('board_lifecycle_alt');
const FORMER_OFFICIAL_ID = BoardIdSchema.parse('board_lifecycle_former');
const ALTERNATE_GROUP_ID = ElementIdSchema.parse('element_lifecycle_altgroup');
const ALTERNATE_CHILD_ID = ElementIdSchema.parse('element_lifecycle_altchild');
const CLONE_IDS = [
  ElementIdSchema.parse('element_lifecycle_clone01'),
  ElementIdSchema.parse('element_lifecycle_clone02'),
  ElementIdSchema.parse('element_lifecycle_clone03'),
  ElementIdSchema.parse('element_lifecycle_clone04'),
] as const;

const createLifecycleDocument = (alternateOwnsAsset = false): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const canonicalBoard = input.boardsById[DOCUMENT_FIXTURE_IDS.board];
  const group = input.elementsById[DOCUMENT_FIXTURE_IDS.group];
  const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
  if (canonicalBoard === undefined || group === undefined || child === undefined) {
    throw new Error('Alternate lifecycle fixture is incomplete.');
  }
  child.assetIds = [];
  if (!alternateOwnsAsset) {
    input.assetsById = {};
  }
  canonicalBoard.alternateIds = [ALTERNATE_ID];
  canonicalBoard.selectedAlternateId = ALTERNATE_ID;
  input.boardsById[ALTERNATE_ID] = {
    id: ALTERNATE_ID,
    name: 'Client direction',
    note: { text: 'Alternate note' },
    childIds: [ALTERNATE_GROUP_ID],
    alternateIds: [],
    selectedAlternateId: null,
  };
  input.elementsById[ALTERNATE_GROUP_ID] = {
    ...group,
    id: ALTERNATE_GROUP_ID,
    frame: { x: 420, y: 32, width: 260, height: 160 },
    childIds: [ALTERNATE_CHILD_ID],
  };
  input.elementsById[ALTERNATE_CHILD_ID] = {
    ...child,
    assetIds: alternateOwnsAsset ? [DOCUMENT_FIXTURE_IDS.asset] : [],
    id: ALTERNATE_CHILD_ID,
    frame: { x: 20, y: 30, width: 100, height: 40 },
    link: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
  };
  return parseProjectFileFixture(input);
};

const allocateFrom = (ids: readonly ElementId[]) => (_sourceId: ElementId, index: number) =>
  ids[index];

const applyTransaction = (document: ProjectDocument, commands: readonly unknown[]) => {
  const result = dispatchHistoryTransaction(createDocumentHistory(document), commands, {
    label: 'Alternate lifecycle',
  });
  if (!result.ok || !result.changed) {
    throw new Error(`Alternate lifecycle transaction failed: ${JSON.stringify(result)}`);
  }
  return result.history;
};

describe('board alternate lifecycle planners', () => {
  it('promotes a selected alternate, retains its source, and preserves the former Official', () => {
    const document = createLifecycleDocument();
    const plan = planBoardAlternatePromote(
      document,
      DOCUMENT_FIXTURE_IDS.board,
      ALTERNATE_ID,
      FORMER_OFFICIAL_ID,
      allocateFrom(CLONE_IDS),
    );
    if (plan === undefined) {
      throw new Error('Expected an alternate promotion plan.');
    }
    const history = applyTransaction(document, plan.commands);
    const promoted = history.document;

    expect(promoted.boardsById[DOCUMENT_FIXTURE_IDS.board]).toMatchObject({
      alternateIds: [ALTERNATE_ID, FORMER_OFFICIAL_ID],
      childIds: [CLONE_IDS[2]],
      note: { text: 'Alternate note' },
      selectedAlternateId: null,
    });
    expect(promoted.boardsById[ALTERNATE_ID]).toBe(document.boardsById[ALTERNATE_ID]);
    expect(promoted.boardsById[FORMER_OFFICIAL_ID]).toMatchObject({
      childIds: [CLONE_IDS[0]],
      name: 'Former Official',
      note: { text: 'Fixture board note' },
    });
    expect(promoted.elementsById[CLONE_IDS[3]]?.link).toEqual({
      kind: 'board',
      boardId: DOCUMENT_FIXTURE_IDS.board,
    });
    expect(history.undoEntries).toHaveLength(1);
    expect(undoDocumentHistory(history)).toMatchObject({
      changed: true,
      history: { document },
      ok: true,
    });
  });

  it('merges selected roots to the right, combines differing notes, and retains the alternate', () => {
    const document = createLifecycleDocument();
    const officialElementIds = selectBoardElementIds(document, DOCUMENT_FIXTURE_IDS.board);
    const officialBounds =
      officialElementIds === undefined
        ? undefined
        : selectSelectionWorldBounds(document, officialElementIds);
    const plan = planBoardAlternateMerge(
      document,
      DOCUMENT_FIXTURE_IDS.board,
      ALTERNATE_ID,
      allocateFrom(CLONE_IDS.slice(0, 2)),
    );
    if (plan === undefined || officialBounds === undefined) {
      throw new Error('Expected an alternate merge plan and official bounds.');
    }
    const history = applyTransaction(document, plan.commands);
    const merged = history.document;
    const mergedRootBounds = selectElementWorldBounds(merged, CLONE_IDS[0]);

    expect(merged.boardsById[DOCUMENT_FIXTURE_IDS.board]).toMatchObject({
      alternateIds: [ALTERNATE_ID],
      childIds: [DOCUMENT_FIXTURE_IDS.group, CLONE_IDS[0]],
      note: { text: 'Fixture board note\n\n---\n\nAlternate note' },
      selectedAlternateId: null,
    });
    expect(mergedRootBounds?.x).toBe(
      officialBounds.x + officialBounds.width + BOARD_ALTERNATE_MERGE_GAP,
    );
    expect(merged.boardsById[ALTERNATE_ID]).toBe(document.boardsById[ALTERNATE_ID]);
    expect(undoDocumentHistory(history)).toMatchObject({
      changed: true,
      history: { document },
      ok: true,
    });
  });

  it('discards the selected alternate subtree through one exactly undoable transaction', () => {
    const document = createLifecycleDocument();
    const plan = planBoardAlternateDiscard(document, DOCUMENT_FIXTURE_IDS.board, ALTERNATE_ID);
    if (plan === undefined) {
      throw new Error('Expected an alternate discard plan.');
    }
    const history = applyTransaction(document, plan.commands);

    expect(history.document.boardsById[ALTERNATE_ID]).toBeUndefined();
    expect(history.document.elementsById[ALTERNATE_GROUP_ID]).toBeUndefined();
    expect(history.document.elementsById[ALTERNATE_CHILD_ID]).toBeUndefined();
    expect(history.document.boardsById[DOCUMENT_FIXTURE_IDS.board]).toMatchObject({
      alternateIds: [],
      selectedAlternateId: null,
    });
    expect(history.undoEntries).toHaveLength(1);
    expect(undoDocumentHistory(history)).toMatchObject({
      changed: true,
      history: { document },
      ok: true,
    });
  });

  it('deletes an asset owned only by discarded alternate content and restores it on undo', () => {
    const document = createLifecycleDocument(true);
    const plan = planBoardAlternateDiscard(document, DOCUMENT_FIXTURE_IDS.board, ALTERNATE_ID);
    if (plan === undefined) {
      throw new Error('Expected an asset-owning alternate discard plan.');
    }
    expect(plan.commands.at(-1)).toEqual({
      type: DOCUMENT_COMMAND_TYPES.deleteAsset,
      assetId: DOCUMENT_FIXTURE_IDS.asset,
    });

    const history = applyTransaction(document, plan.commands);
    expect(history.document.assetsById[DOCUMENT_FIXTURE_IDS.asset]).toBeUndefined();
    expect(undoDocumentHistory(history)).toMatchObject({
      changed: true,
      history: { document },
      ok: true,
    });
  });

  it('rejects lifecycle actions unless the target is the selected family member', () => {
    const document = createLifecycleDocument();
    expect(
      planBoardAlternateMerge(
        document,
        DOCUMENT_FIXTURE_IDS.board,
        FORMER_OFFICIAL_ID,
        allocateFrom(CLONE_IDS),
      ),
    ).toBeUndefined();
    expect(
      planBoardAlternateDiscard(document, DOCUMENT_FIXTURE_IDS.board, FORMER_OFFICIAL_ID),
    ).toBeUndefined();
  });
});
