import {
  DOCUMENT_COMMAND_TYPES,
  selectElementWorldBounds,
  type ElementId,
  type ProjectDocument,
  type SetElementFrameCommand,
  type WorldRect as ElementFrame,
} from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import {
  createViewportPoint,
  createWorldRect,
  type ViewportPoint,
  type ViewportRect,
  type WorldPoint,
  type WorldRect,
} from './viewport-transform';

export const RESIZE_HANDLES = Object.freeze([
  'northWest',
  'north',
  'northEast',
  'east',
  'southEast',
  'south',
  'southWest',
  'west',
] as const);

export type ResizeHandle = (typeof RESIZE_HANDLES)[number];

/** M6 fallback; M8 will supply per-control minima through ControlDefinition. */
export const RESIZE_INTERACTION_POLICY = Object.freeze({
  minimumHeightWorldUnits: 8,
  minimumWidthWorldUnits: 8,
  handleHitSizePixels: DESIGN_TOKENS.editor.selectionHandleHitSize,
  handleSizePixels: DESIGN_TOKENS.editor.selectionHandleSize,
});

export interface ResizeHandlePosition {
  readonly handle: ResizeHandle;
  readonly point: ViewportPoint;
}

export interface ResizeTargetCapture {
  readonly elementId: ElementId;
  /** Canonical local frame. Only this frame is committed. */
  readonly frame: ElementFrame;
  /** Derived once so nested parent origins never leak into persisted geometry. */
  readonly worldBounds: WorldRect;
}

export interface ResolvedResizeFrame {
  readonly frame: ElementFrame;
  readonly worldBounds: WorldRect;
}

const isCornerHandle = (handle: ResizeHandle): boolean =>
  handle === 'northWest' ||
  handle === 'northEast' ||
  handle === 'southEast' ||
  handle === 'southWest';

const movesWest = (handle: ResizeHandle): boolean =>
  handle === 'northWest' || handle === 'west' || handle === 'southWest';

const movesEast = (handle: ResizeHandle): boolean =>
  handle === 'northEast' || handle === 'east' || handle === 'southEast';

const movesNorth = (handle: ResizeHandle): boolean =>
  handle === 'northWest' || handle === 'north' || handle === 'northEast';

const movesSouth = (handle: ResizeHandle): boolean =>
  handle === 'southWest' || handle === 'south' || handle === 'southEast';

/** Clockwise handle centers derived from one viewport-space selection rectangle. */
export const getResizeHandlePositions = (bounds: ViewportRect): readonly ResizeHandlePosition[] => {
  const left = bounds.x;
  const centerX = bounds.x + bounds.width / 2;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const centerY = bounds.y + bounds.height / 2;
  const bottom = bounds.y + bounds.height;
  const points: Record<ResizeHandle, ViewportPoint> = {
    northWest: createViewportPoint(left, top),
    north: createViewportPoint(centerX, top),
    northEast: createViewportPoint(right, top),
    east: createViewportPoint(right, centerY),
    southEast: createViewportPoint(right, bottom),
    south: createViewportPoint(centerX, bottom),
    southWest: createViewportPoint(left, bottom),
    west: createViewportPoint(left, centerY),
  };
  return Object.freeze(
    RESIZE_HANDLES.map((handle) => Object.freeze({ handle, point: points[handle] })),
  );
};

/**
 * Fixed-screen handle hit testing. Overlapping zones choose the nearest
 * center, then a corner, then stable clockwise order so tiny shapes remain
 * deterministic at every zoom and device scale.
 */
export const hitTestResizeHandle = (
  point: ViewportPoint,
  bounds: ViewportRect,
): ResizeHandle | undefined => {
  const halfHitSize = RESIZE_INTERACTION_POLICY.handleHitSizePixels / 2;
  return getResizeHandlePositions(bounds)
    .map((position, index) => ({
      ...position,
      distanceSquared: (position.point.x - point.x) ** 2 + (position.point.y - point.y) ** 2,
      index,
    }))
    .filter(
      (position) =>
        Math.abs(position.point.x - point.x) <= halfHitSize &&
        Math.abs(position.point.y - point.y) <= halfHitSize,
    )
    .sort(
      (first, second) =>
        first.distanceSquared - second.distanceSquared ||
        Number(isCornerHandle(second.handle)) - Number(isCornerHandle(first.handle)) ||
        first.index - second.index,
    )[0]?.handle;
};

/** Captures one unlocked element and its derived world origin exactly once. */
export const captureResizeTarget = (
  document: ProjectDocument,
  elementId: ElementId,
): ResizeTargetCapture | undefined => {
  const element = document.elementsById[elementId];
  const worldBounds = selectElementWorldBounds(document, elementId);
  if (element === undefined || element.locked || worldBounds === undefined) {
    return undefined;
  }
  return Object.freeze({
    elementId,
    frame: Object.freeze({ ...element.frame }),
    worldBounds: createWorldRect(
      worldBounds.x,
      worldBounds.y,
      worldBounds.width,
      worldBounds.height,
    ),
  });
};

