import { describe, expect, it } from 'vitest';

import {
  ComponentIdSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  dispatchDocumentCommand,
  parseProjectDocument,
  type CreateComponentCommand,
  type ElementNode,
  type ProjectDocument,
} from '../src/domain';
import {
  createEmptyElementRowDataInput,
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  getFixtureControlProperties,
  getFixtureControlVersion,
} from './fixtures/project-document';

const parseFixture = (): ProjectDocument => {
  const parsed = parseProjectDocument(createValidProjectDocumentInput());
  if (!parsed.ok) {
    throw new Error('Component command base fixture is invalid.');
  }
  return parsed.value;
};

const createComponentCommand = (
  componentIdText: string,
  rootIdText: string,
  childIdText: string,
  index = 0,
): CreateComponentCommand => {
  const componentId = ComponentIdSchema.parse(componentIdText);
  const rootId = ElementIdSchema.parse(rootIdText);
  const childId = ElementIdSchema.parse(childIdText);
  const elements: readonly ElementNode[] = Object.freeze([
    Object.freeze({
      id: rootId,
      controlType: CONTROL_TYPES.group,
      controlVersion: getFixtureControlVersion(CONTROL_TYPES.group),
      frame: Object.freeze({ x: 0, y: 0, width: 240, height: 160 }),
      locked: false,
      properties: Object.freeze({}),
      childIds: Object.freeze([childId]),
      assetIds: Object.freeze([]),
      link: null,
      rowData: Object.freeze(createEmptyElementRowDataInput()),
    }),
    Object.freeze({
      id: childId,
      controlType: CONTROL_TYPES.button,
      controlVersion: getFixtureControlVersion(CONTROL_TYPES.button),
      frame: Object.freeze({ x: 20, y: 30, width: 120, height: 40 }),
      locked: false,
      properties: Object.freeze({
        ...getFixtureControlProperties(CONTROL_TYPES.button),
        text: 'Action',
      }),
      childIds: Object.freeze([]),
      assetIds: Object.freeze([]),
      link: null,
      rowData: Object.freeze(createEmptyElementRowDataInput()),
    }),
  ]);
  return Object.freeze({
    type: DOCUMENT_COMMAND_TYPES.createComponent,
    component: Object.freeze({ id: componentId, name: 'Reusable action', rootElementId: rootId }),
    elements,
    index,
  });
};

describe('component commands', () => {
  it('creates and deletes complete hidden definition trees with exact inverses', () => {
    const original = parseFixture();
    const command = createComponentCommand(
      'component_command001',
      'element_componentroot1',
      'element_componentchild1',
    );
    const created = dispatchDocumentCommand(original, command);
    expect(created).toMatchObject({ ok: true, changed: true });
    if (!created.ok || !created.changed) {
      throw new Error('Expected component creation to succeed.');
    }
    expect(created.document.componentIds).toEqual([command.component.id]);
    expect(created.document.componentsById[command.component.id]).toEqual(command.component);
    expect(created.document.elementsById[command.component.rootElementId]).toEqual(
      command.elements[0],
    );

    const deleted = dispatchDocumentCommand(created.document, created.inverse);
    expect(deleted).toMatchObject({ ok: true, changed: true });
    if (!deleted.ok || !deleted.changed) {
      throw new Error('Expected inverse component deletion to succeed.');
    }
    expect(deleted.document).toEqual(original);

    const restored = dispatchDocumentCommand(deleted.document, deleted.inverse);
    expect(restored).toMatchObject({ ok: true, changed: true });
    if (!restored.ok || !restored.changed) {
      throw new Error('Expected inverse component restoration to succeed.');
    }
    expect(restored.document).toEqual(created.document);
  });

  it('protects referenced definitions and supports rename and reorder', () => {
    const firstCommand = createComponentCommand(
      'component_command001',
      'element_componentroot1',
      'element_componentchild1',
    );
    const first = dispatchDocumentCommand(parseFixture(), firstCommand);
    if (!first.ok || !first.changed) throw new Error('Expected first component creation.');
    const secondCommand = createComponentCommand(
      'component_command002',
      'element_componentroot2',
      'element_componentchild2',
      1,
    );
    const second = dispatchDocumentCommand(first.document, secondCommand);
    if (!second.ok || !second.changed) throw new Error('Expected second component creation.');

    const instanceId = ElementIdSchema.parse('element_componentinst1');
    const instance = dispatchDocumentCommand(second.document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        id: instanceId,
        controlType: CONTROL_TYPES.componentInstance,
        controlVersion: getFixtureControlVersion(CONTROL_TYPES.componentInstance),
        frame: { x: 40, y: 40, width: 240, height: 160 },
        locked: false,
        properties: { componentId: firstCommand.component.id, overrides: {} },
        childIds: [],
        assetIds: [],
        link: null,
        rowData: createEmptyElementRowDataInput(),
      },
      owner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      index: 1,
    });
    if (!instance.ok || !instance.changed) throw new Error('Expected instance creation.');

    expect(
      dispatchDocumentCommand(instance.document, {
        type: DOCUMENT_COMMAND_TYPES.deleteComponent,
        componentId: firstCommand.component.id,
      }),
    ).toMatchObject({ ok: false, error: { code: 'conflict' }, document: instance.document });

    const renamed = dispatchDocumentCommand(instance.document, {
      type: DOCUMENT_COMMAND_TYPES.renameComponent,
      componentId: firstCommand.component.id,
      name: 'Primary action',
    });
    if (!renamed.ok || !renamed.changed) throw new Error('Expected component rename.');
    expect(renamed.document.componentsById[firstCommand.component.id]?.name).toBe('Primary action');

    const reordered = dispatchDocumentCommand(renamed.document, {
      type: DOCUMENT_COMMAND_TYPES.reorderComponent,
      componentId: secondCommand.component.id,
      toIndex: 0,
    });
    if (!reordered.ok || !reordered.changed) throw new Error('Expected component reorder.');
    expect(reordered.document.componentIds).toEqual([
      secondCommand.component.id,
      firstCommand.component.id,
    ]);
  });

  it('rejects a cyclic definition command without changing the document', () => {
    const original = parseFixture();
    const componentId = ComponentIdSchema.parse('component_recursive1');
    const rootId = ElementIdSchema.parse('element_recursiveroot');
    const instanceId = ElementIdSchema.parse('element_recursiveinst');
    const result = dispatchDocumentCommand(original, {
      type: DOCUMENT_COMMAND_TYPES.createComponent,
      component: { id: componentId, name: 'Recursive', rootElementId: rootId },
      elements: [
        {
          id: rootId,
          controlType: CONTROL_TYPES.group,
          controlVersion: getFixtureControlVersion(CONTROL_TYPES.group),
          frame: { x: 0, y: 0, width: 200, height: 120 },
          locked: false,
          properties: {},
          childIds: [instanceId],
          assetIds: [],
          link: null,
          rowData: createEmptyElementRowDataInput(),
        },
        {
          id: instanceId,
          controlType: CONTROL_TYPES.componentInstance,
          controlVersion: getFixtureControlVersion(CONTROL_TYPES.componentInstance),
          frame: { x: 10, y: 10, width: 100, height: 80 },
          locked: false,
          properties: { componentId, overrides: {} },
          childIds: [],
          assetIds: [],
          link: null,
          rowData: createEmptyElementRowDataInput(),
        },
      ],
      index: 0,
    });

    expect(result).toMatchObject({
      ok: false,
      document: original,
      error: { code: 'document-invalid' },
    });
  });
});
