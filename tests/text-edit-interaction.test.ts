// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { ElementIdSchema, type ElementId } from '../src/domain';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import {
  createTextEditViewportRoute,
  TextEditInteraction,
  type TextEditTarget,
} from '../src/renderer/editor/text-edit-interaction';
import { createWorldPoint, createWorldRect } from '../src/renderer/editor/viewport-transform';

const TEXT_ID = ElementIdSchema.parse('element_text_edit');
const OTHER_ID = ElementIdSchema.parse('element_other_edit');

const createTarget = (
  elementId: ElementId = TEXT_ID,
  overrides: Partial<TextEditTarget> = {},
): TextEditTarget => ({
  accessibleLabel: 'Edit text label',
  elementId,
  fontSizeWorldUnits: 16,
  mode: 'single-line',
  text: 'Before',
  worldBounds: createWorldRect(10, 20, 120, 36),
  ...overrides,
});

describe('text edit interaction authority', () => {
  it('normalizes one captured target and keeps draft and composition state transient', () => {
    const commit = vi.fn(() => true);
    const interaction = new TextEditInteraction({ capture: createTarget, commit });
    const publications = vi.fn();
    interaction.subscribe(publications);

    expect(interaction.begin(TEXT_ID)).toBe(true);
    const started = interaction.getSnapshot();
    expect(started).toMatchObject({
      draft: 'Before',
      isComposing: false,
      kind: 'editingText',
      revision: 1,
      target: { elementId: TEXT_ID, worldBounds: { height: 36, width: 120, x: 10, y: 20 } },
    });
    expect(started.kind === 'editingText' && Object.isFrozen(started.target)).toBe(true);
    expect(interaction.begin(TEXT_ID)).toBe(false);
    expect(interaction.updateDraft('During')).toBe(true);
    expect(interaction.updateDraft('During')).toBe(false);
    expect(interaction.setComposing(true)).toBe(true);
    expect(interaction.complete()).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(interaction.setComposing(false)).toBe(true);
    expect(interaction.cancel()).toBe(true);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle', revision: 5 });
    expect(commit).not.toHaveBeenCalled();
    expect(publications).toHaveBeenCalledTimes(5);
  });

  it('normalizes pasted line breaks only for single-line targets', () => {
    const singleLine = new TextEditInteraction({ capture: createTarget, commit: () => true });
    singleLine.begin(TEXT_ID);
    expect(singleLine.updateDraft('First\r\nSecond\nThird')).toBe(true);
    expect(singleLine.getSnapshot()).toMatchObject({ draft: 'First Second Third' });

    const multiline = new TextEditInteraction({
      capture: (id) => createTarget(id, { mode: 'multiline' }),
      commit: () => true,
    });
    multiline.begin(TEXT_ID);
    expect(multiline.updateDraft('First\nSecond')).toBe(true);
    expect(multiline.getSnapshot()).toMatchObject({ draft: 'First\nSecond' });
  });

  it.each([
    ['mismatched ID', () => createTarget(OTHER_ID)],
    ['empty label', () => createTarget(TEXT_ID, { accessibleLabel: ' ' })],
    ['invalid font size', () => createTarget(TEXT_ID, { fontSizeWorldUnits: 0 })],
    ['invalid mode', () => createTarget(TEXT_ID, { mode: 'rich-text' as 'single-line' })],
    [
      'invalid bounds',
      () =>
        createTarget(TEXT_ID, {
          worldBounds: { height: 20, width: Number.NaN, x: 0, y: 0 } as ReturnType<
            typeof createWorldRect
          >,
        }),
    ],
  ])('rejects %s at the capture boundary', (_label, capture) => {
    const interaction = new TextEditInteraction({ capture, commit: () => true });
    expect(interaction.begin(TEXT_ID)).toBe(false);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle', revision: 0 });
  });

  it('releases internal ownership before one successful commit and skips unchanged drafts', () => {
    const holder: { interaction?: TextEditInteraction } = {};
    const commit = vi.fn(() => {
      expect(holder.interaction?.cancel()).toBe(false);
      return true;
    });
    const interaction = new TextEditInteraction({ capture: createTarget, commit });
    holder.interaction = interaction;

    interaction.begin(TEXT_ID);
    expect(interaction.complete()).toBe('unchanged');
    expect(commit).not.toHaveBeenCalled();

    interaction.begin(TEXT_ID);
    interaction.updateDraft('After');
    expect(interaction.complete()).toBe('committed');
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ text: 'Before' }), 'After');
    expect(interaction.getSnapshot()).toMatchObject({ kind: 'idle' });
    expect(interaction.complete()).toBe(false);
  });

  it('restores the exact active draft after a rejected or throwing commit so it can retry', () => {
    const commit = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(false)
      .mockImplementationOnce(() => {
        throw new Error('Rejected');
      })
      .mockReturnValueOnce(true);
    const interaction = new TextEditInteraction({ capture: createTarget, commit });
    interaction.begin(TEXT_ID);
    interaction.updateDraft('Retry me');

    expect(interaction.complete()).toBe('failed');
    expect(interaction.getSnapshot()).toMatchObject({ draft: 'Retry me', kind: 'editingText' });
    expect(interaction.complete()).toBe('failed');
    expect(interaction.getSnapshot()).toMatchObject({ draft: 'Retry me', kind: 'editingText' });
    expect(interaction.complete()).toBe('committed');
    expect(commit).toHaveBeenCalledTimes(3);
  });

  it('cancels when selection or canonical capture no longer matches the starting target', () => {
    let target = createTarget();
    const interaction = new TextEditInteraction({
      capture: () => target,
      commit: () => true,
    });

    interaction.begin(TEXT_ID);
    expect(interaction.reconcileTarget(OTHER_ID)).toBe(true);
    interaction.begin(TEXT_ID);
    target = createTarget(TEXT_ID, { worldBounds: createWorldRect(11, 20, 120, 36) });
    expect(interaction.reconcileTarget(TEXT_ID)).toBe(true);
    expect(interaction.getSnapshot()).toMatchObject({ kind: 'idle' });
  });

  it('routes exact single selection and pointer targets without changing selection on failure', () => {
    const selection = new SelectionStore();
    const interaction = new TextEditInteraction({
      capture: (id) => (id === TEXT_ID ? createTarget() : undefined),
      commit: () => true,
    });
    const route = createTextEditViewportRoute({
      interaction,
      queryPointerTarget: (point) => (point.x === 10 ? TEXT_ID : OTHER_ID),
      selection,
    });

    expect(route.beginFromSelection()).toBe(false);
    selection.replace([TEXT_ID, OTHER_ID], OTHER_ID);
    expect(route.beginFromSelection()).toBe(false);
    selection.selectOnly(TEXT_ID);
    expect(route.beginFromSelection()).toBe(true);
    expect(route.cancel()).toBe(true);

    selection.selectOnly(OTHER_ID);
    expect(route.beginFromWorldPoint(createWorldPoint(0, 0))).toBe(false);
    expect(selection.getSnapshot().primaryId).toBe(OTHER_ID);
    expect(route.beginFromWorldPoint(createWorldPoint(10, 0))).toBe(true);
    expect(selection.getSnapshot()).toMatchObject({ primaryId: TEXT_ID, selectedIds: [TEXT_ID] });
  });
});
