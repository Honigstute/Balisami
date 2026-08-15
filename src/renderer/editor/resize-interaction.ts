import type { ElementId, SetElementFrameCommand, WorldRect as ElementFrame } from '../../domain';
import type { AnimationFrameScheduler } from './viewport-camera-store';
import {
  createResizeCommand,
  resolveResizeFrame,
  type ResizeHandle,
  type ResizeTargetCapture,
} from './resize-geometry';
import type { WorldPoint, WorldRect } from './viewport-transform';

export interface ResizeInteractionSource {
  readonly capture: (elementId: ElementId) => ResizeTargetCapture | undefined;
  readonly commit: (command: SetElementFrameCommand) => boolean;
}

export interface ResizePointerInput {
  readonly pointerId: number;
  readonly shiftKey: boolean;
  readonly worldPoint: WorldPoint;
}

export interface ResizeBeginInput extends ResizePointerInput {
  readonly elementId: ElementId;
  readonly handle: ResizeHandle;
  readonly startWorldPoint: WorldPoint;
}

export type ResizeCompletion = 'committed' | 'failed' | 'unchanged';

export interface ResizingSnapshot {
  readonly elementId: ElementId;
  readonly frame: ElementFrame;
  readonly handle: ResizeHandle;
  readonly kind: 'resizing';
  readonly pointerId: number;
  readonly worldBounds: WorldRect;
}

export type ResizeInteractionSnapshot = { readonly kind: 'idle' } | ResizingSnapshot;

interface ActiveResize {
  readonly capture: ResizeTargetCapture;
  readonly handle: ResizeHandle;
  readonly pointerId: number;
  readonly startWorldPoint: WorldPoint;
}

const IDLE_SNAPSHOT: ResizeInteractionSnapshot = Object.freeze({ kind: 'idle' });

const requirePointerId = (pointerId: number): number => {
  if (!Number.isSafeInteger(pointerId) || pointerId < 0) {
    throw new RangeError('Resize pointer ID must be a non-negative safe integer.');
  }
  return pointerId;
};

const framesEqual = (first: ElementFrame, second: ElementFrame): boolean =>
  first.x === second.x &&
  first.y === second.y &&
  first.width === second.width &&
  first.height === second.height;

const createResizingSnapshot = (
  active: ActiveResize,
  worldPoint: WorldPoint,
  aspectLocked: boolean,
): ResizingSnapshot => {
  const resolved = resolveResizeFrame(
    active.capture,
    active.handle,
    active.startWorldPoint,
    worldPoint,
    aspectLocked,
  );
  return Object.freeze({
    elementId: active.capture.elementId,
    frame: resolved.frame,
    handle: active.handle,
    kind: 'resizing',
    pointerId: active.pointerId,
    worldBounds: resolved.worldBounds,
  });
};

/**
 * External transient resize authority. The document remains unchanged during
 * preview; arbitrary raw events collapse into one animation-frame publication
 * and pointer-up emits at most one validated frame command.
 */
export class ResizeInteraction {
  readonly #listeners = new Set<() => void>();
  readonly #scheduler: AnimationFrameScheduler;
  readonly #source: ResizeInteractionSource;

  #active: ActiveResize | undefined;
  #pending: ResizingSnapshot | undefined;
  #scheduledFrameId: number | undefined;
  #snapshot: ResizeInteractionSnapshot = IDLE_SNAPSHOT;

  constructor(source: ResizeInteractionSource, scheduler: AnimationFrameScheduler) {
    this.#source = source;
    this.#scheduler = scheduler;
  }

  getSnapshot = (): ResizeInteractionSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  begin(input: ResizeBeginInput): boolean {
    if (this.#active !== undefined) {
      return false;
    }
    const pointerId = requirePointerId(input.pointerId);
    const capture = this.#source.capture(input.elementId);
    if (capture === undefined) {
      return false;
    }
    const active = Object.freeze({
      capture,
      handle: input.handle,
      pointerId,
      startWorldPoint: input.startWorldPoint,
    });
    this.#active = active;
    this.#publish(createResizingSnapshot(active, input.worldPoint, input.shiftKey));
    return true;
  }

  update(input: ResizePointerInput): boolean {
    const active = this.#active;
    if (active === undefined || active.pointerId !== input.pointerId) {
      return false;
    }
    const next = createResizingSnapshot(active, input.worldPoint, input.shiftKey);
    const latest = this.#pending ?? this.#snapshot;
    if (latest.kind === 'resizing' && framesEqual(latest.frame, next.frame)) {
      return true;
    }
    this.#pending = next;
    if (this.#scheduledFrameId === undefined) {
      this.#scheduledFrameId = this.#scheduler.request(this.#handleAnimationFrame);
    }
    return true;
  }

  complete(input: ResizePointerInput): ResizeCompletion | false {
    const active = this.#active;
    if (active === undefined || active.pointerId !== input.pointerId) {
      return false;
    }
    this.update(input);
    this.flushPending();
    const snapshot = this.#snapshot;
    let result: ResizeCompletion = 'failed';
    if (snapshot.kind === 'resizing' && framesEqual(snapshot.frame, active.capture.frame)) {
      result = 'unchanged';
    } else if (snapshot.kind === 'resizing') {
      try {
        result = this.#source.commit(createResizeCommand(active.capture, snapshot.frame))
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

  #publish(snapshot: ResizeInteractionSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
