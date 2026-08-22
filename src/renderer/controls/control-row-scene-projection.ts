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
  readonly labelBounds: WorldRect;
  readonly labelX: number;
  readonly baselineY: number;
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
  if (rows.layout === 'segments') {
    const cellWidth = bounds.width / parsed.length;
    return Object.freeze(
      parsed.map((row, index) => {
        const binding = rowData.bindings[index]!;
        const labelWidth = textMeasurementService.measure({ ...request, text: row.label }).width;
        const cellX = roundControlTextWorldUnit(bounds.x + cellWidth * index);
        const cellRight =
          index === parsed.length - 1
            ? bounds.x + bounds.width
            : roundControlTextWorldUnit(bounds.x + cellWidth * (index + 1));
        const labelX = roundControlTextWorldUnit((cellX + cellRight) / 2);
        return Object.freeze({
          bounds: createWorldRect(cellX, bounds.y, cellRight - cellX, bounds.height),
          id: binding.id,
          label: row.label,
          labelBounds: createWorldRect(
            roundControlTextWorldUnit(labelX - labelWidth / 2),
            bounds.y,
            labelWidth,
            bounds.height,
          ),
          labelX,
          baselineY: line.baselineY,
          link: binding.link,
        });
      }),
    );
  }
  const textLeft =
    textLayout.textAnchor === 'middle'
      ? line.x - textLayout.width / 2
      : textLayout.textAnchor === 'end'
        ? line.x - textLayout.width
        : line.x;
  let cursor = 0;
  const projected = parsed.map((row, index) => {
    const sourceIndex = source.indexOf(row.label, cursor);
    if (sourceIndex < cursor) {
      throw new Error('Parsed control rows no longer match their canonical text source.');
    }
    const prefix = source.slice(0, sourceIndex);
    cursor = sourceIndex + row.label.length;
    const prefixWidth = textMeasurementService.measure({ ...request, text: prefix }).width;
    const labelWidth = textMeasurementService.measure({ ...request, text: row.label }).width;
    const binding = rowData.bindings[index]!;
    const labelBounds = createWorldRect(
      roundControlTextWorldUnit(textLeft + prefixWidth),
      bounds.y,
      labelWidth,
      bounds.height,
    );
    return Object.freeze({
      bounds: labelBounds,
      id: binding.id,
      label: row.label,
      labelBounds,
      labelX: labelBounds.x,
      baselineY: line.baselineY,
      link: binding.link,
    });
  });
  return Object.freeze(projected);
};
