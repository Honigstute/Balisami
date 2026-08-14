// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createDocumentHistory, ElementIdSchema, parseProjectDocument } from '../src/domain';
import {
  SELECTION_INTERACTION_POLICY,
  SelectionInteraction,
} from '../src/renderer/editor/selection-interaction';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import {
  createViewportPoint,
  createWorldPoint,
  type WorldPoint,
} from '../src/renderer/editor/viewport-transform';
import { createValidProjectDocumentInput } from './fixtures/project-document';

const FIRST_ID = ElementIdSchema.parse('element_press001');
const SECOND_ID = ElementIdSchema.parse('element_press002');

const hitTest = (point: WorldPoint) => {
  if (point.x < 0) {
    return undefined;
  }
  return point.x < 100 ? FIRST_ID : SECOND_ID;
};

const beginAndComplete = (
  interaction: SelectionInteraction,
  worldX: number,
  shiftKey = false,
): void => {
  expect(
    interaction.beginPress({
      pointerId: 7,
      shiftKey,
      viewportPoint: createViewportPoint(20, 30),
      worldPoint: createWorldPoint(worldX, 0),
    }),
  ).toBe(true);
  expect(interaction.completePress(7, createViewportPoint(20, 30))).toBe(true);
};

describe('selection interaction', () => {
  it('commits click, Shift-toggle, and empty-space rules only on pointer completion', () => {
    const selection = new SelectionStore();
    const interaction = new SelectionInteraction(selection, hitTest);

    expect(
      interaction.beginPress({
        pointerId: 7,
        shiftKey: false,
        viewportPoint: createViewportPoint(20, 30),
        worldPoint: createWorldPoint(10, 0),
      }),
    ).toBe(true);
    expect(selection.getSnapshot().selectedIds).toEqual([]);
    expect(interaction.getSnapshot()).toEqual({
      clickEligible: true,
      kind: 'pressed',
      pointerId: 7,
    });
    expect(interaction.completePress(7, createViewportPoint(20, 30))).toBe(true);
    expect(selection.getSnapshot().selectedIds).toEqual([FIRST_ID]);

    beginAndComplete(interaction, 120, true);
    expect(selection.getSnapshot()).toMatchObject({
      primaryId: SECOND_ID,
      selectedIds: [FIRST_ID, SECOND_ID],
    });
    beginAndComplete(interaction, 10, true);
    expect(selection.getSnapshot()).toMatchObject({
      primaryId: SECOND_ID,
      selectedIds: [SECOND_ID],
    });
    beginAndComplete(interaction, -1, true);
    expect(selection.getSnapshot().selectedIds).toEqual([SECOND_ID]);
    beginAndComplete(interaction, -1);
    expect(selection.getSnapshot().selectedIds).toEqual([]);
  });

  it('cancels Escape-equivalent and pointer cancellation without changing session state', () => {
    const selection = new SelectionStore();
    selection.selectOnly(FIRST_ID);
    const before = selection.getSnapshot();
    const interaction = new SelectionInteraction(selection, hitTest);
    interaction.beginPress({
      pointerId: 5,
      shiftKey: false,
      viewportPoint: createViewportPoint(0, 0),
      worldPoint: createWorldPoint(120, 0),
    });

    expect(interaction.cancelPress(99)).toBe(false);
    expect(interaction.cancelPress(5)).toBe(true);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(selection.getSnapshot()).toBe(before);
    expect(interaction.completePress(5, createViewportPoint(0, 0))).toBe(false);
  });

  it('cannot create a document edit or history entry for selection-only gestures', () => {
    const parsed = parseProjectDocument(createValidProjectDocumentInput());
    if (!parsed.ok) {
      throw new Error('Selection history fixture is invalid.');
    }
    const history = createDocumentHistory(parsed.value);
    const documentBefore = history.document;
    const stateBefore = history.currentStateId;
    const selection = new SelectionStore();
    const interaction = new SelectionInteraction(selection, hitTest);

    beginAndComplete(interaction, 10);
    beginAndComplete(interaction, 120, true);
    interaction.beginPress({
      pointerId: 8,
      shiftKey: false,
      viewportPoint: createViewportPoint(0, 0),
      worldPoint: createWorldPoint(10, 0),
    });
    interaction.cancelPress(8);

    expect(history.document).toBe(documentBefore);
    expect(history.currentStateId).toBe(stateBefore);
    expect(history.undoEntries).toHaveLength(0);
    expect(history.redoEntries).toHaveLength(0);
  });

  it('disqualifies a click after zoom-independent screen-space movement', () => {
    const selection = new SelectionStore();
    selection.selectOnly(FIRST_ID);
    const before = selection.getSnapshot();
    const interaction = new SelectionInteraction(selection, hitTest);
    interaction.beginPress({
      pointerId: 3,
      shiftKey: false,
      viewportPoint: createViewportPoint(10, 10),
      worldPoint: createWorldPoint(120, 0),
    });

    const movement = SELECTION_INTERACTION_POLICY.clickMovementThresholdPixels + 0.01;
    expect(interaction.updatePress(3, createViewportPoint(10 + movement, 10))).toBe(true);
    expect(interaction.getSnapshot()).toMatchObject({ clickEligible: false, kind: 'pressed' });
    expect(interaction.completePress(3, createViewportPoint(10 + movement, 10))).toBe(true);
    expect(selection.getSnapshot()).toBe(before);
  });

  it('rejects concurrent or malformed pointer ownership predictably', () => {
    const selection = new SelectionStore();
    const interaction = new SelectionInteraction(selection, hitTest);
    const input = {
      pointerId: 1,
      shiftKey: false,
      viewportPoint: createViewportPoint(0, 0),
      worldPoint: createWorldPoint(0, 0),
    };

    expect(interaction.beginPress(input)).toBe(true);
    expect(interaction.beginPress({ ...input, pointerId: 2 })).toBe(false);
    expect(interaction.updatePress(2, createViewportPoint(0, 0))).toBe(false);
    expect(interaction.completePress(2, createViewportPoint(0, 0))).toBe(false);
    interaction.cancelPress();
    expect(() => interaction.beginPress({ ...input, pointerId: -1 })).toThrow(RangeError);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
  });

  it('clears selection from idle Escape but never while a press owns the gesture', () => {
    const selection = new SelectionStore();
    selection.selectOnly(FIRST_ID);
    const interaction = new SelectionInteraction(selection, hitTest);
    interaction.beginPress({
      pointerId: 1,
      shiftKey: false,
      viewportPoint: createViewportPoint(0, 0),
      worldPoint: createWorldPoint(0, 0),
    });

    expect(interaction.clearSelectionWhenIdle()).toBe(false);
    expect(selection.getSnapshot().selectedIds).toEqual([FIRST_ID]);
    interaction.cancelPress();
    expect(interaction.clearSelectionWhenIdle()).toBe(true);
    expect(selection.getSnapshot().selectedIds).toEqual([]);
  });
});
