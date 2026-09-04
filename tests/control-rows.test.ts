import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  ProjectIdSchema,
  appendControlRowEdit,
  createControlRowEdits,
  createControlRowSelectionUpdate,
  createControlRowsUpdate,
  createDocumentHistory,
  createElementRowId,
  createEmptyProjectDocument,
  dispatchDocumentCommand,
  dispatchHistoryCommand,
  getControlSpec,
  listElementLinkReferences,
  MAX_CONTROL_ROW_DEPTH,
  formatControlRowSource,
  parseControlRowSource,
  parseControlRows,
  parseProjectDocument,
  rekeyControlRowState,
  redoDocumentHistory,
  selectBoardCommandAvailability,
  undoDocumentHistory,
  type ElementNode,
  type ControlTypeId,
  type ProjectDocument,
} from '../src/domain';
import { createControlInsertionCommand } from '../src/renderer/controls/control-insertion';
import { decodeProjectFileEnvelope, encodeProjectFileEnvelope } from '../src/persistence';
import {
  captureSelectionClipboardPayload,
  planSelectionPaste,
} from '../src/renderer/editor/selection-clipboard';
import { planSelectionDuplicate } from '../src/renderer/editor/selection-duplicate';
import { createWorldPoint } from '../src/renderer/editor/viewport-transform';
import { planBoardContentClone } from '../src/renderer/projects/board-content-clone';

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

const createSelectionFixture = (controlType: ControlTypeId) => {
  const created = createEmptyProjectDocument({
    boardId: BOARD_ID,
    projectId: ProjectIdSchema.parse('project_selectionrows'),
  });
  if (!created.ok) throw new Error('Selection rows fixture project is invalid.');
  const definition = getControlSpec(controlType);
  if (definition === undefined) throw new Error(`Definition '${controlType}' is missing.`);
  const command = createControlInsertionCommand({
    boardId: BOARD_ID,
    center: createWorldPoint(240, 160),
    controlType,
    document: created.value,
    elementId: ELEMENT_ID,
  });
  const inserted = dispatchDocumentCommand(created.value, command);
  if (!inserted.ok || !inserted.changed)
    throw new Error('Selection rows fixture was not inserted.');
  const element = inserted.document.elementsById[ELEMENT_ID];
  if (element === undefined) throw new Error('Selection rows fixture element is missing.');
  return Object.freeze({ definition, document: inserted.document, element });
};

