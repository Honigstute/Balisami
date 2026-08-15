// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { ElementIdSchema, type SetElementFrameCommand } from '../src/domain';
import { MoveInteraction } from '../src/renderer/editor/move-interaction';
import type { MoveTargetCapture } from '../src/renderer/editor/move-geometry';
import type { AnimationFrameScheduler } from '../src/renderer/editor/viewport-camera-store';
import { createWorldPoint } from '../src/renderer/editor/viewport-transform';

const FIRST_ID = ElementIdSchema.parse('element_move0001');
const CHILD_ID = ElementIdSchema.parse('element_movechild');

class TestAnimationFrameScheduler implements AnimationFrameScheduler {
  readonly callbacks = new Map<number, (timestamp: number) => void>();
  #nextId = 1;

  cancel = (requestId: number): void => {
    this.callbacks.delete(requestId);
  };

  request = (callback: (timestamp: number) => void): number => {
    const requestId = this.#nextId++;
    this.callbacks.set(requestId, callback);
    return requestId;
  };
}

const CAPTURE: MoveTargetCapture = Object.freeze({
  affectedIds: Object.freeze([FIRST_ID, CHILD_ID]),
  targets: Object.freeze([
    Object.freeze({
      frame: Object.freeze({ x: 10, y: 20, width: 100, height: 50 }),
      id: FIRST_ID,
    }),
  ]),
});

describe('move interaction', () => {
  it('coalesces 500 raw updates and commits one exact command from the immutable start', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const commits: (readonly SetElementFrameCommand[])[] = [];
    const interaction = new MoveInteraction(
      {
        capture: () => CAPTURE,
        commit: (commands) => {
          commits.push(commands);
          return true;
        },
      },
      scheduler,
    );
    const listener = vi.fn();
    interaction.subscribe(listener);
    expect(
      interaction.begin({
        pointerId: 7,
        shiftKey: false,
        startWorldPoint: createWorldPoint(100, 200),
        targetIds: [FIRST_ID],
        worldPoint: createWorldPoint(101, 201),
      }),
    ).toBe(true);

    for (let index = 1; index <= 500; index += 1) {
      interaction.update({
        pointerId: 7,
        shiftKey: false,
        worldPoint: createWorldPoint(100 + index / 10, 200 - index / 20),
      });
    }
    expect(scheduler.callbacks.size).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    expect(
      interaction.complete({
        pointerId: 7,
        shiftKey: false,
        worldPoint: createWorldPoint(150, 175),
      }),
    ).toBe('committed');
    expect(scheduler.callbacks.size).toBe(0);
    expect(commits).toEqual([
      [
        {
          type: 'element.set-frame',
          elementId: FIRST_ID,
          frame: { x: 60, y: -5, width: 100, height: 50 },
        },
      ],
    ]);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('recomputes Shift axis lock without drift and cancels pending work without a commit', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const commit = vi.fn(() => true);
    const interaction = new MoveInteraction({ capture: () => CAPTURE, commit }, scheduler);
    interaction.begin({
      pointerId: 3,
      shiftKey: false,
      startWorldPoint: createWorldPoint(0, 0),
      targetIds: [FIRST_ID],
      worldPoint: createWorldPoint(5, 2),
    });
    interaction.update({
      pointerId: 3,
      shiftKey: true,
      worldPoint: createWorldPoint(8, 20),
    });
    interaction.flushPending();
    expect(interaction.getSnapshot()).toMatchObject({ delta: { x: 0, y: 20 }, kind: 'moving' });

    interaction.update({
      pointerId: 3,
      shiftKey: false,
      worldPoint: createWorldPoint(-7, 4),
    });
    expect(interaction.cancel(3)).toBe(true);
    expect(scheduler.callbacks.size).toBe(0);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(commit).not.toHaveBeenCalled();
  });

  it('rejects invalid ownership and clears preview after a failed commit', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const interaction = new MoveInteraction(
      { capture: () => CAPTURE, commit: () => false },
      scheduler,
    );
    expect(() =>
      interaction.begin({
        pointerId: -1,
        shiftKey: false,
        startWorldPoint: createWorldPoint(0, 0),
        targetIds: [FIRST_ID],
        worldPoint: createWorldPoint(1, 1),
      }),
    ).toThrow(RangeError);
    expect(
      interaction.begin({
        pointerId: 2,
        shiftKey: false,
        startWorldPoint: createWorldPoint(0, 0),
        targetIds: [FIRST_ID],
        worldPoint: createWorldPoint(1, 1),
      }),
    ).toBe(true);
    expect(
      interaction.complete({
        pointerId: 9,
        shiftKey: false,
        worldPoint: createWorldPoint(5, 5),
      }),
    ).toBe(false);
    expect(
      interaction.complete({
        pointerId: 2,
        shiftKey: false,
        worldPoint: createWorldPoint(5, 5),
      }),
    ).toBe('failed');
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
  });
});
