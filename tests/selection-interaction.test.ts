// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createDocumentHistory, ElementIdSchema, parseProjectDocument } from '../src/domain';
import {
  SELECTION_INTERACTION_POLICY,
  SelectionInteraction,
  type SelectionInteractionGeometry,
  type SelectionPointerPosition,
} from '../src/renderer/editor/selection-interaction';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { createViewportPoint, createWorldPoint } from '../src/renderer/editor/viewport-transform';
import { createValidProjectDocumentInput } from './fixtures/project-document';

const FIRST_ID = ElementIdSchema.parse('element_press001');
const SECOND_ID = ElementIdSchema.parse('element_press002');
const THIRD_ID = ElementIdSchema.parse('element_press003');

const createPosition = (
  viewportX: number,
  viewportY = 0,
  worldX = viewportX,
  worldY = viewportY,
): SelectionPointerPosition =>
  Object.freeze({
    viewportPoint: createViewportPoint(viewportX, viewportY),
    worldPoint: createWorldPoint(worldX, worldY),
  });

const createGeometry = (
  overrides: Partial<SelectionInteractionGeometry> = {},
): SelectionInteractionGeometry => ({
  listSelectableIds: () => [FIRST_ID, SECOND_ID, THIRD_ID],
  queryHitStack: (point) => {
    if (point.x < 0) {
      return [];
    }
    return point.x < 100 ? [FIRST_ID] : [SECOND_ID];
  },
  querySelectionRegion: () => [],
  ...overrides,
});

const beginAndComplete = (
  interaction: SelectionInteraction,
  worldX: number,
  options: { readonly altKey?: boolean; readonly shiftKey?: boolean } = {},
): void => {
  const position = createPosition(20, 30, worldX, 0);
  expect(
    interaction.beginPress({
      altKey: options.altKey ?? false,
      pointerId: 7,
      shiftKey: options.shiftKey ?? false,
      ...position,
    }),
  ).toBe(true);
  expect(interaction.completePress(7, { ...position, shiftKey: options.shiftKey ?? false })).toBe(
    true,
  );
};

