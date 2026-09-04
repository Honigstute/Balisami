import type { ControlDefinition, ControlHitShapePoint } from './control-definition';
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

export interface ControlHitSegment {
  readonly end: ControlHitShapePoint;
  readonly start: ControlHitShapePoint;
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
  segment: ControlHitSegment,
  tolerance: number,
  bounds: ControlHitBounds,
  point: ControlHitPoint,
): boolean => {
  const startX = bounds.x + segment.start.x * bounds.width;
  const startY = bounds.y + segment.start.y * bounds.height;
  const endX = bounds.x + segment.end.x * bounds.width;
  const endY = bounds.y + segment.end.y * bounds.height;
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
  return Math.hypot(point.x - nearestX, point.y - nearestY) <= tolerance;
};

/**
 * Resolves the definition-owned normalized line geometry used by both scene
 * projection and exact hit testing. The unresolved Arrow routing enum remains
 * visual (`visual-1`/`visual-2`) until product names are confirmed.
 */
export const getControlHitSegments = (
  definition: ControlDefinition,
  properties: ElementProperties,
): readonly ControlHitSegment[] => {
  const shape = definition.scene.hitShape;
  if (shape.kind !== 'line') {
    return Object.freeze([]);
  }
  if (definition.scene.kind === 'arrow' && properties.routing === 'visual-2') {
    const corner = Object.freeze({ x: shape.end.x, y: shape.start.y });
    return Object.freeze([
      Object.freeze({ end: corner, start: shape.start }),
      Object.freeze({ end: shape.end, start: corner }),
    ]);
  }
  return Object.freeze([Object.freeze({ end: shape.end, start: shape.start })]);
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
    return getControlHitSegments(definition, properties).some((segment) =>
      containsLine(segment, shape.tolerance, bounds, point),
    );
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

/** Resolves optional checkbox/radio state without renderer-side control branching. */
export const getControlAccessibleChecked = (
  definition: ControlDefinition,
  properties: ElementProperties,
): boolean | undefined => {
  const property = definition.accessibility.checkedProperty;
  if (property === null) return undefined;
  const value = properties[property];
  return definition.accessibility.checkedValues.some((checkedValue) => checkedValue === value);
};
