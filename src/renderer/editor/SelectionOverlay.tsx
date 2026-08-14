import { useLayoutEffect, useRef } from 'react';

import type { ElementId } from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import type { DocumentSceneModel } from './document-scene-model';
import type { SelectionStore } from './selection-store';
import type { ViewportCameraStore } from './viewport-camera-store';
import { createWorldRect, worldRectToViewport, type WorldRect } from './viewport-transform';

interface SelectionOverlayProps {
  readonly camera: ViewportCameraStore;
  readonly model: DocumentSceneModel;
  readonly selection: SelectionStore;
}

const HANDLE_SIZE = DESIGN_TOKENS.space[2];

const getSceneSelectionWorldBounds = (
  model: DocumentSceneModel,
  selectedIds: readonly ElementId[],
): WorldRect | undefined => {
  const firstItem = selectedIds.flatMap((id) => {
    const item = model.getItem(id);
    return item === undefined ? [] : [item];
  })[0];
  if (firstItem === undefined) {
    return undefined;
  }

  let left = firstItem.bounds.x;
  let top = firstItem.bounds.y;
  let right = firstItem.bounds.x + firstItem.bounds.width;
  let bottom = firstItem.bounds.y + firstItem.bounds.height;
  for (const id of selectedIds) {
    const item = model.getItem(id);
    if (item === undefined || item.id === firstItem.id) {
      continue;
    }
    left = Math.min(left, item.bounds.x);
    top = Math.min(top, item.bounds.y);
    right = Math.max(right, item.bounds.x + item.bounds.width);
    bottom = Math.max(bottom, item.bounds.y + item.bounds.height);
  }
  return createWorldRect(left, top, right - left, bottom - top);
};

/** Fixed-screen selection geometry; camera publications never enter React. */
export const SelectionOverlay = ({ camera, model, selection }: SelectionOverlayProps) => {
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
      const worldBounds = getSceneSelectionWorldBounds(model, selection.getSnapshot().selectedIds);
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
      const halfHandle = HANDLE_SIZE / 2;
      const corners = [
        [bounds.x, bounds.y],
        [bounds.x + bounds.width, bounds.y],
        [bounds.x, bounds.y + bounds.height],
        [bounds.x + bounds.width, bounds.y + bounds.height],
      ] as const;
      handles.forEach((handle, index) => {
        const corner = corners[index];
        if (corner === undefined) {
          return;
        }
        handle.setAttribute('x', String(corner[0] - halfHandle));
        handle.setAttribute('y', String(corner[1] - halfHandle));
        handle.setAttribute('width', String(HANDLE_SIZE));
        handle.setAttribute('height', String(HANDLE_SIZE));
      });
      group.removeAttribute('display');
      group.dataset.selectionCount = String(selection.getSnapshot().selectedIds.length);
    };

    apply();
    const unsubscribeCamera = camera.subscribe(apply);
    const unsubscribeModel = model.subscribe(apply);
    const unsubscribeSelection = selection.subscribe(apply);
    return () => {
      unsubscribeCamera();
      unsubscribeModel();
      unsubscribeSelection();
    };
  }, [camera, model, selection]);

  return (
    <g data-selection-count="0" data-selection-overlay="bounds" display="none" ref={groupRef}>
      <rect className="selection-overlay__outline" />
      <rect className="selection-overlay__handle" />
      <rect className="selection-overlay__handle" />
      <rect className="selection-overlay__handle" />
      <rect className="selection-overlay__handle" />
    </g>
  );
};
