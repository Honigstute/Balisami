import { render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ElementIdSchema,
  DOCUMENT_COMMAND_TYPES,
  CONTROL_TYPES,
  FOUNDATION_CONTROL_TYPES,
  dispatchDocumentCommand,
  parseProjectDocument,
  type ProjectDocument,
} from '../src/domain';
import type { ControlTextMeasurementService } from '../src/renderer/controls/control-text-measurement';
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
import {
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  getFixtureControlVersion,
} from './fixtures/project-document';

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
const CLONE_ID = ElementIdSchema.parse('element_sceneclone');

const parseMovePreviewFixture = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  input.elementsById[DOCUMENT_FIXTURE_IDS.group]!.childIds.push(OTHER_ID);
  input.elementsById[OTHER_ID] = {
    id: OTHER_ID,
    controlType: FOUNDATION_CONTROL_TYPES.rectangle,
    controlVersion: getFixtureControlVersion(FOUNDATION_CONTROL_TYPES.rectangle),
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

const parseTextSceneFixture = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  input.elementsById[DOCUMENT_FIXTURE_IDS.child]!.controlType = CONTROL_TYPES.textLabel;
  input.elementsById[DOCUMENT_FIXTURE_IDS.child]!.properties = { text: 'Line\r\nbreak' };
  const result = parseProjectDocument(input);
  if (!result.ok) {
    throw new Error('Text scene fixture is invalid.');
  }
  return result.value;
};

const parseImageSceneFixture = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child]!;
  child.controlType = CONTROL_TYPES.imagePlaceholder;
  child.controlVersion = getFixtureControlVersion(CONTROL_TYPES.imagePlaceholder);
  child.properties = { showBorder: false };
  child.assetIds = [DOCUMENT_FIXTURE_IDS.asset];
  const result = parseProjectDocument(input);
  if (!result.ok) {
    throw new Error('Image scene fixture is invalid.');
  }
  return result.value;
};

