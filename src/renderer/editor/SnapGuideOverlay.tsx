import { useLayoutEffect, useRef } from 'react';

import type { MoveInteraction } from './move-interaction';
import type { ResizeInteraction } from './resize-interaction';
import { SNAP_AXES, type SnapGuideDescriptor, type SnapGuideSegment } from './snap-engine';
import type { ViewportCameraStore } from './viewport-camera-store';
import {
  createWorldPoint,
  worldPointToViewport,
  type ViewportTransform,
} from './viewport-transform';

interface SnapGuideOverlayProps {
  readonly camera: ViewportCameraStore;
  readonly moveInteraction: MoveInteraction;
  readonly resizeInteraction?: ResizeInteraction;
}

const applyLineGuideGeometry = (
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

const projectSegment = (
  segment: SnapGuideSegment,
  axis: SnapGuideDescriptor['axis'],
  transform: ViewportTransform,
): string => {
  const start = worldPointToViewport(createWorldPoint(segment.startX, segment.startY), transform);
  const end = worldPointToViewport(createWorldPoint(segment.endX, segment.endY), transform);
  const horizontal = axis === 'x';
  const tickX = horizontal ? 0 : 3;
  const tickY = horizontal ? 3 : 0;
  return [
    `M ${String(start.x)} ${String(start.y)} L ${String(end.x)} ${String(end.y)}`,
    `M ${String(start.x - tickX)} ${String(start.y - tickY)} L ${String(start.x + tickX)} ${String(start.y + tickY)}`,
    `M ${String(end.x - tickX)} ${String(end.y - tickY)} L ${String(end.x + tickX)} ${String(end.y + tickY)}`,
  ].join(' ');
};

const applySpacingGuideGeometry = (
  path: SVGPathElement,
  guide: SnapGuideDescriptor,
  camera: ViewportCameraStore,
): void => {
  const segments = guide.segments;
  if (segments === undefined) {
    throw new Error('Equal-gap guide is missing its dimension segments.');
  }
  const transform = camera.getTransformSnapshot();
  path.setAttribute(
    'd',
    segments.map((segment) => projectSegment(segment, guide.axis, transform)).join(' '),
  );
  path.dataset.guideKind = guide.kind;
  path.dataset.guideSource = guide.sourceId;
  if (guide.gap !== undefined) {
    path.dataset.guideGap = String(guide.gap);
  }
  path.removeAttribute('display');
};

const hideGuideElement = (element: SVGElement): void => {
  element.setAttribute('display', 'none');
  delete element.dataset.guideGap;
  delete element.dataset.guideKind;
  delete element.dataset.guideSource;
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
    const lines = [...group.querySelectorAll<SVGLineElement>('[data-guide-axis]')];
    const paths = [...group.querySelectorAll<SVGPathElement>('[data-guide-spacing-axis]')];
    if (lines.length !== SNAP_AXES.length || paths.length !== SNAP_AXES.length) {
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
        const line = lines[index];
        const path = paths[index];
        if (line === undefined || path === undefined) {
          throw new Error('Snap guide overlay axis nodes are unavailable.');
        }
        const guide = guides.find((candidate) => candidate.axis === axis);
        if (guide === undefined) {
          hideGuideElement(line);
          hideGuideElement(path);
        } else if (guide.kind === 'equalGap') {
          hideGuideElement(line);
          applySpacingGuideGeometry(path, guide, camera);
        } else {
          hideGuideElement(path);
          applyLineGuideGeometry(line, guide, camera);
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
      {SNAP_AXES.map((axis) => (
        <path
          className="snap-guide-overlay__spacing"
          data-guide-spacing-axis={axis}
          key={`spacing-${axis}`}
        />
      ))}
    </g>
  );
};
