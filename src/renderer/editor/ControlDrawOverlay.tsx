import { useLayoutEffect, useRef } from 'react';

import type { ControlDrawInteraction } from './control-draw-interaction';
import type { ViewportCameraStore } from './viewport-camera-store';
import { worldRectToViewport } from './viewport-transform';

interface ControlDrawOverlayProps {
  readonly camera: ViewportCameraStore;
  readonly interaction: ControlDrawInteraction;
}

/** Imperative viewport-space preview; pointer motion never enters React. */
export const ControlDrawOverlay = ({ camera, interaction }: ControlDrawOverlayProps) => {
  const groupRef = useRef<SVGGElement | null>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    const rectangle = group?.children[0];
    if (group === null || rectangle?.localName !== 'rect') {
      return;
    }
    const apply = (): void => {
      const snapshot = interaction.getSnapshot();
      if (snapshot.kind !== 'drawing') {
        group.setAttribute('display', 'none');
        group.dataset.controlDrawType = 'none';
        return;
      }
      const frame = worldRectToViewport(snapshot.frame, camera.getTransformSnapshot());
      rectangle.setAttribute('x', String(frame.x));
      rectangle.setAttribute('y', String(frame.y));
      rectangle.setAttribute('width', String(frame.width));
      rectangle.setAttribute('height', String(frame.height));
      group.removeAttribute('display');
      group.dataset.controlDrawType = snapshot.controlType;
    };

    apply();
    const unsubscribeInteraction = interaction.subscribe(apply);
    const unsubscribeCamera = camera.subscribe(apply);
    return () => {
      unsubscribeCamera();
      unsubscribeInteraction();
    };
  }, [camera, interaction]);

  return (
    <g
      data-control-draw-overlay="preview"
      data-control-draw-type="none"
      display="none"
      ref={groupRef}
    >
      <rect className="control-draw-overlay__frame" />
    </g>
  );
};
