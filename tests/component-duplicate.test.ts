import { describe, expect, it } from 'vitest';

import {
  ComponentIdSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  dispatchDocumentCommand,
  parseProjectDocument,
  type ProjectDocument,
} from '../src/domain';
import { planComponentDuplicate } from '../src/renderer/controls/component-duplicate';
import {
  createValidProjectDocumentInput,
  getFixtureControlProperties,
  getFixtureControlVersion,
} from './fixtures/project-document';

const SOURCE_COMPONENT_ID = ComponentIdSchema.parse('component_duplicate_source');
const SOURCE_ROOT_ID = ElementIdSchema.parse('element_duplicate_source_root');
const SOURCE_CHILD_ID = ElementIdSchema.parse('element_duplicate_source_child');

const createFixture = (): ProjectDocument => {
  const parsed = parseProjectDocument(createValidProjectDocumentInput());
  if (!parsed.ok) throw new Error('Component duplicate base fixture is invalid.');
  const created = dispatchDocumentCommand(parsed.value, {
    type: DOCUMENT_COMMAND_TYPES.createComponent,
    component: {
      id: SOURCE_COMPONENT_ID,
      name: 'Reusable action',
      rootElementId: SOURCE_ROOT_ID,
    },
    elements: [
      {
        id: SOURCE_ROOT_ID,
        controlType: CONTROL_TYPES.group,
        controlVersion: getFixtureControlVersion(CONTROL_TYPES.group),
        frame: { x: 0, y: 0, width: 240, height: 160 },
        locked: false,
        properties: {},
        childIds: [SOURCE_CHILD_ID],
        assetIds: [],
        link: null,
      },
      {
        id: SOURCE_CHILD_ID,
        controlType: CONTROL_TYPES.button,
        controlVersion: getFixtureControlVersion(CONTROL_TYPES.button),
        frame: { x: 20, y: 30, width: 120, height: 40 },
        locked: false,
        properties: { ...getFixtureControlProperties(CONTROL_TYPES.button), text: 'Action' },
        childIds: [],
        assetIds: [],
        link: null,
      },
    ],
    index: 0,
  });
  if (!created.ok || !created.changed) throw new Error('Component duplicate source is invalid.');
  return created.document;
};

describe('component definition duplication', () => {
  it('clones the complete tree beside its source as one exactly undoable command', () => {
    const document = createFixture();
    const newComponentId = ComponentIdSchema.parse('component_duplicate_copy');
    const copyRootId = ElementIdSchema.parse('element_duplicate_copy_root');
    const copyChildId = ElementIdSchema.parse('element_duplicate_copy_child');
    const ids = [copyRootId, copyChildId];
    const command = planComponentDuplicate(
      document,
      SOURCE_COMPONENT_ID,
      newComponentId,
      (_sourceId, index) => ids[index],
    );
    expect(command).toMatchObject({
      component: { id: newComponentId, name: 'Reusable action Copy' },
      index: 1,
    });
    if (command === undefined) throw new Error('Expected a component duplicate command.');

    const duplicated = dispatchDocumentCommand(document, command);
    expect(duplicated).toMatchObject({ ok: true, changed: true });
    if (!duplicated.ok || !duplicated.changed) throw new Error('Expected component duplication.');
    expect(duplicated.document.componentIds).toEqual([SOURCE_COMPONENT_ID, newComponentId]);
    expect(duplicated.document.elementsById[copyRootId]?.childIds).toEqual([copyChildId]);
    expect(duplicated.document.elementsById[copyChildId]?.properties).toEqual({
      ...getFixtureControlProperties(CONTROL_TYPES.button),
      text: 'Action',
    });

    const undone = dispatchDocumentCommand(duplicated.document, duplicated.inverse);
    expect(undone).toMatchObject({ ok: true, changed: true });
    if (undone.ok && undone.changed) expect(undone.document).toEqual(document);
  });

  it('allocates a bounded unique copy name', () => {
    const document = createFixture();
    const firstId = ComponentIdSchema.parse('component_duplicate_first');
    const first = planComponentDuplicate(document, SOURCE_COMPONENT_ID, firstId, (_id, index) =>
      ElementIdSchema.parse(`element_duplicate_first_${String(index)}`),
    );
    if (first === undefined) throw new Error('Expected the first duplicate.');
    const applied = dispatchDocumentCommand(document, first);
    if (!applied.ok || !applied.changed) throw new Error('Expected the first copy to apply.');
    const second = planComponentDuplicate(
      applied.document,
      SOURCE_COMPONENT_ID,
      ComponentIdSchema.parse('component_duplicate_second'),
      (_id, index) => ElementIdSchema.parse(`element_duplicate_second_${String(index)}`),
    );
    expect(second?.component.name).toBe('Reusable action Copy 2');
  });

  it('rejects component and element identity collisions without a partial plan', () => {
    const document = createFixture();
    expect(
      planComponentDuplicate(document, SOURCE_COMPONENT_ID, SOURCE_COMPONENT_ID, () =>
        ElementIdSchema.parse('element_duplicate_unused'),
      ),
    ).toBeUndefined();
    expect(
      planComponentDuplicate(
        document,
        SOURCE_COMPONENT_ID,
        ComponentIdSchema.parse('component_duplicate_collision'),
        () => SOURCE_ROOT_ID,
      ),
    ).toBeUndefined();
  });
});
