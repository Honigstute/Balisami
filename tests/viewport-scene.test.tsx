import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ViewportEmptyState, ViewportScene } from '../src/renderer/editor/ViewportScene';
import { SCENE_LAYER_ATTRIBUTE, SCENE_LAYERS } from '../src/renderer/editor/scene-layers';
import { KeyboardNudgeInteraction } from '../src/renderer/editor/keyboard-nudge-interaction';
import { SelectionInteraction } from '../src/renderer/editor/selection-interaction';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import {
  createTextEditViewportRoute,
  TextEditInteraction,
} from '../src/renderer/editor/text-edit-interaction';
import type { ViewportAlignmentCommand } from '../src/renderer/editor/viewport-input';
import { CONTROL_TYPES, ElementIdSchema, type SetElementFrameCommand } from '../src/domain';
import { CONTROL_DRAG_MIME_TYPE } from '../src/renderer/controls/control-drag-transfer';
import { MoveInteraction } from '../src/renderer/editor/move-interaction';
import type { MoveTargetCapture } from '../src/renderer/editor/move-geometry';
import { resolveSnap } from '../src/renderer/editor/snap-engine';
import { ResizeInteraction } from '../src/renderer/editor/resize-interaction';
import type { ResizeTargetCapture } from '../src/renderer/editor/resize-geometry';
import {
  ViewportCameraStore,
  type AnimationFrameScheduler,
} from '../src/renderer/editor/viewport-camera-store';
import {
  createDeviceScale,
  createViewportSize,
  createViewportPoint,
  createViewportTransform,
  createViewportZoom,
  createWorldRect,
  viewportPointToWorld,
} from '../src/renderer/editor/viewport-transform';

const SELECTABLE_ID = ElementIdSchema.parse('element_viewportselect');
const SECOND_SELECTABLE_ID = ElementIdSchema.parse('element_viewportsecond');

const MOVE_CAPTURE: MoveTargetCapture = Object.freeze({
  affectedIds: Object.freeze([SELECTABLE_ID]),
  targets: Object.freeze([
    Object.freeze({
      frame: Object.freeze({ x: 10, y: 20, width: 100, height: 50 }),
      id: SELECTABLE_ID,
    }),
  ]),
  worldBounds: createWorldRect(10, 20, 100, 50),
});

