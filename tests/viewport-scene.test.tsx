import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ViewportEmptyState, ViewportScene } from '../src/renderer/editor/ViewportScene';
import { SCENE_LAYER_ATTRIBUTE, SCENE_LAYERS } from '../src/renderer/editor/scene-layers';
import { SelectionInteraction } from '../src/renderer/editor/selection-interaction';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { ElementIdSchema } from '../src/domain';
import {
  ViewportCameraStore,
  type AnimationFrameScheduler,
} from '../src/renderer/editor/viewport-camera-store';
import {
  createDeviceScale,
  createViewportSize,
  createViewportPoint,
  createViewportTransform,
  createWorldRect,
  viewportPointToWorld,
} from '../src/renderer/editor/viewport-transform';

const SELECTABLE_ID = ElementIdSchema.parse('element_viewportselect');

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

const createStore = (scheduler: AnimationFrameScheduler) =>
  new ViewportCameraStore({
    initialDeviceScale: createDeviceScale(1),
    initialTransform: createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
    initialViewport: createViewportSize(1, 1),
    scheduler,
  });

const mockViewportBounds = (): void => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 600,
    height: 600,
    left: 0,
    right: 800,
    top: 0,
    width: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
};

describe('viewport scene layers', () => {
  it('mounts one explicit layer stack and updates only the world transform per camera frame', () => {
    mockViewportBounds();
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    let worldRenderCount = 0;
    const WorldChild = () => {
      const renders = useRef(0);
      renders.current += 1;
      worldRenderCount = renders.current;
      return <rect data-testid="world-node" height="20" width="40" />;
    };

    const view = render(
      <ViewportScene
        camera={store}
        domChildren={<ViewportEmptyState />}
        interactionChildren={<rect data-testid="interaction-node" height="8" width="8" />}
        worldChildren={<WorldChild />}
      />,
    );

    for (const layer of Object.values(SCENE_LAYERS)) {
      expect(view.container.querySelectorAll(`[${SCENE_LAYER_ATTRIBUTE}="${layer}"]`)).toHaveLength(
        1,
      );
    }
    expect(screen.getByText('Built for quick thinking')).toBeInTheDocument();
    expect(scheduler.callbacks.size).toBe(1);
    scheduler.flushNext();

    const worldLayer = view.container.querySelector(
      `[${SCENE_LAYER_ATTRIBUTE}="${SCENE_LAYERS.world}"]`,
    );
    const root = view.container.querySelector('.editor-viewport');
    expect(worldLayer).toHaveAttribute('transform', 'matrix(1 0 0 1 0 0)');
    expect(root).toHaveAttribute('data-camera-revision', '1');
    expect(worldRenderCount).toBe(1);

    store.scheduleTransform(createViewportTransform({ panX: 120, panY: -45, zoom: 1.5 }));
    scheduler.flushNext();

    expect(worldLayer).toHaveAttribute('transform', 'matrix(1.5 0 0 1.5 120 -45)');
    expect(root).toHaveAttribute('data-camera-revision', '2');
    expect(worldRenderCount).toBe(1);
    store.dispose();
  });

  it('coalesces pointer-centered Chromium pinch wheel events without anchor drift', () => {
    mockViewportBounds();
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const view = render(<ViewportScene camera={store} />);
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    scheduler.flushNext();
    const anchor = createViewportPoint(240, 180);
    const worldBefore = viewportPointToWorld(anchor, store.getTransformSnapshot());

    fireEvent.wheel(root, {
      clientX: anchor.x,
      clientY: anchor.y,
      ctrlKey: true,
      deltaMode: 0,
      deltaY: -100,
    });
    fireEvent.wheel(root, {
      clientX: anchor.x,
      clientY: anchor.y,
      ctrlKey: true,
      deltaMode: 0,
      deltaY: -100,
    });

    expect(scheduler.callbacks.size).toBe(1);
    scheduler.flushNext();
    expect(store.getTransformSnapshot().zoom).toBeCloseTo(Math.exp(0.4), 12);
    const worldAfter = viewportPointToWorld(anchor, store.getTransformSnapshot());
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 12);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 12);
    store.dispose();
  });

  it('pans from an immutable start transform and restores it on Escape', () => {
    mockViewportBounds();
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const view = render(<ViewportScene camera={store} />);
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    scheduler.flushNext();

    fireEvent.keyDown(root, { code: 'Space' });
    expect(root).toHaveAttribute('data-pan-state', 'ready');
    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 7 });
    fireEvent.pointerMove(root, { clientX: 130, clientY: 120, pointerId: 7 });
    fireEvent.pointerMove(root, { clientX: 180, clientY: 145, pointerId: 7 });
    expect(root).toHaveAttribute('data-pan-state', 'active');
    expect(scheduler.callbacks.size).toBe(1);
    scheduler.flushNext();
    expect(store.getTransformSnapshot().pan).toMatchObject({ x: 80, y: 45 });

    fireEvent.keyDown(root, { code: 'Escape' });
    expect(store.getTransformSnapshot().pan).toMatchObject({ x: 0, y: 0 });
    expect(root).toHaveAttribute('data-pan-state', 'ready');
    fireEvent.keyUp(window, { code: 'Space' });
    expect(root).toHaveAttribute('data-pan-state', 'idle');
    store.dispose();
  });

  it('restores both transform and active fit mode when a pan is cancelled', () => {
    mockViewportBounds();
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const view = render(<ViewportScene camera={store} />);
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    scheduler.flushNext();
    store.scheduleFraming({ bounds: createWorldRect(0, 0, 1_000, 500), kind: 'fit' });
    scheduler.flushNext();
    const startTransform = store.getTransformSnapshot();
    const startFraming = store.getFramingSnapshot();

    fireEvent.keyDown(root, { code: 'Space' });
    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 17 });
    fireEvent.pointerMove(root, { clientX: 180, clientY: 145, pointerId: 17 });
    scheduler.flushNext();
    expect(store.getFramingSnapshot()).toEqual({ kind: 'manual' });

    fireEvent.keyDown(root, { code: 'Escape' });
    expect(store.getTransformSnapshot()).toBe(startTransform);
    expect(store.getFramingSnapshot()).toEqual(startFraming);
    store.dispose();
  });

  it('supports middle-button pan and synchronously includes the pointer-up position', () => {
    mockViewportBounds();
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const view = render(<ViewportScene camera={store} />);
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    scheduler.flushNext();

    fireEvent.pointerDown(root, { button: 1, clientX: 400, clientY: 300, pointerId: 9 });
    fireEvent.pointerUp(root, { button: 1, clientX: 360, clientY: 325, pointerId: 9 });

    expect(scheduler.callbacks.size).toBe(0);
    expect(store.getTransformSnapshot().pan).toMatchObject({ x: -40, y: 25 });
    expect(root).toHaveAttribute('data-pan-state', 'idle');
    store.dispose();
  });

  it('does not steal the Space key from an editable DOM overlay child', () => {
    mockViewportBounds();
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const view = render(
      <ViewportScene camera={store} domChildren={<input aria-label="Inline editor" />} />,
    );
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    const input = screen.getByLabelText('Inline editor');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    scheduler.flushNext();

    expect(fireEvent.keyDown(input, { code: 'Space' })).toBe(true);
    expect(root).toHaveAttribute('data-pan-state', 'idle');
    store.dispose();
  });

  it('routes click selection through viewport-to-world conversion and preserves pan ownership', () => {
    mockViewportBounds();
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const selection = new SelectionStore();
    const interaction = new SelectionInteraction(selection, (point) =>
      point.x >= 100 && point.x <= 200 ? SELECTABLE_ID : undefined,
    );
    const view = render(<ViewportScene camera={store} selectionInteraction={interaction} />);
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    scheduler.flushNext();
    store.scheduleTransform(createViewportTransform({ panX: 50, panY: 0, zoom: 2 }));
    scheduler.flushNext();

    fireEvent.pointerDown(root, {
      button: 0,
      clientX: 350,
      clientY: 100,
      pointerId: 21,
    });
    expect(root).toHaveAttribute('data-selection-state', 'pressed');
    expect(selection.getSnapshot().selectedIds).toEqual([]);
    fireEvent.pointerUp(root, { button: 0, clientX: 350, clientY: 100, pointerId: 21 });
    expect(root).toHaveAttribute('data-selection-state', 'idle');
    expect(selection.getSnapshot().selectedIds).toEqual([SELECTABLE_ID]);

    fireEvent.keyDown(root, { code: 'Space' });
    fireEvent.pointerDown(root, { button: 0, clientX: 350, clientY: 100, pointerId: 22 });
    expect(root).toHaveAttribute('data-pan-state', 'active');
    expect(root).toHaveAttribute('data-selection-state', 'idle');
    fireEvent.keyDown(root, { code: 'Escape' });
    expect(selection.getSnapshot().selectedIds).toEqual([SELECTABLE_ID]);
    fireEvent.keyUp(window, { code: 'Space' });

    fireEvent.pointerDown(root, { button: 0, clientX: 350, clientY: 100, pointerId: 23 });
    fireEvent.keyDown(root, { code: 'Escape' });
    expect(root).toHaveAttribute('data-selection-state', 'idle');
    expect(selection.getSnapshot().selectedIds).toEqual([SELECTABLE_ID]);
    fireEvent.keyDown(root, { code: 'Escape' });
    expect(selection.getSnapshot().selectedIds).toEqual([]);
    store.dispose();
  });

  it('cancels selection presses across pointer loss, window blur, and teardown paths', () => {
    mockViewportBounds();
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const selection = new SelectionStore();
    selection.selectOnly(SELECTABLE_ID);
    const before = selection.getSnapshot();
    const interaction = new SelectionInteraction(selection, () => undefined);
    const view = render(<ViewportScene camera={store} selectionInteraction={interaction} />);
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    scheduler.flushNext();

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 31 });
    fireEvent.pointerCancel(root, { pointerId: 31 });
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(selection.getSnapshot()).toBe(before);

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 32 });
    fireEvent.lostPointerCapture(root, { pointerId: 32 });
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(selection.getSnapshot()).toBe(before);

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 33 });
    fireEvent.blur(window);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(selection.getSnapshot()).toBe(before);

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 34 });
    view.unmount();
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(selection.getSnapshot()).toBe(before);
    store.dispose();
  });
});
