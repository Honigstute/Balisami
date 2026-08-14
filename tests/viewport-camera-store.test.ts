// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  ViewportCameraStore,
  type AnimationFrameScheduler,
} from '../src/renderer/editor/viewport-camera-store';
import {
  createViewportPoint,
  createDeviceScale,
  createViewportSize,
  createViewportTransform,
  createViewportVector,
  createViewportZoom,
  viewportPointToWorld,
} from '../src/renderer/editor/viewport-transform';

class TestAnimationFrameScheduler implements AnimationFrameScheduler {
  readonly callbacks = new Map<number, (timestamp: number) => void>();
  readonly cancelled: number[] = [];
  requestCount = 0;
  #nextId = 1;

  cancel = (requestId: number): void => {
    this.cancelled.push(requestId);
    this.callbacks.delete(requestId);
  };

  request = (callback: (timestamp: number) => void): number => {
    const requestId = this.#nextId;
    this.#nextId += 1;
    this.requestCount += 1;
    this.callbacks.set(requestId, callback);
    return requestId;
  };

  flushNext(timestamp = 16.67): void {
    const entry = this.callbacks.entries().next().value as
      readonly [number, (timestamp: number) => void] | undefined;
    if (entry === undefined) {
      throw new Error('No animation frame is pending.');
    }
    this.callbacks.delete(entry[0]);
    entry[1](timestamp);
  }
}

const createStore = (scheduler: AnimationFrameScheduler) =>
  new ViewportCameraStore({
    initialDeviceScale: createDeviceScale(1),
    initialTransform: createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
    initialViewport: createViewportSize(1_000, 600),
    scheduler,
  });

