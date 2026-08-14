import type { WorldSpatialIndex } from './spatial-index';
import {
  createViewportRect,
  createWorldRect,
  viewportRectToWorld,
  type ViewportSize,
  type ViewportTransform,
  type WorldRect,
} from './viewport-transform';

export const VISIBLE_WORLD_POLICY = Object.freeze({
  defaultOverscanPixels: 96,
});

/** Derives transient visible world bounds; this value is never persisted. */
export const getVisibleWorldRange = (
  transform: ViewportTransform,
  viewport: ViewportSize,
  overscanPixels: number = VISIBLE_WORLD_POLICY.defaultOverscanPixels,
): WorldRect => {
  if (!Number.isFinite(overscanPixels) || overscanPixels < 0) {
    throw new RangeError('Visible world overscan must be finite and non-negative.');
  }
  const visible = viewportRectToWorld(
    createViewportRect(0, 0, viewport.width, viewport.height),
    transform,
  );
  const worldOverscan = overscanPixels / transform.zoom;
  return createWorldRect(
    visible.x - worldOverscan,
    visible.y - worldOverscan,
    visible.width + worldOverscan * 2,
    visible.height + worldOverscan * 2,
  );
};

export const queryVisibleWorldItems = <Id extends string>(
  index: WorldSpatialIndex<Id>,
  transform: ViewportTransform,
  viewport: ViewportSize,
  overscanPixels: number = VISIBLE_WORLD_POLICY.defaultOverscanPixels,
): readonly Id[] => index.query(getVisibleWorldRange(transform, viewport, overscanPixels));
