// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { ElementIdSchema } from '../src/domain';
import { SelectionStore } from '../src/renderer/editor/selection-store';

const FIRST_ID = ElementIdSchema.parse('element_select001');
const SECOND_ID = ElementIdSchema.parse('element_select002');
const THIRD_ID = ElementIdSchema.parse('element_select003');

describe('selection store', () => {
  it('publishes immutable session snapshots and suppresses semantic no-ops', () => {
    const store = new SelectionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const empty = store.getSnapshot();

    expect(store.clear()).toBe(false);
    expect(store.selectOnly(FIRST_ID)).toBe(true);
    const selected = store.getSnapshot();
    expect(selected).toEqual({ primaryId: FIRST_ID, revision: 1, selectedIds: [FIRST_ID] });
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected.selectedIds)).toBe(true);
    expect(store.selectOnly(FIRST_ID)).toBe(false);
    expect(store.getSnapshot()).toBe(selected);
    expect(empty).not.toBe(selected);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('uses explicit ordered toggle and primary-selection rules', () => {
    const store = new SelectionStore();

    store.replace([FIRST_ID, FIRST_ID, SECOND_ID], FIRST_ID);
    expect(store.getSnapshot()).toMatchObject({
      primaryId: FIRST_ID,
      selectedIds: [FIRST_ID, SECOND_ID],
    });
    store.toggle(THIRD_ID);
    expect(store.getSnapshot()).toMatchObject({
      primaryId: THIRD_ID,
      selectedIds: [FIRST_ID, SECOND_ID, THIRD_ID],
    });
    store.toggle(THIRD_ID);
    expect(store.getSnapshot()).toMatchObject({
      primaryId: SECOND_ID,
      selectedIds: [FIRST_ID, SECOND_ID],
    });
    store.toggle(FIRST_ID);
    expect(store.getSnapshot()).toMatchObject({
      primaryId: SECOND_ID,
      selectedIds: [SECOND_ID],
    });
    expect(store.has(FIRST_ID)).toBe(false);
  });

  it('reconciles stale IDs without reordering surviving session state', () => {
    const store = new SelectionStore();
    store.replace([FIRST_ID, SECOND_ID, THIRD_ID], SECOND_ID);

    expect(store.reconcile(new Set([FIRST_ID, THIRD_ID]))).toBe(true);
    expect(store.getSnapshot()).toMatchObject({
      primaryId: THIRD_ID,
      selectedIds: [FIRST_ID, THIRD_ID],
    });
    expect(store.reconcile(new Set([FIRST_ID, THIRD_ID]))).toBe(false);
    expect(store.reconcile(new Set())).toBe(true);
    expect(store.getSnapshot()).toMatchObject({ primaryId: undefined, selectedIds: [] });
  });
});
