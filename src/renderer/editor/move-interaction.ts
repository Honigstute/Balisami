import type { ElementId, SetElementFrameCommand } from '../../domain';
import type { AnimationFrameScheduler } from './viewport-camera-store';
import { createMoveCommands, resolveMoveDelta, type MoveTargetCapture } from './move-geometry';
import type { WorldPoint, WorldVector } from './viewport-transform';

export interface MoveInteractionSource {
  readonly capture: (targetIds: readonly ElementId[]) => MoveTargetCapture | undefined;
  readonly commit: (commands: readonly SetElementFrameCommand[]) => boolean;
}

export interface MovePointerInput {
  readonly pointerId: number;
  readonly shiftKey: boolean;
  readonly worldPoint: WorldPoint;
}

export interface MoveBeginInput extends MovePointerInput {
  readonly startWorldPoint: WorldPoint;
  readonly targetIds: readonly ElementId[];
}

export type MoveCompletion = 'committed' | 'failed' | 'unchanged';

interface MovingSnapshot {
  readonly affectedIds: readonly ElementId[];
  readonly delta: WorldVector;
  readonly kind: 'moving';
  readonly pointerId: number;
  readonly targetIds: readonly ElementId[];
}

export type MoveInteractionSnapshot = { readonly kind: 'idle' } | MovingSnapshot;

interface ActiveMove {
  readonly capture: MoveTargetCapture;
  readonly pointerId: number;
  readonly startWorldPoint: WorldPoint;
}

const IDLE_SNAPSHOT: MoveInteractionSnapshot = Object.freeze({ kind: 'idle' });

const requirePointerId = (pointerId: number): number => {
  if (!Number.isSafeInteger(pointerId) || pointerId < 0) {
    throw new RangeError('Move pointer ID must be a non-negative safe integer.');
  }
  return pointerId;
};

const deltasEqual = (first: WorldVector, second: WorldVector): boolean =>
  first.x === second.x && first.y === second.y;

const createMovingSnapshot = (active: ActiveMove, delta: WorldVector): MovingSnapshot =>
  Object.freeze({
    affectedIds: active.capture.affectedIds,
    delta,
    kind: 'moving',
    pointerId: active.pointerId,
    targetIds: Object.freeze(active.capture.targets.map((target) => target.id)),
  });

/**
 * External transient move authority. Raw pointer updates coalesce to one
 * publication per animation frame; completion flushes the exact final delta
 * and emits one command transaction through the supplied boundary.
 */
export class MoveInteraction {
  readonly #listeners = new Set<() => void>();
  readonly #scheduler: AnimationFrameScheduler;
  readonly #source: MoveInteractionSource;

  #active: ActiveMove | undefined;
  #pending: MoveInteractionSnapshot | undefined;
  #scheduledFrameId: number | undefined;
  #snapshot: MoveInteractionSnapshot = IDLE_SNAPSHOT;

  constructor(source: MoveInteractionSource, scheduler: AnimationFrameScheduler) {
    this.#source = source;
    this.#scheduler = scheduler;
  }

  getSnapshot = (): MoveInteractionSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  begin(input: MoveBeginInput): boolean {
    if (this.#active !== undefined) {
      return false;
    }
    const pointerId = requirePointerId(input.pointerId);
    const capture = this.#source.capture(input.targetIds);
    if (capture === undefined || capture.targets.length === 0) {
      return false;
    }
    const active = Object.freeze({
      capture,
      pointerId,
      startWorldPoint: input.startWorldPoint,
    });
    this.#active = active;
    this.#publish(
      createMovingSnapshot(
        active,
        resolveMoveDelta(input.startWorldPoint, input.worldPoint, input.shiftKey),
      ),
    );
    return true;
  }

  update(input: MovePointerInput): boolean {
    const active = this.#active;
    if (active === undefined || active.pointerId !== input.pointerId) {
      return false;
    }
    const next = createMovingSnapshot(
      active,
      resolveMoveDelta(active.startWorldPoint, input.worldPoint, input.shiftKey),
    );
    const latest = this.#pending ?? this.#snapshot;
    if (latest.kind === 'moving' && deltasEqual(latest.delta, next.delta)) {
      return true;
    }
    this.#pending = next;
    if (this.#scheduledFrameId === undefined) {
      this.#scheduledFrameId = this.#scheduler.request(this.#handleAnimationFrame);
    }
    return true;
  }

  complete(input: MovePointerInput): MoveCompletion | false {
    const active = this.#active;
    if (active === undefined || active.pointerId !== input.pointerId) {
      return false;
    }
    this.update(input);
    this.flushPending();
    const snapshot = this.#snapshot;
    let result: MoveCompletion = 'failed';
    if (snapshot.kind === 'moving' && snapshot.delta.x === 0 && snapshot.delta.y === 0) {
      result = 'unchanged';
    } else if (snapshot.kind === 'moving') {
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

  cancel(pointerId?: number): boolean {
    const active = this.#active;
    if (active === undefined || (pointerId !== undefined && active.pointerId !== pointerId)) {
      return false;
    }
    this.#finish();
    return true;
  }

  /** Publishes the exact latest pointer state for completion and tests. */
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

  #publish(snapshot: MoveInteractionSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
