// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  executeViewportCommand,
  getViewportShortcutLabel,
  resolveViewportShortcut,
  VIEWPORT_COMMAND_IDS,
} from '../src/renderer/editor/viewport-commands';
import {
  ViewportCameraStore,
  type AnimationFrameScheduler,
} from '../src/renderer/editor/viewport-camera-store';
import {
  createDeviceScale,
  createViewportPoint,
  createViewportSize,
  createViewportTransform,
  createWorldRect,
  viewportPointToWorld,
} from '../src/renderer/editor/viewport-transform';

class TestAnimationFrameScheduler implements AnimationFrameScheduler {
  readonly callbacks = new Map<number, (timestamp: number) => void>();
  #nextId = 1;

  cancel = (requestId: number): void => {
    this.callbacks.delete(requestId);
  };

  request = (callback: (timestamp: number) => void): number => {
    const requestId = this.#nextId;
    this.#nextId += 1;
    this.callbacks.set(requestId, callback);
    return requestId;
  };

  flushNext(): void {
    const entry = this.callbacks.entries().next().value as
      readonly [number, (timestamp: number) => void] | undefined;
    if (entry === undefined) {
      throw new Error('No animation frame is pending.');
    }
    this.callbacks.delete(entry[0]);
    entry[1](16.67);
  }
}

const createStore = (scheduler: AnimationFrameScheduler, zoom = 1) =>
  new ViewportCameraStore({
    initialDeviceScale: createDeviceScale(1),
    initialTransform: createViewportTransform({ panX: -120, panY: 80, zoom }),
    initialViewport: createViewportSize(1_000, 600),
    scheduler,
  });

const shortcut = (overrides: Partial<Parameters<typeof resolveViewportShortcut>[0]> = {}) => ({
  altKey: false,
  ctrlKey: true,
  key: '0',
  metaKey: false,
  shiftKey: false,
  ...overrides,
});

describe('viewport commands', () => {
  it('zooms around the viewport center and reverses without anchor drift', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const camera = createStore(scheduler);
    const center = createViewportPoint(500, 300);
    const worldAtCenter = viewportPointToWorld(center, camera.getTransformSnapshot());

    expect(
      executeViewportCommand(VIEWPORT_COMMAND_IDS.zoomIn, {
        boardBounds: undefined,
        camera,
      }),
    ).toBe(true);
    scheduler.flushNext();
    expect(camera.getZoomSnapshot()).toBe(1.2);
    expect(viewportPointToWorld(center, camera.getTransformSnapshot())).toEqual(worldAtCenter);

    executeViewportCommand(VIEWPORT_COMMAND_IDS.zoomOut, { boardBounds: undefined, camera });
    scheduler.flushNext();
    expect(camera.getZoomSnapshot()).toBe(1);
    expect(viewportPointToWorld(center, camera.getTransformSnapshot())).toEqual(worldAtCenter);
  });

  it('supports actual, fit-board, and fit-width while keeping unavailable commands explicit', () => {
    const scheduler = new TestAnimationFrameScheduler();
    const camera = createStore(scheduler, 2);
    const bounds = createWorldRect(100, -200, 1_000, 2_000);

    executeViewportCommand(VIEWPORT_COMMAND_IDS.actualSize, { boardBounds: bounds, camera });
    scheduler.flushNext();
    expect(camera.getSnapshot()).toMatchObject({
      framing: { kind: 'actual' },
      transform: { zoom: 1 },
    });

    executeViewportCommand(VIEWPORT_COMMAND_IDS.fitBoard, { boardBounds: bounds, camera });
    scheduler.flushNext();
    expect(camera.getSnapshot()).toMatchObject({
      framing: { kind: 'fit' },
      transform: { zoom: 0.252 },
    });

    executeViewportCommand(VIEWPORT_COMMAND_IDS.fitWidth, { boardBounds: bounds, camera });
    scheduler.flushNext();
    expect(camera.getSnapshot()).toMatchObject({
      framing: { kind: 'width' },
      transform: { zoom: 0.904 },
    });

    expect(
      executeViewportCommand(VIEWPORT_COMMAND_IDS.fitBoard, {
        boardBounds: undefined,
        camera,
      }),
    ).toBe(false);
    expect(
      executeViewportCommand(VIEWPORT_COMMAND_IDS.fitSelection, {
        boardBounds: bounds,
        camera,
      }),
    ).toBe(false);
    expect(scheduler.callbacks.size).toBe(0);
  });

  it('maps exactly one native modifier and exposes matching platform labels', () => {
    expect(resolveViewportShortcut(shortcut({ key: '+' }))).toBe(VIEWPORT_COMMAND_IDS.zoomIn);
    expect(resolveViewportShortcut(shortcut({ key: '-' }))).toBe(VIEWPORT_COMMAND_IDS.zoomOut);
    expect(resolveViewportShortcut(shortcut({ ctrlKey: false, key: '1', metaKey: true }))).toBe(
      VIEWPORT_COMMAND_IDS.fitBoard,
    );
    expect(resolveViewportShortcut(shortcut({ key: '1', shiftKey: true }))).toBe(
      VIEWPORT_COMMAND_IDS.fitWidth,
    );
    expect(resolveViewportShortcut(shortcut({ ctrlKey: false, metaKey: false }))).toBeUndefined();
    expect(resolveViewportShortcut(shortcut({ metaKey: true }))).toBeUndefined();
    expect(resolveViewportShortcut(shortcut({ altKey: true }))).toBeUndefined();
    expect(resolveViewportShortcut(shortcut({ key: '0', shiftKey: true }))).toBeUndefined();

    expect(getViewportShortcutLabel(VIEWPORT_COMMAND_IDS.actualSize, 'darwin')).toBe('⌘0');
    expect(getViewportShortcutLabel(VIEWPORT_COMMAND_IDS.fitWidth, 'darwin')).toBe('⇧⌘1');
    expect(getViewportShortcutLabel(VIEWPORT_COMMAND_IDS.fitBoard, 'win32')).toBe('Ctrl+1');
    expect(getViewportShortcutLabel(VIEWPORT_COMMAND_IDS.fitWidth, 'win32')).toBe('Ctrl+Shift+1');
    expect(getViewportShortcutLabel(VIEWPORT_COMMAND_IDS.fitSelection, 'win32')).toBeUndefined();
  });
});
