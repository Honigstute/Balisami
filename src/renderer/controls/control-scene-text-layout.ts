import type { ControlDefinition, ElementProperties } from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import type { WorldRect } from '../editor/viewport-transform';
import { getControlSceneTextX } from './control-scene-geometry';
import {
  roundControlTextWorldUnit,
  type ControlTextMeasurementService,
} from './control-text-measurement';

export interface ControlSceneTextLine {
  /** Canonical alphabetic baseline in world coordinates. */
  readonly baselineY: number;
  /** Per-row disabled styling; undefined inherits the control opacity. */
  readonly opacity?: number;
  readonly text: string;
  readonly x: number;
}

export interface ControlSceneTextLayout {
  readonly color: string | undefined;
  readonly fontSize: number;
  readonly fontStyle: 'italic' | 'normal';
  readonly fontWeight: 'bold' | 'normal';
  readonly lines: readonly ControlSceneTextLine[];
  readonly textAnchor: 'end' | 'middle' | 'start';
  readonly textDecoration: 'none' | 'underline';
  readonly width: number;
}

/**
 * Projects registry-owned text into canonical world-space baselines. Scene SVG,
 * later baseline snapping, thumbnails, and export can consume the same result
 * instead of recreating font alignment with platform-specific DOM heuristics.
 */
export const calculateControlSceneTextLayout = (
  definition: ControlDefinition,
  bounds: WorldRect,
  properties: ElementProperties,
  measurementService: ControlTextMeasurementService,
  displayValue?: string,
): ControlSceneTextLayout | undefined => {
  const text = definition.capabilities.text;
  if (text === null) {
    return undefined;
  }
  const value = displayValue ?? properties[text.property];
  if (typeof value !== 'string') {
    return undefined;
  }
  const style = text.style;
  const fontSizeValue =
    style.fontSizeProperty === null ? undefined : properties[style.fontSizeProperty];
  const fontSize = typeof fontSizeValue === 'number' ? fontSizeValue : text.fontSize;
  const alignmentValue =
    style.alignmentProperty === null ? undefined : properties[style.alignmentProperty];
  const alignment =
    alignmentValue === 'center' || alignmentValue === 'end' || alignmentValue === 'start'
      ? alignmentValue
      : text.alignment;
  const measurement = measurementService.measure({
    fontSize,
    fontStyle:
      style.italicProperty !== null && properties[style.italicProperty] === true
        ? 'italic'
        : 'normal',
    fontWeight:
      style.boldProperty !== null && properties[style.boldProperty] === true ? 'bold' : 'normal',
    mode: text.mode,
    text: value,
  });
  if (
    measurement.lineCount !== measurement.lines.length ||
    measurement.lines.length !== measurement.baselineOffsets.length
  ) {
    throw new Error('Control text measurement returned inconsistent line geometry.');
  }

  const layoutTop = bounds.y + (bounds.height - measurement.height) / 2;
  const hasCenteredIcon =
    definition.capabilities.icon && alignment === 'center' && typeof properties.iconId === 'string';
  const iconSize = Math.min(
    DESIGN_TOKENS.control.iconSize,
    Math.max(0, bounds.height - DESIGN_TOKENS.space[2] * 2),
  );
  const x = roundControlTextWorldUnit(
    hasCenteredIcon
      ? bounds.x +
          (bounds.width - (iconSize + DESIGN_TOKENS.space[1] + measurement.width)) / 2 +
          iconSize +
          DESIGN_TOKENS.space[1] +
          measurement.width / 2
      : getControlSceneTextX(definition, bounds, properties, alignment),
  );
  const colorValue = style.colorProperty === null ? undefined : properties[style.colorProperty];
  return Object.freeze({
    color: typeof colorValue === 'string' && colorValue !== 'default' ? colorValue : undefined,
    fontSize,
    fontStyle:
      style.italicProperty !== null && properties[style.italicProperty] === true
        ? 'italic'
        : 'normal',
    fontWeight:
      style.boldProperty !== null && properties[style.boldProperty] === true ? 'bold' : 'normal',
    lines: Object.freeze(
      measurement.lines.map((line, index) =>
        Object.freeze({
          baselineY: roundControlTextWorldUnit(
            layoutTop + (measurement.baselineOffsets[index] ?? 0),
          ),
          text: line,
          x,
        }),
      ),
    ),
    textAnchor: alignment === 'center' ? 'middle' : alignment,
    textDecoration:
      style.underlineProperty !== null && properties[style.underlineProperty] === true
        ? 'underline'
        : 'none',
    width: measurement.width,
  });
};
