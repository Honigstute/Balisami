import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ComponentIdSchema,
  CONTROL_TYPES,
  ElementIdSchema,
  createCustomIconReference,
  createDocumentHistory,
  dispatchHistoryTransaction,
  parseProjectDocument,
  undoDocumentHistory,
  type ProjectDocument,
} from '../src/domain';
import { ControlInspector } from '../src/renderer/controls/ControlInspector';
import { createComponentOverrideModel } from '../src/renderer/controls/component-override-model';
import { planComponentDefinitionUpdateFromInstance } from '../src/renderer/controls/component-definition-update';
import {
  planComponentOverrideUpdate,
  type ComponentOverrideUpdate,
} from '../src/renderer/controls/component-override-update';
import { createBoardSceneItems } from '../src/renderer/editor/document-scene-model';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import {
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  getFixtureControlVersion,
} from './fixtures/project-document';

const COMPONENT_ID = ComponentIdSchema.parse('component_override01');
const INSTANCE_ID = ElementIdSchema.parse('element_overrideinst');
const SECOND_INSTANCE_ID = ElementIdSchema.parse('element_overrideinst2');

const createComponentDocument = (
  overrideText?: string,
  includeSecondInstance = false,
): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const board = input.boardsById[DOCUMENT_FIXTURE_IDS.board];
  const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
  if (board === undefined || child === undefined) {
    throw new Error('Component override fixture is incomplete.');
  }
  child.controlType = CONTROL_TYPES.button;
  child.controlVersion = getFixtureControlVersion(CONTROL_TYPES.button);
  child.properties = { iconId: null, text: 'Definition action' };
  child.assetIds = [];
  input.componentIds = [COMPONENT_ID];
  input.componentsById[COMPONENT_ID] = {
    id: COMPONENT_ID,
    name: 'Reusable action',
    rootElementId: DOCUMENT_FIXTURE_IDS.group,
  };
  board.childIds = [INSTANCE_ID];
  input.elementsById[INSTANCE_ID] = {
    id: INSTANCE_ID,
    controlType: CONTROL_TYPES.componentInstance,
    controlVersion: getFixtureControlVersion(CONTROL_TYPES.componentInstance),
    frame: { x: 80, y: 60, width: 320, height: 180 },
    locked: false,
    properties: {
      componentId: COMPONENT_ID,
      overrides:
        overrideText === undefined ? {} : { [DOCUMENT_FIXTURE_IDS.child]: { text: overrideText } },
    },
    childIds: [],
    assetIds: [],
    link: null,
  };
  if (includeSecondInstance) {
    board.childIds.push(SECOND_INSTANCE_ID);
    input.elementsById[SECOND_INSTANCE_ID] = {
      ...input.elementsById[INSTANCE_ID],
      id: SECOND_INSTANCE_ID,
      frame: { x: 440, y: 60, width: 320, height: 180 },
      properties: { componentId: COMPONENT_ID, overrides: {} },
    };
  }
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) {
    throw new Error(`Component override fixture is invalid: ${JSON.stringify(parsed.issues)}`);
  }
  return parsed.value;
};

