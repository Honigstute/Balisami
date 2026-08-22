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
  readonly text: string;
  readonly x: number;
}

export interface ControlSceneTextLayout {
  readonly fontSize: number;
  readonly lines: readonly ControlSceneTextLine[];
  readonly textAnchor: 'middle' | 'start';
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
): ControlSceneTextLayout | undefined => {
  const text = definition.capabilities.text;
  if (text === null) {
    return undefined;
  }
  const value = properties[text.property];
  if (typeof value !== 'string') {
    return undefined;
  }
  const measurement = measurementService.measure({
    fontSize: text.fontSize,
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
    definition.capabilities.icon &&
    text.alignment === 'center' &&
    typeof properties.iconId === 'string';
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
      : getControlSceneTextX(definition, bounds, properties),
  );
  return Object.freeze({
    fontSize: text.fontSize,
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
    textAnchor: text.alignment === 'center' ? 'middle' : 'start',
    width: measurement.width,
  });
};