const RESIZE_CAPTURE: ResizeTargetCapture = Object.freeze({
  elementId: SELECTABLE_ID,
  frame: Object.freeze({ x: 10, y: 20, width: 100, height: 50 }),
  worldBounds: createWorldRect(10, 20, 100, 50),
});

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
    expect(screen.getByText('Your canvas is ready')).toBeInTheDocument();
    expect(
      screen.getByText('Choose a control from the library, or drag one directly onto the canvas.'),
    ).toBeInTheDocument();
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

  it('enters text editing from exact Enter or a transformed double-click and isolates canvas keys', () => {
    mockViewportBounds();
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const selection = new SelectionStore();
    selection.selectOnly(SELECTABLE_ID);
    const commit = vi.fn(() => true);
    const interaction = new TextEditInteraction({
      capture: (elementId) =>
        elementId === SELECTABLE_ID
          ? {
              accessibleLabel: 'Edit selected label',
              elementId,
              fontSizeWorldUnits: 16,
              mode: 'single-line',
              text: 'Before',
              worldBounds: createWorldRect(10, 20, 100, 50),
            }
          : undefined,
      commit,
    });
    const queryPointerTarget = vi.fn(() => SELECTABLE_ID);
    const route = createTextEditViewportRoute({
      interaction,
      queryPointerTarget,
      selection,
    });
    const deleteSelection = vi.fn(() => true);
    const view = render(
      <ViewportScene
        camera={store}
        onDeleteSelection={deleteSelection}
        selection={selection}
        textEdit={route}
      />,
    );
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    scheduler.flushNext();

    fireEvent.keyDown(root, { code: 'Enter', repeat: true });
    fireEvent.keyDown(root, { code: 'Enter', shiftKey: true });
    expect(interaction.getSnapshot()).toMatchObject({ kind: 'idle' });
    fireEvent.keyDown(root, { code: 'Enter' });
    expect(root).toHaveAttribute('data-selection-state', 'editingText');
    fireEvent.keyDown(root, { code: 'Delete' });
    expect(deleteSelection).not.toHaveBeenCalled();
    fireEvent.keyDown(root, { code: 'Escape' });
    expect(root).toHaveAttribute('data-selection-state', 'idle');

    store.scheduleTransform(createViewportTransform({ panX: 100, panY: 50, zoom: 2 }));
    scheduler.flushNext();
    fireEvent.doubleClick(root, { button: 0, clientX: 140, clientY: 90 });
    expect(queryPointerTarget).toHaveBeenCalledWith(expect.objectContaining({ x: 20, y: 20 }));
    expect(root).toHaveAttribute('data-selection-state', 'editingText');
    expect(commit).not.toHaveBeenCalled();
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
    const selection = new SelectionStore();
    const interaction = new SelectionInteraction(selection, {
      listSelectableIds: () => [SELECTABLE_ID],
      queryHitStack: () => [],
      querySelectionRegion: () => [],
    });
    const view = render(
      <ViewportScene
        camera={store}
        domChildren={<input aria-label="Inline editor" />}
        selectionInteraction={interaction}
      />,
    );
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    const input = screen.getByLabelText('Inline editor');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    scheduler.flushNext();

    expect(fireEvent.keyDown(input, { code: 'Space' })).toBe(true);
    expect(root).toHaveAttribute('data-pan-state', 'idle');
    expect(fireEvent.keyDown(input, { code: 'KeyA', ctrlKey: true })).toBe(true);
    expect(selection.getSnapshot().selectedIds).toEqual([]);
    store.dispose();
  });

  it('routes click selection through viewport-to-world conversion and preserves pan ownership', () => {
    mockViewportBounds();
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const selection = new SelectionStore();
    const interaction = new SelectionInteraction(selection, {
      listSelectableIds: () => [SELECTABLE_ID],
      queryHitStack: (point) => (point.x >= 100 && point.x <= 200 ? [SELECTABLE_ID] : []),
      querySelectionRegion: () => [],
    });
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

    fireEvent.keyDown(root, { code: 'KeyA', ctrlKey: true });
    expect(selection.getSnapshot().selectedIds).toEqual([SELECTABLE_ID]);
    expect(root).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(root, { code: 'Space' });
    fireEvent.pointerDown(root, { button: 0, clientX: 350, clientY: 100, pointerId: 22 });
    expect(root).toHaveAttribute('data-pan-state', 'active');
    expect(root).toHaveAttribute('data-selection-state', 'idle');
    fireEvent.keyDown(root, { code: 'Escape' });
    expect(selection.getSnapshot().selectedIds).toEqual([SELECTABLE_ID]);
    fireEvent.keyUp(window, { code: 'Space' });

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 24 });
    fireEvent.pointerMove(root, { clientX: 160, clientY: 140, pointerId: 24 });
    expect(root).toHaveAttribute('data-selection-state', 'marquee');
    const transformBeforeWheel = store.getTransformSnapshot();
    fireEvent.wheel(root, { clientX: 160, clientY: 140, deltaMode: 0, deltaY: 100 });
    expect(store.getTransformSnapshot()).toBe(transformBeforeWheel);
    fireEvent.keyDown(root, { code: 'Escape' });
    expect(root).toHaveAttribute('data-selection-state', 'idle');
    expect(selection.getSnapshot().selectedIds).toEqual([SELECTABLE_ID]);

    fireEvent.pointerDown(root, { button: 0, clientX: 350, clientY: 100, pointerId: 23 });
    fireEvent.keyDown(root, { code: 'Escape' });
    expect(root).toHaveAttribute('data-selection-state', 'idle');
    expect(selection.getSnapshot().selectedIds).toEqual([SELECTABLE_ID]);
    fireEvent.keyDown(root, { code: 'Escape' });
    expect(selection.getSnapshot().selectedIds).toEqual([]);
    fireEvent.keyDown(root, { code: 'KeyA', ctrlKey: true, metaKey: true });
    expect(selection.getSnapshot().selectedIds).toEqual([]);
    fireEvent.keyDown(root, { code: 'KeyA', metaKey: true });
    expect(selection.getSnapshot().selectedIds).toEqual([SELECTABLE_ID]);
    store.dispose();
  });

  it('click-selects and fast-drags an accessible SVG Button through its exact release point', () => {
    mockViewportBounds();
    const cameraScheduler = new TestAnimationFrameScheduler();
    const moveScheduler = new TestAnimationFrameScheduler();
    const store = createStore(cameraScheduler);
    const commits: (readonly SetElementFrameCommand[])[] = [];
    const move = new MoveInteraction(
      {
        capture: () => MOVE_CAPTURE,
        commit: (commands) => {
          commits.push(commands);
          return true;
        },
      },
      moveScheduler,
    );
    const selection = new SelectionStore();
    const interaction = new SelectionInteraction(
      selection,
      {
        listSelectableIds: () => [SELECTABLE_ID],
        queryHitStack: () => [SELECTABLE_ID],
        querySelectionRegion: () => [],
      },
      move,
    );
    render(
      <ViewportScene
        camera={store}
        selectionInteraction={interaction}
        worldChildren={<g data-testid="scene-button" role="button" />}
      />,
    );
    const sceneButton = screen.getByTestId('scene-button');
    cameraScheduler.flushNext();

    fireEvent.pointerDown(sceneButton, { button: 0, clientX: 100, clientY: 100, pointerId: 71 });
    fireEvent.pointerUp(sceneButton, { button: 0, clientX: 145, clientY: 125, pointerId: 71 });

    expect(selection.getSnapshot().selectedIds).toEqual([SELECTABLE_ID]);
    expect(commits).toEqual([
      [
        {
          elementId: SELECTABLE_ID,
          frame: { height: 50, width: 100, x: 55, y: 45 },
          type: 'element.set-frame',
        },
      ],
    ]);
    expect(moveScheduler.callbacks.size).toBe(0);
    store.dispose();
  });

  it('commits the exact window release when the browser refuses pointer capture', () => {
    mockViewportBounds();
    const cameraScheduler = new TestAnimationFrameScheduler();
    const moveScheduler = new TestAnimationFrameScheduler();
    const store = createStore(cameraScheduler);
    const commits: (readonly SetElementFrameCommand[])[] = [];
    const move = new MoveInteraction(
      {
        capture: () => MOVE_CAPTURE,
        commit: (commands) => {
          commits.push(commands);
          return true;
        },
      },
      moveScheduler,
    );
    const interaction = new SelectionInteraction(
      new SelectionStore(),
      {
        listSelectableIds: () => [SELECTABLE_ID],
        queryHitStack: () => [SELECTABLE_ID],
        querySelectionRegion: () => [],
      },
      move,
    );
    const view = render(<ViewportScene camera={store} selectionInteraction={interaction} />);
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    root.setPointerCapture = vi.fn(() => {
      throw new DOMException('Synthetic native capture refusal.');
    });
    root.hasPointerCapture = vi.fn(() => false);
    cameraScheduler.flushNext();

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 72 });
    fireEvent.pointerMove(window, {
      buttons: 1,
      clientX: 140,
      clientY: 125,
      pointerId: 72,
    });
    fireEvent.pointerUp(window, { buttons: 0, clientX: 165, clientY: 145, pointerId: 72 });

    expect(commits).toEqual([
      [
        {
          elementId: SELECTABLE_ID,
          frame: { height: 50, width: 100, x: 75, y: 65 },
          type: 'element.set-frame',
        },
      ],
    ]);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(moveScheduler.callbacks.size).toBe(0);
    store.dispose();
  });

  it('treats button-up capture loss as completion but active-button capture loss as cancellation', () => {
    mockViewportBounds();
    const cameraScheduler = new TestAnimationFrameScheduler();
    const moveScheduler = new TestAnimationFrameScheduler();
    const store = createStore(cameraScheduler);
    const commits: (readonly SetElementFrameCommand[])[] = [];
    const move = new MoveInteraction(
      {
        capture: () => MOVE_CAPTURE,
        commit: (commands) => {
          commits.push(commands);
          return true;
        },
      },
      moveScheduler,
    );
    const interaction = new SelectionInteraction(
      new SelectionStore(),
      {
        listSelectableIds: () => [SELECTABLE_ID],
        queryHitStack: () => [SELECTABLE_ID],
        querySelectionRegion: () => [],
      },
      move,
    );
    const view = render(<ViewportScene camera={store} selectionInteraction={interaction} />);
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    cameraScheduler.flushNext();

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 73 });
    fireEvent.pointerMove(root, {
      buttons: 1,
      clientX: 130,
      clientY: 120,
      pointerId: 73,
    });
    fireEvent.lostPointerCapture(root, {
      buttons: 0,
      clientX: 155,
      clientY: 135,
      pointerId: 73,
    });
    expect(commits).toHaveLength(1);
    expect(commits[0]?.[0]).toMatchObject({ frame: { x: 65, y: 55 } });

    fireEvent.pointerDown(root, { button: 0, clientX: 155, clientY: 135, pointerId: 74 });
    fireEvent.pointerMove(root, {
      buttons: 1,
      clientX: 190,
      clientY: 165,
      pointerId: 74,
    });
    fireEvent.lostPointerCapture(root, {
      buttons: 1,
      clientX: 190,
      clientY: 165,
      pointerId: 74,
    });
    expect(commits).toHaveLength(1);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(move.getSnapshot()).toEqual({ kind: 'idle' });
    store.dispose();
  });

  it('drops a typed shelf control at the canonical transformed world point', () => {
    mockViewportBounds();
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const onInsertControlAt = vi.fn(() => true);
    const view = render(<ViewportScene camera={store} onInsertControlAt={onInsertControlAt} />);
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    scheduler.flushNext();
    store.scheduleTransform(createViewportTransform({ panX: 50, panY: 0, zoom: 2 }));
    scheduler.flushNext();
    const dataTransfer = {
      dropEffect: 'none',
      getData: (type: string) => (type === CONTROL_DRAG_MIME_TYPE ? CONTROL_TYPES.button : ''),
      types: [CONTROL_DRAG_MIME_TYPE],
    } as unknown as DataTransfer;

    expect(fireEvent.dragOver(root, { dataTransfer })).toBe(false);
    expect(dataTransfer.dropEffect).toBe('copy');
    const dropEvent = createEvent.drop(root, { dataTransfer });
    Object.defineProperties(dropEvent, {
      clientX: { value: 250 },
      clientY: { value: 100 },
    });
    expect(fireEvent(root, dropEvent)).toBe(false);
    expect(onInsertControlAt).toHaveBeenCalledWith(
      CONTROL_TYPES.button,
      expect.objectContaining({ x: 100, y: 50 }),
    );
    store.dispose();
  });

  it('cancels selection presses across pointer loss, window blur, and teardown paths', () => {
    mockViewportBounds();
    const scheduler = new TestAnimationFrameScheduler();
    const store = createStore(scheduler);
    const selection = new SelectionStore();
    selection.selectOnly(SELECTABLE_ID);
    const before = selection.getSnapshot();
    const interaction = new SelectionInteraction(selection, {
      listSelectableIds: () => [SELECTABLE_ID],
      queryHitStack: () => [],
      querySelectionRegion: () => [],
    });
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
    fireEvent.lostPointerCapture(root, { buttons: 1, pointerId: 32 });
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(selection.getSnapshot()).toBe(before);

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 33 });
    fireEvent.blur(window);
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(selection.getSnapshot()).toBe(before);

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 34 });
    fireEvent.pointerMove(root, { clientX: 140, clientY: 140, pointerId: 34 });
    expect(interaction.getSnapshot()).toMatchObject({ kind: 'marquee' });
    interaction.cancelPress(34);
    expect(root).toHaveAttribute('data-selection-state', 'idle');
    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 35 });
    fireEvent.pointerMove(root, { clientX: 140, clientY: 140, pointerId: 35 });
    view.unmount();
    expect(interaction.getSnapshot()).toEqual({ kind: 'idle' });
    expect(selection.getSnapshot()).toBe(before);
    store.dispose();
  });

  it('routes move modifiers and every cancellation path through the same pointer owner', () => {
    mockViewportBounds();
    const cameraScheduler = new TestAnimationFrameScheduler();
    const moveScheduler = new TestAnimationFrameScheduler();
    const store = createStore(cameraScheduler);
    const commits: (readonly SetElementFrameCommand[])[] = [];
    const snapBypassRequests: boolean[] = [];
    const move = new MoveInteraction(
      {
        capture: () => MOVE_CAPTURE,
        commit: (commands) => {
          commits.push(commands);
          return true;
        },
        resolveSnap: (request) => {
          snapBypassRequests.push(request.snapBypassed);
          return resolveSnap({
            activeAxes: request.activeAxes,
            bypass: request.snapBypassed,
            candidates: [],
            movingBounds: request.capture.worldBounds,
            previousLocks: request.previousLocks,
            rawDelta: request.rawDelta,
            zoom: createViewportZoom(1),
          });
        },
      },
      moveScheduler,
    );
    const selection = new SelectionStore();
    selection.selectOnly(SELECTABLE_ID);
    const interaction = new SelectionInteraction(
      selection,
      {
        listSelectableIds: () => [SELECTABLE_ID],
        queryHitStack: () => [SELECTABLE_ID],
        querySelectionRegion: () => [],
      },
      move,
    );
    const view = render(
      <ViewportScene camera={store} selectionInteraction={interaction} shortcutPlatform="win32" />,
    );
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    cameraScheduler.flushNext();

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 41 });
    fireEvent.pointerMove(root, { clientX: 140, clientY: 115, pointerId: 41 });
    expect(snapBypassRequests.at(-1)).toBe(false);
    expect(root).toHaveAttribute('data-selection-state', 'moving');
    expect(move.getSnapshot()).toMatchObject({ delta: { x: 40, y: 15 }, kind: 'moving' });
    const transformBeforeWheel = store.getTransformSnapshot();
    fireEvent.wheel(root, { clientX: 140, clientY: 115, deltaMode: 0, deltaY: 100 });
    expect(store.getTransformSnapshot()).toBe(transformBeforeWheel);
    fireEvent.keyDown(root, { code: 'Escape' });
    expect(root).toHaveAttribute('data-selection-state', 'idle');
    expect(move.getSnapshot()).toEqual({ kind: 'idle' });
    expect(commits).toHaveLength(0);

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 42 });
    fireEvent.pointerMove(root, { clientX: 130, clientY: 170, pointerId: 42, shiftKey: true });
    expect(move.getSnapshot()).toMatchObject({ delta: { x: 0, y: 70 }, kind: 'moving' });
    fireEvent.lostPointerCapture(root, { buttons: 1, pointerId: 42 });
    expect(root).toHaveAttribute('data-selection-state', 'idle');
    expect(move.getSnapshot()).toEqual({ kind: 'idle' });
    expect(commits).toHaveLength(0);

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 43 });
    fireEvent.pointerMove(root, {
      clientX: 130,
      clientY: 170,
      ctrlKey: true,
      pointerId: 43,
      shiftKey: true,
    });
    fireEvent.pointerUp(root, {
      clientX: 130,
      clientY: 170,
      ctrlKey: true,
      pointerId: 43,
      shiftKey: true,
    });
    expect(snapBypassRequests.at(-1)).toBe(true);
    expect(root).toHaveAttribute('data-selection-state', 'idle');
    expect(commits).toEqual([
      [
        {
          type: 'element.set-frame',
          elementId: SELECTABLE_ID,
          frame: { x: 10, y: 90, width: 100, height: 50 },
        },
      ],
    ]);
    expect(selection.getSnapshot().selectedIds).toEqual([SELECTABLE_ID]);
    expect(moveScheduler.callbacks.size).toBe(0);
    store.dispose();
  });

  it('routes resize hover, modifiers, completion, and every cancellation through one owner', () => {
    mockViewportBounds();
    const cameraScheduler = new TestAnimationFrameScheduler();
    const resizeScheduler = new TestAnimationFrameScheduler();
    const store = createStore(cameraScheduler);
    const commits: SetElementFrameCommand[] = [];
    const resizeSnapBypassRequests: boolean[] = [];
    const resize = new ResizeInteraction(
      {
        capture: () => RESIZE_CAPTURE,
        commit: (command) => {
          commits.push(command);
          return true;
        },
        resolveSnap: (request) => {
          resizeSnapBypassRequests.push(request.snapBypassed);
          return {
            ...request.raw,
            guides: [],
            locks: {},
          };
        },
      },
      resizeScheduler,
    );
    const selection = new SelectionStore();
    selection.selectOnly(SELECTABLE_ID);
    const interaction = new SelectionInteraction(
      selection,
      {
        listSelectableIds: () => [SELECTABLE_ID],
        queryHitStack: () => [SELECTABLE_ID],
        queryResizeHandle: (_elementId, point) =>
          point.x >= 90 && point.y >= 90 ? 'southEast' : undefined,
        querySelectionRegion: () => [],
      },
      undefined,
      resize,
    );
    const view = render(
      <ViewportScene camera={store} selectionInteraction={interaction} shortcutPlatform="win32" />,
    );
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    cameraScheduler.flushNext();
    store.scheduleDeviceScale(createDeviceScale(2));
    cameraScheduler.flushNext();

    fireEvent.pointerMove(root, { clientX: 100, clientY: 100, pointerId: 50 });
    expect(root).toHaveAttribute('data-resize-handle', 'southEast');
    fireEvent.pointerLeave(root);
    expect(root).not.toHaveAttribute('data-resize-handle');

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 51 });
    expect(root).toHaveAttribute('data-selection-state', 'resizing');
    expect(root).toHaveAttribute('data-resize-handle', 'southEast');
    fireEvent.pointerMove(root, { clientX: 140, clientY: 115, pointerId: 51 });
    expect(resizeSnapBypassRequests.at(-1)).toBe(false);
    expect(resizeScheduler.callbacks.size).toBe(1);
    resizeScheduler.flushNext();
    expect(resize.getSnapshot()).toMatchObject({
      frame: { x: 10, y: 20, width: 140, height: 65 },
      kind: 'resizing',
    });
    const transformBeforeWheel = store.getTransformSnapshot();
    fireEvent.wheel(root, { clientX: 140, clientY: 115, deltaMode: 0, deltaY: 100 });
    expect(store.getTransformSnapshot()).toBe(transformBeforeWheel);
    fireEvent.keyDown(root, { code: 'Escape' });
    expect(resize.getSnapshot()).toEqual({ kind: 'idle' });
    expect(commits).toHaveLength(0);

    fireEvent.pointerDown(root, {
      button: 0,
      clientX: 100,
      clientY: 100,
      ctrlKey: true,
      pointerId: 52,
    });
    fireEvent.pointerMove(root, {
      clientX: 130,
      clientY: 110,
      ctrlKey: true,
      pointerId: 52,
    });
    expect(resizeSnapBypassRequests.at(-1)).toBe(true);
    fireEvent.pointerCancel(root, { pointerId: 52 });
    expect(resize.getSnapshot()).toEqual({ kind: 'idle' });

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 53 });
    fireEvent.pointerMove(root, { clientX: 130, clientY: 110, pointerId: 53 });
    fireEvent.lostPointerCapture(root, { buttons: 1, pointerId: 53 });
    expect(resize.getSnapshot()).toEqual({ kind: 'idle' });

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 54 });
    fireEvent.pointerMove(root, { clientX: 130, clientY: 110, pointerId: 54 });
    fireEvent.blur(window);
    expect(resize.getSnapshot()).toEqual({ kind: 'idle' });

    fireEvent.pointerDown(root, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 55,
      shiftKey: true,
    });
    fireEvent.pointerUp(root, {
      clientX: 150,
      clientY: 125,
      pointerId: 55,
      shiftKey: true,
    });
    expect(commits).toEqual([
      {
        type: 'element.set-frame',
        elementId: SELECTABLE_ID,
        frame: { x: 10, y: 20, width: 150, height: 75 },
      },
    ]);
    expect(selection.getSnapshot().selectedIds).toEqual([SELECTABLE_ID]);

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 56 });
    fireEvent.pointerMove(root, { clientX: 130, clientY: 110, pointerId: 56 });
    view.unmount();
    expect(resize.getSnapshot()).toEqual({ kind: 'idle' });
    expect(commits).toHaveLength(1);
    expect(resizeScheduler.callbacks.size).toBe(0);
    store.dispose();
  });

  it('owns held-arrow nudge lifecycle without stealing editable or modified key input', () => {
    mockViewportBounds();
    const cameraScheduler = new TestAnimationFrameScheduler();
    const nudgeScheduler = new TestAnimationFrameScheduler();
    const store = createStore(cameraScheduler);
    const commits: (readonly SetElementFrameCommand[])[] = [];
    const nudge = new KeyboardNudgeInteraction(
      {
        capture: () => MOVE_CAPTURE,
        commit: (commands) => {
          commits.push(commands);
          return true;
        },
      },
      nudgeScheduler,
    );
    const selection = new SelectionStore();
    selection.selectOnly(SELECTABLE_ID);
    const interaction = new SelectionInteraction(selection, {
      listSelectableIds: () => [SELECTABLE_ID, SECOND_SELECTABLE_ID],
      queryHitStack: () => [SELECTABLE_ID],
      querySelectionRegion: () => [],
    });
    const view = render(
      <ViewportScene
        camera={store}
        domChildren={<input aria-label="Nudge-safe inline editor" />}
        keyboardNudgeInteraction={nudge}
        selection={selection}
        selectionInteraction={interaction}
      />,
    );
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    const input = screen.getByLabelText('Nudge-safe inline editor');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    cameraScheduler.flushNext();
    store.scheduleTransform(createViewportTransform({ panX: 70, panY: -35, zoom: 4 }));
    store.scheduleDeviceScale(createDeviceScale(2));
    cameraScheduler.flushNext();

    expect(fireEvent.keyDown(input, { code: 'ArrowRight' })).toBe(true);
    expect(nudge.getSnapshot()).toEqual({ kind: 'idle' });
    expect(fireEvent.keyDown(root, { code: 'ArrowRight', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(root, { altKey: true, code: 'ArrowRight' })).toBe(true);
    expect(fireEvent.keyDown(root, { code: 'ArrowRight', metaKey: true })).toBe(true);
    expect(nudge.getSnapshot()).toEqual({ kind: 'idle' });

    expect(fireEvent.keyDown(root, { code: 'ArrowRight' })).toBe(false);
    expect(root).toHaveAttribute('data-selection-state', 'nudging');
    expect(nudge.getSnapshot()).toMatchObject({ delta: { x: 1, y: 0 }, kind: 'nudging' });
    expect(fireEvent.keyDown(root, { code: 'ArrowRight', repeat: true, shiftKey: true })).toBe(
      false,
    );
    expect(fireEvent.keyDown(root, { code: 'ArrowDown' })).toBe(false);
    expect(nudgeScheduler.callbacks.size).toBe(1);
    const transformBeforeWheel = store.getTransformSnapshot();
    fireEvent.wheel(root, { deltaMode: 0, deltaY: 100 });
    expect(store.getTransformSnapshot()).toBe(transformBeforeWheel);

    expect(fireEvent.keyUp(window, { code: 'ArrowRight' })).toBe(false);
    expect(root).toHaveAttribute('data-selection-state', 'nudging');
    expect(commits).toHaveLength(0);
    expect(fireEvent.keyUp(window, { code: 'ArrowDown' })).toBe(false);
    expect(root).toHaveAttribute('data-selection-state', 'idle');
    expect(commits).toEqual([
      [
        {
          type: 'element.set-frame',
          elementId: SELECTABLE_ID,
          frame: { x: 21, y: 21, width: 100, height: 50 },
        },
      ],
    ]);
    expect(nudgeScheduler.callbacks.size).toBe(0);

    fireEvent.keyDown(root, { code: 'ArrowLeft' });
    selection.selectOnly(SECOND_SELECTABLE_ID);
    expect(nudge.getSnapshot()).toEqual({ kind: 'idle' });
    expect(commits).toHaveLength(1);

    selection.selectOnly(SELECTABLE_ID);
    fireEvent.keyDown(root, { code: 'ArrowUp' });
    fireEvent.blur(window);
    expect(nudge.getSnapshot()).toEqual({ kind: 'idle' });
    expect(commits).toHaveLength(1);

    fireEvent.keyDown(root, { code: 'ArrowDown' });
    fireEvent.keyDown(root, { code: 'Escape' });
    expect(nudge.getSnapshot()).toEqual({ kind: 'idle' });
    expect(commits).toHaveLength(1);

    fireEvent.keyDown(root, { code: 'ArrowDown' });
    view.unmount();
    expect(nudge.getSnapshot()).toEqual({ kind: 'idle' });
    expect(nudgeScheduler.callbacks.size).toBe(0);
    expect(commits).toHaveLength(1);
    store.dispose();
  });

  it('routes one exact Delete or Backspace keydown only while the viewport is idle', () => {
    mockViewportBounds();
    const cameraScheduler = new TestAnimationFrameScheduler();
    const nudgeScheduler = new TestAnimationFrameScheduler();
    const store = createStore(cameraScheduler);
    const deleteSelection = vi.fn(() => true);
    const nudge = new KeyboardNudgeInteraction(
      { capture: () => MOVE_CAPTURE, commit: () => true },
      nudgeScheduler,
    );
    const selection = new SelectionStore();
    selection.selectOnly(SELECTABLE_ID);
    const interaction = new SelectionInteraction(selection, {
      listSelectableIds: () => [SELECTABLE_ID],
      queryHitStack: () => [SELECTABLE_ID],
      querySelectionRegion: () => [],
    });
    const view = render(
      <ViewportScene
        camera={store}
        domChildren={<input aria-label="Delete-safe inline editor" />}
        keyboardNudgeInteraction={nudge}
        onDeleteSelection={deleteSelection}
        selection={selection}
        selectionInteraction={interaction}
      />,
    );
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    const input = screen.getByLabelText('Delete-safe inline editor');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    cameraScheduler.flushNext();

    expect(fireEvent.keyDown(input, { code: 'Delete' })).toBe(true);
    expect(fireEvent.keyDown(root, { code: 'Delete', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(root, { code: 'Delete', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(root, { altKey: true, code: 'Backspace' })).toBe(true);
    expect(fireEvent.keyDown(root, { code: 'Backspace', shiftKey: true })).toBe(true);
    expect(deleteSelection).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(root, { code: 'Delete', repeat: true })).toBe(false);
    expect(deleteSelection).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(root, { code: 'Backspace' })).toBe(false);
    expect(deleteSelection).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 70 });
    expect(root).toHaveAttribute('data-selection-state', 'pressed');
    expect(fireEvent.keyDown(root, { code: 'Delete' })).toBe(true);
    expect(deleteSelection).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(root, { code: 'Escape' });

    fireEvent.keyDown(root, { code: 'Space' });
    expect(fireEvent.keyDown(root, { code: 'Delete' })).toBe(true);
    expect(deleteSelection).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(window, { code: 'Space' });

    fireEvent.keyDown(root, { code: 'ArrowRight' });
    expect(root).toHaveAttribute('data-selection-state', 'nudging');
    expect(fireEvent.keyDown(root, { code: 'Backspace' })).toBe(true);
    expect(deleteSelection).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(root, { code: 'Escape' });

    expect(fireEvent.keyDown(root, { code: 'Delete' })).toBe(false);
    expect(deleteSelection).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(nudgeScheduler.callbacks.size).toBe(0);
    store.dispose();
  });

  it('routes edit and grouping shortcuts through the exact platform modifier only while idle', () => {
    mockViewportBounds();
    const cameraScheduler = new TestAnimationFrameScheduler();
    const nudgeScheduler = new TestAnimationFrameScheduler();
    const store = createStore(cameraScheduler);
    const alignSelection = vi.fn<(action: ViewportAlignmentCommand) => boolean>(() => true);
    const copySelection = vi.fn(() => true);
    const bringSelectionForward = vi.fn(() => true);
    const bringSelectionToFront = vi.fn(() => true);
    const cutSelection = vi.fn(() => true);
    const duplicateSelection = vi.fn(() => true);
    const groupSelection = vi.fn(() => true);
    const lockSelection = vi.fn(() => true);
    const pasteSelection = vi.fn(() => true);
    const sendSelectionBackward = vi.fn(() => true);
    const sendSelectionToBack = vi.fn(() => true);
    const ungroupSelection = vi.fn(() => true);
    const unlockAll = vi.fn(() => true);
    const nudge = new KeyboardNudgeInteraction(
      { capture: () => MOVE_CAPTURE, commit: () => true },
      nudgeScheduler,
    );
    const selection = new SelectionStore();
    selection.selectOnly(SELECTABLE_ID);
    const interaction = new SelectionInteraction(selection, {
      listSelectableIds: () => [SELECTABLE_ID],
      queryHitStack: () => [SELECTABLE_ID],
      querySelectionRegion: () => [],
    });
    const renderScene = (shortcutPlatform: 'darwin' | 'win32') => (
      <ViewportScene
        camera={store}
        domChildren={<input aria-label="Duplicate-safe inline editor" />}
        keyboardNudgeInteraction={nudge}
        onAlignSelection={alignSelection}
        onBringSelectionForward={bringSelectionForward}
        onBringSelectionToFront={bringSelectionToFront}
        onCopySelection={copySelection}
        onCutSelection={cutSelection}
        onDuplicateSelection={duplicateSelection}
        onGroupSelection={groupSelection}
        onLockSelection={lockSelection}
        onPasteSelection={pasteSelection}
        onSendSelectionBackward={sendSelectionBackward}
        onSendSelectionToBack={sendSelectionToBack}
        onUngroupSelection={ungroupSelection}
        onUnlockAll={unlockAll}
        selection={selection}
        selectionInteraction={interaction}
        shortcutPlatform={shortcutPlatform}
      />
    );
    const view = render(renderScene('darwin'));
    const root = view.container.querySelector<HTMLElement>('.editor-viewport');
    const input = screen.getByLabelText('Duplicate-safe inline editor');
    if (root === null) {
      throw new Error('Viewport root did not mount.');
    }
    cameraScheduler.flushNext();

    expect(fireEvent.keyDown(input, { code: 'KeyD', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(input, { code: 'KeyC', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(input, { altKey: true, code: 'Digit1', metaKey: true })).toBe(true);
    expect(alignSelection).not.toHaveBeenCalled();
    expect(copySelection).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(root, { code: 'KeyD', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(root, { altKey: true, code: 'KeyD', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(root, { code: 'KeyD', metaKey: true, shiftKey: true })).toBe(true);
    expect(duplicateSelection).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(root, { code: 'KeyD', metaKey: true, repeat: true })).toBe(false);
    expect(duplicateSelection).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(root, { code: 'KeyD', metaKey: true })).toBe(false);
    expect(duplicateSelection).toHaveBeenCalledTimes(1);
    expect(fireEvent.keyDown(root, { code: 'KeyC', metaKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { code: 'KeyX', metaKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { code: 'KeyV', metaKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { code: 'KeyG', metaKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { code: 'KeyG', metaKey: true, shiftKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { code: 'ArrowUp', metaKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { code: 'ArrowUp', metaKey: true, shiftKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { code: 'ArrowDown', metaKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { code: 'ArrowDown', metaKey: true, shiftKey: true })).toBe(
      false,
    );
    expect(fireEvent.keyDown(root, { code: 'Digit2', metaKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { code: 'Digit3', metaKey: true })).toBe(false);
    for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']) {
      expect(fireEvent.keyDown(root, { altKey: true, code, metaKey: true })).toBe(false);
    }
    expect(copySelection).toHaveBeenCalledTimes(1);
    expect(cutSelection).toHaveBeenCalledTimes(1);
    expect(pasteSelection).toHaveBeenCalledTimes(1);
    expect(groupSelection).toHaveBeenCalledTimes(1);
    expect(ungroupSelection).toHaveBeenCalledTimes(1);
    expect(bringSelectionForward).toHaveBeenCalledTimes(1);
    expect(bringSelectionToFront).toHaveBeenCalledTimes(1);
    expect(sendSelectionBackward).toHaveBeenCalledTimes(1);
    expect(sendSelectionToBack).toHaveBeenCalledTimes(1);
    expect(lockSelection).toHaveBeenCalledTimes(1);
    expect(unlockAll).toHaveBeenCalledTimes(1);
    expect(alignSelection.mock.calls.map(([action]) => action)).toEqual([
      'align-left',
      'align-center',
      'align-right',
      'align-top',
      'align-middle',
      'align-bottom',
    ]);
    expect(fireEvent.keyDown(root, { code: 'KeyG', metaKey: true, repeat: true })).toBe(false);
    expect(groupSelection).toHaveBeenCalledTimes(1);
    expect(fireEvent.keyDown(root, { code: 'KeyC', metaKey: true, repeat: true })).toBe(false);
    expect(copySelection).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(root, { button: 0, clientX: 100, clientY: 100, pointerId: 71 });
    expect(root).toHaveAttribute('data-selection-state', 'pressed');
    expect(fireEvent.keyDown(root, { code: 'KeyD', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(root, { code: 'KeyG', metaKey: true })).toBe(true);
    expect(duplicateSelection).toHaveBeenCalledTimes(1);
    expect(groupSelection).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(root, { code: 'Escape' });

    fireEvent.keyDown(root, { code: 'Space' });
    expect(fireEvent.keyDown(root, { code: 'KeyD', metaKey: true })).toBe(true);
    expect(duplicateSelection).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(window, { code: 'Space' });

    fireEvent.keyDown(root, { code: 'ArrowRight' });
    expect(root).toHaveAttribute('data-selection-state', 'nudging');
    expect(fireEvent.keyDown(root, { code: 'KeyD', metaKey: true })).toBe(true);
    expect(duplicateSelection).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(root, { code: 'Escape' });

    view.rerender(renderScene('win32'));
    expect(fireEvent.keyDown(root, { code: 'KeyD', metaKey: true })).toBe(true);
    expect(duplicateSelection).toHaveBeenCalledTimes(1);
    expect(fireEvent.keyDown(root, { code: 'KeyD', ctrlKey: true })).toBe(false);
    expect(duplicateSelection).toHaveBeenCalledTimes(2);
    expect(fireEvent.keyDown(root, { code: 'KeyV', ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { code: 'KeyG', ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { code: 'KeyG', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { code: 'ArrowUp', ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { code: 'ArrowDown', ctrlKey: true, shiftKey: true })).toBe(
      false,
    );
    expect(fireEvent.keyDown(root, { code: 'Digit2', ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { code: 'Digit3', ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(root, { altKey: true, code: 'Digit1', ctrlKey: true })).toBe(false);
    expect(pasteSelection).toHaveBeenCalledTimes(2);
    expect(groupSelection).toHaveBeenCalledTimes(2);
    expect(ungroupSelection).toHaveBeenCalledTimes(2);
    expect(bringSelectionForward).toHaveBeenCalledTimes(2);
    expect(sendSelectionToBack).toHaveBeenCalledTimes(2);
    expect(lockSelection).toHaveBeenCalledTimes(2);
    expect(unlockAll).toHaveBeenCalledTimes(2);
    expect(alignSelection).toHaveBeenLastCalledWith('align-left');

    view.unmount();
    expect(nudgeScheduler.callbacks.size).toBe(0);
    store.dispose();
  });
});
