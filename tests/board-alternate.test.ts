// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  ElementIdSchema,
  createDocumentHistory,
  dispatchDocumentCommand,
  dispatchHistoryTransaction,
  undoDocumentHistory,
  type DocumentCommand,
  type ProjectDocument,
} from '../src/domain';
import { planBoardAlternateClone } from '../src/renderer/projects/board-alternate';
import { parseProjectFileFixture } from './fixtures/project-file';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const SOURCE_ALTERNATE_ID = BoardIdSchema.parse('board_alternate_source');
const CLONE_ALTERNATE_ID = BoardIdSchema.parse('board_alternate_clone');
const CLONE_GROUP_ID = ElementIdSchema.parse('element_altclone_group');
const CLONE_CHILD_ID = ElementIdSchema.parse('element_altclone_child');

const createSelectedAlternateDocument = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const canonicalBoard = input.boardsById[DOCUMENT_FIXTURE_IDS.board];
  const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
  if (canonicalBoard === undefined || child === undefined) {
    throw new Error('Alternate fixture source is incomplete.');
  }
  child.assetIds = [];
  input.assetsById = {};
  canonicalBoard.childIds = [];
  canonicalBoard.alternateIds = [SOURCE_ALTERNATE_ID];
  canonicalBoard.selectedAlternateId = SOURCE_ALTERNATE_ID;
  input.boardsById[SOURCE_ALTERNATE_ID] = {
    id: SOURCE_ALTERNATE_ID,
    name: 'Client draft',
    note: { text: 'Selected alternate note' },
    childIds: [DOCUMENT_FIXTURE_IDS.group],
    alternateIds: [],
    selectedAlternateId: null,
  };
  return parseProjectFileFixture(input);
};

const applyPlan = (
  document: ProjectDocument,
  commands: readonly DocumentCommand[],
): ProjectDocument => {
  let current = document;
  for (const command of commands) {
    const result = dispatchDocumentCommand(current, command);
    if (!result.ok || !result.changed) {
      throw new Error(`Alternate command '${command.type}' did not apply.`);
    }
    current = result.document;
  }
  return current;
};

describe('board alternate planner', () => {
  it('clones the selected version with fresh ownership, canonical links, and a unique name', () => {
    const document = createSelectedAlternateDocument();
    const cloneIds = [CLONE_GROUP_ID, CLONE_CHILD_ID];
    const plan = planBoardAlternateClone(
      document,
      DOCUMENT_FIXTURE_IDS.board,
      CLONE_ALTERNATE_ID,
      (_sourceId, index) => cloneIds[index],
      'create',
    );
    if (plan === undefined) {
      throw new Error('Expected an alternate clone plan.');
    }

    expect(plan.sourceVersionId).toBe(SOURCE_ALTERNATE_ID);
    expect(plan.commands.map((command) => command.type)).toEqual([
      'board.create-alternate',
      'element.create',
      'element.create',
    ]);
    const cloned = applyPlan(document, plan.commands);

    expect(cloned.boardIds).toEqual([DOCUMENT_FIXTURE_IDS.board]);
    expect(cloned.boardsById[DOCUMENT_FIXTURE_IDS.board]).toMatchObject({
      alternateIds: [SOURCE_ALTERNATE_ID, CLONE_ALTERNATE_ID],
      selectedAlternateId: CLONE_ALTERNATE_ID,
    });
    expect(cloned.boardsById[CLONE_ALTERNATE_ID]).toMatchObject({
      childIds: [CLONE_GROUP_ID],
      name: 'Alternate 1',
      note: { text: 'Selected alternate note' },
    });
    expect(cloned.elementsById[CLONE_GROUP_ID]?.childIds).toEqual([CLONE_CHILD_ID]);
    expect(cloned.elementsById[CLONE_CHILD_ID]?.link).toEqual({
      kind: 'board',
      boardId: DOCUMENT_FIXTURE_IDS.board,
    });

    const transaction = dispatchHistoryTransaction(createDocumentHistory(document), plan.commands, {
      label: 'Create alternate',
    });
    expect(transaction).toMatchObject({ changed: true, ok: true });
    if (!transaction.ok || !transaction.changed) {
      throw new Error('Alternate transaction did not apply.');
    }
    expect(transaction.history.undoEntries).toHaveLength(1);
    expect(undoDocumentHistory(transaction.history)).toMatchObject({
      changed: true,
      history: { document },
      ok: true,
    });
  });

  it('names a duplicated version from the selected source and rejects collisions up front', () => {
    const document = createSelectedAlternateDocument();
    const plan = planBoardAlternateClone(
      document,
      DOCUMENT_FIXTURE_IDS.board,
      CLONE_ALTERNATE_ID,
      (_sourceId, index) => [CLONE_GROUP_ID, CLONE_CHILD_ID][index],
      'duplicate',
    );
    expect(plan?.commands[0]).toMatchObject({
      alternate: { name: 'Client draft copy' },
    });

    expect(
      planBoardAlternateClone(
        document,
        DOCUMENT_FIXTURE_IDS.board,
        SOURCE_ALTERNATE_ID,
        () => CLONE_GROUP_ID,
        'create',
      ),
    ).toBeUndefined();
    expect(
      planBoardAlternateClone(
        document,
        DOCUMENT_FIXTURE_IDS.board,
        CLONE_ALTERNATE_ID,
        () => DOCUMENT_FIXTURE_IDS.child,
        'create',
      ),
    ).toBeUndefined();
  });
});
