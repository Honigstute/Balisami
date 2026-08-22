import {
  parseControlRows,
  type ControlDefinition,
  type ElementProperties,
  type ElementRowData,
} from '../../domain';
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

export interface ControlSelectedRowProjection extends ControlRowSceneProjection {
  readonly appearance: 'fill' | 'text';
  readonly color: string | undefined;
}

export interface ControlSceneProjection {
  readonly borderVisible: boolean;
  readonly bounds: WorldRect;
  readonly disabled: boolean;
  readonly fillColor: string | undefined;
  readonly icon: ControlSceneIconProjection | undefined;
  readonly markPath: string;
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
  const parsedRows =
    definition.rows === null ? undefined : parseControlRows(definition.rows, properties);
  const displayText =
    definition.rows?.display === 'labels'
      ? parsedRows?.map((row) => row.label).join('')
      : undefined;
  const sourceTextLayout =
    textMeasurementService === undefined
      ? undefined
      : calculateControlSceneTextLayout(
          definition,
          bounds,
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
              Object.freeze({ baselineY: row.baselineY, text: row.label, x: row.labelX }),
            ),
          ),
          textAnchor: 'middle' as const,
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
  const rowSeparatorPath =
    definition.rows?.layout !== 'segments'
      ? ''
      : rowProjections
          .slice(0, -1)
          .map((row) => {
            const x = row.bounds.x + row.bounds.width;
            return `M ${String(x)} ${String(bounds.y)} L ${String(x)} ${String(bounds.y + bounds.height)}`;
          })
          .join(' ');
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
      rowSeparatorPath,
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
    rows: rowProjections,
    rowSeparatorPath,
    selectedRow:
      selectedRow === undefined || rowSelection === null || rowSelection === undefined
        ? undefined
        : Object.freeze({
            ...selectedRow,
            appearance: rowSelection.appearance.kind,
            color: resolveColor(rowSelection.appearance.colorProperty),
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
