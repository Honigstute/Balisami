import { useLayoutEffect, useRef, type DragEvent, type ReactNode } from 'react';

import type { ControlTypeId } from '../../domain';
import { CONTROL_DRAG_MIME_TYPE, parseDraggedControlType } from '../controls/control-drag-transfer';

import type { KeyboardNudgeInteraction } from './keyboard-nudge-interaction';
import { SCENE_LAYER_ATTRIBUTE, SCENE_LAYERS } from './scene-layers';
import type { SelectionInteraction } from './selection-interaction';
import type { SelectionStore } from './selection-store';
import type { TextEditViewportRoute } from './text-edit-interaction';
import type { ViewportShortcutPlatform } from './viewport-commands';
import type { ViewportCameraStore } from './viewport-camera-store';
import { ViewportInputController, type ViewportAlignmentCommand } from './viewport-input';
import {
  createDeviceScale,
  createViewportPoint,
  createViewportSize,
  viewportPointToWorld,
  type WorldPoint,
} from './viewport-transform';

interface ViewportSceneProps {
  readonly camera: ViewportCameraStore;
  readonly domChildren?: ReactNode;
  readonly interactionChildren?: ReactNode;
  readonly keyboardNudgeInteraction?: KeyboardNudgeInteraction;
  readonly onAlignSelection?: (action: ViewportAlignmentCommand) => boolean;
  readonly onBringSelectionForward?: () => boolean;
  readonly onBringSelectionToFront?: () => boolean;
  readonly onCopySelection?: () => boolean;
  readonly onCutSelection?: () => boolean;
  readonly onDeleteSelection?: () => boolean;
  readonly onDuplicateSelection?: () => boolean;
  readonly onGroupSelection?: () => boolean;
  readonly onInsertControlAt?: (controlType: ControlTypeId, point: WorldPoint) => boolean;
  readonly onLockSelection?: () => boolean;
  readonly onPasteSelection?: () => boolean;
  readonly onSendSelectionBackward?: () => boolean;
  readonly onSendSelectionToBack?: () => boolean;
  readonly onUngroupSelection?: () => boolean;
  readonly onUnlockAll?: () => boolean;
  readonly selection?: SelectionStore;
  readonly selectionInteraction?: SelectionInteraction;
  readonly shortcutPlatform?: ViewportShortcutPlatform;
  readonly textEdit?: TextEditViewportRoute;
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
    <h1>Your canvas is ready</h1>
    <p>Choose a control from the library, or drag one directly onto the canvas.</p>
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
  keyboardNudgeInteraction,
  onAlignSelection,
  onBringSelectionForward,
  onBringSelectionToFront,
  onCopySelection,
  onCutSelection,
  onDeleteSelection,
  onDuplicateSelection,
  onGroupSelection,
  onInsertControlAt,
  onLockSelection,
  onPasteSelection,
  onSendSelectionBackward,
  onSendSelectionToBack,
  onUngroupSelection,
  onUnlockAll,
  selection,
  selectionInteraction,
  shortcutPlatform,
  textEdit,
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
    const input = new ViewportInputController(root, camera, {
      ...(onAlignSelection === undefined ? {} : { alignSelection: onAlignSelection }),
      ...(onBringSelectionForward === undefined
        ? {}
        : { bringSelectionForward: onBringSelectionForward }),
      ...(onBringSelectionToFront === undefined
        ? {}
        : { bringSelectionToFront: onBringSelectionToFront }),
      ...(onCopySelection === undefined ? {} : { copySelection: onCopySelection }),
      ...(onCutSelection === undefined ? {} : { cutSelection: onCutSelection }),
      ...(onDeleteSelection === undefined ? {} : { deleteSelection: onDeleteSelection }),
      ...(onDuplicateSelection === undefined ? {} : { duplicateSelection: onDuplicateSelection }),
      ...(onGroupSelection === undefined ? {} : { groupSelection: onGroupSelection }),
      ...(onLockSelection === undefined ? {} : { lockSelection: onLockSelection }),
      ...(keyboardNudgeInteraction === undefined
        ? {}
        : { keyboardNudge: keyboardNudgeInteraction }),
      ...(selection === undefined ? {} : { selection }),
      ...(selectionInteraction === undefined ? {} : { selectionInteraction }),
      ...(onPasteSelection === undefined ? {} : { pasteSelection: onPasteSelection }),
      ...(onSendSelectionBackward === undefined
        ? {}
        : { sendSelectionBackward: onSendSelectionBackward }),
      ...(onSendSelectionToBack === undefined
        ? {}
        : { sendSelectionToBack: onSendSelectionToBack }),
      ...(onUngroupSelection === undefined ? {} : { ungroupSelection: onUngroupSelection }),
      ...(onUnlockAll === undefined ? {} : { unlockAll: onUnlockAll }),
      ...(shortcutPlatform === undefined ? {} : { shortcutPlatform }),
      ...(textEdit === undefined ? {} : { textEdit }),
    });
    input.connect();
    return () => input.disconnect();
  }, [
    camera,
    keyboardNudgeInteraction,
    onAlignSelection,
    onBringSelectionForward,
    onBringSelectionToFront,
    onCopySelection,
    onCutSelection,
    onDeleteSelection,
    onDuplicateSelection,
    onGroupSelection,
    onLockSelection,
    onPasteSelection,
    onSendSelectionBackward,
    onSendSelectionToBack,
    onUngroupSelection,
    onUnlockAll,
    selection,
    selectionInteraction,
    shortcutPlatform,
    textEdit,
  ]);

  const handleControlDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (
      onInsertControlAt === undefined ||
      !Array.from(event.dataTransfer.types).includes(CONTROL_DRAG_MIME_TYPE)
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleControlDrop = (event: DragEvent<HTMLDivElement>): void => {
    const root = rootRef.current;
    const controlType = parseDraggedControlType(event.dataTransfer.getData(CONTROL_DRAG_MIME_TYPE));
    if (root === null || controlType === undefined || onInsertControlAt === undefined) {
      return;
    }
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return;
    }
    const bounds = root.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }
    const viewportPoint = createViewportPoint(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    );
    event.preventDefault();
    onInsertControlAt(
      controlType,
      viewportPointToWorld(viewportPoint, camera.getTransformSnapshot()),
    );
  };

  return (
    <div
      aria-label="Interactive canvas"
      className="editor-viewport"
      data-camera-revision="0"
      data-pan-state="idle"
      data-selection-state="idle"
      onDragOver={handleControlDragOver}
      onDrop={handleControlDrop}
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