describe('viewport camera store', () => {
  it('coalesces 1,000 raw transform updates into one latest-state publication', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const listener = vi.fn();
    store.subscribe(listener);

    for (let index = 1; index <= 1_000; index += 1) {
      store.scheduleTransform(createViewportTransform({ panX: index, panY: -index, zoom: 1 }));
    }

    expect(scheduler.requestCount).toBe(1);
    expect(scheduler.callbacks.size).toBe(1);
    expect(store.getSnapshot()).toMatchObject({
      revision: 0,
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    });

    scheduler.flushNext();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({
      revision: 1,
      transform: { pan: { x: 1_000, y: -1_000 }, zoom: 1 },
    });
  });

  it('keeps sequential queued zooms anchored using the latest pending transform', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const anchor = createViewportPoint(420, 260);
    const initialWorldPoint = viewportPointToWorld(anchor, store.getTransformSnapshot());

    store.scheduleZoomAtPoint(createViewportZoom(1.5), anchor);
    store.scheduleZoomAtPoint(createViewportZoom(2), anchor);
    scheduler.flushNext();

    const finalWorldPoint = viewportPointToWorld(anchor, store.getTransformSnapshot());
    expect(finalWorldPoint.x).toBe(initialWorldPoint.x);
    expect(finalWorldPoint.y).toBe(initialWorldPoint.y);
    expect(store.getTransformSnapshot().zoom).toBe(2);
  });

  it('accumulates relative wheel zoom and pan against pending camera state', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const anchor = createViewportPoint(500, 300);
    const initialWorldPoint = viewportPointToWorld(anchor, store.getTransformSnapshot());

    store.scheduleZoomByFactor(1.25, anchor);
    store.scheduleZoomByFactor(1.2, anchor);
    store.scheduleTranslation(createViewportVector(40, -20));
    scheduler.flushNext();

    expect(store.getTransformSnapshot().zoom).toBe(1.5);
    expect(store.getTransformSnapshot().pan).toMatchObject({ x: -210, y: -170 });
    const translatedAnchorWorldPoint = viewportPointToWorld(
      createViewportPoint(anchor.x + 40, anchor.y - 20),
      store.getTransformSnapshot(),
    );
    expect(translatedAnchorWorldPoint).toEqual(initialWorldPoint);
    expect(scheduler.requestCount).toBe(1);
  });

  it('rejects invalid relative zoom factors before scheduling work', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const anchor = createViewportPoint(500, 300);

    expect(() => store.scheduleZoomByFactor(0, anchor)).toThrow(RangeError);
    expect(() => store.scheduleZoomByFactor(Number.NaN, anchor)).toThrow(RangeError);
    expect(scheduler.requestCount).toBe(0);
  });

  it('coalesces a pending transform and resize without reading stale published state', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    store.scheduleTransform(createViewportTransform({ panX: 100, panY: 50, zoom: 1.5 }));
    store.scheduleViewportResize(createViewportSize(1_200, 700), { kind: 'manual' });
    scheduler.flushNext();

    expect(store.getSnapshot()).toMatchObject({
      revision: 1,
      transform: { pan: { x: 200, y: 100 }, zoom: 1.5 },
      viewport: { width: 1_200, height: 700 },
    });
  });

  it('publishes semantic changes only and preserves selector snapshot identity between frames', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const listener = vi.fn();
    store.subscribe(listener);
    const transformSnapshot = store.getTransformSnapshot();
    const viewportSnapshot = store.getViewportSnapshot();

    store.scheduleTransform(createViewportTransform({ panX: 0, panY: 0, zoom: 1 }));
    expect(scheduler.requestCount).toBe(0);
    expect(store.getTransformSnapshot()).toBe(transformSnapshot);
    expect(store.getViewportSnapshot()).toBe(viewportSnapshot);
    expect(listener).not.toHaveBeenCalled();
  });

  it('updates device scale without replacing transform or viewport selector snapshots', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const transformSnapshot = store.getTransformSnapshot();
    const viewportSnapshot = store.getViewportSnapshot();

    store.scheduleDeviceScale(createDeviceScale(1.5));
    scheduler.flushNext();

    expect(store.getDeviceScaleSnapshot()).toBe(1.5);
    expect(store.getTransformSnapshot()).toBe(transformSnapshot);
    expect(store.getViewportSnapshot()).toBe(viewportSnapshot);
    expect(store.getSnapshot().revision).toBe(1);
  });

  it('records an initial viewport measurement without shifting the camera', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const transformSnapshot = store.getTransformSnapshot();

    store.scheduleViewportMeasurement(createViewportSize(1_440, 900));
    scheduler.flushNext();

    expect(store.getViewportSnapshot()).toMatchObject({ width: 1_440, height: 900 });
    expect(store.getTransformSnapshot()).toBe(transformSnapshot);
  });

  it('can flush a gesture end synchronously and cancels the queued frame', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const listener = vi.fn();
    store.subscribe(listener);
    store.scheduleTransform(createViewportTransform({ panX: 80, panY: 40, zoom: 1 }));

    store.flushPending();

    expect(scheduler.cancelled).toEqual([1]);
    expect(scheduler.callbacks.size).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().revision).toBe(1);
  });

  it('cancels a queued return to the current state without publishing', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const listener = vi.fn();
    store.subscribe(listener);
    store.scheduleTransform(createViewportTransform({ panX: 80, panY: 40, zoom: 1 }));
    store.scheduleTransform(createViewportTransform({ panX: 0, panY: 0, zoom: 1 }));

    expect(scheduler.cancelled).toEqual([1]);
    expect(scheduler.callbacks.size).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot().revision).toBe(0);
  });

  it('supports explicit cancellation and makes disposal final and idempotent', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const listener = vi.fn();
    store.subscribe(listener);
    store.scheduleTransform(createViewportTransform({ panX: 10, panY: 20, zoom: 1 }));
    store.cancelPending();

    expect(scheduler.cancelled).toEqual([1]);
    expect(store.getSnapshot().revision).toBe(0);
    store.dispose();
    store.dispose();
    expect(() =>
      store.scheduleTransform(createViewportTransform({ panX: 1, panY: 1, zoom: 1 })),
    ).toThrow('Viewport camera store has been disposed.');
    expect(() => store.subscribe(listener)).toThrow('Viewport camera store has been disposed.');
  });
});
