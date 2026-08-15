// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  createDocumentHistory,
  dispatchDocumentCommand,
  dispatchHistoryTransaction,
  parseProjectDocument,
  redoDocumentHistory,
  selectElementWorldBounds,
  undoDocumentHistory,
  type DocumentHistoryState,
  type ElementId,
  type ProjectDocument,
} from '../src/domain';
import {
  groupSelectedElements,
  planSelectionGroup,
  planSelectionUngroup,
  ungroupSelectedElement,
} from '../src/renderer/editor/selection-grouping';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const SECOND_ID = ElementIdSchema.parse('element_groupsecond1');
const THIRD_ID = ElementIdSchema.parse('element_groupthird01');
const NEW_GROUP_ID = ElementIdSchema.parse('element_newgroup001');
const STALE_ID = ElementIdSchema.parse('element_groupstale01');

const parseFixture = (input: unknown): ProjectDocument => {
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) {
    throw new Error(`Grouping fixture is invalid: ${JSON.stringify(parsed.issues)}`);
  }
  return parsed.value;
};

const createGroupingFixture = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
  const owner = input.elementsById[DOCUMENT_FIXTURE_IDS.group];
  if (child === undefined || owner === undefined) {
    throw new Error('Grouping fixture elements are missing.');
  }
  input.elementsById[SECOND_ID] = {
    ...structuredClone(child),
    id: SECOND_ID,
    frame: { x: 180, y: 80, width: 80, height: 40 },
    assetIds: [],
    link: null,
  };
  input.elementsById[THIRD_ID] = {
    ...structuredClone(child),
    id: THIRD_ID,
    frame: { x: 340, y: 12, width: 120, height: 90 },
    assetIds: [],
    link: null,
  };
  owner.childIds = [DOCUMENT_FIXTURE_IDS.child, SECOND_ID, THIRD_ID];
  return parseFixture(input);
};

const getWorldBounds = (document: ProjectDocument, ids: readonly ElementId[]) =>
  ids.map((id) => selectElementWorldBounds(document, id));

