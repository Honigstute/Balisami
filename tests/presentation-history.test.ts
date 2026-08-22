// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { BoardIdSchema } from '../src/domain';
import {
  createPresentationHistory,
  reducePresentationHistory,
} from '../src/renderer/projects/presentation-history';

const FIRST = BoardIdSchema.parse('board_presentfirst');
const SECOND = BoardIdSchema.parse('board_presentsecond');
const THIRD = BoardIdSchema.parse('board_presentthird');

describe('presentation history', () => {
  it('tracks visits with browser-like back, forward, and branch behavior', () => {
    const initial = createPresentationHistory(FIRST);
    const second = reducePresentationHistory(initial, { boardId: SECOND, type: 'visit' });
    const third = reducePresentationHistory(second, { boardId: THIRD, type: 'visit' });
    const back = reducePresentationHistory(third, { type: 'back' });

    expect(back).toEqual({ back: [FIRST], current: SECOND, forward: [THIRD] });
    expect(reducePresentationHistory(back, { type: 'forward' })).toEqual(third);
    expect(reducePresentationHistory(back, { boardId: FIRST, type: 'visit' })).toEqual({
      back: [FIRST, SECOND],
      current: FIRST,
      forward: [],
    });
  });

  it('keeps no-op identity and reconciles removed canonical boards', () => {
    const initial = createPresentationHistory(FIRST);
    expect(reducePresentationHistory(initial, { type: 'back' })).toBe(initial);
    expect(reducePresentationHistory(initial, { boardId: FIRST, type: 'visit' })).toBe(initial);

    const visited = reducePresentationHistory(initial, { boardId: SECOND, type: 'visit' });
    expect(
      reducePresentationHistory(visited, { boardIds: [FIRST, THIRD], type: 'reconcile' }),
    ).toEqual(createPresentationHistory(FIRST));
  });
});
