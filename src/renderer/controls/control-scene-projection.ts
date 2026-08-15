import type { ControlDefinition, ElementProperties } from '../../domain';
import type { WorldRect } from '../editor/viewport-transform';
import {
  createControlSceneMarkPath,
  createControlSceneOutlinePath,
  getControlScenePrimitiveBounds,
} from './control-scene-geometry';
import {
  calculateControlSceneTextLayout,
  type ControlSceneTextLayout,
} from './control-scene-text-layout';
import type { ControlTextMeasurementService } from './control-text-measurement';

export interface ControlSceneProjection {
  readonly bounds: WorldRect;
  readonly markPath: string;
  readonly outlinePath: string;
  readonly primitiveBounds: WorldRect;
  readonly textLayout: ControlSceneTextLayout | undefined;
}

export interface ControlSceneProjectionInput {
  readonly bounds: WorldRect;
  readonly definition: ControlDefinition;
  readonly identity: string;
  readonly properties: ElementProperties;
  readonly textMeasurementService: ControlTextMeasurementService | undefined;
}

/**
 * Pure presentation projection shared by thumbnails and future export. The
 * definition remains the only source for primitive, property, and text rules.
 */
export const createControlSceneProjection = ({
  bounds,
  definition,
  identity,
  properties,
  textMeasurementService,
}: ControlSceneProjectionInput): ControlSceneProjection =>
  Object.freeze({
    bounds,
    markPath: createControlSceneMarkPath(definition.type, bounds, identity, properties),
    outlinePath: createControlSceneOutlinePath(definition.type, bounds, identity),
    primitiveBounds: getControlScenePrimitiveBounds(definition.type, bounds),
    textLayout:
      textMeasurementService === undefined
        ? undefined
        : calculateControlSceneTextLayout(definition, bounds, properties, textMeasurementService),
  });
