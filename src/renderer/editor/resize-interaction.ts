import type { ElementId, SetElementFrameCommand, WorldRect as ElementFrame } from '../../domain';
import type { AnimationFrameScheduler } from './viewport-camera-store';
import {
  createResizeCommand,
  resolveResizeFrame,
  type ResizeHandle,
  type ResizeTargetCapture,
} from './resize-geometry';
import type { ResolvedResizeSnap } from './resize-snapping';
import type { SnapGuideDescriptor, SnapLocks } from './snap-engine';
import type { WorldPoint, WorldRect } from './viewport-transform';
import { createWorldPoint } from './viewport-transform';

export interface ResizeSnapRequest {
  readonly aspectLocked: boolean;
  readonly capture: ResizeTargetCapture;
  readonly currentWorldPoint: WorldPoint;
  readonly handle: ResizeHandle;
  readonly previousLocks: SnapLocks;
  readonly raw: ReturnType<typeof resolveResizeFrame>;
  readonly snapBypassed: boolean;
  readonly startWorldPoint: WorldPoint;
}

export interface ResizeInteractionSource {
  readonly capture: (elementId: ElementId) => ResizeTargetCapture | undefined;
  readonly commit: (command: SetElementFrameCommand) => boolean;
  readonly resolveSnap?: (request: ResizeSnapRequest) => ResolvedResizeSnap;
}

export interface ResizePointerInput {
  readonly pointerId: number;
  readonly snapBypassed: boolean;
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
  readonly guides: readonly SnapGuideDescriptor[];
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
const EMPTY_GUIDES: readonly SnapGuideDescriptor[] = Object.freeze([]);
const EMPTY_LOCKS: SnapLocks = Object.freeze({});

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
  resolved: ReturnType<typeof resolveResizeFrame>,
  guides: readonly SnapGuideDescriptor[],
): ResizingSnapshot => {
  return Object.freeze({
    elementId: active.capture.elementId,
    frame: resolved.frame,
    guides,
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
  #locks: SnapLocks = EMPTY_LOCKS;
  #pendingInput: ResizePointerInput | undefined;
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
    const normalizedInput = this.#copyPointerInput(input);
    const pointerId = normalizedInput.pointerId;
    const capture = this.#source.capture(input.elementId);
    if (capture === undefined) {
      return false;
    }
    const active = Object.freeze({
      capture,
      handle: input.handle,
      pointerId,
      startWorldPoint: createWorldPoint(input.startWorldPoint.x, input.startWorldPoint.y),
    });
    this.#active = active;
    this.#locks = EMPTY_LOCKS;
    this.#publish(this.#resolveSnapshot(active, normalizedInput));
    return true;
  }

  update(input: ResizePointerInput): boolean {
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

  #publish(snapshot: ResizeInteractionSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      listener();
    }
  }

  #copyPointerInput(input: ResizePointerInput): ResizePointerInput {
    if (typeof input.snapBypassed !== 'boolean' || typeof input.shiftKey !== 'boolean') {
      throw new TypeError('Resize modifiers must be boolean values.');
    }
    return Object.freeze({
      pointerId: requirePointerId(input.pointerId),
      snapBypassed: input.snapBypassed,
      shiftKey: input.shiftKey,
      worldPoint: createWorldPoint(input.worldPoint.x, input.worldPoint.y),
    });
  }

  #resolveSnapshot(active: ActiveResize, input: ResizePointerInput): ResizingSnapshot {
    const normalizedInput = this.#copyPointerInput(input);
    const raw = resolveResizeFrame(
      active.capture,
      active.handle,
      active.startWorldPoint,
      normalizedInput.worldPoint,
      normalizedInput.shiftKey,
    );
    try {
      const resolved = this.#source.resolveSnap?.({
        aspectLocked: normalizedInput.shiftKey,
        capture: active.capture,
        currentWorldPoint: normalizedInput.worldPoint,
        handle: active.handle,
        previousLocks: this.#locks,
        raw,
        snapBypassed: normalizedInput.snapBypassed,
        startWorldPoint: active.startWorldPoint,
      });
      if (resolved !== undefined) {
        this.#locks = resolved.locks;
        return createResizingSnapshot(active, resolved, resolved.guides);
      }
    } catch {
      // Snapping is assistive. Preserve resize ownership and raw geometry if
      // candidate generation or resolution fails for one pointer frame.
    }
    this.#locks = EMPTY_LOCKS;
    return createResizingSnapshot(active, raw, EMPTY_GUIDES);
  }
}
