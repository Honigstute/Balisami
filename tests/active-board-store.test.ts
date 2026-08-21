// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { BoardIdSchema } from '../src/domain';
import { ActiveBoardStore } from '../src/renderer/projects/active-board-store';

const FIRST_BOARD_ID = BoardIdSchema.parse('board_active001');
const SECOND_BOARD_ID = BoardIdSchema.parse('board_active002');

describe('active board store', () => {
  it('publishes only real session selection changes', () => {
    const store = new ActiveBoardStore();
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.getSnapshot()).toBeUndefined();
    expect(store.select(FIRST_BOARD_ID)).toBe(true);
    expect(store.select(FIRST_BOARD_ID)).toBe(false);
    expect(store.getSnapshot()).toBe(FIRST_BOARD_ID);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('retains a live board and falls back to canonical board order', () => {
    const store = new ActiveBoardStore();

    expect(store.reconcile([FIRST_BOARD_ID, SECOND_BOARD_ID])).toBe(true);
    expect(store.getSnapshot()).toBe(FIRST_BOARD_ID);
    store.select(SECOND_BOARD_ID);
    expect(store.reconcile([FIRST_BOARD_ID, SECOND_BOARD_ID])).toBe(false);
    expect(store.reconcile([FIRST_BOARD_ID])).toBe(true);
    expect(store.getSnapshot()).toBe(FIRST_BOARD_ID);
    expect(store.reconcile([])).toBe(true);
    expect(store.getSnapshot()).toBeUndefined();
  });
});
