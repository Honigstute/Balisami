// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { BoardIdSchema, ElementIdSchema, dispatchDocumentCommand } from '../src/domain';
import { planBoardDuplicate } from '../src/renderer/projects/board-duplicate';
import { createAssetFreeProjectDocument, parseProjectFileFixture } from './fixtures/project-file';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const CLONE_BOARD_ID = BoardIdSchema.parse('board_duplicate01');
const CLONE_GROUP_ID = ElementIdSchema.parse('element_duplicate_group');
const CLONE_CHILD_ID = ElementIdSchema.parse('element_duplicate_child');
const SOURCE_ALTERNATE_ID = BoardIdSchema.parse('board_duplicate_source_alt');

describe('board duplicate planner', () => {
  it('clones the complete nested board in canonical order and remaps self-links', () => {
    const document = createAssetFreeProjectDocument();
    const allocatedIds = [CLONE_GROUP_ID, CLONE_CHILD_ID];
    const plan = planBoardDuplicate(
      document,
      DOCUMENT_FIXTURE_IDS.board,
      CLONE_BOARD_ID,
      (_sourceId, index) => allocatedIds[index],
    );
    expect(plan?.sourceElementIds).toEqual([
      DOCUMENT_FIXTURE_IDS.group,
      DOCUMENT_FIXTURE_IDS.child,
    ]);
    expect(plan?.commands.map((command) => command.type)).toEqual([
      'board.create',
      'element.create',
      'element.create',
    ]);
    if (plan === undefined) {
      throw new Error('Expected a board duplicate plan.');
    }

    let duplicated = document;
    for (const command of plan.commands) {
      const result = dispatchDocumentCommand(duplicated, command);
      if (!result.ok || !result.changed) {
        throw new Error(`Duplicate command '${command.type}' did not apply.`);
      }
      duplicated = result.document;
    }

    expect(duplicated.boardIds).toEqual([DOCUMENT_FIXTURE_IDS.board, CLONE_BOARD_ID]);
    expect(duplicated.boardsById[CLONE_BOARD_ID]).toMatchObject({
      childIds: [CLONE_GROUP_ID],
      name: 'Main wireframe copy',
      note: { text: 'Fixture board note' },
    });
    expect(duplicated.elementsById[CLONE_GROUP_ID]).toMatchObject({
      childIds: [CLONE_CHILD_ID],
      frame: document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.frame,
      properties: document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.properties,
    });
    expect(duplicated.elementsById[CLONE_CHILD_ID]).toMatchObject({
      link: { kind: 'board', boardId: CLONE_BOARD_ID },
      frame: document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.frame,
      properties: document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.properties,
    });
  });

  it('rejects board and element ID collisions before emitting any commands', () => {
    const document = createAssetFreeProjectDocument();

    expect(
      planBoardDuplicate(
        document,
        DOCUMENT_FIXTURE_IDS.board,
        DOCUMENT_FIXTURE_IDS.board,
        () => CLONE_CHILD_ID,
      ),
    ).toBeUndefined();
    expect(
      planBoardDuplicate(
        document,
        DOCUMENT_FIXTURE_IDS.board,
        CLONE_BOARD_ID,
        () => CLONE_CHILD_ID,
      ),
    ).toBeUndefined();
    expect(
      planBoardDuplicate(document, DOCUMENT_FIXTURE_IDS.board, CLONE_BOARD_ID, () =>
        ElementIdSchema.parse(DOCUMENT_FIXTURE_IDS.child),
      ),
    ).toBeUndefined();
  });

  it('duplicates only the selected alternate content into a new official board', () => {
    const input = createValidProjectDocumentInput();
    const canonicalBoard = input.boardsById[DOCUMENT_FIXTURE_IDS.board];
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (canonicalBoard === undefined || child === undefined) {
      throw new Error('Selected-version duplicate fixture is incomplete.');
    }
    child.assetIds = [];
    input.assetsById = {};
    canonicalBoard.childIds = [];
    canonicalBoard.alternateIds = [SOURCE_ALTERNATE_ID];
    canonicalBoard.selectedAlternateId = SOURCE_ALTERNATE_ID;
    input.boardsById[SOURCE_ALTERNATE_ID] = {
      id: SOURCE_ALTERNATE_ID,
      name: 'Review draft',
      note: { text: 'Alternate content' },
      childIds: [DOCUMENT_FIXTURE_IDS.group],
      alternateIds: [],
      selectedAlternateId: null,
    };
    const document = parseProjectFileFixture(input);
    const cloneIds = [CLONE_GROUP_ID, CLONE_CHILD_ID];
    const plan = planBoardDuplicate(
      document,
      DOCUMENT_FIXTURE_IDS.board,
      CLONE_BOARD_ID,
      (_sourceId, index) => cloneIds[index],
    );
    if (plan === undefined) {
      throw new Error('Expected a selected-version board duplicate plan.');
    }

    expect(plan.sourceVersionId).toBe(SOURCE_ALTERNATE_ID);
    let duplicated = document;
    for (const command of plan.commands) {
      const result = dispatchDocumentCommand(duplicated, command);
      if (!result.ok || !result.changed) {
        throw new Error(`Duplicate command '${command.type}' did not apply.`);
      }
      duplicated = result.document;
    }
    expect(duplicated.boardsById[CLONE_BOARD_ID]).toMatchObject({
      alternateIds: [],
      childIds: [CLONE_GROUP_ID],
      name: 'Main wireframe copy',
      note: { text: 'Alternate content' },
      selectedAlternateId: null,
    });
    expect(duplicated.elementsById[CLONE_CHILD_ID]?.link).toEqual({
      kind: 'board',
      boardId: CLONE_BOARD_ID,
    });
  });
});
