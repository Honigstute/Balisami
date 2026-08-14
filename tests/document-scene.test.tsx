import { render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  parseProjectDocument,
  type ProjectDocument,
} from '../src/domain';
import { DocumentScene } from '../src/renderer/editor/DocumentScene';
import { DocumentSceneModel } from '../src/renderer/editor/document-scene-model';
import { KeyboardNudgeInteraction } from '../src/renderer/editor/keyboard-nudge-interaction';
import { captureMoveTargets } from '../src/renderer/editor/move-geometry';
import { MoveInteraction } from '../src/renderer/editor/move-interaction';
import { captureResizeTarget } from '../src/renderer/editor/resize-geometry';
import { ResizeInteraction } from '../src/renderer/editor/resize-interaction';
import { ViewportScene } from '../src/renderer/editor/ViewportScene';
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

const parseFixture = (childX = 16): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  input.elementsById[DOCUMENT_FIXTURE_IDS.child]!.frame.x = childX;
  const result = parseProjectDocument(input);
  if (!result.ok) {
    throw new Error('Document scene test fixture is invalid.');
  }
  return result.value;
};

const OTHER_ID = ElementIdSchema.parse('element_sceneother');

const parseMovePreviewFixture = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  input.elementsById[DOCUMENT_FIXTURE_IDS.group]!.childIds.push(OTHER_ID);
  input.elementsById[OTHER_ID] = {
    id: OTHER_ID,
    controlType: FOUNDATION_CONTROL_TYPES.rectangle,
    frame: { x: 180, y: 24, width: 100, height: 48 },
    locked: false,
    properties: {},
    childIds: [],
    assetIds: [],
    link: null,
  };
  const result = parseProjectDocument(input);
  if (!result.ok) {
    throw new Error('Move preview scene fixture is invalid.');
  }
  return result.value;
};

