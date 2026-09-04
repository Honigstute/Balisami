import {
  parseControlRows,
  type ControlDefinition,
  type ElementProperties,
  type ElementRowData,
} from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
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
import {
  createControlRowSceneProjections,
  type ControlRowSceneProjection,
} from './control-row-scene-projection';
import { createControlTabsFillPath, createControlTabsOutlinePath } from './control-tabs-scene';
import {
  createAccordionActiveHeaderPath,
  createAccordionLayout,
  createAccordionOutlinePath,
} from './control-accordion-scene';

export interface ControlSelectedRowProjection extends ControlRowSceneProjection {
  readonly appearance: 'fill' | 'text';
  readonly color: string | undefined;
  readonly fillOpacity: number | undefined;
}

export interface ControlSceneProjection {
  readonly borderVisible: boolean;
  readonly bounds: WorldRect;
  readonly disabled: boolean;
  readonly fillColor: string | undefined;
  /** Optional non-rectangular fill silhouette rendered before row selection. */
  readonly fillPath: string;
  readonly fillRadiusX: number | undefined;
  readonly fillRadiusY: number | undefined;
  readonly icon: ControlSceneIconProjection | undefined;
  readonly markPath: string;
  readonly markFillColor: string | undefined;
  readonly markStrokeColor: string | undefined;
  readonly outlinePath: string;
  readonly primitiveBounds: WorldRect;
  /** Canonical measured row geometry shared by every presentation surface. */
  readonly rows: readonly ControlRowSceneProjection[];
  readonly rowSeparatorPath: string;
  readonly selectedRow: ControlSelectedRowProjection | undefined;
  readonly opacity: number | undefined;
  readonly strokeColor: string | undefined;
  readonly textLayout: ControlSceneTextLayout | undefined;
}