describe('selection grouping foundation', () => {
  it('plans non-contiguous siblings in canonical order at the topmost selected position', () => {
    const document = createGroupingFixture();
    const allocateId = vi.fn(() => NEW_GROUP_ID);
    const plan = planSelectionGroup(
      document,
      [THIRD_ID, DOCUMENT_FIXTURE_IDS.child, THIRD_ID],
      allocateId,
    );

    expect(allocateId).toHaveBeenCalledWith([DOCUMENT_FIXTURE_IDS.child, THIRD_ID]);
    expect(plan).toMatchObject({
      childIds: [DOCUMENT_FIXTURE_IDS.child, THIRD_ID],
      groupId: NEW_GROUP_ID,
      command: {
        type: DOCUMENT_COMMAND_TYPES.groupElements,
        group: {
          id: NEW_GROUP_ID,
          controlType: FOUNDATION_CONTROL_TYPES.group,
          frame: { x: 16, y: 12, width: 444, height: 90 },
          childIds: [DOCUMENT_FIXTURE_IDS.child, THIRD_ID],
        },
        owner: { kind: 'element', elementId: DOCUMENT_FIXTURE_IDS.group },
        toIndex: 1,
      },
    });
    expect(plan?.command.childFrames).toEqual([
      {
        elementId: DOCUMENT_FIXTURE_IDS.child,
        frame: { x: 0, y: 12, width: 120, height: 48 },
      },
      { elementId: THIRD_ID, frame: { x: 324, y: 0, width: 120, height: 90 } },
    ]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan?.command)).toBe(true);
  });

  it('groups with exact inverse replay and preserves nested world geometry', () => {
    const document = createGroupingFixture();
    const plan = planSelectionGroup(
      document,
      [DOCUMENT_FIXTURE_IDS.child, THIRD_ID],
      () => NEW_GROUP_ID,
    );
    if (plan === undefined) {
      throw new Error('Expected a valid group plan.');
    }
    const beforeBounds = getWorldBounds(document, plan.childIds);
    const grouped = dispatchDocumentCommand(document, plan.command);
    expect(grouped).toMatchObject({ ok: true, changed: true, label: 'Group elements' });
    if (!grouped.ok || !grouped.changed) {
      throw new Error('Expected grouping to apply.');
    }

    expect(grouped.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.childIds).toEqual([
      SECOND_ID,
      NEW_GROUP_ID,
    ]);
    expect(grouped.document.elementsById[NEW_GROUP_ID]?.childIds).toEqual(plan.childIds);
    expect(getWorldBounds(grouped.document, plan.childIds)).toEqual(beforeBounds);

    const restored = dispatchDocumentCommand(grouped.document, grouped.inverse);
    expect(restored).toMatchObject({ ok: true, changed: true });
    if (!restored.ok || !restored.changed) {
      throw new Error('Expected inverse ungrouping to apply.');
    }
    expect(JSON.stringify(restored.document)).toBe(JSON.stringify(document));
  });

  it('stores exact inverse frames when floating-point translation is not algebraically reversible', () => {
    const input = createValidProjectDocumentInput();
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    const owner = input.elementsById[DOCUMENT_FIXTURE_IDS.group];
    if (child === undefined || owner === undefined) {
      throw new Error('Floating-point grouping fixture is incomplete.');
    }
    child.frame.x = -421_733_127.356_107_8;
    input.elementsById[SECOND_ID] = {
      ...structuredClone(child),
      id: SECOND_ID,
      frame: { ...child.frame, x: -28_512_495.314_744_424 },
      assetIds: [],
      link: null,
    };
    owner.childIds = [DOCUMENT_FIXTURE_IDS.child, SECOND_ID];
    const document = parseFixture(input);
    const plan = planSelectionGroup(
      document,
      [DOCUMENT_FIXTURE_IDS.child, SECOND_ID],
      () => NEW_GROUP_ID,
    );
    if (plan === undefined) {
      throw new Error('Expected a valid floating-point group plan.');
    }
    const grouped = dispatchDocumentCommand(document, plan.command);
    if (!grouped.ok || !grouped.changed) {
      throw new Error('Expected floating-point grouping to apply.');
    }
    const before = selectElementWorldBounds(document, SECOND_ID);
    const after = selectElementWorldBounds(grouped.document, SECOND_ID);
    expect(Math.abs((after?.x ?? Number.NaN) - (before?.x ?? Number.NaN))).toBeLessThan(0.000_001);

    const restored = dispatchDocumentCommand(grouped.document, grouped.inverse);
    if (!restored.ok || !restored.changed) {
      throw new Error('Expected exact floating-point inverse to apply.');
    }
    expect(JSON.stringify(restored.document)).toBe(JSON.stringify(document));
  });

  it('ungroups into the group position, retains both relative orders, and has an exact inverse', () => {
    const document = createGroupingFixture();
    const plan = planSelectionGroup(
      document,
      [DOCUMENT_FIXTURE_IDS.child, THIRD_ID],
      () => NEW_GROUP_ID,
    );
    if (plan === undefined) {
      throw new Error('Expected a valid group plan.');
    }
    const grouped = dispatchDocumentCommand(document, plan.command);
    if (!grouped.ok || !grouped.changed) {
      throw new Error('Expected grouping to apply.');
    }
    const beforeUngroup = grouped.document;
    const beforeBounds = getWorldBounds(beforeUngroup, plan.childIds);
    const ungroupPlan = planSelectionUngroup(beforeUngroup, [NEW_GROUP_ID]);
    expect(ungroupPlan?.command.ownerChildIds).toEqual([
      SECOND_ID,
      DOCUMENT_FIXTURE_IDS.child,
      THIRD_ID,
    ]);
    if (ungroupPlan === undefined) {
      throw new Error('Expected a valid ungroup plan.');
    }

    const ungrouped = dispatchDocumentCommand(beforeUngroup, ungroupPlan.command);
    expect(ungrouped).toMatchObject({ ok: true, changed: true, label: 'Ungroup elements' });
    if (!ungrouped.ok || !ungrouped.changed) {
      throw new Error('Expected ungrouping to apply.');
    }
    expect(ungrouped.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.childIds).toEqual([
      SECOND_ID,
      DOCUMENT_FIXTURE_IDS.child,
      THIRD_ID,
    ]);
    expect(getWorldBounds(ungrouped.document, plan.childIds)).toEqual(beforeBounds);

    const restored = dispatchDocumentCommand(ungrouped.document, ungrouped.inverse);
    expect(restored).toMatchObject({ ok: true, changed: true });
    if (!restored.ok || !restored.changed) {
      throw new Error('Expected inverse grouping to apply.');
    }
    expect(JSON.stringify(restored.document)).toBe(JSON.stringify(beforeUngroup));
  });

  it('rejects stale, locked, cross-owner, colliding, and malformed structural input atomically', () => {
    const document = createGroupingFixture();
    expect(planSelectionGroup(document, [], () => NEW_GROUP_ID)).toBeUndefined();
    expect(
      planSelectionGroup(document, [DOCUMENT_FIXTURE_IDS.child], () => NEW_GROUP_ID),
    ).toBeUndefined();
    expect(
      planSelectionGroup(document, [DOCUMENT_FIXTURE_IDS.child, STALE_ID], () => NEW_GROUP_ID),
    ).toBeUndefined();
    expect(
      planSelectionGroup(
        document,
        [DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child],
        () => NEW_GROUP_ID,
      ),
    ).toBeUndefined();
    expect(
      planSelectionGroup(document, [DOCUMENT_FIXTURE_IDS.child, SECOND_ID], () => SECOND_ID),
    ).toBeUndefined();

    const lockedInput = createValidProjectDocumentInput();
    const lockedChild = lockedInput.elementsById[DOCUMENT_FIXTURE_IDS.child];
    const lockedOwner = lockedInput.elementsById[DOCUMENT_FIXTURE_IDS.group];
    if (lockedChild === undefined || lockedOwner === undefined) {
      throw new Error('Locked grouping fixture is incomplete.');
    }
    lockedChild.locked = true;
    lockedInput.elementsById[SECOND_ID] = {
      ...structuredClone(lockedChild),
      id: SECOND_ID,
      locked: false,
      assetIds: [],
      link: null,
    };
    lockedOwner.childIds.push(SECOND_ID);
    const lockedDocument = parseFixture(lockedInput);
    expect(
      planSelectionGroup(
        lockedDocument,
        [DOCUMENT_FIXTURE_IDS.child, SECOND_ID],
        () => NEW_GROUP_ID,
      ),
    ).toBeUndefined();

    const ancestorLockedInput = createValidProjectDocumentInput();
    const ancestorLockedOwner = ancestorLockedInput.elementsById[DOCUMENT_FIXTURE_IDS.group];
    const ancestorLockedChild = ancestorLockedInput.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (ancestorLockedOwner === undefined || ancestorLockedChild === undefined) {
      throw new Error('Ancestor-lock grouping fixture is incomplete.');
    }
    ancestorLockedOwner.locked = true;
    ancestorLockedInput.elementsById[SECOND_ID] = {
      ...structuredClone(ancestorLockedChild),
      id: SECOND_ID,
      assetIds: [],
      link: null,
    };
    ancestorLockedOwner.childIds.push(SECOND_ID);
    expect(
      planSelectionGroup(
        parseFixture(ancestorLockedInput),
        [DOCUMENT_FIXTURE_IDS.child, SECOND_ID],
        () => NEW_GROUP_ID,
      ),
    ).toBeUndefined();

    const validPlan = planSelectionGroup(
      document,
      [DOCUMENT_FIXTURE_IDS.child, THIRD_ID],
      () => NEW_GROUP_ID,
    );
    if (validPlan === undefined) {
      throw new Error('Expected a valid group plan.');
    }
    const originalJson = JSON.stringify(document);
    const reversedChildren = [...validPlan.command.group.childIds].reverse();
    const reversedFrames = [...validPlan.command.childFrames].reverse();
    const nonCanonical = dispatchDocumentCommand(document, {
      ...validPlan.command,
      childFrames: reversedFrames,
      group: { ...validPlan.command.group, childIds: reversedChildren },
    });
    const outOfRange = dispatchDocumentCommand(document, {
      ...validPlan.command,
      toIndex: 99,
    });
    const wrongSize = dispatchDocumentCommand(document, {
      ...validPlan.command,
      childFrames: validPlan.command.childFrames.map((entry, index) =>
        index === 0 ? { ...entry, frame: { ...entry.frame, width: entry.frame.width + 1 } } : entry,
      ),
    });
    const wrongPosition = dispatchDocumentCommand(document, {
      ...validPlan.command,
      childFrames: validPlan.command.childFrames.map((entry, index) =>
        index === 0 ? { ...entry, frame: { ...entry.frame, x: entry.frame.x + 10 } } : entry,
      ),
    });
    expect(nonCanonical).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(outOfRange).toMatchObject({ ok: false, error: { code: 'out-of-range' } });
    expect(wrongSize).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(wrongPosition).toMatchObject({ ok: false, error: { code: 'conflict' } });
    for (const result of [nonCanonical, outOfRange, wrongSize, wrongPosition]) {
      expect(result.document).toBe(document);
    }
    expect(JSON.stringify(document)).toBe(originalJson);
  });

  it('commits each action once and reconciles selection only after accepted output', () => {
    const document = createGroupingFixture();
    let history: DocumentHistoryState = createDocumentHistory(document);
    const selection = new SelectionStore();
    selection.replace([THIRD_ID, DOCUMENT_FIXTURE_IDS.child], DOCUMENT_FIXTURE_IDS.child);
    const commit = vi.fn((commands: readonly unknown[], label: string) => {
      const result = dispatchHistoryTransaction(history, commands, { label });
      if (!result.ok || !result.changed) {
        return undefined;
      }
      history = result.history;
      return history.document;
    });

    expect(groupSelectedElements(document, selection, () => NEW_GROUP_ID, { commit })).toBe(true);
    const groupedDocument = history.document;
    expect(commit).toHaveBeenCalledTimes(1);
    expect(history.undoEntries).toHaveLength(1);
    expect(selection.getSnapshot()).toMatchObject({
      primaryId: NEW_GROUP_ID,
      selectedIds: [NEW_GROUP_ID],
    });

    const undone = undoDocumentHistory(history);
    expect(undone).toMatchObject({ ok: true, changed: true });
    expect(JSON.stringify(undone.history.document)).toBe(JSON.stringify(document));
    const redone = redoDocumentHistory(undone.history);
    expect(redone).toMatchObject({ ok: true, changed: true });
    expect(JSON.stringify(redone.history.document)).toBe(JSON.stringify(groupedDocument));
    history = redone.history;

    expect(ungroupSelectedElement(groupedDocument, selection, { commit })).toBe(true);
    expect(commit).toHaveBeenCalledTimes(2);
    expect(history.undoEntries).toHaveLength(2);
    expect(selection.getSnapshot()).toMatchObject({
      primaryId: THIRD_ID,
      selectedIds: [DOCUMENT_FIXTURE_IDS.child, THIRD_ID],
    });
  });

  it('preserves exact nested world bounds and inverse bytes across seeded fixtures', () => {
    let seed = 0x71a5b1c;
    const random = (): number => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0x1_0000_0000;
    };

    for (let fixtureIndex = 0; fixtureIndex < 200; fixtureIndex += 1) {
      const input = createValidProjectDocumentInput();
      const owner = input.elementsById[DOCUMENT_FIXTURE_IDS.group];
      const template = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
      if (owner === undefined || template === undefined) {
        throw new Error('Seeded grouping fixture is incomplete.');
      }
      owner.childIds = [];
      delete input.elementsById[DOCUMENT_FIXTURE_IDS.child];
      const childIds: ElementId[] = [];
      for (let childIndex = 0; childIndex < 8; childIndex += 1) {
        const id = ElementIdSchema.parse(
          `element_seed${String(childIndex).padStart(2, '0')}${String(fixtureIndex).padStart(4, '0')}`,
        );
        childIds.push(id);
        input.elementsById[id] = {
          ...structuredClone(template),
          id,
          frame: {
            x: Math.floor(random() * 800) / 4 - 100,
            y: Math.floor(random() * 600) / 4 - 80,
            width: Math.floor(random() * 120) + 8,
            height: Math.floor(random() * 90) + 8,
          },
          assetIds: [],
          link: null,
        };
      }
      owner.childIds = [...childIds];
      const document = parseFixture(input);
      const selectedIds = childIds.filter((_id, index) => index % 3 !== fixtureIndex % 3);
      const plan = planSelectionGroup(document, [...selectedIds].reverse(), () => NEW_GROUP_ID);
      if (plan === undefined) {
        throw new Error(`Seeded group plan ${String(fixtureIndex)} was rejected.`);
      }
      const beforeBounds = getWorldBounds(document, childIds);
      const grouped = dispatchDocumentCommand(document, plan.command);
      if (!grouped.ok || !grouped.changed) {
        throw new Error(`Seeded grouping ${String(fixtureIndex)} failed.`);
      }
      expect(getWorldBounds(grouped.document, childIds)).toEqual(beforeBounds);
      const restored = dispatchDocumentCommand(grouped.document, grouped.inverse);
      if (!restored.ok || !restored.changed) {
        throw new Error(`Seeded inverse ${String(fixtureIndex)} failed.`);
      }
      expect(JSON.stringify(restored.document)).toBe(JSON.stringify(document));
    }
  });
});
