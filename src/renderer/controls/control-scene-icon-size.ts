import type { ControlDefinition, ElementProperties } from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import type { WorldRect } from '../editor/viewport-transform';

export const CONTROL_ICON_SIZE_BY_PRESET = Object.freeze({
  xs: 8,
  s: 12,
  m: 16,
  l: 24,
  xl: 32,
  xxl: 48,
});

/** Resolves definition-owned icon presets and keeps the result inside dense bounds. */
export const resolveControlSceneIconSize = (
  definition: ControlDefinition,
  bounds: WorldRect,
  properties: ElementProperties,
): number => {
  const iconSizeProperty = definition.scene.style?.iconSizeProperty;
  const iconSizeValue =
    iconSizeProperty === null || iconSizeProperty === undefined
      ? undefined
      : properties[iconSizeProperty];
  const requestedSize =
    typeof iconSizeValue === 'string' && iconSizeValue in CONTROL_ICON_SIZE_BY_PRESET
      ? CONTROL_ICON_SIZE_BY_PRESET[iconSizeValue as keyof typeof CONTROL_ICON_SIZE_BY_PRESET]
      : DESIGN_TOKENS.control.iconSize;
  const inset = DESIGN_TOKENS.space[2] * 2;
  return Math.min(
    requestedSize,
    Math.max(0, bounds.width - inset),
    Math.max(0, bounds.height - inset),
  );
};
