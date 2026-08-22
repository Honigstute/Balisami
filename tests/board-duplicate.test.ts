// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  ProjectIdSchema,
  createControlRowEdits,
  createControlRowsUpdate,
  createElementRowId,
  createEmptyProjectDocument,
  dispatchDocumentCommand,
  getControlSpec,
} from '../src/domain';
import { createControlInsertionCommand } from '../src/renderer/controls/control-insertion';
import { createWorldPoint } from '../src/renderer/editor/viewport-transform';
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

  it('re-keys parsed rows and remaps their self-board links through the shared clone path', () => {
    const sourceBoardId = BoardIdSchema.parse('board_rowclone_source');
    const sourceElementId = ElementIdSchema.parse('element_rowclone_source');
    const cloneBoardId = BoardIdSchema.parse('board_rowclone_target');
    const cloneElementId = ElementIdSchema.parse('element_rowclone_target');
    const created = createEmptyProjectDocument({
      boardId: sourceBoardId,
      projectId: ProjectIdSchema.parse('project_rowclone'),
    });
    if (!created.ok) throw new Error('Row clone project is invalid.');
    const inserted = dispatchDocumentCommand(
      created.value,
      createControlInsertionCommand({
        boardId: sourceBoardId,
        center: createWorldPoint(160, 120),
        controlType: CONTROL_TYPES.breadcrumbs,
        document: created.value,
        elementId: sourceElementId,
      }),
    );
    if (!inserted.ok || !inserted.changed) throw new Error('Row clone control was not inserted.');
    const definition = getControlSpec(CONTROL_TYPES.breadcrumbs);
    const sourceElement = inserted.document.elementsById[sourceElementId];
    if (definition === undefined || sourceElement === undefined) {
      throw new Error('Row clone definition is missing.');
    }
    const edits = createControlRowEdits(definition, sourceElement);
    if (edits === undefined) throw new Error('Row clone labels did not parse.');
    const update = createControlRowsUpdate(
      definition,
      sourceElement,
      edits.map((edit, index) =>
        index === 0
          ? Object.freeze({
              ...edit,
              link: Object.freeze({ kind: 'board' as const, boardId: sourceBoardId }),
            })
          : edit,
      ),
      sourceElement.rowData.nextId,
    );
    if (update === undefined) throw new Error('Row clone link update is invalid.');
    const linked = dispatchDocumentCommand(inserted.document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: sourceElementId,
      properties: update.properties,
      rowData: update.rowData,
    });
    if (!linked.ok || !linked.changed) throw new Error('Row clone link did not apply.');
    const plan = planBoardDuplicate(
      linked.document,
      sourceBoardId,
      cloneBoardId,
      () => cloneElementId,
    );
    if (plan === undefined) throw new Error('Row board clone could not be planned.');
    const createClone = plan.commands.find(
      (command) => command.type === DOCUMENT_COMMAND_TYPES.createElement,
    );
    expect(createClone?.element.rowData.bindings[0]).toEqual({
      generation: 0,
      id: createElementRowId(cloneElementId, 0),
      link: { kind: 'board', boardId: cloneBoardId },
    });
    expect(createClone?.element.rowData.nextId).toBe(sourceElement.rowData.nextId);
  });
});