describe('registry parsed-row identity contract', () => {
  it('parses only the documented marker grammar and keeps disabled notation on the label', () => {
    const checkbox = getControlSpec(CONTROL_TYPES.checkboxGroup);
    const radio = getControlSpec(CONTROL_TYPES.radioButtonGroup);
    if (checkbox?.rows === null || checkbox?.rows === undefined) {
      throw new Error('Checkbox Group rows are missing.');
    }
    if (radio?.rows === null || radio?.rows === undefined) {
      throw new Error('Radio Button Group rows are missing.');
    }

    expect(parseControlRowSource(checkbox.rows, '[x] -disabled selected-')).toEqual({
      adornment: null,
      depth: 0,
      disabled: true,
      label: 'disabled selected',
      marker: 'selected',
    });
    expect(parseControlRowSource(radio.rows, '(o) -option 5-')).toEqual({
      adornment: null,
      depth: 0,
      disabled: true,
      label: 'option 5',
      marker: 'selected',
    });
    expect(parseControlRowSource(checkbox.rows, 'Plain text row')).toEqual({
      adornment: null,
      depth: 0,
      disabled: false,
      label: 'Plain text row',
      marker: null,
    });
    expect(parseControlRowSource(checkbox.rows, '(o) wrong group')).toBeUndefined();
    expect(parseControlRowSource(checkbox.rows, '[o] wrong token')).toBeUndefined();
    expect(parseControlRowSource(radio.rows, '[x] wrong group')).toBeUndefined();
    expect(parseControlRowSource(radio.rows, '(x) wrong token')).toBeUndefined();
    expect(parseControlRowSource(checkbox.rows, '-[x] wrong disabled location-')).toBeUndefined();
    expect(
      formatControlRowSource(checkbox.rows, {
        adornment: null,
        depth: 0,
        disabled: true,
        label: 'disabled selected',
        marker: 'selected',
      }),
    ).toBe('[x] -disabled selected-');
  });

  it('parses exact tree adornments and preserves documented dot or space indentation', () => {
    const tree = getControlSpec(CONTROL_TYPES.treePane);
    if (tree?.rows === null || tree?.rows === undefined) {
      throw new Error('Tree Pane rows are missing.');
    }
    expect(parseControlRows(tree.rows, { items: '..f Dot child\n  F Space child' })).toEqual([
      {
        adornment: 'folder-closed',
        depth: 2,
        disabled: false,
        label: 'Dot child',
        marker: null,
      },
      {
        adornment: 'folder-open',
        depth: 2,
        disabled: false,
        label: 'Space child',
        marker: null,
      },
    ]);
    expect(parseControlRowSource(tree.rows, '. f Ambiguous')).toBeUndefined();
    expect(
      parseControlRowSource(tree.rows, `${'.'.repeat(MAX_CONTROL_ROW_DEPTH + 1)}f Too deep`),
    ).toBeUndefined();
    expect(parseControlRows(tree.rows, { items: '\tf Becomes root' })).toBeUndefined();
    expect(
      formatControlRowSource(tree.rows, {
        adornment: 'file',
        depth: 2,
        disabled: false,
        label: 'Leaf',
        marker: null,
      }),
    ).toBe('..- Leaf');
  });

  it('preserves marker and disabled state through atomic edits, reorder, append, undo, and redo', () => {
    const { definition, document, element } = createSelectionFixture(CONTROL_TYPES.checkboxGroup);
    const edits = createControlRowEdits(definition, element);
    if (edits === undefined) throw new Error('Checkbox Group rows did not parse.');
    expect(edits.map(({ disabled, marker }) => [marker, disabled])).toEqual([
      ['unchecked', false],
      ['selected', false],
      ['indeterminate', false],
      ['unchecked', true],
      ['selected', true],
      ['indeterminate', true],
      [null, false],
    ]);

    const appended = appendControlRowEdit(definition, element, edits, 'New row');
    expect(appended?.edits.at(-1)?.marker).toBe('unchecked');
    if (appended === undefined) throw new Error('Checkbox Group append is invalid.');
    const update = createControlRowsUpdate(
      definition,
      element,
      [
        Object.freeze({ ...edits[1]!, label: 'Selected edited' }),
        edits[0]!,
        ...edits.slice(2),
        appended.edits.at(-1)!,
      ],
      appended.nextId,
    );
    if (update === undefined) throw new Error('Checkbox Group update is invalid.');
    expect(update.rowData.bindings.slice(0, 2).map(({ id }) => id)).toEqual([
      edits[1]!.id,
      edits[0]!.id,
    ]);
    expect(update.properties.items).toContain('[x] Selected edited');
    expect(update.properties.items).toContain('[ ] New row');

    const committed = dispatchHistoryCommand(createDocumentHistory(document), {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: ELEMENT_ID,
      ...update,
    });
    if (!committed.ok || !committed.changed) throw new Error('Checkbox Group edit did not commit.');
    const undone = undoDocumentHistory(committed.history);
    if (!undone.ok || !undone.changed) throw new Error('Checkbox Group edit did not undo.');
    expect(undone.history.document).toEqual(document);
    const redone = redoDocumentHistory(undone.history);
    if (!redone.ok || !redone.changed) throw new Error('Checkbox Group edit did not redo.');
    expect(redone.history.document).toEqual(committed.history.document);
  });

  it('materializes required and optional selection defaults and validates allow-none', () => {
    const buttonBar = createSelectionFixture(CONTROL_TYPES.buttonBar);
    const linkBar = createSelectionFixture(CONTROL_TYPES.linkBar);
    const buttonIds = buttonBar.element.rowData.bindings.map((binding) => binding.id);

    expect(buttonBar.element.properties.selectedRowId).toBe(buttonIds[0]);
    expect(linkBar.element.properties.selectedRowId).toBeNull();
    expect(
      createControlRowSelectionUpdate(buttonBar.definition, buttonBar.element, null),
    ).toBeUndefined();
    expect(
      createControlRowSelectionUpdate(linkBar.definition, linkBar.element, null),
    ).toMatchObject({
      properties: { selectedRowId: null },
    });
    expect(
      createControlRowSelectionUpdate(
        buttonBar.definition,
        buttonBar.element,
        createElementRowId(ElementIdSchema.parse('element_foreignrows'), 0),
      ),
    ).toBeUndefined();

    for (const selectedRowId of [
      null,
      createElementRowId(ElementIdSchema.parse('element_foreignrows'), 0),
    ]) {
      const malformed = {
        ...buttonBar.document,
        elementsById: {
          ...buttonBar.document.elementsById,
          [ELEMENT_ID]: {
            ...buttonBar.element,
            properties: { ...buttonBar.element.properties, selectedRowId },
          },
        },
      };
      expect(parseProjectDocument(malformed).ok).toBe(false);
    }
  });

  it('preserves stable selection through edits and reorder, replaces deletion deterministically, and rekeys clones atomically', () => {
    const { definition, document, element } = createSelectionFixture(CONTROL_TYPES.buttonBar);
    const edits = createControlRowEdits(definition, element);
    if (edits === undefined) throw new Error('Button Bar rows did not parse.');
    const selected = edits[1]!.id;
    const selectedUpdate = createControlRowSelectionUpdate(definition, element, selected);
    if (selectedUpdate === undefined) throw new Error('Button Bar selection is invalid.');
    const selectedElement = Object.freeze({ ...element, ...selectedUpdate });
    const reordered = createControlRowsUpdate(
      definition,
      selectedElement,
      [Object.freeze({ ...edits[2]!, label: 'Three edited' }), edits[1]!, edits[0]!],
      element.rowData.nextId,
    );
    if (reordered === undefined) throw new Error('Button Bar reorder is invalid.');
    expect(reordered.properties.selectedRowId).toBe(selected);

    const reorderedElement = Object.freeze({ ...selectedElement, ...reordered });
    const reorderedEdits = createControlRowEdits(definition, reorderedElement);
    if (reorderedEdits === undefined) throw new Error('Reordered Button Bar rows did not parse.');
    const deleted = createControlRowsUpdate(
      definition,
      reorderedElement,
      reorderedEdits.filter((edit) => edit.id !== selected),
      reorderedElement.rowData.nextId,
    );
    if (deleted === undefined) throw new Error('Button Bar delete is invalid.');
    expect(deleted.properties.selectedRowId).toBe(edits[0]!.id);

    const lastSelectedUpdate = createControlRowSelectionUpdate(
      definition,
      element,
      edits.at(-1)!.id,
    );
    if (lastSelectedUpdate === undefined) throw new Error('Last Button Bar row is invalid.');
    const lastSelectedElement = Object.freeze({ ...element, ...lastSelectedUpdate });
    const deletedLast = createControlRowsUpdate(
      definition,
      lastSelectedElement,
      edits.slice(0, -1),
      element.rowData.nextId,
    );
    if (deletedLast === undefined) throw new Error('Last Button Bar delete is invalid.');
    expect(deletedLast.properties.selectedRowId).toBe(edits.at(-2)!.id);

    const cloneId = ElementIdSchema.parse('element_controlrows_clone');
    const rekeyed = rekeyControlRowState(
      definition,
      reordered.properties,
      reordered.rowData,
      cloneId,
    );
    if (rekeyed === undefined) throw new Error('Button Bar clone rekey is invalid.');
    expect(rekeyed.rowData.bindings.map((binding) => binding.id)).toEqual([
      createElementRowId(cloneId, 2),
      createElementRowId(cloneId, 1),
      createElementRowId(cloneId, 0),
    ]);
    expect(rekeyed.properties.selectedRowId).toBe(createElementRowId(cloneId, 1));

    const committed = dispatchHistoryCommand(createDocumentHistory(document), {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: ELEMENT_ID,
      ...selectedUpdate,
    });
    if (!committed.ok || !committed.changed)
      throw new Error('Button Bar selection did not commit.');
    const undone = undoDocumentHistory(committed.history);
    if (!undone.ok || !undone.changed) throw new Error('Button Bar selection did not undo.');
    expect(undone.history.document).toEqual(document);
    const redone = redoDocumentHistory(undone.history);
    if (!redone.ok || !redone.changed) throw new Error('Button Bar selection did not redo.');
    expect(redone.history.document).toEqual(committed.history.document);
  });

  it('rekeys selected identity together with row data in duplicate, paste, and board clone planners', () => {
    const { document, element } = createSelectionFixture(CONTROL_TYPES.buttonBar);
    const selectedGeneration = element.rowData.bindings.find(
      (binding) => binding.id === element.properties.selectedRowId,
    )?.generation;
    expect(selectedGeneration).toBe(0);

    const duplicateId = ElementIdSchema.parse('element_rows_duplicate');
    const duplicate = planSelectionDuplicate(
      document,
      [ELEMENT_ID],
      [ELEMENT_ID],
      () => duplicateId,
    );
    expect(duplicate?.commands[0]?.element.properties.selectedRowId).toBe(
      createElementRowId(duplicateId, 0),
    );
    expect(duplicate?.commands[0]?.element.rowData.bindings[0]?.id).toBe(
      createElementRowId(duplicateId, 0),
    );

    const payload = captureSelectionClipboardPayload(
      document,
      [ELEMENT_ID],
      ELEMENT_ID,
      [ELEMENT_ID],
      'copy',
    );
    const pasteId = ElementIdSchema.parse('element_rows_paste001');
    const paste = planSelectionPaste(document, payload, 0, () => pasteId);
    expect(paste?.commands[0]?.element.properties.selectedRowId).toBe(
      createElementRowId(pasteId, 0),
    );
    expect(paste?.commands[0]?.element.rowData.bindings[0]?.id).toBe(
      createElementRowId(pasteId, 0),
    );

    const boardCloneId = ElementIdSchema.parse('element_rows_boardclone');
    const boardClone = planBoardContentClone(document, BOARD_ID, BOARD_ID, () => boardCloneId);
    const boardCloneElement =
      boardClone?.commands[0]?.type === DOCUMENT_COMMAND_TYPES.createElement
        ? boardClone.commands[0].element
        : undefined;
    expect(boardCloneElement?.properties.selectedRowId).toBe(createElementRowId(boardCloneId, 0));
    expect(boardCloneElement?.rowData.bindings[0]?.id).toBe(createElementRowId(boardCloneId, 0));
  });

  it('round-trips selected stable row identity through the project codec', () => {
    const { document, element } = createSelectionFixture(CONTROL_TYPES.buttonBar);
    const encoded = encodeProjectFileEnvelope(document, {});
    if (!encoded.ok) throw new Error('Selected row document could not be encoded.');
    const decoded = decodeProjectFileEnvelope(encoded.value);
    if (!decoded.ok) throw new Error('Selected row document could not be reopened.');
    expect(decoded.value.document.elementsById[ELEMENT_ID]).toEqual(element);
    expect(decoded.value.document.elementsById[ELEMENT_ID]?.properties.selectedRowId).toBe(
      createElementRowId(ELEMENT_ID, 0),
    );
  });

  it.each([CONTROL_TYPES.tabBar, CONTROL_TYPES.verticalTabs])(
    'round-trips %s row edits, links, and optional stable selection',
    (controlType) => {
      const { definition, document, element } = createSelectionFixture(controlType);
      const edits = createControlRowEdits(definition, element);
      if (edits === undefined) throw new Error(`Tab rows for '${controlType}' did not parse.`);
      const selectedRowId = edits[1]?.id;
      if (selectedRowId === undefined) throw new Error('Tab selection fixture is incomplete.');
      const update = createControlRowsUpdate(
        definition,
        element,
        edits.map((edit, index) =>
          index === 1
            ? Object.freeze({
                ...edit,
                label: 'Selected destination',
                link: Object.freeze({
                  kind: 'external' as const,
                  url: 'https://example.com/tab',
                }),
              })
            : edit,
        ),
        element.rowData.nextId,
      );
      if (update === undefined) throw new Error('Tab row update is invalid.');
      const selected = createControlRowSelectionUpdate(
        definition,
        { ...element, properties: update.properties, rowData: update.rowData },
        selectedRowId,
      );
      if (selected === undefined) throw new Error('Tab selection update is invalid.');
      const committed = dispatchDocumentCommand(document, {
        type: DOCUMENT_COMMAND_TYPES.setElementProperties,
        elementId: ELEMENT_ID,
        properties: selected.properties,
        rowData: update.rowData,
      });
      if (!committed.ok || !committed.changed) throw new Error('Tab update did not commit.');

      const encoded = encodeProjectFileEnvelope(committed.document, {});
      if (!encoded.ok) throw new Error('Tab document could not be encoded.');
      const decoded = decodeProjectFileEnvelope(encoded.value);
      if (!decoded.ok) throw new Error('Tab document could not be reopened.');
      const reopened = decoded.value.document.elementsById[ELEMENT_ID];
      expect(reopened?.properties.selectedRowId).toBe(selectedRowId);
      expect(reopened?.properties.items).toContain('Selected destination');
      expect(reopened?.rowData.bindings[1]).toEqual({
        generation: 1,
        id: selectedRowId,
        link: { kind: 'external', url: 'https://example.com/tab' },
      });
    },
  );

  it('round-trips Tree Pane hierarchy, adornments, links, and stable selection', () => {
    const { definition, document, element } = createSelectionFixture(CONTROL_TYPES.treePane);
    const edits = createControlRowEdits(definition, element);
    if (edits === undefined) throw new Error('Tree Pane rows did not parse.');
    const selectedRowId = edits[2]?.id;
    if (selectedRowId === undefined) throw new Error('Tree Pane selection fixture is incomplete.');
    const update = createControlRowsUpdate(
      definition,
      element,
      edits.map((edit, index) =>
        index === 2
          ? Object.freeze({
              ...edit,
              adornment: 'file' as const,
              depth: 3,
              label: 'Nested archive leaf',
              link: Object.freeze({ kind: 'external' as const, url: 'https://example.com/tree' }),
            })
          : edit,
      ),
      element.rowData.nextId,
    );
    if (update === undefined) throw new Error('Tree Pane row update is invalid.');
    const selected = createControlRowSelectionUpdate(
      definition,
      {
        ...element,
        properties: update.properties,
        rowData: update.rowData,
      },
      selectedRowId,
    );
    if (selected === undefined) throw new Error('Tree Pane selection update is invalid.');
    const committed = dispatchDocumentCommand(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: ELEMENT_ID,
      properties: selected.properties,
      rowData: update.rowData,
    });
    if (!committed.ok || !committed.changed) throw new Error('Tree Pane update did not commit.');

    const encoded = encodeProjectFileEnvelope(committed.document, {});
    if (!encoded.ok) throw new Error('Tree Pane document could not be encoded.');
    const decoded = decodeProjectFileEnvelope(encoded.value);
    if (!decoded.ok) throw new Error('Tree Pane document could not be reopened.');
    const reopened = decoded.value.document.elementsById[ELEMENT_ID];
    expect(reopened?.properties.selectedRowId).toBe(selectedRowId);
    expect(reopened?.properties.items).toContain('...- Nested archive leaf');
    expect(reopened?.rowData.bindings[2]).toMatchObject({
      id: selectedRowId,
      link: { kind: 'external', url: 'https://example.com/tree' },
    });
    if (reopened === undefined) throw new Error('Reopened Tree Pane is missing.');
    const reopenedEdits = createControlRowEdits(definition, reopened);
    if (reopenedEdits === undefined) throw new Error('Reopened Tree Pane rows did not parse.');
    expect(reopenedEdits[2]).toMatchObject({
      adornment: 'file',
      depth: 3,
      label: 'Nested archive leaf',
    });
  });

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
    const appended = appendControlRowEdit(definition, afterDelete, afterDeleteEdits, 'New row');
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
