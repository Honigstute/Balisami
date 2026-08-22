import {
  parseControlRows,
  type ControlDefinition,
  type ElementProperties,
  type ElementRowData,
} from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
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
  readonly disabled: boolean;
  readonly link: ElementRowData['bindings'][number]['link'];
  readonly marker: Readonly<{
    readonly fillPath: string;
    readonly strokePath: string;
  }> | null;
}

const createCirclePath = (centerX: number, centerY: number, radius: number): string =>
  [
    `M ${String(centerX - radius)} ${String(centerY)}`,
    `A ${String(radius)} ${String(radius)} 0 1 0 ${String(centerX + radius)} ${String(centerY)}`,
    `A ${String(radius)} ${String(radius)} 0 1 0 ${String(centerX - radius)} ${String(centerY)}`,
  ].join(' ');

const createRowMarkerProjection = (
  kind: 'checkbox' | 'radio',
  state: 'indeterminate' | 'selected' | 'unchecked',
  rowBounds: WorldRect,
): NonNullable<ControlRowSceneProjection['marker']> => {
  const size = Math.max(
    0,
    Math.min(DESIGN_TOKENS.control.iconSize, rowBounds.height - DESIGN_TOKENS.space[1]),
  );
  const left = roundControlTextWorldUnit(rowBounds.x + DESIGN_TOKENS.space[1]);
  const top = roundControlTextWorldUnit(rowBounds.y + (rowBounds.height - size) / 2);
  const right = roundControlTextWorldUnit(left + size);
  const bottom = roundControlTextWorldUnit(top + size);
  const centerX = roundControlTextWorldUnit((left + right) / 2);
  const centerY = roundControlTextWorldUnit((top + bottom) / 2);
  const radius = roundControlTextWorldUnit(size / 2);
  const outline =
    kind === 'checkbox'
      ? `M ${String(left)} ${String(top)} H ${String(right)} V ${String(bottom)} H ${String(left)} Z`
      : createCirclePath(centerX, centerY, radius);
  const stateStroke =
    state === 'indeterminate'
      ? `M ${String(left + size * 0.25)} ${String(centerY)} L ${String(right - size * 0.25)} ${String(centerY)}`
      : state === 'selected' && kind === 'checkbox'
        ? `M ${String(left + size * 0.2)} ${String(centerY)} L ${String(left + size * 0.43)} ${String(bottom - size * 0.2)} L ${String(right - size * 0.15)} ${String(top + size * 0.2)}`
        : '';
  return Object.freeze({
    fillPath:
      state === 'selected' && kind === 'radio'
        ? createCirclePath(centerX, centerY, roundControlTextWorldUnit(size * 0.24))
        : '',
    strokePath: [outline, stateStroke].filter((path) => path.length > 0).join(' '),
  });
};

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
    (rows.layout !== 'stack' && textLayout.lines.length !== 1)
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
  if (rows.layout === 'stack') {
    const rowHeight = bounds.height / parsed.length;
    return Object.freeze(
      parsed.map((row, index) => {
        const binding = rowData.bindings[index]!;
        const rowTop = roundControlTextWorldUnit(bounds.y + rowHeight * index);
        const rowBottom =
          index === parsed.length - 1
            ? bounds.y + bounds.height
            : roundControlTextWorldUnit(bounds.y + rowHeight * (index + 1));
        const rowBounds = createWorldRect(bounds.x, rowTop, bounds.width, rowBottom - rowTop);
        const labelMeasurement = textMeasurementService.measure({ ...request, text: row.label });
        const labelX = roundControlTextWorldUnit(
          bounds.x +
            DESIGN_TOKENS.space[1] +
            (row.marker === null ? 0 : DESIGN_TOKENS.control.iconSize + DESIGN_TOKENS.space[1]),
        );
        return Object.freeze({
          baselineY: roundControlTextWorldUnit(
            rowTop +
              (rowBottom - rowTop - labelMeasurement.height) / 2 +
              (labelMeasurement.baselineOffsets[0] ?? 0),
          ),
          bounds: rowBounds,
          disabled: row.disabled,
          id: binding.id,
          label: row.label,
          labelBounds: createWorldRect(labelX, rowTop, labelMeasurement.width, rowBottom - rowTop),
          labelX,
          link: binding.link,
          marker:
            rows.marker === null || row.marker === null
              ? null
              : createRowMarkerProjection(rows.marker.kind, row.marker, rowBounds),
        });
      }),
    );
  }
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
          disabled: false,
          link: binding.link,
          marker: null,
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
      disabled: false,
      link: binding.link,
      marker: null,
    });
  });
  return Object.freeze(projected);
};
