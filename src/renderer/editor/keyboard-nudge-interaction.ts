import type { ElementId, SetElementFrameCommand } from '../../domain';
import { createMoveCommands, type MoveTargetCapture } from './move-geometry';
import type { AnimationFrameScheduler } from './viewport-camera-store';
import { createWorldVector, type WorldVector } from './viewport-transform';

export const KEYBOARD_NUDGE_POLICY = Object.freeze({
  largeStepWorldUnits: 10,
  smallStepWorldUnits: 1,
});

export const KEYBOARD_NUDGE_KEYS = Object.freeze([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
] as const);

export type KeyboardNudgeKey = (typeof KEYBOARD_NUDGE_KEYS)[number];

export interface KeyboardNudgeInteractionSource {
  readonly capture: (targetIds: readonly ElementId[]) => MoveTargetCapture | undefined;
  readonly commit: (commands: readonly SetElementFrameCommand[]) => boolean;
}

export type KeyboardNudgeCompletion = 'committed' | 'failed' | 'unchanged';

interface KeyboardNudgingSnapshot {
  readonly affectedIds: readonly ElementId[];
  readonly delta: WorldVector;
  readonly kind: 'nudging';
  readonly targetIds: readonly ElementId[];
}

export type KeyboardNudgeInteractionSnapshot = { readonly kind: 'idle' } | KeyboardNudgingSnapshot;

interface ActiveKeyboardNudge {
  readonly capture: MoveTargetCapture;
  readonly delta: WorldVector;
}

const IDLE_SNAPSHOT: KeyboardNudgeInteractionSnapshot = Object.freeze({ kind: 'idle' });
const KEYBOARD_NUDGE_KEY_SET = new Set<string>(KEYBOARD_NUDGE_KEYS);

export const isKeyboardNudgeKey = (code: string): code is KeyboardNudgeKey =>
  KEYBOARD_NUDGE_KEY_SET.has(code);

/** Resolves one repeat event directly in world units, independent of camera and DPR. */
export const resolveKeyboardNudgeStep = (
  key: KeyboardNudgeKey,
  largeStep: boolean,
): WorldVector => {
  const step = largeStep
    ? KEYBOARD_NUDGE_POLICY.largeStepWorldUnits
    : KEYBOARD_NUDGE_POLICY.smallStepWorldUnits;
  switch (key) {
    case 'ArrowLeft':
      return createWorldVector(-step, 0);
    case 'ArrowRight':
      return createWorldVector(step, 0);
    case 'ArrowUp':
      return createWorldVector(0, -step);
    case 'ArrowDown':
      return createWorldVector(0, step);
  }
};

const createNudgingSnapshot = (active: ActiveKeyboardNudge): KeyboardNudgingSnapshot =>
  Object.freeze({
    affectedIds: active.capture.affectedIds,
    delta: active.delta,
    kind: 'nudging',
    targetIds: Object.freeze(active.capture.targets.map((target) => target.id)),
  });

const addStep = (delta: WorldVector, step: WorldVector): WorldVector =>
  createWorldVector(delta.x + step.x, delta.y + step.y);

/**
 * Transient keyboard-translation authority. The first keydown captures local
 * frames once, repeats update only preview state, and the final keyup commits
 * one command transaction. Cancellation therefore leaves no document edit.
 */
export class KeyboardNudgeInteraction {
  readonly #listeners = new Set<() => void>();
  readonly #scheduler: AnimationFrameScheduler;
  readonly #source: KeyboardNudgeInteractionSource;

  #active: ActiveKeyboardNudge | undefined;
  #pending: KeyboardNudgeInteractionSnapshot | undefined;
  #scheduledFrameId: number | undefined;
  #snapshot: KeyboardNudgeInteractionSnapshot = IDLE_SNAPSHOT;

  constructor(source: KeyboardNudgeInteractionSource, scheduler: AnimationFrameScheduler) {
    this.#source = source;
    this.#scheduler = scheduler;
  }

  getSnapshot = (): KeyboardNudgeInteractionSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  begin(targetIds: readonly ElementId[], key: KeyboardNudgeKey, largeStep: boolean): boolean {
    if (this.#active !== undefined) {
      return false;
    }
    const capture = this.#source.capture(targetIds);
    if (capture === undefined || capture.targets.length === 0) {
      return false;
    }
    const active: ActiveKeyboardNudge = Object.freeze({
      capture,
      delta: resolveKeyboardNudgeStep(key, largeStep),
    });
    this.#active = active;
    this.#publish(createNudgingSnapshot(active));
    return true;
  }

  step(key: KeyboardNudgeKey, largeStep: boolean): boolean {
    const active = this.#active;
    if (active === undefined) {
      return false;
    }
    const next = Object.freeze({
      capture: active.capture,
      delta: addStep(active.delta, resolveKeyboardNudgeStep(key, largeStep)),
    });
    this.#active = next;
    this.#pending = createNudgingSnapshot(next);
    if (this.#scheduledFrameId === undefined) {
      this.#scheduledFrameId = this.#scheduler.request(this.#handleAnimationFrame);
    }
    return true;
  }

  complete(): KeyboardNudgeCompletion | false {
    const active = this.#active;
    if (active === undefined) {
      return false;
    }
    this.flushPending();
    const snapshot = this.#snapshot;
    let result: KeyboardNudgeCompletion = 'failed';
    if (snapshot.kind === 'nudging' && snapshot.delta.x === 0 && snapshot.delta.y === 0) {
      result = 'unchanged';
    } else if (snapshot.kind === 'nudging') {
      try {
        result = this.#source.commit(createMoveCommands(active.capture, snapshot.delta))
          ? 'committed'
          : 'failed';
      } catch {
        result = 'failed';
      }
    }
    this.#finish();
    return result;
  }

  cancel(): boolean {
    if (this.#active === undefined) {
      return false;
    }
    this.#finish();
    return true;
  }

  /** Publishes the exact latest repeat before completion and deterministic tests. */
  flushPending(): void {
    if (this.#scheduledFrameId !== undefined) {
      this.#scheduler.cancel(this.#scheduledFrameId);
      this.#scheduledFrameId = undefined;
    }
    const pending = this.#pending;
    this.#pending = undefined;
    if (pending !== undefined) {
      this.#publish(pending);
    }
  }

  #finish(): void {
    if (this.#scheduledFrameId !== undefined) {
      this.#scheduler.cancel(this.#scheduledFrameId);
    }
    this.#scheduledFrameId = undefined;
    this.#pending = undefined;
    this.#active = undefined;
    this.#publish(IDLE_SNAPSHOT);
  }

  #handleAnimationFrame = (): void => {
    this.#scheduledFrameId = undefined;
    const pending = this.#pending;
    this.#pending = undefined;
    if (pending !== undefined) {
      this.#publish(pending);
    }
  };

  #publish(snapshot: KeyboardNudgeInteractionSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