describe('selection interaction', () => {
  it('commits click, Shift-toggle, and empty-space rules only on pointer completion', () => {
    const selection = new SelectionStore();
    const interaction = new SelectionInteraction(selection, createGeometry());
    const firstPosition = createPosition(20, 30, 10, 0);

    expect(
      interaction.beginPress({
        altKey: false,
        pointerId: 7,
        shiftKey: false,
        ...firstPosition,
      }),
    ).toBe(true);
    expect(selection.getSnapshot().selectedIds).toEqual([]);
    expect(interaction.getSnapshot()).toEqual({
      clickEligible: true,
      kind: 'pressed',
      pointerId: 7,
    });
    expect(interaction.completePress(7, { ...firstPosition, shiftKey: false })).toBe(true);
    expect(selection.getSnapshot().selectedIds).toEqual([FIRST_ID]);

    beginAndComplete(interaction, 120, { shiftKey: true });
    expect(selection.getSnapshot()).toMatchObject({
      primaryId: SECOND_ID,
      selectedIds: [FIRST_ID, SECOND_ID],
    });
    beginAndComplete(interaction, 10, { shiftKey: true });
    expect(selection.getSnapshot()).toMatchObject({
      primaryId: SECOND_ID,
      selectedIds: [SECOND_ID],
    });
    beginAndComplete(interaction, -1, { shiftKey: true });
    expect(selection.getSnapshot().selectedIds).toEqual([SECOND_ID]);
    beginAndComplete(interaction, -1);
    expect(selection.getSnapshot().selectedIds).toEqual([]);
  });

  it('cycles an overlap stack deterministically only for Alt or Option click', () => {
    const selection = new SelectionStore();
    const interaction = new SelectionInteraction(
      selection,
      createGeometry({ queryHitStack: () => [FIRST_ID, SECOND_ID, THIRD_ID] }),
    );

    beginAndComplete(interaction, 10);
    expect(selection.getSnapshot().primaryId).toBe(FIRST_ID);
    beginAndComplete(interaction, 10, { altKey: true });
    expect(selection.getSnapshot().primaryId).toBe(SECOND_ID);
    beginAndComplete(interaction, 10, { altKey: true });
    expect(selection.getSnapshot().primaryId).toBe(THIRD_ID);
    beginAndComplete(interaction, 10, { altKey: true });
    expect(selection.getSnapshot().primaryId).toBe(FIRST_ID);
    beginAndComplete(interaction, 10);
    expect(selection.getSnapshot().primaryId).toBe(FIRST_ID);
  });

  it('selects every intersecting control for an empty-space marquee in either direction', () => {
    const selection = new SelectionStore();
    const querySelectionRegion = vi.fn<SelectionInteractionGeometry['querySelectionRegion']>(
      (_bounds, mode) => (mode === 'contained' ? [FIRST_ID] : [SECOND_ID, THIRD_ID]),
    );
    const interaction = new SelectionInteraction(
      selection,
      createGeometry({ queryHitStack: () => [], querySelectionRegion }),
    );
    const start = createPosition(50, 50);
    const forwardEnd = createPosition(90, 80);
    interaction.beginPress({ altKey: false, pointerId: 1, shiftKey: false, ...start });

    expect(interaction.updatePress(1, { ...forwardEnd, shiftKey: false })).toBe(true);
    expect(interaction.getSnapshot()).toMatchObject({
      kind: 'marquee',
      mode: 'intersecting',
      previewIds: [SECOND_ID, THIRD_ID],
    });
    expect(interaction.completePress(1, { ...forwardEnd, shiftKey: false })).toBe(true);
    expect(selection.getSnapshot().selectedIds).toEqual([SECOND_ID, THIRD_ID]);

    const intersectingEnd = createPosition(10, 90);
    interaction.beginPress({ altKey: false, pointerId: 2, shiftKey: false, ...start });
    interaction.updatePress(2, { ...intersectingEnd, shiftKey: false });
    expect(interaction.getSnapshot()).toMatchObject({
      kind: 'marquee',
      mode: 'intersecting',
      previewIds: [SECOND_ID, THIRD_ID],
    });
    interaction.completePress(2, { ...intersectingEnd, shiftKey: false });
    expect(selection.getSnapshot().selectedIds).toEqual([SECOND_ID, THIRD_ID]);
    expect(querySelectionRegion).toHaveBeenCalledTimes(4);
    for (const [, mode] of querySelectionRegion.mock.calls) {
      expect(mode).toBe('intersecting');
    }
  });

  it('adds Shift-marquee candidates and preserves exact state when marquee is cancelled', () => {
    const selection = new SelectionStore();
    selection.selectOnly(FIRST_ID);
    const interaction = new SelectionInteraction(
      selection,
      createGeometry({
        queryHitStack: () => [],
        querySelectionRegion: () => [SECOND_ID, THIRD_ID],
      }),
    );
    const start = createPosition(0, 0);
    const end = createPosition(20, 20);
    interaction.beginPress({ altKey: false, pointerId: 4, shiftKey: true, ...start });
    interaction.updatePress(4, { ...end, shiftKey: true });
    interaction.completePress(4, { ...end, shiftKey: true });
    expect(selection.getSnapshot()).toMatchObject({
      primaryId: THIRD_ID,
      selectedIds: [FIRST_ID, SECOND_ID, THIRD_ID],
    });

    const beforeCancel = selection.getSnapshot();
    interaction.beginPress({ altKey: false, pointerId: 5, shiftKey: false, ...start });
    interaction.updatePress(5, { ...end, shiftKey: false });
    expect(interaction.cancelPress(5)).toBe(true);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(selection.getSnapshot()).toBe(beforeCancel);
  });

  it('supports vertical line-like marquee geometry with positive world extents', () => {
    const querySelectionRegion = vi.fn<SelectionInteractionGeometry['querySelectionRegion']>(
      (bounds) => {
        expect(bounds.width).toBeGreaterThan(0);
        expect(bounds.height).toBeGreaterThan(0);
        return [FIRST_ID];
      },
    );
    const interaction = new SelectionInteraction(
      new SelectionStore(),
      createGeometry({ queryHitStack: () => [], querySelectionRegion }),
    );
    const start = createPosition(20, 10, -50, -25);
    const end = createPosition(20, 40, -50, 5);

    interaction.beginPress({ altKey: false, pointerId: 6, shiftKey: false, ...start });
    interaction.completePress(6, { ...end, shiftKey: false });
    expect(querySelectionRegion).toHaveBeenCalledOnce();
  });

  it('disqualifies movement over an element until the transform state exists', () => {
    const selection = new SelectionStore();
    selection.selectOnly(FIRST_ID);
    const before = selection.getSnapshot();
    const interaction = new SelectionInteraction(selection, createGeometry());
    const start = createPosition(10, 10, 120, 0);
    const movement = SELECTION_INTERACTION_POLICY.clickMovementThresholdPixels + 0.01;
    const end = createPosition(10 + movement, 10, 120, 0);
    interaction.beginPress({ altKey: false, pointerId: 3, shiftKey: false, ...start });

    expect(interaction.updatePress(3, { ...end, shiftKey: false })).toBe(true);
    expect(interaction.getSnapshot()).toMatchObject({ clickEligible: false, kind: 'pressed' });
    expect(interaction.completePress(3, { ...end, shiftKey: false })).toBe(true);
    expect(selection.getSnapshot()).toBe(before);
  });

  it('selects all available IDs only while idle and clears them on idle Escape', () => {
    const selection = new SelectionStore();
    const interaction = new SelectionInteraction(
      selection,
      createGeometry({ listSelectableIds: () => [FIRST_ID, SECOND_ID] }),
    );

    expect(interaction.selectAllWhenIdle()).toBe(true);
    expect(selection.getSnapshot().selectedIds).toEqual([FIRST_ID, SECOND_ID]);
    const start = createPosition(0, 0);
    interaction.beginPress({ altKey: false, pointerId: 1, shiftKey: false, ...start });
    expect(interaction.selectAllWhenIdle()).toBe(false);
    expect(interaction.clearSelectionWhenIdle()).toBe(false);
    interaction.cancelPress();
    expect(interaction.clearSelectionWhenIdle()).toBe(true);
    expect(selection.getSnapshot().selectedIds).toEqual([]);
  });

  it('never creates a document edit or history entry for selection scope changes', () => {
    const parsed = parseProjectDocument(createValidProjectDocumentInput());
    if (!parsed.ok) {
      throw new Error('Selection history fixture is invalid.');
    }
    const history = createDocumentHistory(parsed.value);
    const documentBefore = history.document;
    const stateBefore = history.currentStateId;
    const interaction = new SelectionInteraction(new SelectionStore(), createGeometry());

    interaction.selectAllWhenIdle();
    beginAndComplete(interaction, 10);
    beginAndComplete(interaction, 120, { shiftKey: true });
    const start = createPosition(0, 0, -1, -1);
    const end = createPosition(20, 20, 20, 20);
    interaction.beginPress({ altKey: false, pointerId: 8, shiftKey: false, ...start });
    interaction.updatePress(8, { ...end, shiftKey: false });
    interaction.cancelPress(8);

    expect(history.document).toBe(documentBefore);
    expect(history.currentStateId).toBe(stateBefore);
    expect(history.undoEntries).toHaveLength(0);
    expect(history.redoEntries).toHaveLength(0);
  });

  it('rejects concurrent, mismatched, and malformed pointer ownership predictably', () => {
    const interaction = new SelectionInteraction(new SelectionStore(), createGeometry());
    const position = createPosition(0, 0);
    const input = { altKey: false, pointerId: 1, shiftKey: false, ...position };

    expect(interaction.beginPress(input)).toBe(true);
    expect(interaction.beginPress({ ...input, pointerId: 2 })).toBe(false);
    expect(interaction.updatePress(2, { ...position, shiftKey: false })).toBe(false);
    expect(interaction.completePress(2, { ...position, shiftKey: false })).toBe(false);
    interaction.cancelPress();
    expect(() => interaction.beginPress({ ...input, pointerId: -1 })).toThrow(RangeError);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
  });
});
