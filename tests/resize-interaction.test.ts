// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';
import { ResizeInteraction } from '../src/renderer/editor/resize-interaction';
import type { ResizeTargetCapture } from '../src/renderer/editor/resize-geometry';
import type { AnimationFrameScheduler } from '../src/renderer/editor/viewport-camera-store';
import { createWorldPoint, createWorldRect } from '../src/renderer/editor/viewport-transform';

class TestAnimationFrameScheduler implements AnimationFrameScheduler {
  readonly callbacks = new Map<number, (timestamp: number) => void>();
  readonly cancelled: number[] = [];
  #nextId = 1;

  cancel = (requestId: number): void => {
    this.cancelled.push(requestId);
    this.callbacks.delete(requestId);
  };

  request = (callback: (timestamp: number) => void): number => {
    const requestId = this.#nextId++;
    this.callbacks.set(requestId, callback);
    return requestId;
  };

  flushNext(): void {
    const entry = this.callbacks.entries().next().value as
      readonly [number, (timestamp: number) => void] | undefined;
    if (entry === undefined) {
      throw new Error('No resize frame is pending.');
    }
    this.callbacks.delete(entry[0]);
    entry[1](16.67);
  }
}

const createCapture = (): ResizeTargetCapture =>
  Object.freeze({
    elementId: DOCUMENT_FIXTURE_IDS.child,
    frame: Object.freeze({ x: 16, y: 24, width: 120, height: 48 }),
    worldBounds: createWorldRect(-4, 36.5, 120, 48),
  });

describe('resize interaction', () => {
  it('coalesces 500 raw updates and commits one exact final frame command', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const commit = vi.fn(() => true);
    const resize = new ResizeInteraction({ capture: createCapture, commit }, scheduler);
    const listener = vi.fn();
    resize.subscribe(listener);
    expect(
      resize.begin({
        elementId: DOCUMENT_FIXTURE_IDS.child,
        handle: 'southEast',
        pointerId: 3,
        shiftKey: false,
        startWorldPoint: createWorldPoint(116, 84.5),
        worldPoint: createWorldPoint(116, 84.5),
      }),
    ).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    for (let index = 1; index <= 500; index += 1) {
      resize.update({
        pointerId: 3,
        shiftKey: false,
        worldPoint: createWorldPoint(116 + index / 10, 84.5 + index / 20),
      });
    }
    expect(scheduler.callbacks.size).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    scheduler.flushNext();
    expect(resize.getSnapshot()).toMatchObject({
      frame: { x: 16, y: 24, width: 170, height: 73 },
      kind: 'resizing',
      worldBounds: { x: -4, y: 36.5, width: 170, height: 73 },
    });

    expect(
      resize.complete({
        pointerId: 3,
        shiftKey: false,
        worldPoint: createWorldPoint(176, 114.5),
      }),
    ).toBe('committed');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({
      type: 'element.set-frame',
      elementId: DOCUMENT_FIXTURE_IDS.child,
      frame: { x: 16, y: 24, width: 180, height: 78 },
    });
    expect(resize.getSnapshot()).toEqual({ kind: 'idle' });
    expect(scheduler.callbacks.size).toBe(0);
  });

  it('recomputes a live Shift change from the immutable start frame', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const resize = new ResizeInteraction({ capture: createCapture, commit: () => true }, scheduler);
    resize.begin({
      elementId: DOCUMENT_FIXTURE_IDS.child,
      handle: 'east',
      pointerId: 4,
      shiftKey: false,
      startWorldPoint: createWorldPoint(116, 60.5),
      worldPoint: createWorldPoint(176, 60.5),
    });
    expect(resize.getSnapshot()).toMatchObject({
      frame: { x: 16, y: 24, width: 180, height: 48 },
    });
    resize.update({
      pointerId: 4,
      shiftKey: true,
      worldPoint: createWorldPoint(176, 999),
    });
    scheduler.flushNext();
    expect(resize.getSnapshot()).toMatchObject({
      frame: { x: 16, y: 12, width: 180, height: 72 },
    });
  });

  it('cancels pending work and never commits', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const commit = vi.fn(() => true);
    const resize = new ResizeInteraction({ capture: createCapture, commit }, scheduler);
    resize.begin({
      elementId: DOCUMENT_FIXTURE_IDS.child,
      handle: 'west',
      pointerId: 5,
      shiftKey: false,
      startWorldPoint: createWorldPoint(-4, 60.5),
      worldPoint: createWorldPoint(-4, 60.5),
    });
    resize.update({
      pointerId: 5,
      shiftKey: false,
      worldPoint: createWorldPoint(20, 60.5),
    });
    expect(scheduler.callbacks.size).toBe(1);
    expect(resize.cancel(5)).toBe(true);
    expect(resize.getSnapshot()).toEqual({ kind: 'idle' });
    expect(scheduler.callbacks.size).toBe(0);
    expect(commit).not.toHaveBeenCalled();
  });

  it('reports unchanged and contains capture or commit failures', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const commit = vi.fn(() => {
      throw new Error('Expected failure');
    });
    const resize = new ResizeInteraction({ capture: createCapture, commit }, scheduler);
    const beginInput = {
      elementId: DOCUMENT_FIXTURE_IDS.child,
      handle: 'south' as const,
      pointerId: 6,
      shiftKey: false,
      startWorldPoint: createWorldPoint(56, 84.5),
      worldPoint: createWorldPoint(56, 84.5),
    };
    expect(resize.begin(beginInput)).toBe(true);
    expect(resize.complete(beginInput)).toBe('unchanged');
    expect(commit).not.toHaveBeenCalled();

    expect(resize.begin({ ...beginInput, pointerId: 7 })).toBe(true);
    expect(
      resize.complete({
        pointerId: 7,
        shiftKey: false,
        worldPoint: createWorldPoint(56, 94.5),
      }),
    ).toBe('failed');
    expect(resize.getSnapshot()).toEqual({ kind: 'idle' });

    const missing = new ResizeInteraction(
      { capture: () => undefined, commit: () => true },
      scheduler,
    );
    expect(missing.begin(beginInput)).toBe(false);
  });
});