describe('component instance overrides', () => {
  it('projects registry fields, applies one override, and resets to the live definition', () => {
    const document = createComponentDocument();
    const model = createComponentOverrideModel(document, INSTANCE_ID);
    expect(model).toMatchObject({
      component: { id: COMPONENT_ID, name: 'Reusable action' },
      sections: [
        {
          label: 'Definition action · Content',
          targetElementId: DOCUMENT_FIXTURE_IDS.child,
          fields: [
            { field: { property: 'text' }, overridden: false, value: 'Definition action' },
            { field: { property: 'iconId' }, overridden: false, value: null },
          ],
        },
      ],
    });

    const commands = planComponentOverrideUpdate(document, {
      instanceId: INSTANCE_ID,
      property: 'text',
      targetElementId: DOCUMENT_FIXTURE_IDS.child,
      value: 'Instance action',
    });
    expect(commands).toHaveLength(1);
    const applied = dispatchHistoryTransaction(createDocumentHistory(document), commands ?? [], {
      label: 'Edit component override',
    });
    if (!applied.ok || !applied.changed) throw new Error('Expected component override commit.');
    expect(
      createComponentOverrideModel(applied.history.document, INSTANCE_ID)?.sections[0]?.fields[0],
    ).toMatchObject({
      overridden: true,
      value: 'Instance action',
    });
    expect(
      createBoardSceneItems(applied.history.document, DOCUMENT_FIXTURE_IDS.board).find(
        (item) => !item.interactive && item.controlType === CONTROL_TYPES.button,
      )?.properties,
    ).toMatchObject({ text: 'Instance action' });

    const resetCommands = planComponentOverrideUpdate(applied.history.document, {
      instanceId: INSTANCE_ID,
      property: 'text',
      reset: true,
      targetElementId: DOCUMENT_FIXTURE_IDS.child,
    });
    const reset = dispatchHistoryTransaction(applied.history, resetCommands ?? [], {
      label: 'Reset component override',
    });
    if (!reset.ok || !reset.changed) throw new Error('Expected component override reset.');
    expect(reset.history.document.elementsById[INSTANCE_ID]?.properties).toEqual({
      componentId: COMPONENT_ID,
      overrides: {},
    });
    expect(
      createComponentOverrideModel(reset.history.document, INSTANCE_ID)?.sections[0]?.fields[0],
    ).toMatchObject({
      overridden: false,
      value: 'Definition action',
    });
  });

  it('keeps custom-icon asset reachability valid and cleans the final unused reference', () => {
    const document = createComponentDocument();
    const iconId = createCustomIconReference(DOCUMENT_FIXTURE_IDS.asset);
    const commands = planComponentOverrideUpdate(document, {
      instanceId: INSTANCE_ID,
      property: 'iconId',
      targetElementId: DOCUMENT_FIXTURE_IDS.child,
      value: iconId,
    });
    expect(commands?.map((command) => command.type)).toEqual([
      'element.set-assets',
      'element.set-properties',
    ]);
    const applied = dispatchHistoryTransaction(createDocumentHistory(document), commands ?? []);
    if (!applied.ok || !applied.changed) throw new Error('Expected custom icon override.');
    expect(applied.history.document.elementsById[INSTANCE_ID]?.assetIds).toEqual([
      DOCUMENT_FIXTURE_IDS.asset,
    ]);

    const resetCommands = planComponentOverrideUpdate(applied.history.document, {
      instanceId: INSTANCE_ID,
      property: 'iconId',
      reset: true,
      targetElementId: DOCUMENT_FIXTURE_IDS.child,
    });
    expect(resetCommands?.map((command) => command.type)).toEqual([
      'element.set-properties',
      'element.set-assets',
      'asset.delete',
    ]);
  });

  it('promotes overrides into the definition and updates other instances in one history entry', () => {
    const document = createComponentDocument('Promoted action', true);
    const commands = planComponentDefinitionUpdateFromInstance(document, INSTANCE_ID);
    expect(commands).toBeDefined();
    const applied = dispatchHistoryTransaction(createDocumentHistory(document), commands ?? [], {
      label: 'Update component definition',
    });
    if (!applied.ok || !applied.changed) throw new Error('Expected definition update.');

    expect(applied.history.undoEntries).toHaveLength(1);
    expect(applied.history.document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.properties).toEqual({
      iconId: null,
      text: 'Promoted action',
    });
    expect(applied.history.document.elementsById[INSTANCE_ID]?.properties).toEqual({
      componentId: COMPONENT_ID,
      overrides: {},
    });
    expect(
      createBoardSceneItems(applied.history.document, DOCUMENT_FIXTURE_IDS.board).find(
        (item) =>
          item.id === `${SECOND_INSTANCE_ID}::${DOCUMENT_FIXTURE_IDS.child}` &&
          item.controlType === CONTROL_TYPES.button,
      )?.properties,
    ).toMatchObject({ text: 'Promoted action' });

    const undone = undoDocumentHistory(applied.history);
    expect(undone).toMatchObject({ ok: true, changed: true });
    if (!undone.ok || !undone.changed) throw new Error('Expected definition update undo.');
    expect(undone.history.document).toEqual(document);
  });

  it('moves promoted custom-icon reachability from the instance into the definition', () => {
    const original = createComponentDocument();
    const overrideCommands = planComponentOverrideUpdate(original, {
      instanceId: INSTANCE_ID,
      property: 'iconId',
      targetElementId: DOCUMENT_FIXTURE_IDS.child,
      value: createCustomIconReference(DOCUMENT_FIXTURE_IDS.asset),
    });
    const overridden = dispatchHistoryTransaction(
      createDocumentHistory(original),
      overrideCommands ?? [],
    );
    if (!overridden.ok || !overridden.changed) throw new Error('Expected icon override.');
    const updateCommands = planComponentDefinitionUpdateFromInstance(
      overridden.history.document,
      INSTANCE_ID,
    );
    const updated = dispatchHistoryTransaction(overridden.history, updateCommands ?? []);
    if (!updated.ok || !updated.changed) throw new Error('Expected icon definition update.');

    expect(updated.history.document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.assetIds).toEqual([
      DOCUMENT_FIXTURE_IDS.asset,
    ]);
    expect(updated.history.document.elementsById[INSTANCE_ID]?.assetIds).toEqual([]);
    expect(updated.history.document.assetsById[DOCUMENT_FIXTURE_IDS.asset]).toBeDefined();
  });

  it('renders component identity and emits registry-derived override and reset actions', () => {
    const document = createComponentDocument('Instance action');
    const selection = new SelectionStore();
    selection.selectOnly(INSTANCE_ID);
    const onSetComponentOverride = vi.fn<(update: ComponentOverrideUpdate) => boolean>(() => true);
    const onRenameComponent = vi.fn(() => true);
    const onUpdateComponentDefinition = vi.fn(() => true);
    const onDetachComponent = vi.fn(() => true);
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(false)}
        onDetachComponent={onDetachComponent}
        onSetComponentOverride={onSetComponentOverride}
        onRenameComponent={onRenameComponent}
        onSetFrames={() => true}
        onSetProperties={() => true}
        onUpdateComponentDefinition={onUpdateComponentDefinition}
        selection={selection}
      />,
    );

    const definitionName = screen.getByRole('textbox', { name: 'Definition name' });
    expect(definitionName).toHaveValue('Reusable action');
    fireEvent.change(definitionName, { target: { value: 'Primary action' } });
    fireEvent.blur(definitionName);
    expect(onRenameComponent).toHaveBeenCalledWith(COMPONENT_ID, 'Primary action');
    fireEvent.click(screen.getByRole('button', { name: 'Update Definition' }));
    expect(onUpdateComponentDefinition).toHaveBeenCalledWith(INSTANCE_ID);
    fireEvent.click(screen.getByRole('button', { name: 'Break Apart' }));
    expect(onDetachComponent).toHaveBeenCalledWith(INSTANCE_ID);
    const text = screen.getByRole('textbox', { name: 'Text' });
    expect(text).toHaveValue('Instance action');
    fireEvent.change(text, { target: { value: 'Local action' } });
    fireEvent.blur(text);
    expect(onSetComponentOverride).toHaveBeenCalledWith({
      instanceId: INSTANCE_ID,
      property: 'text',
      targetElementId: DOCUMENT_FIXTURE_IDS.child,
      value: 'Local action',
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Use Definition' })[0] as HTMLElement);
    expect(onSetComponentOverride).toHaveBeenCalledWith({
      instanceId: INSTANCE_ID,
      property: 'text',
      reset: true,
      targetElementId: DOCUMENT_FIXTURE_IDS.child,
    });
  });
});