describe('document SVG scene', () => {
  it('renders an authenticated image URL without placeholder marks or an implicit border', () => {
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
    const document = parseImageSceneFixture();
    const model = new DocumentSceneModel();
    const renderScene = (assetUrls: Readonly<Record<string, string>>) => (
      <ViewportScene
        camera={camera}
        worldChildren={
          <DocumentScene
            activeBoardId={DOCUMENT_FIXTURE_IDS.board}
            assetUrls={assetUrls}
            camera={camera}
            document={document}
            model={model}
          />
        }
      />
    );
    const view = render(
      renderScene({ [DOCUMENT_FIXTURE_IDS.asset]: 'blob:balsamic-authenticated-image' }),
    );
    scheduler.flushNext();
    const element = view.container.querySelector(
      `[data-scene-element-id="${DOCUMENT_FIXTURE_IDS.child}"]`,
    );
    const image = element?.querySelector('.scene-control__image');
    const mark = element?.querySelector('.scene-control__mark');
    const outline = element?.querySelector('.scene-control__outline');
    expect(image).toHaveAttribute('href', 'blob:balsamic-authenticated-image');
    expect(image).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    expect(image).toHaveAttribute('display', 'inline');
    expect(mark).toHaveAttribute('display', 'none');
    expect(outline).toHaveAttribute('display', 'none');

    view.rerender(renderScene({}));
    expect(image).not.toHaveAttribute('href');
    expect(image).toHaveAttribute('display', 'none');
    expect(mark).toHaveAttribute('display', 'inline');
    camera.dispose();
  });

  it('projects linked-element hints at constant screen size and updates keyed nodes', () => {
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
    const linkedDocument = parseFixture();
    const model = new DocumentSceneModel();
    const renderScene = (document: ProjectDocument) => (
      <ViewportScene
        camera={camera}
        worldChildren={
          <DocumentScene
            activeBoardId={DOCUMENT_FIXTURE_IDS.board}
            camera={camera}
            document={document}
            model={model}
          />
        }
      />
    );
    const view = render(renderScene(linkedDocument));
    scheduler.flushNext();
    const sceneElement = view.container.querySelector(
      `[data-scene-element-id="${DOCUMENT_FIXTURE_IDS.child}"]`,
    );
    const hint = sceneElement?.querySelector<SVGGElement>('.scene-control__link-hint');
    const background = hint?.querySelector<SVGCircleElement>(
      '.scene-control__link-hint-background',
    );
    expect(hint).toHaveAttribute('data-link-kind', 'board');
    expect(hint).toHaveAttribute('data-link-target', DOCUMENT_FIXTURE_IDS.board);
    expect(background).toHaveAttribute('r', '8');

    camera.scheduleTransform(createViewportTransform({ panX: 0, panY: 0, zoom: 2 }));
    scheduler.flushNext();
    expect(background).toHaveAttribute('r', '4');

    const cleared = dispatchDocumentCommand(linkedDocument, {
      type: DOCUMENT_COMMAND_TYPES.setElementLink,
      elementId: DOCUMENT_FIXTURE_IDS.child,
      link: null,
    });
    if (!cleared.ok || !cleared.changed) {
      throw new Error('Linked scene fixture could not be cleared.');
    }
    view.rerender(renderScene(cleared.document));
    expect(view.container.querySelector('.scene-control__link-hint')).toBe(hint);
    expect(hint).toHaveAttribute('display', 'none');
    camera.dispose();
  });

  it('updates an existing keyed text node from canonical measured alphabetic baselines', () => {
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
    const document = parseTextSceneFixture();
    const model = new DocumentSceneModel();
    const service: ControlTextMeasurementService = {
      measure: vi.fn(() => ({
        baselineOffsets: [14],
        height: 25.2,
        lineCount: 1,
        lineHeight: 25.2,
        lines: ['Line break'],
        width: 70,
      })),
    };
    const renderScene = (textMeasurementService?: ControlTextMeasurementService) => (
      <ViewportScene
        camera={camera}
        worldChildren={
          <DocumentScene
            activeBoardId={DOCUMENT_FIXTURE_IDS.board}
            camera={camera}
            document={document}
            model={model}
            {...(textMeasurementService === undefined ? {} : { textMeasurementService })}
          />
        }
      />
    );
    const view = render(renderScene());
    scheduler.flushNext();
    const sceneElement = view.container.querySelector<SVGGElement>(
      `[data-scene-element-id="${DOCUMENT_FIXTURE_IDS.child}"]`,
    );
    const textElement = sceneElement?.querySelector<SVGTextElement>('.scene-control__text');
    expect(textElement).toHaveAttribute('display', 'none');

    view.rerender(renderScene(service));
    expect(
      view.container.querySelector(`[data-scene-element-id="${DOCUMENT_FIXTURE_IDS.child}"]`),
    ).toBe(sceneElement);
    expect(sceneElement?.querySelector('.scene-control__text')).toBe(textElement);
    expect(textElement).toHaveAttribute('display', 'inline');
    expect(textElement).toHaveAttribute('dominant-baseline', 'alphabetic');
    expect(textElement).toHaveAttribute('font-size', '18');
    expect(textElement).toHaveAttribute('text-anchor', 'start');
    const line = textElement?.querySelector('tspan');
    expect(line).toHaveAttribute('x', '-4');
    expect(line).toHaveAttribute('y', '61.9');
    expect(line).toHaveTextContent('Line break');
    expect(service.measure).toHaveBeenCalledWith({
      fontSize: 18,
      mode: 'single-line',
      text: 'Line\r\nbreak',
    });
    camera.dispose();
  });

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
    expect(
      view.container.querySelector(`[data-scene-element-id="${DOCUMENT_FIXTURE_IDS.group}"]`),
    ).toBeNull();
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.group)?.kind).toBe('container');
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
      snapBypassed: false,
      shiftKey: false,
      startWorldPoint: createWorldPoint(0, 0),
      targetIds: [DOCUMENT_FIXTURE_IDS.child],
      worldPoint: createWorldPoint(10, 5),
    });
    for (let index = 1; index <= 500; index += 1) {
      move.update({
        pointerId: 4,
        snapBypassed: false,
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

  it('removes a deleted keyed node without regenerating an unrelated sibling', () => {
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
    const document = parseMovePreviewFixture();
    const model = new DocumentSceneModel();
    const renderScene = (currentDocument: ProjectDocument) => (
      <ViewportScene
        camera={camera}
        worldChildren={
          <DocumentScene
            activeBoardId={DOCUMENT_FIXTURE_IDS.board}
            camera={camera}
            document={currentDocument}
            model={model}
          />
        }
      />
    );
    const view = render(renderScene(document));
    scheduler.flushNext();
    const deletedSelector = `[data-scene-element-id="${DOCUMENT_FIXTURE_IDS.child}"]`;
    const unrelatedSelector = `[data-scene-element-id="${OTHER_ID}"]`;
    const deleted = view.container.querySelector(deletedSelector);
    const unrelated = view.container.querySelector<SVGGElement>(unrelatedSelector);
    if (deleted === null || unrelated === null) {
      throw new Error('Delete preview scene elements did not mount.');
    }
    const unrelatedPath = unrelated.querySelector('path')?.getAttribute('d');
    const unrelatedRevision = unrelated.dataset.sceneRevision;
    const result = dispatchDocumentCommand(document, {
      type: DOCUMENT_COMMAND_TYPES.deleteElement,
      elementId: DOCUMENT_FIXTURE_IDS.child,
    });
    if (!result.ok || !result.changed) {
      throw new Error('Delete preview command was not accepted.');
    }

    view.rerender(renderScene(result.document));
    expect(view.container.querySelector(deletedSelector)).toBeNull();
    expect(view.container.querySelector(unrelatedSelector)).toBe(unrelated);
    expect(unrelated.querySelector('path')?.getAttribute('d')).toBe(unrelatedPath);
    expect(unrelated.dataset.sceneRevision).toBe(unrelatedRevision);
    camera.dispose();
  });

  it('adds a duplicated keyed node without regenerating its source or an unrelated sibling', () => {
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
    const document = parseMovePreviewFixture();
    const model = new DocumentSceneModel();
    const renderScene = (currentDocument: ProjectDocument) => (
      <ViewportScene
        camera={camera}
        worldChildren={
          <DocumentScene
            activeBoardId={DOCUMENT_FIXTURE_IDS.board}
            camera={camera}
            document={currentDocument}
            model={model}
          />
        }
      />
    );
    const view = render(renderScene(document));
    scheduler.flushNext();
    const sourceSelector = `[data-scene-element-id="${DOCUMENT_FIXTURE_IDS.child}"]`;
    const unrelatedSelector = `[data-scene-element-id="${OTHER_ID}"]`;
    const cloneSelector = `[data-scene-element-id="${CLONE_ID}"]`;
    const source = view.container.querySelector<SVGGElement>(sourceSelector);
    const unrelated = view.container.querySelector<SVGGElement>(unrelatedSelector);
    if (source === null || unrelated === null) {
      throw new Error('Duplicate preview source elements did not mount.');
    }
    const sourcePath = source.querySelector('path')?.getAttribute('d');
    const sourceRevision = source.dataset.sceneRevision;
    const unrelatedPath = unrelated.querySelector('path')?.getAttribute('d');
    const unrelatedRevision = unrelated.dataset.sceneRevision;
    const sourceElement = document.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (sourceElement === undefined) {
      throw new Error('Duplicate preview source record is missing.');
    }
    const result = dispatchDocumentCommand(document, {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        ...sourceElement,
        id: CLONE_ID,
        frame: { ...sourceElement.frame, x: 26, y: 34 },
        childIds: [],
      },
      owner: { kind: 'element', elementId: DOCUMENT_FIXTURE_IDS.group },
      index: 1,
    });
    if (!result.ok || !result.changed) {
      throw new Error('Duplicate preview command was not accepted.');
    }

    view.rerender(renderScene(result.document));
    expect(view.container.querySelector(cloneSelector)).not.toBeNull();
    expect(view.container.querySelector(sourceSelector)).toBe(source);
    expect(source.querySelector('path')?.getAttribute('d')).toBe(sourcePath);
    expect(source.dataset.sceneRevision).toBe(sourceRevision);
    expect(view.container.querySelector(unrelatedSelector)).toBe(unrelated);
    expect(unrelated.querySelector('path')?.getAttribute('d')).toBe(unrelatedPath);
    expect(unrelated.dataset.sceneRevision).toBe(unrelatedRevision);
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
      snapBypassed: false,
      shiftKey: false,
      startWorldPoint: createWorldPoint(116, 84.5),
      worldPoint: createWorldPoint(116, 84.5),
    });
    for (let index = 1; index <= 500; index += 1) {
      resize.update({
        pointerId: 10,
        snapBypassed: false,
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
