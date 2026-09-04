import {
  parseControlRows,
  type ControlDefinition,
  type ElementProperties,
  type ElementRowData,
  type ParsedControlRow,
} from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import { createWorldRect, type WorldRect } from '../editor/viewport-transform';
import type { ControlSceneTextLayout } from './control-scene-text-layout';
import { getControlTabsStripExtent } from './control-tabs-scene';
import {
  roundControlTextWorldUnit,
  type ControlTextMeasurementService,
} from './control-text-measurement';

export interface ControlRowSceneProjection {
  readonly adornment: Readonly<{
    readonly fillPath: string;
    readonly strokePath: string;
  }> | null;
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
  offset = 0,
): NonNullable<ControlRowSceneProjection['marker']> => {
  const size = Math.max(
    0,
    Math.min(DESIGN_TOKENS.control.iconSize, rowBounds.height - DESIGN_TOKENS.space[1]),
  );
  const left = roundControlTextWorldUnit(rowBounds.x + DESIGN_TOKENS.space[1] + offset);
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

const createTreeAdornmentProjection = (
  kind: Exclude<ParsedControlRow['adornment'], null>,
  rowBounds: WorldRect,
  depth: number,
): NonNullable<ControlRowSceneProjection['adornment']> => {
  const size = Math.max(
    0,
    Math.min(DESIGN_TOKENS.control.iconSize, rowBounds.height - DESIGN_TOKENS.space[1]),
  );
  const indentation = depth * (DESIGN_TOKENS.control.iconSize + DESIGN_TOKENS.space[1]);
  const left = roundControlTextWorldUnit(rowBounds.x + DESIGN_TOKENS.space[1] + indentation);
  const top = roundControlTextWorldUnit(rowBounds.y + (rowBounds.height - size) / 2);
  const right = roundControlTextWorldUnit(left + size);
  const bottom = roundControlTextWorldUnit(top + size);
  const centerX = roundControlTextWorldUnit((left + right) / 2);
  const centerY = roundControlTextWorldUnit((top + bottom) / 2);
  const quarter = size * 0.25;
  if (kind === 'spacer') return Object.freeze({ fillPath: '', strokePath: '' });
  if (kind === 'disclosure-closed') {
    return Object.freeze({
      fillPath: `M ${String(left + quarter)} ${String(top)} L ${String(right - quarter)} ${String(centerY)} L ${String(left + quarter)} ${String(bottom)} Z`,
      strokePath: '',
    });
  }
  if (kind === 'disclosure-open') {
    return Object.freeze({
      fillPath: `M ${String(left)} ${String(top + quarter)} L ${String(centerX)} ${String(bottom - quarter)} L ${String(right)} ${String(top + quarter)} Z`,
      strokePath: '',
    });
  }
  if (kind === 'folder-closed' || kind === 'folder-open') {
    const folderTop = top + size * 0.25;
    const flapRight = left + size * 0.48;
    const fillPath =
      kind === 'folder-closed'
        ? `M ${String(left)} ${String(folderTop)} L ${String(left + size * 0.35)} ${String(folderTop)} L ${String(flapRight)} ${String(top + size * 0.42)} H ${String(right)} V ${String(bottom)} H ${String(left)} Z`
        : `M ${String(left)} ${String(folderTop)} L ${String(left + size * 0.35)} ${String(folderTop)} L ${String(flapRight)} ${String(top + size * 0.42)} H ${String(right)} L ${String(right - size * 0.18)} ${String(bottom)} H ${String(left)} Z`;
    return Object.freeze({ fillPath, strokePath: '' });
  }
  const outline = `M ${String(left)} ${String(top)} H ${String(right)} V ${String(bottom)} H ${String(left)} Z`;
  if (kind === 'file') {
    return Object.freeze({
      fillPath: '',
      strokePath: `${outline} M ${String(left + size * 0.25)} ${String(top + size * 0.35)} H ${String(right - size * 0.2)} M ${String(left + size * 0.25)} ${String(centerY)} H ${String(right - size * 0.2)} M ${String(left + size * 0.25)} ${String(top + size * 0.65)} H ${String(right - size * 0.2)}`,
    });
  }
  const horizontal = `M ${String(left + quarter)} ${String(centerY)} H ${String(right - quarter)}`;
  const vertical = `M ${String(centerX)} ${String(top + quarter)} V ${String(bottom - quarter)}`;
  const check = `M ${String(left + size * 0.18)} ${String(centerY)} L ${String(left + size * 0.42)} ${String(bottom - size * 0.18)} L ${String(right - size * 0.12)} ${String(top + size * 0.16)}`;
  return Object.freeze({
    fillPath: '',
    strokePath: [
      outline,
      ...(kind === 'plus' ? [horizontal, vertical] : []),
      ...(kind === 'minus' ? [horizontal] : []),
      ...(kind === 'checkbox-checked' ? [check] : []),
    ].join(' '),
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
  const tabs = definition.scene.tabs;
  if (definition.scene.kind === 'tabs' && tabs !== undefined) {
    const stripExtent = getControlTabsStripExtent(definition, bounds, properties);
    if (tabs.orientation === 'horizontal') {
      const measurements = parsed.map((row) =>
        textMeasurementService.measure({ ...request, text: row.label }),
      );
      const naturalWidths = measurements.map(
        (measurement) => measurement.width + DESIGN_TOKENS.space[4],
      );
      const naturalTotal = naturalWidths.reduce((total, width) => total + width, 0);
      const scale = naturalTotal > bounds.width ? bounds.width / naturalTotal : 1;
      const widths = naturalWidths.map((width) => width * scale);
      const totalWidth = widths.reduce((total, width) => total + width, 0);
      const alignment =
        tabs.alignmentProperty === null ? 'start' : properties[tabs.alignmentProperty];
      const startX =
        alignment === 'center'
          ? bounds.x + (bounds.width - totalWidth) / 2
          : alignment === 'end'
            ? bounds.x + bounds.width - totalWidth
            : bounds.x;
      const rowY =
        properties[tabs.positionProperty] === 'bottom'
          ? bounds.y + bounds.height - stripExtent
          : bounds.y;
      let cursorX = startX;
      return Object.freeze(
        parsed.map((row, index) => {
          const binding = rowData.bindings[index]!;
          const measurement = measurements[index]!;
          const width = widths[index]!;
          const rowBounds = createWorldRect(
            roundControlTextWorldUnit(cursorX),
            rowY,
            index === parsed.length - 1
              ? roundControlTextWorldUnit(startX + totalWidth - cursorX)
              : roundControlTextWorldUnit(width),
            stripExtent,
          );
          cursorX += width;
          const labelX = roundControlTextWorldUnit(rowBounds.x + rowBounds.width / 2);
          return Object.freeze({
            adornment: null,
            baselineY: roundControlTextWorldUnit(
              rowBounds.y +
                (rowBounds.height - measurement.height) / 2 +
                (measurement.baselineOffsets[0] ?? 0),
            ),
            bounds: rowBounds,
            disabled: false,
            id: binding.id,
            label: row.label,
            labelBounds: createWorldRect(
              roundControlTextWorldUnit(labelX - measurement.width / 2),
              rowBounds.y,
              measurement.width,
              rowBounds.height,
            ),
            labelX,
            link: binding.link,
            marker: null,
          });
        }),
      );
    }
    const rowHeight = Math.min(
      textLayout.fontSize + DESIGN_TOKENS.space[4],
      bounds.height / parsed.length,
    );
    const rowX =
      properties[tabs.positionProperty] === 'right'
        ? bounds.x + bounds.width - stripExtent
        : bounds.x;
    return Object.freeze(
      parsed.map((row, index) => {
        const binding = rowData.bindings[index]!;
        const measurement = textMeasurementService.measure({ ...request, text: row.label });
        const rowBounds = createWorldRect(
          rowX,
          roundControlTextWorldUnit(bounds.y + rowHeight * index),
          stripExtent,
          roundControlTextWorldUnit(rowHeight),
        );
        const labelX = roundControlTextWorldUnit(rowBounds.x + DESIGN_TOKENS.space[2]);
        return Object.freeze({
          adornment: null,
          baselineY: roundControlTextWorldUnit(
            rowBounds.y +
              (rowBounds.height - measurement.height) / 2 +
              (measurement.baselineOffsets[0] ?? 0),
          ),
          bounds: rowBounds,
          disabled: false,
          id: binding.id,
          label: row.label,
          labelBounds: createWorldRect(
            labelX,
            rowBounds.y,
            Math.max(0, rowBounds.width - DESIGN_TOKENS.space[4]),
            rowBounds.height,
          ),
          labelX,
          link: binding.link,
          marker: null,
        });
      }),
    );
  }
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
        const indentation = row.depth * (DESIGN_TOKENS.control.iconSize + DESIGN_TOKENS.space[1]);
        const labelX = roundControlTextWorldUnit(
          bounds.x +
            DESIGN_TOKENS.space[1] +
            indentation +
            (row.marker === null && row.adornment === null
              ? 0
              : DESIGN_TOKENS.control.iconSize + DESIGN_TOKENS.space[1]),
        );
        return Object.freeze({
          adornment:
            row.adornment === null
              ? null
              : createTreeAdornmentProjection(row.adornment, rowBounds, row.depth),
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
          adornment: null,
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
      adornment: null,
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
