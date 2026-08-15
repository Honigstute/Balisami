import { useLayoutEffect, useRef } from 'react';

import type { MoveInteraction } from './move-interaction';
import type { ResizeInteraction } from './resize-interaction';
import { SNAP_AXES, type SnapGuideDescriptor } from './snap-engine';
import type { ViewportCameraStore } from './viewport-camera-store';
import { createWorldPoint, worldPointToViewport } from './viewport-transform';

interface SnapGuideOverlayProps {
  readonly camera: ViewportCameraStore;
  readonly moveInteraction: MoveInteraction;
  readonly resizeInteraction?: ResizeInteraction;
}

const applyGuideGeometry = (
  line: SVGLineElement,
  guide: SnapGuideDescriptor,
  camera: ViewportCameraStore,
): void => {
  const transform = camera.getTransformSnapshot();
  const first = worldPointToViewport(
    createWorldPoint(
      guide.axis === 'x' ? guide.position : guide.start,
      guide.axis === 'x' ? guide.start : guide.position,
    ),
    transform,
  );
  const second = worldPointToViewport(
    createWorldPoint(
      guide.axis === 'x' ? guide.position : guide.end,
      guide.axis === 'x' ? guide.end : guide.position,
    ),
    transform,
  );
  line.setAttribute('x1', String(first.x));
  line.setAttribute('y1', String(first.y));
  line.setAttribute('x2', String(second.x));
  line.setAttribute('y2', String(second.y));
  line.dataset.guideKind = guide.kind;
  line.dataset.guideSource = guide.sourceId;
  line.removeAttribute('display');
};

/** Fixed-screen smart guides; camera and pointer frames never enter React. */
export const SnapGuideOverlay = ({
  camera,
  moveInteraction,
  resizeInteraction,
}: SnapGuideOverlayProps) => {
  const groupRef = useRef<SVGGElement | null>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (group === null) {
      return;
    }
    const lines = [...group.children];
    if (lines.length !== SNAP_AXES.length || lines.some((line) => line.localName !== 'line')) {
      throw new Error('Snap guide overlay structure was changed unexpectedly.');
    }

    const apply = (): void => {
      const snapshot = moveInteraction.getSnapshot();
      const resizeSnapshot = resizeInteraction?.getSnapshot();
      const guides =
        resizeSnapshot?.kind === 'resizing'
          ? resizeSnapshot.guides
          : snapshot.kind === 'moving'
            ? snapshot.guides
            : [];
      for (const [index, axis] of SNAP_AXES.entries()) {
        const line = lines[index] as SVGLineElement;
        const guide = guides.find((candidate) => candidate.axis === axis);
        if (guide === undefined) {
          line.setAttribute('display', 'none');
          delete line.dataset.guideKind;
          delete line.dataset.guideSource;
        } else {
          applyGuideGeometry(line, guide, camera);
        }
      }
      group.dataset.guideCount = String(guides.length);
      if (guides.length === 0) {
        group.setAttribute('display', 'none');
      } else {
        group.removeAttribute('display');
      }
    };

    apply();
    const unsubscribeCamera = camera.subscribe(apply);
    const unsubscribeMove = moveInteraction.subscribe(apply);
    const unsubscribeResize = resizeInteraction?.subscribe(apply);
    return () => {
      unsubscribeCamera();
      unsubscribeMove();
      unsubscribeResize?.();
    };
  }, [camera, moveInteraction, resizeInteraction]);

  return (
    <g data-guide-count="0" data-snap-guide-overlay="gesture-guides" display="none" ref={groupRef}>
      {SNAP_AXES.map((axis) => (
        <line className="snap-guide-overlay__line" data-guide-axis={axis} key={axis} />
      ))}
    </g>
  );
};
