import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ViewportEmptyState, ViewportScene } from '../src/renderer/editor/ViewportScene';
import { SCENE_LAYER_ATTRIBUTE, SCENE_LAYERS } from '../src/renderer/editor/scene-layers';
import {
  ViewportCameraStore,
  type AnimationFrameScheduler,
} from '../src/renderer/editor/viewport-camera-store';
import {
  createDeviceScale,
  createViewportSize,
  createViewportTransform,
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

const createStore = (scheduler: AnimationFrameScheduler) =>
  new ViewportCameraStore({
    initialDeviceScale: createDeviceScale(1),
    initialTransform: createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
    initialViewport: createViewportSize(1, 1),
    scheduler,
  });

describe('viewport scene layers', () => {
  it('mounts one explicit layer stack and updates only the world transform per camera frame', () => {
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
});
