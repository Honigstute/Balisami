// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { ElementIdSchema, parseProjectDocument, type SetElementFrameCommand } from '../src/domain';
import {
  isKeyboardNudgeKey,
  KeyboardNudgeInteraction,
  resolveKeyboardNudgeStep,
} from '../src/renderer/editor/keyboard-nudge-interaction';
import { captureMoveTargets, type MoveTargetCapture } from '../src/renderer/editor/move-geometry';
import type { AnimationFrameScheduler } from '../src/renderer/editor/viewport-camera-store';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const ROOT_ID = ElementIdSchema.parse('element_nudgeroot1');
const CHILD_ID = ElementIdSchema.parse('element_nudgechild');

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
  affectedIds: Object.freeze([ROOT_ID, CHILD_ID]),
  targets: Object.freeze([
    Object.freeze({
      frame: Object.freeze({ x: 10, y: 20, width: 100, height: 50 }),
      id: ROOT_ID,
    }),
  ]),
});

describe('keyboard nudge interaction', () => {
  it('defines one layout-independent arrow contract with one- and ten-unit world steps', () => {
    expect(isKeyboardNudgeKey('ArrowLeft')).toBe(true);
    expect(isKeyboardNudgeKey('KeyA')).toBe(false);
    expect(resolveKeyboardNudgeStep('ArrowLeft', false)).toMatchObject({ x: -1, y: 0 });
    expect(resolveKeyboardNudgeStep('ArrowRight', true)).toMatchObject({ x: 10, y: 0 });
    expect(resolveKeyboardNudgeStep('ArrowUp', false)).toMatchObject({ x: 0, y: -1 });
    expect(resolveKeyboardNudgeStep('ArrowDown', true)).toMatchObject({ x: 0, y: 10 });
  });

  it('coalesces 500 repeats into one exact command transaction from the captured local frame', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const commits: (readonly SetElementFrameCommand[])[] = [];
    const interaction = new KeyboardNudgeInteraction(
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

    expect(interaction.begin([ROOT_ID, CHILD_ID], 'ArrowRight', false)).toBe(true);
    for (let index = 1; index < 500; index += 1) {
      expect(interaction.step('ArrowRight', false)).toBe(true);
    }
    interaction.step('ArrowUp', true);

    expect(scheduler.callbacks.size).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(interaction.complete()).toBe('committed');
    expect(scheduler.callbacks.size).toBe(0);
    expect(commits).toEqual([
      [
        {
          type: 'element.set-frame',
          elementId: ROOT_ID,
          frame: { x: 510, y: 10, width: 100, height: 50 },
        },
      ],
    ]);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('cancels pending preview exactly and handles unavailable, unchanged, and failed commits', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const commit = vi.fn(() => false);
    const interaction = new KeyboardNudgeInteraction({ capture: () => CAPTURE, commit }, scheduler);

    expect(interaction.begin([ROOT_ID], 'ArrowLeft', false)).toBe(true);
    interaction.step('ArrowDown', true);
    expect(interaction.cancel()).toBe(true);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(scheduler.callbacks.size).toBe(0);
    expect(commit).not.toHaveBeenCalled();

    expect(interaction.begin([ROOT_ID], 'ArrowLeft', false)).toBe(true);
    interaction.step('ArrowRight', false);
    expect(interaction.complete()).toBe('unchanged');
    expect(commit).not.toHaveBeenCalled();

    expect(interaction.begin([ROOT_ID], 'ArrowDown', false)).toBe(true);
    expect(interaction.complete()).toBe('failed');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(interaction.complete()).toBe(false);

    const unavailable = new KeyboardNudgeInteraction(
      { capture: () => undefined, commit: () => true },
      scheduler,
    );
    expect(unavailable.begin([ROOT_ID], 'ArrowRight', false)).toBe(false);
  });

  it('refuses a locked selected control through the shared move-capture contract', () => {
    const input = createValidProjectDocumentInput();
    input.elementsById[DOCUMENT_FIXTURE_IDS.child]!.locked = true;
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) {
      throw new Error('Locked keyboard nudge fixture is invalid.');
    }
    const commit = vi.fn(() => true);
    const interaction = new KeyboardNudgeInteraction(
      { capture: (ids) => captureMoveTargets(parsed.value, ids), commit },
      new TestAnimationFrameScheduler(),
    );

    expect(interaction.begin([DOCUMENT_FIXTURE_IDS.child], 'ArrowRight', false)).toBe(false);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(commit).not.toHaveBeenCalled();
  });
});
