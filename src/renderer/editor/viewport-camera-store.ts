import { reframeViewportOnResize, type ViewportFramingRequest } from './viewport-framing';
import {
  setViewportZoomAtPoint,
  type DeviceScale,
  type ViewportPoint,
  type ViewportSize,
  type ViewportTransform,
  type ViewportZoom,
} from './viewport-transform';

export interface AnimationFrameScheduler {
  readonly cancel: (requestId: number) => void;
  readonly request: (callback: (timestamp: number) => void) => number;
}

export interface ViewportCameraSnapshot {
  readonly deviceScale: DeviceScale;
  readonly revision: number;
  readonly transform: ViewportTransform;
  readonly viewport: ViewportSize;
}

export interface ViewportCameraStoreOptions {
  readonly initialDeviceScale: DeviceScale;
  readonly initialTransform: ViewportTransform;
  readonly initialViewport: ViewportSize;
  readonly scheduler: AnimationFrameScheduler;
}

interface PendingCameraState {
  readonly deviceScale: DeviceScale;
  readonly transform: ViewportTransform;
  readonly viewport: ViewportSize;
}

const transformsEqual = (first: ViewportTransform, second: ViewportTransform): boolean =>
  first === second ||
  (first.zoom === second.zoom && first.pan.x === second.pan.x && first.pan.y === second.pan.y);

const viewportSizesEqual = (first: ViewportSize, second: ViewportSize): boolean =>
  first === second || (first.width === second.width && first.height === second.height);

const cameraStatesEqual = (
  first: Pick<ViewportCameraSnapshot, 'deviceScale' | 'transform' | 'viewport'>,
  second: PendingCameraState,
): boolean =>
  first.deviceScale === second.deviceScale &&
  transformsEqual(first.transform, second.transform) &&
  viewportSizesEqual(first.viewport, second.viewport);

const freezeSnapshot = (revision: number, state: PendingCameraState): ViewportCameraSnapshot =>
  Object.freeze({
    deviceScale: state.deviceScale,
    revision,
    transform: state.transform,
    viewport: state.viewport,
  });

export const createBrowserAnimationFrameScheduler = (): AnimationFrameScheduler =>
  Object.freeze({
    cancel: (requestId: number) => window.cancelAnimationFrame(requestId),
    request: (callback: (timestamp: number) => void) => window.requestAnimationFrame(callback),
  });

/**
 * One external authority for camera/session geometry. Producers can enqueue on
 * every raw input; subscribers see at most one immutable publication per frame.
 */
export class ViewportCameraStore {
  readonly #listeners = new Set<() => void>();
  readonly #scheduler: AnimationFrameScheduler;

  #disposed = false;
  #pending: PendingCameraState | undefined;
  #scheduledFrameId: number | undefined;
  #snapshot: ViewportCameraSnapshot;

  constructor(options: ViewportCameraStoreOptions) {
    this.#scheduler = options.scheduler;
    this.#snapshot = freezeSnapshot(0, {
      deviceScale: options.initialDeviceScale,
      transform: options.initialTransform,
      viewport: options.initialViewport,
    });
  }

  getSnapshot = (): ViewportCameraSnapshot => this.#snapshot;

  getDeviceScaleSnapshot = (): DeviceScale => this.#snapshot.deviceScale;

  getTransformSnapshot = (): ViewportTransform => this.#snapshot.transform;

  getViewportSnapshot = (): ViewportSize => this.#snapshot.viewport;

  subscribe = (listener: () => void): (() => void) => {
    this.#assertActive();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  scheduleTransform(transform: ViewportTransform): void {
    const base = this.#getPendingOrCurrent();
    this.#schedule({ deviceScale: base.deviceScale, transform, viewport: base.viewport });
  }

  scheduleDeviceScale(deviceScale: DeviceScale): void {
    const base = this.#getPendingOrCurrent();
    this.#schedule({ deviceScale, transform: base.transform, viewport: base.viewport });
  }

  /** Records the first measured viewport without inventing a resize camera delta. */
  scheduleViewportMeasurement(viewport: ViewportSize): void {
    const base = this.#getPendingOrCurrent();
    this.#schedule({ deviceScale: base.deviceScale, transform: base.transform, viewport });
  }

  scheduleZoomAtPoint(zoom: ViewportZoom, anchor: ViewportPoint): void {
    const base = this.#getPendingOrCurrent();
    this.#schedule({
      deviceScale: base.deviceScale,
      transform: setViewportZoomAtPoint(base.transform, zoom, anchor),
      viewport: base.viewport,
    });
  }

  scheduleViewportResize(viewport: ViewportSize, request: ViewportFramingRequest): void {
    const base = this.#getPendingOrCurrent();
    this.#schedule({
      deviceScale: base.deviceScale,
      transform: reframeViewportOnResize(base.transform, base.viewport, viewport, request),
      viewport,
    });
  }

  /** Publishes pending state synchronously for gesture completion or deterministic tests. */
  flushPending(): void {
    this.#assertActive();
    if (this.#scheduledFrameId !== undefined) {
      this.#scheduler.cancel(this.#scheduledFrameId);
      this.#scheduledFrameId = undefined;
    }
    this.#publishPending();
  }

  cancelPending(): void {
    this.#assertActive();
    if (this.#scheduledFrameId !== undefined) {
      this.#scheduler.cancel(this.#scheduledFrameId);
      this.#scheduledFrameId = undefined;
    }
    this.#pending = undefined;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    if (this.#scheduledFrameId !== undefined) {
      this.#scheduler.cancel(this.#scheduledFrameId);
    }
    this.#scheduledFrameId = undefined;
    this.#pending = undefined;
    this.#listeners.clear();
    this.#disposed = true;
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error('Viewport camera store has been disposed.');
    }
  }

  #getPendingOrCurrent(): PendingCameraState {
    this.#assertActive();
    return this.#pending ?? this.#snapshot;
  }

  #schedule(state: PendingCameraState): void {
    if (cameraStatesEqual(this.#snapshot, state)) {
      this.#pending = undefined;
      if (this.#scheduledFrameId !== undefined) {
        this.#scheduler.cancel(this.#scheduledFrameId);
        this.#scheduledFrameId = undefined;
      }
      return;
    }
    if (this.#pending !== undefined && cameraStatesEqual(this.#pending, state)) {
      return;
    }
    this.#pending = Object.freeze(state);
    if (this.#scheduledFrameId === undefined) {
      this.#scheduledFrameId = this.#scheduler.request(this.#handleAnimationFrame);
    }
  }

  #handleAnimationFrame = (): void => {
    this.#scheduledFrameId = undefined;
    if (!this.#disposed) {
      this.#publishPending();
    }
  };

  #publishPending(): void {
    const pending = this.#pending;
    this.#pending = undefined;
    if (pending === undefined || cameraStatesEqual(this.#snapshot, pending)) {
      return;
    }
    this.#snapshot = freezeSnapshot(this.#snapshot.revision + 1, pending);
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