describe('document SVG scene', () => {
  it('updates keyed geometry and culling imperatively without replacing unchanged nodes', () => {
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
    const initialDocument = parseFixture();
    const model = new DocumentSceneModel();
    const view = render(
      <ViewportScene
        camera={camera}
        worldChildren={
          <DocumentScene
            activeBoardId={DOCUMENT_FIXTURE_IDS.board}
            camera={camera}
            document={initialDocument}
            model={model}
          />
        }
      />,
    );
    scheduler.flushNext();
    const selector = `[data-scene-element-id="${DOCUMENT_FIXTURE_IDS.child}"]`;
    const initialElement = view.container.querySelector(selector);
    expect(initialElement).not.toBeNull();
    const initialPath = initialElement?.querySelector('path')?.getAttribute('d');

    camera.scheduleTransform(createViewportTransform({ panX: 25, panY: 15, zoom: 1 }));
    scheduler.flushNext();
    expect(view.container.querySelector(selector)).toBe(initialElement);
    expect(initialElement?.querySelector('path')?.getAttribute('d')).toBe(initialPath);

    const movedDocument = parseFixture(30);
    view.rerender(
      <ViewportScene
        camera={camera}
        worldChildren={
          <DocumentScene
            activeBoardId={DOCUMENT_FIXTURE_IDS.board}
            camera={camera}
            document={movedDocument}
            model={model}
          />
        }
      />,
    );
    expect(view.container.querySelector(selector)).toBe(initialElement);
    expect(initialElement?.querySelector('path')?.getAttribute('d')).not.toBe(initialPath);

    camera.scheduleTransform(createViewportTransform({ panX: -10_000, panY: -10_000, zoom: 1 }));
    scheduler.flushNext();
    expect(view.container.querySelector(selector)).toBeNull();
    camera.dispose();
  });

  it('translates only affected keyed nodes during a move preview without React rerenders', () => {
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
    const cameraScheduler = new TestAnimationFrameScheduler();
    const moveScheduler = new TestAnimationFrameScheduler();
    const camera = new ViewportCameraStore({
      initialDeviceScale: createDeviceScale(1),
      initialTransform: createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
      initialViewport: createViewportSize(1, 1),
      scheduler: cameraScheduler,
    });
    const document = parseMovePreviewFixture();
    const model = new DocumentSceneModel();
    const move = new MoveInteraction(
      {
        capture: (ids) => captureMoveTargets(document, ids),
        commit: () => false,
      },
      moveScheduler,
    );
    let sceneRenderCount = 0;
    const CountedScene = () => {
      const renders = useRef(0);
      renders.current += 1;
      sceneRenderCount = renders.current;
      return (
        <DocumentScene
          activeBoardId={DOCUMENT_FIXTURE_IDS.board}
          camera={camera}
          document={document}
          model={model}
          moveInteraction={move}
        />
      );
    };
    const view = render(<ViewportScene camera={camera} worldChildren={<CountedScene />} />);
    cameraScheduler.flushNext();
    const moved = view.container.querySelector<SVGGElement>(
      `[data-scene-element-id="${DOCUMENT_FIXTURE_IDS.child}"]`,
    );
    const unrelated = view.container.querySelector<SVGGElement>(
      `[data-scene-element-id="${OTHER_ID}"]`,
    );
    if (moved === null || unrelated === null) {
      throw new Error('Move preview scene elements did not mount.');
    }
    const movedPath = moved.querySelector('path')?.getAttribute('d');
    const unrelatedPath = unrelated.querySelector('path')?.getAttribute('d');
    const unrelatedRevision = unrelated.dataset.sceneRevision;

    move.begin({
      pointerId: 4,
      shiftKey: false,
      startWorldPoint: createWorldPoint(0, 0),
      targetIds: [DOCUMENT_FIXTURE_IDS.child],
      worldPoint: createWorldPoint(10, 5),
    });
    for (let index = 1; index <= 500; index += 1) {
      move.update({
        pointerId: 4,
        shiftKey: false,
        worldPoint: createWorldPoint(index / 10, index / 20),
      });
    }
    expect(moveScheduler.callbacks.size).toBe(1);
    moveScheduler.flushNext();

    expect(moved).toHaveAttribute('transform', 'translate(50 25)');
    expect(moved.querySelector('path')?.getAttribute('d')).toBe(movedPath);
    expect(unrelated).not.toHaveAttribute('transform');
    expect(unrelated.querySelector('path')?.getAttribute('d')).toBe(unrelatedPath);
    expect(unrelated.dataset.sceneRevision).toBe(unrelatedRevision);
    expect(sceneRenderCount).toBe(1);

    move.cancel(4);
    expect(moved).not.toHaveAttribute('transform');
    expect(unrelated).not.toHaveAttribute('transform');
    expect(sceneRenderCount).toBe(1);
    camera.dispose();
  });

  it('translates only affected keyed nodes during coalesced keyboard repeats', () => {
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
    const cameraScheduler = new TestAnimationFrameScheduler();
    const nudgeScheduler = new TestAnimationFrameScheduler();
    const camera = new ViewportCameraStore({
      initialDeviceScale: createDeviceScale(2),
      initialTransform: createViewportTransform({ panX: 25, panY: -10, zoom: 4 }),
      initialViewport: createViewportSize(1, 1),
      scheduler: cameraScheduler,
    });
    const document = parseMovePreviewFixture();
    const model = new DocumentSceneModel();
    const nudge = new KeyboardNudgeInteraction(
      {
        capture: (ids) => captureMoveTargets(document, ids),
        commit: () => false,
      },
      nudgeScheduler,
    );
    let sceneRenderCount = 0;
    const CountedScene = () => {
      const renders = useRef(0);
      renders.current += 1;
      sceneRenderCount = renders.current;
      return (
        <DocumentScene
          activeBoardId={DOCUMENT_FIXTURE_IDS.board}
          camera={camera}
          document={document}
          keyboardNudgeInteraction={nudge}
          model={model}
        />
      );
    };
    const view = render(<ViewportScene camera={camera} worldChildren={<CountedScene />} />);
    cameraScheduler.flushNext();
    const nudged = view.container.querySelector<SVGGElement>(
      `[data-scene-element-id="${DOCUMENT_FIXTURE_IDS.child}"]`,
    );
    const unrelated = view.container.querySelector<SVGGElement>(
      `[data-scene-element-id="${OTHER_ID}"]`,
    );
    if (nudged === null || unrelated === null) {
      throw new Error('Keyboard nudge preview scene elements did not mount.');
    }
    const nudgedPath = nudged.querySelector('path')?.getAttribute('d');
    const unrelatedPath = unrelated.querySelector('path')?.getAttribute('d');
    const unrelatedRevision = unrelated.dataset.sceneRevision;

    nudge.begin([DOCUMENT_FIXTURE_IDS.child], 'ArrowRight', false);
    for (let index = 1; index < 500; index += 1) {
      nudge.step('ArrowRight', false);
    }
    nudge.step('ArrowDown', true);
    expect(nudgeScheduler.callbacks.size).toBe(1);
    nudgeScheduler.flushNext();

    expect(nudged).toHaveAttribute('transform', 'translate(500 10)');
    expect(nudged.querySelector('path')?.getAttribute('d')).toBe(nudgedPath);
    expect(unrelated).not.toHaveAttribute('transform');
    expect(unrelated.querySelector('path')?.getAttribute('d')).toBe(unrelatedPath);
    expect(unrelated.dataset.sceneRevision).toBe(unrelatedRevision);
    expect(sceneRenderCount).toBe(1);

    nudge.cancel();
    expect(nudged).not.toHaveAttribute('transform');
    expect(unrelated).not.toHaveAttribute('transform');
    expect(sceneRenderCount).toBe(1);
    camera.dispose();
  });

  it('regenerates only resized preview geometry and restores the canonical keyed node on cancel', () => {
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
    const cameraScheduler = new TestAnimationFrameScheduler();
    const resizeScheduler = new TestAnimationFrameScheduler();
    const camera = new ViewportCameraStore({
      initialDeviceScale: createDeviceScale(1),
      initialTransform: createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
      initialViewport: createViewportSize(1, 1),
      scheduler: cameraScheduler,
    });
    const document = parseMovePreviewFixture();
    const model = new DocumentSceneModel();
    const resize = new ResizeInteraction(
      {
        capture: (id) => captureResizeTarget(document, id),
        commit: () => false,
      },
      resizeScheduler,
    );
    let sceneRenderCount = 0;
    const CountedScene = () => {
      const renders = useRef(0);
      renders.current += 1;
      sceneRenderCount = renders.current;
      return (
        <DocumentScene
          activeBoardId={DOCUMENT_FIXTURE_IDS.board}
          camera={camera}
          document={document}
          model={model}
          resizeInteraction={resize}
        />
      );
    };
    const view = render(<ViewportScene camera={camera} worldChildren={<CountedScene />} />);
    cameraScheduler.flushNext();
    const resized = view.container.querySelector<SVGGElement>(
      `[data-scene-element-id="${DOCUMENT_FIXTURE_IDS.child}"]`,
    );
    const unrelated = view.container.querySelector<SVGGElement>(
      `[data-scene-element-id="${OTHER_ID}"]`,
    );
    if (resized === null || unrelated === null) {
      throw new Error('Resize preview scene elements did not mount.');
    }
    const resizedFill = resized.querySelector<SVGRectElement>('rect');
    const resizedPath = resized.querySelector<SVGPathElement>('path');
    const originalPath = resizedPath?.getAttribute('d');
    const originalRevision = resized.dataset.sceneRevision;
    const unrelatedPath = unrelated.querySelector('path')?.getAttribute('d');
    const unrelatedRevision = unrelated.dataset.sceneRevision;

    resize.begin({
      elementId: DOCUMENT_FIXTURE_IDS.child,
      handle: 'southEast',
      pointerId: 10,
      shiftKey: false,
      startWorldPoint: createWorldPoint(116, 84.5),
      worldPoint: createWorldPoint(116, 84.5),
    });
    for (let index = 1; index <= 500; index += 1) {
      resize.update({
        pointerId: 10,
        shiftKey: false,
        worldPoint: createWorldPoint(116 + index / 10, 84.5 + index / 20),
      });
    }
    expect(resizeScheduler.callbacks.size).toBe(1);
    resizeScheduler.flushNext();

    expect(resizedFill).toHaveAttribute('x', '-4');
    expect(resizedFill).toHaveAttribute('y', '36.5');
    expect(resizedFill).toHaveAttribute('width', '170');
    expect(resizedFill).toHaveAttribute('height', '73');
    expect(resizedPath?.getAttribute('d')).not.toBe(originalPath);
    expect(resized.dataset.sceneRevision).toBe(originalRevision);
    expect(unrelated.querySelector('path')?.getAttribute('d')).toBe(unrelatedPath);
    expect(unrelated.dataset.sceneRevision).toBe(unrelatedRevision);
    expect(sceneRenderCount).toBe(1);

    resize.cancel(10);
    expect(resizedFill).toHaveAttribute('width', '120');
    expect(resizedFill).toHaveAttribute('height', '48');
    expect(resizedPath?.getAttribute('d')).toBe(originalPath);
    expect(unrelated.querySelector('path')?.getAttribute('d')).toBe(unrelatedPath);
    expect(sceneRenderCount).toBe(1);
    camera.dispose();
  });
});
