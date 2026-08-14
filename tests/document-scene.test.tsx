import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { parseProjectDocument, type ProjectDocument } from '../src/domain';
import { DocumentScene } from '../src/renderer/editor/DocumentScene';
import { ViewportScene } from '../src/renderer/editor/ViewportScene';
import {
  ViewportCameraStore,
  type AnimationFrameScheduler,
} from '../src/renderer/editor/viewport-camera-store';
import {
  createDeviceScale,
  createViewportSize,
  createViewportTransform,
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
    const view = render(
      <ViewportScene
        camera={camera}
        worldChildren={
          <DocumentScene
            activeBoardId={DOCUMENT_FIXTURE_IDS.board}
            camera={camera}
            document={initialDocument}
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
});
