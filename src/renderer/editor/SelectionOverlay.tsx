import { useLayoutEffect, useRef } from 'react';

import type { DocumentSceneModel } from './document-scene-model';
import type { KeyboardNudgeInteraction } from './keyboard-nudge-interaction';
import type { MoveInteraction } from './move-interaction';
import {
  getResizeHandlePositions,
  RESIZE_HANDLES,
  RESIZE_INTERACTION_POLICY,
} from './resize-geometry';
import type { ResizeInteraction } from './resize-interaction';
import { getSceneSelectionWorldBounds } from './selection-bounds';
import type { SelectionStore } from './selection-store';
import type { ViewportCameraStore } from './viewport-camera-store';
import { worldRectToViewport } from './viewport-transform';

interface SelectionOverlayProps {
  readonly camera: ViewportCameraStore;
  readonly keyboardNudgeInteraction?: KeyboardNudgeInteraction;
  readonly model: DocumentSceneModel;
  readonly moveInteraction?: MoveInteraction;
  readonly resizeInteraction?: ResizeInteraction;
  readonly selection: SelectionStore;
}

/** Fixed-screen selection geometry; camera publications never enter React. */
export const SelectionOverlay = ({
  camera,
  keyboardNudgeInteraction,
  model,
  moveInteraction,
  resizeInteraction,
  selection,
}: SelectionOverlayProps) => {
  const groupRef = useRef<SVGGElement | null>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (group === null) {
      return;
    }
    const outline = group.children[0];
    const handles = [...group.children].slice(1);
    if (outline?.localName !== 'rect' || handles.some((handle) => handle.localName !== 'rect')) {
      throw new Error('Selection overlay structure was changed unexpectedly.');
    }

    const apply = (): void => {
      const selectionSnapshot = selection.getSnapshot();
      const keyboardNudgeSnapshot = keyboardNudgeInteraction?.getSnapshot();
      const moveSnapshot = moveInteraction?.getSnapshot();
      const resizeSnapshot = resizeInteraction?.getSnapshot();
      const worldBounds = getSceneSelectionWorldBounds(
        model,
        selectionSnapshot.selectedIds,
        keyboardNudgeSnapshot?.kind === 'nudging'
          ? keyboardNudgeSnapshot
          : moveSnapshot?.kind === 'moving'
            ? moveSnapshot
            : undefined,
        resizeSnapshot?.kind === 'resizing'
          ? { bounds: resizeSnapshot.worldBounds, elementId: resizeSnapshot.elementId }
          : undefined,
      );
      if (worldBounds === undefined) {
        group.setAttribute('display', 'none');
        group.dataset.selectionCount = '0';
        return;
      }
      const bounds = worldRectToViewport(worldBounds, camera.getTransformSnapshot());
      const outlineElement = outline as SVGRectElement;
      outlineElement.setAttribute('x', String(bounds.x));
      outlineElement.setAttribute('y', String(bounds.y));
      outlineElement.setAttribute('width', String(bounds.width));
      outlineElement.setAttribute('height', String(bounds.height));
      const halfHandle = RESIZE_INTERACTION_POLICY.handleSizePixels / 2;
      const positions = getResizeHandlePositions(bounds);
      const singleSelection = selectionSnapshot.selectedIds[0];
      const showHandles =
        selectionSnapshot.selectedIds.length === 1 &&
        singleSelection !== undefined &&
        model.getItem(singleSelection)?.kind === 'object';
      handles.forEach((handle, index) => {
        const position = positions[index];
        if (position === undefined) {
          return;
        }
        handle.setAttribute('x', String(position.point.x - halfHandle));
        handle.setAttribute('y', String(position.point.y - halfHandle));
        handle.setAttribute('width', String(RESIZE_INTERACTION_POLICY.handleSizePixels));
        handle.setAttribute('height', String(RESIZE_INTERACTION_POLICY.handleSizePixels));
        handle.setAttribute('display', showHandles ? 'inline' : 'none');
      });
      group.removeAttribute('display');
      group.dataset.selectionCount = String(selectionSnapshot.selectedIds.length);
    };

    apply();
    const unsubscribeCamera = camera.subscribe(apply);
    const unsubscribeKeyboardNudge = keyboardNudgeInteraction?.subscribe(apply);
    const unsubscribeModel = model.subscribe(apply);
    const unsubscribeMove = moveInteraction?.subscribe(apply);
    const unsubscribeResize = resizeInteraction?.subscribe(apply);
    const unsubscribeSelection = selection.subscribe(apply);
    return () => {
      unsubscribeCamera();
      unsubscribeKeyboardNudge?.();
      unsubscribeModel();
      unsubscribeMove?.();
      unsubscribeResize?.();
      unsubscribeSelection();
    };
  }, [camera, keyboardNudgeInteraction, model, moveInteraction, resizeInteraction, selection]);

  return (
    <g data-selection-count="0" data-selection-overlay="bounds" display="none" ref={groupRef}>
      <rect className="selection-overlay__outline" />
      {RESIZE_HANDLES.map((handle) => (
        <rect className="selection-overlay__handle" data-resize-handle={handle} key={handle} />
      ))}
    </g>
  );
};
