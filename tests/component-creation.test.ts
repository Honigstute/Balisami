// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  ComponentIdSchema,
  ElementIdSchema,
  createDocumentHistory,
  dispatchHistoryTransaction,
  parseProjectDocument,
  redoDocumentHistory,
  undoDocumentHistory,
  type ProjectDocument,
} from '../src/domain';
import { planComponentCreationFromGroup } from '../src/renderer/controls/component-creation';
import { createBoardSceneItems } from '../src/renderer/editor/document-scene-model';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const COMPONENT_ID = ComponentIdSchema.parse('component_created001');
const INSTANCE_ID = ElementIdSchema.parse('element_createdinst1');
const DEFINITION_ROOT_ID = ElementIdSchema.parse('element_createdroot1');
const DEFINITION_CHILD_ID = ElementIdSchema.parse('element_createdchild');

const parseFixture = (): ProjectDocument => {
  const parsed = parseProjectDocument(createValidProjectDocumentInput());
  if (!parsed.ok) {
    throw new Error('Component creation fixture is invalid.');
  }
  return parsed.value;
};

describe('component creation planner', () => {
  it('atomically converts a complete group and undo restores the exact source tree', () => {
    const original = parseFixture();
    const definitionIds = [DEFINITION_ROOT_ID, DEFINITION_CHILD_ID] as const;
    const plan = planComponentCreationFromGroup(
      original,
      DOCUMENT_FIXTURE_IDS.group,
      COMPONENT_ID,
      INSTANCE_ID,
      'Reusable card',
      (_sourceId, index) => definitionIds[index],
    );

    expect(plan?.commands).toHaveLength(1);
    if (plan === undefined) {
      throw new Error('Expected component creation plan.');
    }
    const applied = dispatchHistoryTransaction(createDocumentHistory(original), plan.commands, {
      label: 'Create component',
    });
    expect(applied).toMatchObject({ ok: true, changed: true });
    if (!applied.ok || !applied.changed) {
      throw new Error('Expected component conversion to commit.');
    }
    const converted = applied.history.document;
    expect(converted.componentIds).toEqual([COMPONENT_ID]);
    expect(converted.boardsById[DOCUMENT_FIXTURE_IDS.board]?.childIds).toEqual([INSTANCE_ID]);
    expect(converted.elementsById[DOCUMENT_FIXTURE_IDS.group]).toBeUndefined();
    expect(converted.elementsById[DOCUMENT_FIXTURE_IDS.child]).toBeUndefined();
    expect(converted.elementsById[DEFINITION_ROOT_ID]).toMatchObject({
      childIds: [DEFINITION_CHILD_ID],
      frame: { x: 0, y: 0, width: 320, height: 180 },
    });
    expect(converted.elementsById[DEFINITION_CHILD_ID]?.frame).toEqual(
      original.elementsById[DOCUMENT_FIXTURE_IDS.child]?.frame,
    );
    expect(
      createBoardSceneItems(converted, DOCUMENT_FIXTURE_IDS.board).filter(
        (item) => !item.interactive,
      ),
    ).toHaveLength(2);
    expect(applied.history.undoEntries).toHaveLength(1);

    const undone = undoDocumentHistory(applied.history);
    expect(undone).toMatchObject({ ok: true, changed: true });
    if (!undone.ok || !undone.changed) {
      throw new Error('Expected component conversion undo.');
    }
    expect(undone.history.document).toEqual(original);

    const redone = redoDocumentHistory(undone.history);
    expect(redone).toMatchObject({ ok: true, changed: true });
    if (!redone.ok || !redone.changed) {
      throw new Error('Expected component conversion redo.');
    }
    expect(redone.history.document).toEqual(converted);
  });

  it('rejects locked sources and colliding definition identities before emitting a command', () => {
    const original = parseFixture();
    expect(
      planComponentCreationFromGroup(
        original,
        DOCUMENT_FIXTURE_IDS.group,
        COMPONENT_ID,
        INSTANCE_ID,
        'Collision',
        () => DOCUMENT_FIXTURE_IDS.child,
      ),
    ).toBeUndefined();

    const lockedInput = createValidProjectDocumentInput();
    const group = lockedInput.elementsById[DOCUMENT_FIXTURE_IDS.group];
    if (group === undefined) throw new Error('Locked fixture group is missing.');
    group.locked = true;
    const locked = parseProjectDocument(lockedInput);
    if (!locked.ok) throw new Error('Locked fixture is invalid.');
    expect(
      planComponentCreationFromGroup(
        locked.value,
        DOCUMENT_FIXTURE_IDS.group,
        COMPONENT_ID,
        INSTANCE_ID,
        'Locked',
        (_sourceId, index) => [DEFINITION_ROOT_ID, DEFINITION_CHILD_ID][index],
      ),
    ).toBeUndefined();
  });
});