const resolveAspectLockedSize = (
  frame: ElementFrame,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
): readonly [number, number] => {
  const horizontalDirection = movesWest(handle) ? -1 : 1;
  const verticalDirection = movesNorth(handle) ? -1 : 1;
  const rawWidth = frame.width + horizontalDirection * deltaX;
  const rawHeight = frame.height + verticalDirection * deltaY;
  let scale: number;

  if (isCornerHandle(handle)) {
    // Project the pointer onto the immutable starting diagonal. This avoids
    // axis-switch jitter while keeping the opposite corner exactly anchored.
    scale =
      (rawWidth * frame.width + rawHeight * frame.height) / (frame.width ** 2 + frame.height ** 2);
  } else if (movesWest(handle) || movesEast(handle)) {
    scale = rawWidth / frame.width;
  } else {
    scale = rawHeight / frame.height;
  }

  const minimumScale = Math.max(
    RESIZE_INTERACTION_POLICY.minimumWidthWorldUnits / frame.width,
    RESIZE_INTERACTION_POLICY.minimumHeightWorldUnits / frame.height,
  );
  const clampedScale = Math.max(minimumScale, scale);
  return Object.freeze([frame.width * clampedScale, frame.height * clampedScale]);
};

const createResolvedResizeFrame = (
  capture: ResizeTargetCapture,
  handle: ResizeHandle,
  width: number,
  height: number,
  aspectLocked: boolean,
): ResolvedResizeFrame => {
  const frame = capture.frame;
  let x = movesWest(handle) ? frame.x + frame.width - width : frame.x;
  let y = movesNorth(handle) ? frame.y + frame.height - height : frame.y;
  if (aspectLocked && !movesNorth(handle) && !movesSouth(handle)) {
    y = frame.y + (frame.height - height) / 2;
  }
  if (aspectLocked && !movesWest(handle) && !movesEast(handle)) {
    x = frame.x + (frame.width - width) / 2;
  }

  const nextFrame = Object.freeze({ x, y, width, height });
  const parentWorldX = capture.worldBounds.x - frame.x;
  const parentWorldY = capture.worldBounds.y - frame.y;
  return Object.freeze({
    frame: nextFrame,
    worldBounds: createWorldRect(parentWorldX + x, parentWorldY + y, width, height),
  });
};

/** Resolves a Shift resize from one scale while retaining the documented anchor. */
export const resolveAspectLockedResizeScale = (
  capture: ResizeTargetCapture,
  handle: ResizeHandle,
  scale: number,
): ResolvedResizeFrame => {
  if (!Number.isFinite(scale)) {
    throw new RangeError('Resize scale must be finite.');
  }
  const minimumScale = Math.max(
    RESIZE_INTERACTION_POLICY.minimumWidthWorldUnits / capture.frame.width,
    RESIZE_INTERACTION_POLICY.minimumHeightWorldUnits / capture.frame.height,
  );
  const clampedScale = Math.max(minimumScale, scale);
  return createResolvedResizeFrame(
    capture,
    handle,
    capture.frame.width * clampedScale,
    capture.frame.height * clampedScale,
    true,
  );
};

/**
 * Recomputes from the immutable local frame and pointer start. West/east and
 * north/south handles retain the opposite edge; Shift also retains the
 * opposite-edge midpoint for edge handles while preserving the start ratio.
 */
export const resolveResizeFrame = (
  capture: ResizeTargetCapture,
  handle: ResizeHandle,
  startWorldPoint: WorldPoint,
  currentWorldPoint: WorldPoint,
  aspectLocked: boolean,
): ResolvedResizeFrame => {
  const frame = capture.frame;
  const deltaX = currentWorldPoint.x - startWorldPoint.x;
  const deltaY = currentWorldPoint.y - startWorldPoint.y;
  const horizontal = movesWest(handle) || movesEast(handle);
  const vertical = movesNorth(handle) || movesSouth(handle);

  let width = horizontal
    ? Math.max(
        RESIZE_INTERACTION_POLICY.minimumWidthWorldUnits,
        frame.width + (movesWest(handle) ? -deltaX : deltaX),
      )
    : frame.width;
  let height = vertical
    ? Math.max(
        RESIZE_INTERACTION_POLICY.minimumHeightWorldUnits,
        frame.height + (movesNorth(handle) ? -deltaY : deltaY),
      )
    : frame.height;

  if (aspectLocked) {
    [width, height] = resolveAspectLockedSize(frame, handle, deltaX, deltaY);
  }

  return createResolvedResizeFrame(capture, handle, width, height, aspectLocked);
};

export const createResizeCommand = (
  capture: ResizeTargetCapture,
  frame: ElementFrame,
): SetElementFrameCommand =>
  Object.freeze({
    type: DOCUMENT_COMMAND_TYPES.setElementFrame,
    elementId: capture.elementId,
    frame: Object.freeze({ ...frame }),
  });
