import type { ControlDefinition, ElementProperties } from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import type { WorldRect } from '../editor/viewport-transform';
import { getControlSceneTextX } from './control-scene-geometry';
import { resolveControlSceneIconSize } from './control-scene-icon-size';
import {
  roundControlTextWorldUnit,
  type ControlTextMeasurement,
  type ControlTextMeasurementService,
} from './control-text-measurement';

export interface ControlSceneTextLine {
  /** Canonical alphabetic baseline in world coordinates. */
  readonly baselineY: number;
  /** Per-row disabled styling; undefined inherits the control opacity. */
  readonly opacity?: number;
  /** Optional per-line hierarchy used by controls with primary and secondary copy. */
  readonly fontSize?: number;
  readonly fontWeight?: 'bold' | 'normal';
  readonly text: string;
  readonly x: number;
}

interface MultilineButtonMeasuredLine {
  readonly fontSize: number;
  readonly fontWeight: 'bold' | 'normal';
  readonly measurement: ControlTextMeasurement;
  readonly text: string;
}

export interface MultilineButtonTextMeasurement {
  readonly height: number;
  readonly lines: readonly MultilineButtonMeasuredLine[];
  readonly width: number;
}

/** The documented control uses a bold primary line and smaller supporting copy. */
export const measureMultilineButtonText = (
  value: string,
  fontSize: number,
  fontStyle: 'italic' | 'normal',
  bold: boolean,
  measurementService: ControlTextMeasurementService,
): MultilineButtonTextMeasurement => {
  const values = value.replace(/\r\n?|\n/gu, '\n').split('\n');
  const lines = values.map((line, index): MultilineButtonMeasuredLine => {
    const lineFontSize = index === 0 ? fontSize : Math.max(8, fontSize - 3);
    const fontWeight = index === 0 || bold ? 'bold' : 'normal';
    return Object.freeze({
      fontSize: lineFontSize,
      fontWeight,
      measurement: measurementService.measure({
        fontSize: lineFontSize,
        fontStyle,
        fontWeight,
        mode: 'single-line',
        text: line,
      }),
      text: line,
    });
  });
  return Object.freeze({
    height:
      lines.reduce((total, line) => total + line.measurement.height, 0) +
      Math.max(0, lines.length - 1) * DESIGN_TOKENS.space[1],
    lines: Object.freeze(lines),
    width: Math.max(0, ...lines.map((line) => line.measurement.width)),
  });
};

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
  const fontStyle =
    style.italicProperty !== null && properties[style.italicProperty] === true
      ? 'italic'
      : 'normal';
  const bold = style.boldProperty !== null && properties[style.boldProperty] === true;
  if (definition.scene.kind === 'multiline-button') {
    const measurement = measureMultilineButtonText(
      value,
      fontSize,
      fontStyle,
      bold,
      measurementService,
    );
    const hasIcon = definition.capabilities.icon && typeof properties.iconId === 'string';
    const iconSize = Math.min(
      DESIGN_TOKENS.control.iconSize,
      Math.max(0, bounds.height - DESIGN_TOKENS.space[2] * 2),
    );
    const x = roundControlTextWorldUnit(
      hasIcon
        ? bounds.x +
            (bounds.width - (iconSize + DESIGN_TOKENS.space[1] + measurement.width)) / 2 +
            iconSize +
            DESIGN_TOKENS.space[1] +
            measurement.width / 2
        : bounds.x + bounds.width / 2,
    );
    let lineTop = bounds.y + (bounds.height - measurement.height) / 2;
    const lines = measurement.lines.map((line) => {
      const baselineY = roundControlTextWorldUnit(
        lineTop + (line.measurement.baselineOffsets[0] ?? 0),
      );
      lineTop += line.measurement.height + DESIGN_TOKENS.space[1];
      return Object.freeze({
        baselineY,
        fontSize: line.fontSize,
        fontWeight: line.fontWeight,
        text: line.text,
        x,
      });
    });
    return Object.freeze({
      color: undefined,
      fontSize,
      fontStyle,
      fontWeight: bold ? 'bold' : 'normal',
      lines: Object.freeze(lines),
      textAnchor: 'middle' as const,
      textDecoration:
        style.underlineProperty !== null && properties[style.underlineProperty] === true
          ? ('underline' as const)
          : ('none' as const),
      width: measurement.width,
    });
  }
  const measurement = measurementService.measure({
    fontSize,
    fontStyle,
    fontWeight: bold ? 'bold' : 'normal',
    mode: text.mode,
    text: value,
  });
  if (
    measurement.lineCount !== measurement.lines.length ||
    measurement.lines.length !== measurement.baselineOffsets.length
  ) {
    throw new Error('Control text measurement returned inconsistent line geometry.');
  }

  // Field-set legends live on the frame's top edge. Every other text-bearing
  // primitive retains the shared vertically centered layout.
  const circleLabelPosition =
    definition.scene.kind === 'circle-button' ? properties.labelPosition : undefined;
  const layoutTop =
    definition.scene.kind === 'field-set'
      ? bounds.y
      : circleLabelPosition === 'below'
        ? bounds.y + bounds.height - measurement.height - DESIGN_TOKENS.space[2]
        : bounds.y + (bounds.height - measurement.height) / 2;
  const hasCenteredIcon =
    definition.capabilities.icon && alignment === 'center' && typeof properties.iconId === 'string';
  const iconSize = resolveControlSceneIconSize(definition, bounds, properties);
  const x = roundControlTextWorldUnit(
    circleLabelPosition === 'below'
      ? bounds.x + bounds.width / 2
      : circleLabelPosition === 'icon-right' && hasCenteredIcon
        ? bounds.x +
          (bounds.width - (measurement.width + DESIGN_TOKENS.space[1] + iconSize)) / 2 +
          measurement.width / 2
        : hasCenteredIcon
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
    fontStyle: fontStyle,
    fontWeight: bold ? 'bold' : 'normal',
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
