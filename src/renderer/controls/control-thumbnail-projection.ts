import {
  ElementIdSchema,
  createInitialControlRowState,
  type ControlDefinition,
  type ElementProperties,
} from '../../domain';
import { createWorldRect, type WorldRect } from '../editor/viewport-transform';
import {
  createControlSceneProjection,
  type ControlSceneProjection,
} from './control-scene-projection';
import type { ControlTextMeasurementService } from './control-text-measurement';

export const CONTROL_THUMBNAIL_PROJECTION_POLICY = Object.freeze({
  /** Keeps non-scaling sketch strokes clear of the fixed SVG slot edge. */
  framePaddingRatio: 0.04,
});

export interface ControlThumbnailProjection extends ControlSceneProjection {
  readonly viewBox: WorldRect;
}

/**
 * Derives a stable palette preview from registered defaults and canonical scene
 * geometry. Thumbnail metadata selects the behavior but never repeats content.
 */
export const createControlThumbnailProjection = (
  definition: ControlDefinition,
  textMeasurementService?: ControlTextMeasurementService,
  properties: ElementProperties = definition.defaultProperties,
  identity: string = definition.type,
): ControlThumbnailProjection | undefined => {
  if (definition.thumbnail.kind === 'none') {
    return undefined;
  }
  const bounds = createWorldRect(0, 0, definition.defaultSize.width, definition.defaultSize.height);
  const padding =
    Math.min(definition.defaultSize.width, definition.defaultSize.height) *
    CONTROL_THUMBNAIL_PROJECTION_POLICY.framePaddingRatio;
  const thumbnailElementId = ElementIdSchema.parse(
    `element_thumbnail_${definition.type.replaceAll('.', '_')}`,
  );
  const rowState = createInitialControlRowState(definition, thumbnailElementId, properties);
  if (rowState === undefined) return undefined;
  const scene = createControlSceneProjection({
    bounds,
    definition,
    identity: `control-thumbnail:${identity}`,
    properties: rowState.properties,
    rowData: rowState.rowData,
    textMeasurementService,
  });
  return Object.freeze({
    ...scene,
    viewBox: createWorldRect(
      bounds.x - padding,
      bounds.y - padding,
      bounds.width + padding * 2,
      bounds.height + padding * 2,
    ),
  });
};
