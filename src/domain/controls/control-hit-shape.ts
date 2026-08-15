import type { ControlDefinition, ControlHitShape } from './control-definition';
import type { ElementProperties } from '../document/schema';

export interface ControlHitBounds {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface ControlHitPoint {
  readonly x: number;
  readonly y: number;
}

export const getControlHitShapePadding = (definition: ControlDefinition): number =>
  definition.scene.hitShape.kind === 'line' ? definition.scene.hitShape.tolerance : 0;

const containsBounds = (bounds: ControlHitBounds, point: ControlHitPoint): boolean =>
  point.x >= bounds.x &&
  point.x <= bounds.x + bounds.width &&
  point.y >= bounds.y &&
  point.y <= bounds.y + bounds.height;

const containsEllipse = (bounds: ControlHitBounds, point: ControlHitPoint): boolean => {
  const radiusX = bounds.width / 2;
  const radiusY = bounds.height / 2;
  const normalizedX = (point.x - (bounds.x + radiusX)) / radiusX;
  const normalizedY = (point.y - (bounds.y + radiusY)) / radiusY;
  return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
};

const containsLine = (
  shape: Extract<ControlHitShape, { readonly kind: 'line' }>,
  bounds: ControlHitBounds,
  point: ControlHitPoint,
): boolean => {
  const startX = bounds.x + shape.start.x * bounds.width;
  const startY = bounds.y + shape.start.y * bounds.height;
  const endX = bounds.x + shape.end.x * bounds.width;
  const endY = bounds.y + shape.end.y * bounds.height;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const projection =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - startX) * deltaX + (point.y - startY) * deltaY) / lengthSquared),
        );
  const nearestX = startX + projection * deltaX;
  const nearestY = startY + projection * deltaY;
  return Math.hypot(point.x - nearestX, point.y - nearestY) <= shape.tolerance;
};

/**
 * Exact hit test owned by the control definition. The spatial index remains a
 * disposable AABB broad phase; it must never be treated as final geometry.
 * `properties` is reserved for future property-driven shapes such as Arrow.
 */
export const containsControlHitPoint = (
  definition: ControlDefinition,
  bounds: ControlHitBounds,
  properties: ElementProperties,
  point: ControlHitPoint,
): boolean => {
  void properties;
  const shape = definition.scene.hitShape;
  // A line's tolerance intentionally extends beyond its raw frame. The scene
  // model expands its AABB broad-phase query by the same definition-owned value.
  if (shape.kind === 'line') {
    return containsLine(shape, bounds, point);
  }
  if (!containsBounds(bounds, point)) {
    return false;
  }
  if (shape.kind === 'ellipse') {
    return containsEllipse(bounds, point);
  }
  return true;
};

/** Resolves a stable accessible name without renderer-side control branching. */
export const getControlAccessibleName = (
  definition: ControlDefinition,
  properties: ElementProperties,
): string => {
  const property = definition.accessibility.nameProperty;
  const candidate = property === null ? undefined : properties[property];
  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate
    : definition.accessibility.fallbackLabel;
};
