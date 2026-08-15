import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ElementIdSchema } from '../src/domain';
import { MoveInteraction } from '../src/renderer/editor/move-interaction';
import type { MoveTargetCapture } from '../src/renderer/editor/move-geometry';
import { createBoundsSnapCandidates, resolveSnap } from '../src/renderer/editor/snap-engine';
import { SnapGuideOverlay } from '../src/renderer/editor/SnapGuideOverlay';
import {
  ViewportCameraStore,
  type AnimationFrameScheduler,
} from '../src/renderer/editor/viewport-camera-store';
import {
  createDeviceScale,
  createViewportSize,
  createViewportTransform,
  createWorldPoint,
  createWorldRect,
} from '../src/renderer/editor/viewport-transform';

const MOVING_ID = ElementIdSchema.parse('element_guidemoving');
const CAPTURE: MoveTargetCapture = Object.freeze({
  affectedIds: Object.freeze([MOVING_ID]),
  targets: Object.freeze([
    Object.freeze({
      frame: Object.freeze({ x: 10, y: 20, width: 100, height: 50 }),
      id: MOVING_ID,
    }),
  ]),
  worldBounds: createWorldRect(10, 20, 100, 50),
});

class TestScheduler implements AnimationFrameScheduler {
  readonly callbacks = new Map<number, (timestamp: number) => void>();
  #nextId = 1;

  cancel = (requestId: number): void => {
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
      throw new Error('No animation frame is pending.');
    }
    this.callbacks.delete(entry[0]);
    entry[1](16.67);
  }
}

describe('snap guide overlay', () => {
  it('projects immutable world guides into fixed-screen lines and hides them on bypass', () => {
    const scheduler = new TestScheduler();
    const camera = new ViewportCameraStore({
      initialDeviceScale: createDeviceScale(1),
      initialTransform: createViewportTransform({ panX: 10, panY: -5, zoom: 2 }),
      initialViewport: createViewportSize(800, 600),
      scheduler,
    });
    const move = new MoveInteraction(
      {
        capture: () => CAPTURE,
        commit: () => true,
        resolveSnap: (request) =>
          resolveSnap({
            activeAxes: request.activeAxes,
            bypass: request.snapBypassed,
            candidates: createBoundsSnapCandidates({
              bounds: createWorldRect(200, 200, 100, 100),
              kind: 'object',
              sourceId: 'element_guide_target',
              sourceOrder: 0,
            }),
            movingBounds: request.capture.worldBounds,
            previousLocks: request.previousLocks,
            rawDelta: request.rawDelta,
            zoom: camera.getTransformSnapshot().zoom,
          }),
      },
      scheduler,
    );
    const view = render(
      <svg>
        <SnapGuideOverlay camera={camera} moveInteraction={move} />
      </svg>,
    );
    const group = view.container.querySelector<SVGGElement>('[data-snap-guide-overlay]');
    const xLine = group?.querySelector<SVGLineElement>('[data-guide-axis="x"]');
    if (group === null || xLine === null || xLine === undefined) {
      throw new Error('Snap guide overlay did not mount.');
    }
    expect(group).toHaveAttribute('display', 'none');

    move.begin({
      pointerId: 1,
      snapBypassed: false,
      shiftKey: false,
      startWorldPoint: createWorldPoint(0, 0),
      targetIds: [MOVING_ID],
      worldPoint: createWorldPoint(88, 180),
    });
    expect(group).not.toHaveAttribute('display');
    expect(group).toHaveAttribute('data-guide-count', '2');
    expect(xLine).toHaveAttribute('x1', '410');
    expect(xLine).toHaveAttribute('x2', '410');
    expect(xLine).toHaveAttribute('data-guide-source', 'element_guide_target');

    camera.scheduleTransform(createViewportTransform({ panX: 0, panY: 0, zoom: 1 }));
    scheduler.flushNext();
    expect(xLine).toHaveAttribute('x1', '200');

    move.update({
      pointerId: 1,
      snapBypassed: true,
      shiftKey: false,
      worldPoint: createWorldPoint(88, 180),
    });
    move.flushPending();
    expect(group).toHaveAttribute('display', 'none');
    expect(group).toHaveAttribute('data-guide-count', '0');
    camera.dispose();
  });
});
