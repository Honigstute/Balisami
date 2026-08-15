import type { ElementId, SetElementFrameCommand } from '../../domain';
import type { AnimationFrameScheduler } from './viewport-camera-store';
import { createMoveCommands, resolveMoveDelta, type MoveTargetCapture } from './move-geometry';
import type { SnapActiveAxes, SnapGuideDescriptor, SnapLocks, SnapResolution } from './snap-engine';
import {
  createWorldPoint,
  createWorldVector,
  type WorldPoint,
  type WorldVector,
} from './viewport-transform';

export interface MoveSnapRequest {
  readonly activeAxes: SnapActiveAxes;
  readonly capture: MoveTargetCapture;
  readonly previousLocks: SnapLocks;
  readonly rawDelta: WorldVector;
  readonly snapBypassed: boolean;
}

export interface MoveInteractionSource {
  readonly capture: (targetIds: readonly ElementId[]) => MoveTargetCapture | undefined;
  readonly commit: (commands: readonly SetElementFrameCommand[]) => boolean;
  readonly resolveSnap?: (request: MoveSnapRequest) => SnapResolution;
}

export interface MovePointerInput {
  readonly pointerId: number;
  readonly snapBypassed: boolean;
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
  readonly guides: readonly SnapGuideDescriptor[];
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
const EMPTY_GUIDES: readonly SnapGuideDescriptor[] = Object.freeze([]);
const EMPTY_LOCKS: SnapLocks = Object.freeze({});

const requirePointerId = (pointerId: number): number => {
  if (!Number.isSafeInteger(pointerId) || pointerId < 0) {
    throw new RangeError('Move pointer ID must be a non-negative safe integer.');
  }
  return pointerId;
};

const createMovingSnapshot = (
  active: ActiveMove,
  delta: WorldVector,
  guides: readonly SnapGuideDescriptor[],
): MovingSnapshot =>
  Object.freeze({
    affectedIds: active.capture.affectedIds,
    delta,
    guides,
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
  #locks: SnapLocks = EMPTY_LOCKS;
  #pendingInput: MovePointerInput | undefined;
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
    const normalizedInput = this.#copyPointerInput(input);
    const pointerId = normalizedInput.pointerId;
    const capture = this.#source.capture(input.targetIds);
    if (capture === undefined || capture.targets.length === 0) {
      return false;
    }
    const active = Object.freeze({
      capture,
      pointerId,
      startWorldPoint: createWorldPoint(input.startWorldPoint.x, input.startWorldPoint.y),
    });
    this.#active = active;
    this.#locks = EMPTY_LOCKS;
    this.#publish(this.#resolveSnapshot(active, normalizedInput));
    return true;
  }

  update(input: MovePointerInput): boolean {
    const active = this.#active;
    if (active === undefined || active.pointerId !== input.pointerId) {
      return false;
    }
    this.#pendingInput = this.#copyPointerInput(input);
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
    const pendingInput = this.#pendingInput;
    this.#pendingInput = undefined;
    const active = this.#active;
    if (pendingInput !== undefined && active !== undefined) {
      this.#publish(this.#resolveSnapshot(active, pendingInput));
    }
  }

  #finish(): void {
    if (this.#scheduledFrameId !== undefined) {
      this.#scheduler.cancel(this.#scheduledFrameId);
    }
    this.#scheduledFrameId = undefined;
    this.#pendingInput = undefined;
    this.#active = undefined;
    this.#locks = EMPTY_LOCKS;
    this.#publish(IDLE_SNAPSHOT);
  }

  #handleAnimationFrame = (): void => {
    this.#scheduledFrameId = undefined;
    const pendingInput = this.#pendingInput;
    this.#pendingInput = undefined;
    const active = this.#active;
    if (pendingInput !== undefined && active !== undefined) {
      this.#publish(this.#resolveSnapshot(active, pendingInput));
    }
  };

  #publish(snapshot: MoveInteractionSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      listener();
    }
  }

  #copyPointerInput(input: MovePointerInput): MovePointerInput {
    if (typeof input.snapBypassed !== 'boolean' || typeof input.shiftKey !== 'boolean') {
      throw new TypeError('Move modifiers must be boolean values.');
    }
    return Object.freeze({
      pointerId: requirePointerId(input.pointerId),
      snapBypassed: input.snapBypassed,
      shiftKey: input.shiftKey,
      worldPoint: createWorldPoint(input.worldPoint.x, input.worldPoint.y),
    });
  }

  #resolveSnapshot(active: ActiveMove, input: MovePointerInput): MovingSnapshot {
    const normalizedInput = this.#copyPointerInput(input);
    const rawDelta = resolveMoveDelta(
      active.startWorldPoint,
      normalizedInput.worldPoint,
      normalizedInput.shiftKey,
    );
    const activeAxes: SnapActiveAxes = normalizedInput.shiftKey
      ? Object.freeze({ x: rawDelta.y === 0, y: rawDelta.y !== 0 })
      : Object.freeze({ x: true, y: true });
    try {
      const resolution = this.#source.resolveSnap?.({
        activeAxes,
        capture: active.capture,
        previousLocks: this.#locks,
        rawDelta,
        snapBypassed: normalizedInput.snapBypassed,
      });
      if (resolution !== undefined) {
        this.#locks = resolution.locks;
        return createMovingSnapshot(
          active,
          createWorldVector(resolution.adjustedDelta.x, resolution.adjustedDelta.y),
          resolution.guides,
        );
      }
    } catch {
      // Snapping is assistive. A resolver fault must not break move ownership,
      // corrupt the transaction, or strand a stale hysteresis lock.
    }
    this.#locks = EMPTY_LOCKS;
    return createMovingSnapshot(active, createWorldVector(rawDelta.x, rawDelta.y), EMPTY_GUIDES);
  }
}