export interface ControlSceneProjectionInput {
  readonly bounds: WorldRect;
  readonly definition: ControlDefinition;
  readonly identity: string;
  readonly properties: ElementProperties;
  readonly rowData?: ElementRowData;
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
  rowData,
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
  const primitiveBounds = getControlScenePrimitiveBounds(definition.type, bounds, properties);
  const contentBounds =
    definition.scene.kind === 'circle-button' ||
    definition.scene.kind === 'comment' ||
    definition.scene.kind === 'curly-brace' ||
    definition.scene.kind === 'popover' ||
    definition.scene.kind === 'tooltip' ||
    definition.scene.trailingAdornment !== undefined
      ? primitiveBounds
      : bounds;
  const fillRadii =
    definition.scene.kind === 'multiline-button'
      ? Object.freeze({ x: Math.min(14, bounds.width / 2), y: Math.min(14, bounds.height / 2) })
      : definition.scene.kind === 'search-box' && properties.shape === 'rounded'
        ? Object.freeze({ x: bounds.height / 2, y: bounds.height / 2 })
        : definition.scene.kind === 'circle-button' || definition.scene.kind === 'callout'
          ? Object.freeze({ x: primitiveBounds.width / 2, y: primitiveBounds.height / 2 })
          : undefined;
  const parsedRows =
    definition.rows === null ? undefined : parseControlRows(definition.rows, properties);
  const displayText =
    definition.rows?.display === 'labels'
      ? parsedRows?.map((row) => row.label).join(definition.rows.layout === 'stack' ? '\n' : '')
      : undefined;
  const sourceTextLayout =
    textMeasurementService === undefined
      ? undefined
      : calculateControlSceneTextLayout(
          definition,
          contentBounds,
          properties,
          textMeasurementService,
          displayText,
        );
  const rowProjections =
    rowData === undefined
      ? Object.freeze([])
      : createControlRowSceneProjections(
          definition,
          properties,
          rowData,
          sourceTextLayout,
          textMeasurementService,
          bounds,
        );
  const textLayout =
    definition.rows?.display !== 'labels' || sourceTextLayout === undefined
      ? sourceTextLayout
      : Object.freeze({
          ...sourceTextLayout,
          lines: Object.freeze(
            rowProjections.map((row) =>
              Object.freeze({
                baselineY: row.baselineY,
                ...(row.disabled ? { opacity: DESIGN_TOKENS.opacity.disabled } : {}),
                text: row.label,
                x: row.labelX,
              }),
            ),
          ),
          textAnchor:
            definition.rows.layout === 'segments' ? ('middle' as const) : ('start' as const),
        });
  const rowSelection = definition.rows?.selection;
  const selectedValue =
    rowSelection === null || rowSelection === undefined
      ? undefined
      : properties[rowSelection.property];
  const selectedRow =
    typeof selectedValue !== 'string' || rowSelection === null || rowSelection === undefined
      ? undefined
      : rowProjections.find((row) => row.id === selectedValue);
  const accordionLayout =
    definition.scene.kind === 'accordion' && parsedRows !== undefined && rowData !== undefined
      ? createAccordionLayout(
          parsedRows,
          rowData,
          typeof selectedValue === 'string' ? selectedValue : undefined,
          bounds,
        )
      : undefined;
  const rowSeparatorPath =
    definition.rows?.layout !== 'segments' || definition.scene.kind === 'tabs'
      ? ''
      : rowProjections
          .slice(0, -1)
          .map((row) => {
            const x = row.bounds.x + row.bounds.width;
            return `M ${String(x)} ${String(bounds.y)} L ${String(x)} ${String(bounds.y + bounds.height)}`;
          })
          .join(' ');
  const fillColor =
    style === undefined
      ? definition.scene.colorTarget === 'fill'
        ? fallbackColor
        : undefined
      : (resolveColor(style.fillColorProperty) ?? style.defaultFillColor ?? undefined);
  const tabsFillPath =
    definition.scene.kind === 'tabs'
      ? createControlTabsFillPath(definition, bounds, properties, rowProjections)
      : '';
  const tabsOutlinePath =
    definition.scene.kind === 'tabs'
      ? createControlTabsOutlinePath(
          definition,
          bounds,
          identity,
          properties,
          rowProjections,
          selectedRow?.id,
        )
      : undefined;
  const accordionOutlinePath =
    accordionLayout === undefined || parsedRows === undefined || rowData === undefined
      ? undefined
      : createAccordionOutlinePath(parsedRows, rowData, accordionLayout, identity, bounds);
  const scrollbarBounds =
    definition.scene.kind === 'tabs'
      ? primitiveBounds
      : definition.scene.kind === 'accordion'
        ? accordionLayout?.paneBounds
        : bounds;
  return Object.freeze({
    borderVisible:
      borderVisibility === false ||
      (typeof borderMode === 'string' && style?.borderHiddenValues.includes(borderMode) === true)
        ? false
        : true,
    bounds,
    disabled,
    fillColor,
    fillPath: tabsFillPath,
    fillRadiusX: fillRadii?.x,
    fillRadiusY: fillRadii?.y,
    icon: createControlSceneIconProjection(definition, contentBounds, properties, textLayout),
    markPath: [
      ...(accordionLayout === undefined ? [] : [createAccordionActiveHeaderPath(accordionLayout)]),
      createControlSceneMarkPath(definition.type, bounds, identity, properties),
      ...(scrollbarVisible && scrollbarBounds !== undefined
        ? [createControlSceneScrollbarPath(scrollbarBounds, identity)]
        : []),
      rowSeparatorPath,
    ]
      .filter((path) => path.length > 0)
      .join(' '),
    markFillColor:
      definition.scene.markStyle === undefined
        ? undefined
        : (definition.scene.markStyle.fillColor ?? fillColor),
    markStrokeColor: definition.scene.markStyle?.strokeColor ?? undefined,
    outlinePath:
      tabsOutlinePath ??
      accordionOutlinePath ??
      createControlSceneOutlinePath(
        definition.type,
        bounds,
        identity,
        properties,
        sourceTextLayout === undefined
          ? undefined
          : {
              fontSize: sourceTextLayout.fontSize,
              textWidth: sourceTextLayout.width,
              x: sourceTextLayout.lines[0]?.x ?? bounds.x,
            },
      ),
    opacity:
      typeof opacityValue === 'number'
        ? opacityValue * (disabled ? (style?.state?.disabledOpacity ?? 1) : 1)
        : disabled
          ? style?.state?.disabledOpacity
          : undefined,
    primitiveBounds,
    rows: rowProjections,
    rowSeparatorPath,
    selectedRow:
      selectedRow === undefined || rowSelection === null || rowSelection === undefined
        ? undefined
        : Object.freeze({
            ...selectedRow,
            appearance:
              definition.scene.kind === 'accordion' &&
              selectedRow.id === accordionLayout?.activeParentId
                ? ('text' as const)
                : rowSelection.appearance.kind,
            color:
              definition.scene.kind === 'tabs'
                ? DESIGN_TOKENS.color.canvas
                : definition.scene.kind === 'accordion' &&
                    selectedRow.id === accordionLayout?.activeParentId
                  ? DESIGN_TOKENS.color.canvas
                  : resolveColor(rowSelection.appearance.colorProperty),
            fillOpacity: definition.scene.kind === 'tabs' ? 1 : undefined,
          }),
    strokeColor:
      style === undefined
        ? definition.scene.colorTarget === 'stroke'
          ? fallbackColor
          : undefined
        : resolveColor(style.strokeColorProperty),
    textLayout,
  });
};
