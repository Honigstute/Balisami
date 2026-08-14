import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { SCENE_LAYER_ATTRIBUTE, SCENE_LAYERS } from './scene-layers';
import type { SelectionInteraction } from './selection-interaction';
import type { ViewportCameraStore } from './viewport-camera-store';
import { ViewportInputController } from './viewport-input';
import { createDeviceScale, createViewportSize } from './viewport-transform';

interface ViewportSceneProps {
  readonly camera: ViewportCameraStore;
  readonly domChildren?: ReactNode;
  readonly interactionChildren?: ReactNode;
  readonly selectionInteraction?: SelectionInteraction;
  readonly worldChildren?: ReactNode;
}

const serializeWorldTransform = (camera: ViewportCameraStore): string => {
  const { pan, zoom } = camera.getTransformSnapshot();
  return `matrix(${String(zoom)} 0 0 ${String(zoom)} ${String(pan.x)} ${String(pan.y)})`;
};

const getDeviceScale = (): number => {
  const scale = window.devicePixelRatio;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
};

export const ViewportEmptyState = () => (
  <div className="canvas-empty">
    <div aria-hidden="true" className="canvas-empty__frame">
      <span className="canvas-empty__handle canvas-empty__handle--top-left" />
      <span className="canvas-empty__handle canvas-empty__handle--top-right" />
      <span className="canvas-empty__handle canvas-empty__handle--bottom-left" />
      <span className="canvas-empty__handle canvas-empty__handle--bottom-right" />
      <span className="canvas-empty__line" />
      <span className="canvas-empty__button" />
    </div>
    <h1>Built for quick thinking</h1>
    <p>The canvas, selection model, and smart guides attach here without changing the shell.</p>
  </div>
);

/**
 * Explicit scene layers with one imperatively-updated world transform. Camera
 * publications never require a React state update or rerender scene children.
 */
export const ViewportScene = ({
  camera,
  domChildren,
  interactionChildren,
  selectionInteraction,
  worldChildren,
}: ViewportSceneProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<SVGGElement | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const world = worldRef.current;
    if (root === null || world === null) {
      return;
    }
    const applyCamera = (): void => {
      world.setAttribute('transform', serializeWorldTransform(camera));
      root.dataset.cameraRevision = String(camera.getSnapshot().revision);
    };
    applyCamera();
    return camera.subscribe(applyCamera);
  }, [camera]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    let hasMeasuredViewport = false;
    const measure = (): void => {
      const rect = root.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const viewport = createViewportSize(rect.width, rect.height);
      if (hasMeasuredViewport) {
        camera.scheduleViewportResize(viewport);
      } else {
        camera.scheduleViewportMeasurement(viewport);
        hasMeasuredViewport = true;
      }
      camera.scheduleDeviceScale(createDeviceScale(getDeviceScale()));
    };

    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => measure());
    observer?.observe(root);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [camera]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    const input = new ViewportInputController(root, camera, selectionInteraction);
    input.connect();
    return () => input.disconnect();
  }, [camera, selectionInteraction]);

  return (
    <div
      aria-label="Interactive canvas"
      className="editor-viewport"
      data-camera-revision="0"
      data-pan-state="idle"
      data-selection-state="idle"
      ref={rootRef}
      tabIndex={0}
    >
      <svg aria-hidden="true" className="editor-scene" focusable="false">
        <g {...{ [SCENE_LAYER_ATTRIBUTE]: SCENE_LAYERS.world }} ref={worldRef}>
          <g {...{ [SCENE_LAYER_ATTRIBUTE]: SCENE_LAYERS.background }} />
          <g {...{ [SCENE_LAYER_ATTRIBUTE]: SCENE_LAYERS.document }}>{worldChildren}</g>
        </g>
        <g {...{ [SCENE_LAYER_ATTRIBUTE]: SCENE_LAYERS.interaction }}>{interactionChildren}</g>
      </svg>
      <div {...{ [SCENE_LAYER_ATTRIBUTE]: SCENE_LAYERS.dom }} className="editor-dom-overlay">
        {domChildren}
      </div>
    </div>
  );
};
