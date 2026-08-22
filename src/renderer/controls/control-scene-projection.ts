import type { ControlDefinition, ElementProperties } from '../../domain';
import type { WorldRect } from '../editor/viewport-transform';
import {
  createControlSceneMarkPath,
  createControlSceneOutlinePath,
  createControlSceneScrollbarPath,
  getControlScenePrimitiveBounds,
} from './control-scene-geometry';
import {
  calculateControlSceneTextLayout,
  type ControlSceneTextLayout,
} from './control-scene-text-layout';
import type { ControlTextMeasurementService } from './control-text-measurement';
import {
  createControlSceneIconProjection,
  type ControlSceneIconProjection,
} from './control-scene-icon';

export interface ControlSceneProjection {
  readonly borderVisible: boolean;
  readonly bounds: WorldRect;
  readonly disabled: boolean;
  readonly fillColor: string | undefined;
  readonly icon: ControlSceneIconProjection | undefined;
  readonly markPath: string;
  readonly outlinePath: string;
  readonly primitiveBounds: WorldRect;
  readonly opacity: number | undefined;
  readonly strokeColor: string | undefined;
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
}: ControlSceneProjectionInput): ControlSceneProjection => {
  const style = definition.scene.style;
  const resolveColor = (property: string | null | undefined): string | undefined => {
    const value = property === null || property === undefined ? undefined : properties[property];
    return typeof value === 'string' && value !== 'default' ? value : undefined;
  };
  const borderMode =
    style?.borderModeProperty === null || style?.borderModeProperty === undefined
      ? undefined
      : properties[style.borderModeProperty];
  const borderVisibility =
    style?.borderVisibilityProperty === null || style?.borderVisibilityProperty === undefined
      ? undefined
      : properties[style.borderVisibilityProperty];
  const legacyColor = properties.color ?? properties.borderColor;
  const fallbackColor =
    typeof legacyColor === 'string' && legacyColor !== 'default' ? legacyColor : undefined;
  const opacityValue =
    style?.opacityProperty === null || style?.opacityProperty === undefined
      ? properties.opacity
      : properties[style.opacityProperty];
  const stateValue = style?.state === undefined ? undefined : properties[style.state.property];
  const disabled =
    typeof stateValue === 'string' && style?.state?.disabledValues.includes(stateValue) === true;
  const scrollbarVisible =
    style?.scrollbarVisibilityProperty !== null &&
    style?.scrollbarVisibilityProperty !== undefined &&
    properties[style.scrollbarVisibilityProperty] === true;
  const textLayout =
    textMeasurementService === undefined
      ? undefined
      : calculateControlSceneTextLayout(definition, bounds, properties, textMeasurementService);
  return Object.freeze({
    borderVisible:
      borderVisibility === false ||
      (typeof borderMode === 'string' && style?.borderHiddenValues.includes(borderMode) === true)
        ? false
        : true,
    bounds,
    disabled,
    fillColor:
      style === undefined
        ? definition.scene.colorTarget === 'fill'
          ? fallbackColor
          : undefined
        : resolveColor(style.fillColorProperty),
    icon: createControlSceneIconProjection(definition, bounds, properties, textLayout),
    markPath: [
      createControlSceneMarkPath(definition.type, bounds, identity, properties),
      ...(scrollbarVisible ? [createControlSceneScrollbarPath(bounds, identity)] : []),
    ]
      .filter((path) => path.length > 0)
      .join(' '),
    outlinePath: createControlSceneOutlinePath(definition.type, bounds, identity, properties),
    opacity:
      typeof opacityValue === 'number'
        ? opacityValue * (disabled ? (style?.state?.disabledOpacity ?? 1) : 1)
        : disabled
          ? style?.state?.disabledOpacity
          : undefined,
    primitiveBounds: getControlScenePrimitiveBounds(definition.type, bounds),
    strokeColor:
      style === undefined
        ? definition.scene.colorTarget === 'stroke'
          ? fallbackColor
          : undefined
        : resolveColor(style.strokeColorProperty),
    textLayout,
  });
};
