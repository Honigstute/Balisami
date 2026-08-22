import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  ProjectIdSchema,
  appendControlRowEdit,
  createControlRowEdits,
  createControlRowsUpdate,
  createDocumentHistory,
  createElementRowId,
  createEmptyProjectDocument,
  dispatchDocumentCommand,
  dispatchHistoryCommand,
  getControlSpec,
  listElementLinkReferences,
  parseProjectDocument,
  redoDocumentHistory,
  selectBoardCommandAvailability,
  undoDocumentHistory,
  type ElementNode,
  type ProjectDocument,
} from '../src/domain';
import { createControlInsertionCommand } from '../src/renderer/controls/control-insertion';
import { createWorldPoint } from '../src/renderer/editor/viewport-transform';

const BOARD_ID = BoardIdSchema.parse('board_controlrows');
const ELEMENT_ID = ElementIdSchema.parse('element_controlrows');
const TARGET_BOARD_ID = BoardIdSchema.parse('board_controlrows_target');

const createFixture = (): Readonly<{ document: ProjectDocument; element: ElementNode }> => {
  const created = createEmptyProjectDocument({
    boardId: BOARD_ID,
    projectId: ProjectIdSchema.parse('project_controlrows'),
  });
  if (!created.ok) throw new Error('Rows fixture project is invalid.');
  const command = createControlInsertionCommand({
    boardId: BOARD_ID,
    center: createWorldPoint(240, 160),
    controlType: CONTROL_TYPES.breadcrumbs,
    document: created.value,
    elementId: ELEMENT_ID,
  });
  const inserted = dispatchDocumentCommand(created.value, command);
  if (!inserted.ok || !inserted.changed) throw new Error('Rows fixture could not be inserted.');
  const element = inserted.document.elementsById[ELEMENT_ID];
  if (element === undefined) throw new Error('Rows fixture element is missing.');
  return Object.freeze({ document: inserted.document, element });
};

const requireDefinition = () => {
  const definition = getControlSpec(CONTROL_TYPES.breadcrumbs);
  if (definition === undefined) throw new Error('Breadcrumbs definition is missing.');
  return definition;
};

