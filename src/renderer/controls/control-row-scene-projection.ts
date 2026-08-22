import {
  parseControlRows,
  type ControlDefinition,
  type ElementProperties,
  type ElementRowData,
} from '../../domain';
import { createWorldRect, type WorldRect } from '../editor/viewport-transform';
import type { ControlSceneTextLayout } from './control-scene-text-layout';
import {
  roundControlTextWorldUnit,
  type ControlTextMeasurementService,
} from './control-text-measurement';

export interface ControlRowSceneProjection {
  readonly bounds: WorldRect;
  readonly id: string;
  readonly label: string;
  readonly link: ElementRowData['bindings'][number]['link'];
}

/** Exact row spans derived from the same bundled-font authority as rendered text. */
export const createControlRowSceneProjections = (
  definition: ControlDefinition,
  properties: ElementProperties,
  rowData: ElementRowData,
  textLayout: ControlSceneTextLayout | undefined,
  textMeasurementService: ControlTextMeasurementService | undefined,
  bounds: WorldRect,
): readonly ControlRowSceneProjection[] => {
  const rows = definition.rows;
  if (
    rows === null ||
    textLayout === undefined ||
    textMeasurementService === undefined ||
    textLayout.lines.length !== 1
  ) {
    return Object.freeze([]);
  }
  const parsed = parseControlRows(rows, properties);
  if (parsed === undefined || parsed.length !== rowData.bindings.length) {
    return Object.freeze([]);
  }
  const source = properties[rows.property];
  if (typeof source !== 'string') return Object.freeze([]);
  const request = {
    fontSize: textLayout.fontSize,
    fontStyle: textLayout.fontStyle,
    fontWeight: textLayout.fontWeight,
    mode: 'single-line' as const,
  };
  const line = textLayout.lines[0]!;
  const textLeft =
    textLayout.textAnchor === 'middle'
      ? line.x - textLayout.width / 2
      : textLayout.textAnchor === 'end'
        ? line.x - textLayout.width
        : line.x;
  let cursor = 0;
  return Object.freeze(
    parsed.map((row, index) => {
      const sourceIndex = source.indexOf(row.label, cursor);
      if (sourceIndex < cursor) {
        throw new Error('Parsed control rows no longer match their canonical text source.');
      }
      const prefix = source.slice(0, sourceIndex);
      cursor = sourceIndex + row.label.length;
      const prefixWidth = textMeasurementService.measure({ ...request, text: prefix }).width;
      const labelWidth = textMeasurementService.measure({ ...request, text: row.label }).width;
      const binding = rowData.bindings[index]!;
      return Object.freeze({
        bounds: createWorldRect(
          roundControlTextWorldUnit(textLeft + prefixWidth),
          bounds.y,
          labelWidth,
          bounds.height,
        ),
        id: binding.id,
        label: row.label,
        link: binding.link,
      });
    }),
  );
};
