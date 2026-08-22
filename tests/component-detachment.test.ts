// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  ComponentIdSchema,
  CONTROL_TYPES,
  ElementIdSchema,
  createDocumentHistory,
  dispatchHistoryTransaction,
  parseProjectDocument,
  redoDocumentHistory,
  undoDocumentHistory,
  type ProjectDocument,
} from '../src/domain';
import { planComponentDetachment } from '../src/renderer/controls/component-detachment';
import { createBoardSceneItems } from '../src/renderer/editor/document-scene-model';
import {
  createEmptyElementRowDataInput,
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  getFixtureControlProperties,
  getFixtureControlVersion,
} from './fixtures/project-document';

const COMPONENT_ID = ComponentIdSchema.parse('component_detach001');
const INSTANCE_ID = ElementIdSchema.parse('element_detachinst1');
const DETACHED_ROOT_ID = ElementIdSchema.parse('element_detachroot1');
const DETACHED_CHILD_ID = ElementIdSchema.parse('element_detachchild');

const createComponentDocument = (locked = false): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const board = input.boardsById[DOCUMENT_FIXTURE_IDS.board];
  const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
  if (board === undefined || child === undefined) {
    throw new Error('Component detachment fixture is incomplete.');
  }
  child.controlType = CONTROL_TYPES.button;
  child.controlVersion = getFixtureControlVersion(CONTROL_TYPES.button);
  child.properties = {
    ...getFixtureControlProperties(CONTROL_TYPES.button),
    text: 'Definition action',
  };
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
    frame: { x: 80, y: 60, width: 640, height: 360 },
    locked,
    properties: {
      componentId: COMPONENT_ID,
      overrides: { [DOCUMENT_FIXTURE_IDS.child]: { text: 'Detached action' } },
    },
    childIds: [],
    assetIds: [],
    link: null,
    rowData: createEmptyElementRowDataInput(),
  };
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) {
    throw new Error(`Component detachment fixture is invalid: ${JSON.stringify(parsed.issues)}`);
  }
  return parsed.value;
};

describe('component detachment planner', () => {
  it('breaks apart one instance into an independent scaled tree with exact undo and redo', () => {
    const original = createComponentDocument();
    const beforeVisual = createBoardSceneItems(original, DOCUMENT_FIXTURE_IDS.board).find(
      (item) => !item.interactive && item.controlType === CONTROL_TYPES.button,
    );
    const detachedIds = [DETACHED_ROOT_ID, DETACHED_CHILD_ID] as const;
    const plan = planComponentDetachment(
      original,
      INSTANCE_ID,
      (_sourceId, index) => detachedIds[index],
    );
    expect(plan?.commands).toHaveLength(1);
    if (plan === undefined) throw new Error('Expected component detachment plan.');

    const applied = dispatchHistoryTransaction(createDocumentHistory(original), plan.commands, {
      label: 'Break apart component',
    });
    if (!applied.ok || !applied.changed) throw new Error('Expected component detachment.');
    const detached = applied.history.document;
    expect(detached.boardsById[DOCUMENT_FIXTURE_IDS.board]?.childIds).toEqual([DETACHED_ROOT_ID]);
    expect(detached.elementsById[INSTANCE_ID]).toBeUndefined();
    expect(detached.elementsById[DETACHED_ROOT_ID]).toMatchObject({
      frame: { x: 80, y: 60, width: 640, height: 360 },
      childIds: [DETACHED_CHILD_ID],
    });
    expect(detached.elementsById[DETACHED_CHILD_ID]).toMatchObject({
      frame: { x: 32, y: 48, width: 240, height: 96 },
      properties: { iconId: null, text: 'Detached action' },
    });
    expect(detached.componentsById[COMPONENT_ID]).toBeDefined();
    expect(
      createBoardSceneItems(detached, DOCUMENT_FIXTURE_IDS.board).find(
        (item) => item.id === DETACHED_CHILD_ID,
      )?.bounds,
    ).toEqual(beforeVisual?.bounds);
    expect(applied.history.undoEntries).toHaveLength(1);

    const undone = undoDocumentHistory(applied.history);
    if (!undone.ok || !undone.changed) throw new Error('Expected detachment undo.');
    expect(undone.history.document).toEqual(original);
    const redone = redoDocumentHistory(undone.history);
    if (!redone.ok || !redone.changed) throw new Error('Expected detachment redo.');
    expect(redone.history.document).toEqual(detached);
  });

  it('rejects locked instances and colliding detached identities before dispatch', () => {
    const original = createComponentDocument();
    expect(
      planComponentDetachment(original, INSTANCE_ID, () => DOCUMENT_FIXTURE_IDS.child),
    ).toBeUndefined();

    expect(
      planComponentDetachment(createComponentDocument(true), INSTANCE_ID, () => DETACHED_ROOT_ID),
    ).toBeUndefined();
  });
});
