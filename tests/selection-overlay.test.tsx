import { render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { parseProjectDocument, type ProjectDocument } from '../src/domain';
import { DocumentSceneModel } from '../src/renderer/editor/document-scene-model';
import { KeyboardNudgeInteraction } from '../src/renderer/editor/keyboard-nudge-interaction';
import { captureMoveTargets } from '../src/renderer/editor/move-geometry';
import { MoveInteraction } from '../src/renderer/editor/move-interaction';
import { captureResizeTarget } from '../src/renderer/editor/resize-geometry';
import { ResizeInteraction } from '../src/renderer/editor/resize-interaction';
import { SelectionOverlay } from '../src/renderer/editor/SelectionOverlay';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import {
  ViewportCameraStore,
  type AnimationFrameScheduler,
} from '../src/renderer/editor/viewport-camera-store';
import {
  createDeviceScale,
  createViewportSize,
  createViewportTransform,
  createWorldPoint,
} from '../src/renderer/editor/viewport-transform';
import { ViewportScene } from '../src/renderer/editor/ViewportScene';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

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

const parseFixture = (): ProjectDocument => {
  const result = parseProjectDocument(createValidProjectDocumentInput());
  if (!result.ok) {
    throw new Error('Selection overlay fixture is invalid.');
  }
  return result.value;
};

describe('selection overlay', () => {
  it('updates imperatively in screen space and keeps handles constant through zoom', () => {
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
    const camera = new ViewportCameraStore({
      initialDeviceScale: createDeviceScale(1),
      initialTransform: createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
      initialViewport: createViewportSize(1, 1),
      scheduler,
    });
    const model = new DocumentSceneModel();
    const document = parseFixture();
    model.reconcile(document, DOCUMENT_FIXTURE_IDS.board);
    const selection = new SelectionStore();
    const moveScheduler = new TestAnimationFrameScheduler();
    const move = new MoveInteraction(
      {
        capture: (ids) => captureMoveTargets(document, ids),
        commit: () => false,
      },
      moveScheduler,
    );
    const nudgeScheduler = new TestAnimationFrameScheduler();
    const nudge = new KeyboardNudgeInteraction(
      {
        capture: (ids) => captureMoveTargets(document, ids),
        commit: () => false,
      },
      nudgeScheduler,
    );
    const resizeScheduler = new TestAnimationFrameScheduler();
    const resize = new ResizeInteraction(
      {
        capture: (id) => captureResizeTarget(document, id),
        commit: () => false,
      },
      resizeScheduler,
    );
    let overlayRenderCount = 0;
    const CountedOverlay = () => {
      const renders = useRef(0);
      renders.current += 1;
      overlayRenderCount = renders.current;
      return (
        <SelectionOverlay
          camera={camera}
          keyboardNudgeInteraction={nudge}
          model={model}
          moveInteraction={move}
          resizeInteraction={resize}
          selection={selection}
        />
      );
    };
    const view = render(<ViewportScene camera={camera} interactionChildren={<CountedOverlay />} />);
    scheduler.flushNext();
    const group = view.container.querySelector<SVGGElement>('[data-selection-overlay="bounds"]');
    const outline = group?.querySelector<SVGRectElement>('.selection-overlay__outline');
    const handles = group?.querySelectorAll<SVGRectElement>('.selection-overlay__handle');
    if (group === null || outline === null || outline === undefined || handles === undefined) {
      throw new Error('Selection overlay did not mount.');
    }
    expect(group).toHaveAttribute('display', 'none');

    selection.selectOnly(DOCUMENT_FIXTURE_IDS.child);
    expect(group).not.toHaveAttribute('display');
    expect(group).toHaveAttribute('data-selection-count', '1');
    expect(outline).toHaveAttribute('x', '-4');
    expect(outline).toHaveAttribute('y', '36.5');
    expect(outline).toHaveAttribute('width', '120');
    expect(outline).toHaveAttribute('height', '48');
    expect([...handles].every((handle) => handle.getAttribute('width') === '8')).toBe(true);
    expect(handles).toHaveLength(8);

    camera.scheduleTransform(createViewportTransform({ panX: 10, panY: -5, zoom: 2 }));
    scheduler.flushNext();
    expect(outline).toHaveAttribute('x', '2');
    expect(outline).toHaveAttribute('y', '68');
    expect(outline).toHaveAttribute('width', '240');
    expect(outline).toHaveAttribute('height', '96');
    expect([...handles].every((handle) => handle.getAttribute('width') === '8')).toBe(true);
    expect(overlayRenderCount).toBe(1);

    move.begin({
      pointerId: 8,
      shiftKey: false,
      startWorldPoint: createWorldPoint(0, 0),
      targetIds: [DOCUMENT_FIXTURE_IDS.child],
      worldPoint: createWorldPoint(15, -5),
    });
    expect(outline).toHaveAttribute('x', '32');
    expect(outline).toHaveAttribute('y', '58');
    expect(outline).toHaveAttribute('width', '240');
    expect([...handles].every((handle) => handle.getAttribute('width') === '8')).toBe(true);
    expect(overlayRenderCount).toBe(1);

    move.cancel(8);
    expect(outline).toHaveAttribute('x', '2');
    expect(outline).toHaveAttribute('y', '68');
    expect(overlayRenderCount).toBe(1);

    nudge.begin([DOCUMENT_FIXTURE_IDS.child], 'ArrowRight', true);
    nudge.step('ArrowDown', false);
    nudge.flushPending();
    expect(outline).toHaveAttribute('x', '22');
    expect(outline).toHaveAttribute('y', '70');
    expect(outline).toHaveAttribute('width', '240');
    expect([...handles].every((handle) => handle.getAttribute('width') === '8')).toBe(true);
    expect(overlayRenderCount).toBe(1);

    nudge.cancel();
    expect(outline).toHaveAttribute('x', '2');
    expect(outline).toHaveAttribute('y', '68');

    resize.begin({
      elementId: DOCUMENT_FIXTURE_IDS.child,
      handle: 'southEast',
      pointerId: 9,
      shiftKey: false,
      startWorldPoint: createWorldPoint(116, 84.5),
      worldPoint: createWorldPoint(136, 94.5),
    });
    expect(outline).toHaveAttribute('x', '2');
    expect(outline).toHaveAttribute('y', '68');
    expect(outline).toHaveAttribute('width', '280');
    expect(outline).toHaveAttribute('height', '116');
    expect([...handles].every((handle) => handle.getAttribute('width') === '8')).toBe(true);
    expect(overlayRenderCount).toBe(1);

    resize.cancel(9);
    expect(outline).toHaveAttribute('width', '240');
    expect(outline).toHaveAttribute('height', '96');

    selection.replace([DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child]);
    expect(group).toHaveAttribute('data-selection-count', '2');
    expect([...handles].every((handle) => handle.getAttribute('display') === 'none')).toBe(true);
    camera.dispose();
  });
});