describe('registry parsed-row identity contract', () => {
  it('allocates deterministic initial identities and exposes whole-control plus row links', () => {
    const { document, element } = createFixture();
    expect(element.rowData).toEqual({
      version: 1,
      nextId: 4,
      bindings: [0, 1, 2, 3].map((generation) => ({
        generation,
        id: createElementRowId(ELEMENT_ID, generation),
        link: null,
      })),
    });

    const definition = requireDefinition();
    const edits = createControlRowEdits(definition, element);
    if (edits === undefined) throw new Error('Breadcrumb rows did not parse.');
    const linked = createControlRowsUpdate(
      definition,
      element,
      edits.map((edit, index) =>
        index === 1
          ? Object.freeze({
              ...edit,
              link: Object.freeze({ kind: 'board' as const, boardId: BOARD_ID }),
            })
          : edit,
      ),
      element.rowData.nextId,
    );
    if (linked === undefined) throw new Error('Linked row update is invalid.');
    const result = dispatchDocumentCommand(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: ELEMENT_ID,
      properties: linked.properties,
      rowData: linked.rowData,
    });
    if (!result.ok || !result.changed) throw new Error('Linked row update did not apply.');
    const linkedElement = Object.freeze({
      ...result.document.elementsById[ELEMENT_ID]!,
      // The generic reference visitor deliberately supports schemas such as
      // Text Paragraph that expose both whole-control and per-row links.
      link: Object.freeze({ kind: 'external' as const, url: 'https://example.com/control' }),
    });
    expect(listElementLinkReferences(linkedElement)).toEqual([
      { kind: 'control', link: { kind: 'external', url: 'https://example.com/control' } },
      {
        index: 1,
        kind: 'row',
        link: { kind: 'board', boardId: BOARD_ID },
        rowId: createElementRowId(ELEMENT_ID, 1),
      },
    ]);
  });

  it('keeps duplicate-label identity exact through edit, reorder, delete, add, undo, and redo', () => {
    const { document, element } = createFixture();
    const definition = requireDefinition();
    const edits = createControlRowEdits(definition, element);
    if (edits === undefined) throw new Error('Breadcrumb rows did not parse.');
    const firstUpdate = createControlRowsUpdate(
      definition,
      element,
      [
        Object.freeze({
          ...edits[1]!,
          label: 'Same',
          link: { kind: 'board' as const, boardId: BOARD_ID },
        }),
        Object.freeze({ ...edits[0]!, label: 'Same' }),
        Object.freeze({ ...edits[3]!, label: 'Last edited' }),
        edits[2]!,
      ],
      element.rowData.nextId,
    );
    if (firstUpdate === undefined) throw new Error('Explicit reorder update is invalid.');
    const first = dispatchHistoryCommand(createDocumentHistory(document), {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: ELEMENT_ID,
      properties: firstUpdate.properties,
      rowData: firstUpdate.rowData,
    });
    if (!first.ok || !first.changed) throw new Error('Explicit reorder did not commit.');
    const reordered = first.history.document.elementsById[ELEMENT_ID]!;
    expect(reordered.rowData.bindings.map((binding) => binding.generation)).toEqual([1, 0, 3, 2]);
    expect(reordered.rowData.bindings[0]?.link).toEqual({ kind: 'board', boardId: BOARD_ID });

    const reorderedEdits = createControlRowEdits(definition, reordered);
    if (reorderedEdits === undefined) throw new Error('Reordered rows did not parse.');
    const removed = createControlRowsUpdate(
      definition,
      reordered,
      reorderedEdits.filter((edit) => edit.generation !== 1),
      reordered.rowData.nextId,
    );
    if (removed === undefined) throw new Error('Delete update is invalid.');
    const removedResult = dispatchDocumentCommand(first.history.document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: ELEMENT_ID,
      properties: removed.properties,
      rowData: removed.rowData,
    });
    if (!removedResult.ok || !removedResult.changed) throw new Error('Delete did not commit.');
    const afterDelete = removedResult.document.elementsById[ELEMENT_ID]!;
    const afterDeleteEdits = createControlRowEdits(definition, afterDelete);
    if (afterDeleteEdits === undefined) throw new Error('Rows after delete did not parse.');
    const appended = appendControlRowEdit(afterDelete, afterDeleteEdits, 'New row');
    expect(appended?.edits.at(-1)).toMatchObject({
      generation: 4,
      id: createElementRowId(ELEMENT_ID, 4),
    });
    expect(appended?.nextId).toBe(5);

    const undone = undoDocumentHistory(first.history);
    expect(undone).toMatchObject({ ok: true, changed: true });
    if (!undone.ok || !undone.changed) return;
    expect(undone.history.document).toEqual(document);
    const redone = redoDocumentHistory(undone.history);
    expect(redone).toMatchObject({ ok: true, changed: true });
    if (!redone.ok || !redone.changed) return;
    expect(redone.history.document).toEqual(first.history.document);
  });

  it('rejects hidden row-source changes and malformed ownership metadata', () => {
    const { document, element } = createFixture();
    const hidden = dispatchDocumentCommand(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: ELEMENT_ID,
      properties: Object.freeze({ ...element.properties, items: 'One › Two' }),
    });
    expect(hidden).toMatchObject({ ok: false, error: { code: 'conflict' } });

    const malformedElement = element;
    const malformed = {
      ...document,
      elementsById: {
        ...document.elementsById,
        [ELEMENT_ID]: {
          ...malformedElement,
          rowData: {
            ...malformedElement.rowData,
            bindings: malformedElement.rowData.bindings.map((binding, index) =>
              index === 0 ? { ...binding, id: createElementRowId(ELEMENT_ID, 9) } : binding,
            ),
          },
        },
      },
    };
    const parsed = parseProjectDocument(malformed);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(
      parsed.issues.some((issue) => issue.path.includes('bindings') && issue.path.includes(0)),
    ).toBe(true);
  });

  it('blocks hard board deletion through a row link and preserves a linked Trash target', () => {
    const { document, element } = createFixture();
    const createdBoard = dispatchDocumentCommand(document, {
      type: DOCUMENT_COMMAND_TYPES.createBoard,
      board: {
        id: TARGET_BOARD_ID,
        name: 'Row target',
        note: { text: '' },
        childIds: [],
        alternateIds: [],
        selectedAlternateId: null,
      },
      index: 1,
    });
    if (!createdBoard.ok || !createdBoard.changed) throw new Error('Target board was not created.');
    const definition = requireDefinition();
    const edits = createControlRowEdits(definition, element);
    if (edits === undefined) throw new Error('Target row labels did not parse.');
    const update = createControlRowsUpdate(
      definition,
      element,
      edits.map((edit, index) =>
        index === 0
          ? Object.freeze({
              ...edit,
              link: Object.freeze({ kind: 'board' as const, boardId: TARGET_BOARD_ID }),
            })
          : edit,
      ),
      element.rowData.nextId,
    );
    if (update === undefined) throw new Error('Target row link is invalid.');
    const linked = dispatchDocumentCommand(createdBoard.document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: ELEMENT_ID,
      properties: update.properties,
      rowData: update.rowData,
    });
    if (!linked.ok || !linked.changed) throw new Error('Target row link did not apply.');

    expect(selectBoardCommandAvailability(linked.document, TARGET_BOARD_ID)?.canDelete).toBe(false);
    const deletion = dispatchDocumentCommand(linked.document, {
      type: DOCUMENT_COMMAND_TYPES.deleteBoard,
      boardId: TARGET_BOARD_ID,
    });
    expect(deletion).toMatchObject({
      ok: false,
      error: {
        code: 'conflict',
        message: `Board '${TARGET_BOARD_ID}' is linked from element '${ELEMENT_ID}'.`,
      },
    });

    const trashed = dispatchDocumentCommand(linked.document, {
      type: DOCUMENT_COMMAND_TYPES.trashBoard,
      boardId: TARGET_BOARD_ID,
      toIndex: 0,
    });
    if (!trashed.ok || !trashed.changed) throw new Error('Linked target was not moved to Trash.');
    expect(trashed.document.trashedBoardIds).toContain(TARGET_BOARD_ID);
    expect(
      listElementLinkReferences(trashed.document.elementsById[ELEMENT_ID]!).at(-1)?.link,
    ).toEqual({ kind: 'board', boardId: TARGET_BOARD_ID });
  });
});
