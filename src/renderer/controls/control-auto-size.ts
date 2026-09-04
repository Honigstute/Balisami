import {
  getControlSpec,
  parseControlRows,
  parseCustomIconReference,
  type ElementNode,
  type WorldRect,
} from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import { getIconDefinition } from '../../shared/icons/icon-catalog';
import {
  calculateControlTextAutoSize,
  type ControlTextMeasurementService,
} from './control-text-measurement';
import { measureMultilineButtonText } from './control-scene-text-layout';

/**
 * Projects one element frame entirely from its registered policy and the shared
 * bundled-font metrics. The caller remains the only owner of command/history effects.
 */
export const calculateControlAutoSizeFrame = (
  element: ElementNode,
  measurementService: ControlTextMeasurementService,
): WorldRect | undefined => {
  const definition = getControlSpec(element.controlType);
  if (definition === undefined) {
    return undefined;
  }
  const text = definition.capabilities.text;
  const policy = definition.autoSize;
  if (policy === null) {
    return undefined;
  }
  if (policy.basis === 'intrinsic') {
    const width = policy.axis === 'vertical' ? element.frame.width : definition.defaultSize.width;
    const height =
      policy.axis === 'horizontal' ? element.frame.height : definition.defaultSize.height;
    return Object.freeze({ ...element.frame, height, width });
  }
  if (text === null) {
    return undefined;
  }
  const value = element.properties[text.property];
  if (typeof value !== 'string') {
    return undefined;
  }

  const styledFontSize =
    text.style.fontSizeProperty === null
      ? undefined
      : element.properties[text.style.fontSizeProperty];
  const measurementRequest = {
    fontSize: typeof styledFontSize === 'number' ? styledFontSize : text.fontSize,
    fontStyle:
      text.style.italicProperty !== null && element.properties[text.style.italicProperty] === true
        ? 'italic'
        : 'normal',
    fontWeight:
      text.style.boldProperty !== null && element.properties[text.style.boldProperty] === true
        ? 'bold'
        : 'normal',
    mode: text.mode,
  } as const;
  const parsedRows =
    definition.rows === null ? undefined : parseControlRows(definition.rows, element.properties);
  if (policy.basis === 'accordion') {
    const rowSelection = definition.rows?.selection;
    if (parsedRows === undefined || rowSelection === null || rowSelection === undefined) {
      return undefined;
    }
    const selectedValue = element.properties[rowSelection.property];
    const selectedIndex =
      typeof selectedValue === 'string'
        ? element.rowData.bindings.findIndex((binding) => binding.id === selectedValue)
        : -1;
    let activeParentIndex = selectedIndex;
    while (activeParentIndex >= 0 && parsedRows[activeParentIndex]?.depth !== 0) {
      activeParentIndex -= 1;
    }
    let currentParentIndex = -1;
    const visibleRows = parsedRows.filter((row, index) => {
      if (row.depth === 0) {
        currentParentIndex = index;
        return true;
      }
      return currentParentIndex === activeParentIndex;
    });
    const labelWidth = Math.max(
      ...visibleRows
        .map((row) =>
          measurementService.measure({
            ...measurementRequest,
            mode: 'single-line',
            text: row.label,
          }),
        )
        .map(
          (measurement, index) =>
            measurement.width +
            DESIGN_TOKENS.space[5] +
            (visibleRows[index]?.depth ?? 0) * DESIGN_TOKENS.control.accordionChildIndent,
        ),
    );
    const width = Math.max(definition.defaultSize.width, definition.minimumSize.width, labelWidth);
    const height = Math.max(
      definition.minimumSize.height,
      visibleRows.length * DESIGN_TOKENS.control.accordionRowHeight +
        DESIGN_TOKENS.control.accordionPaneMinimumHeight,
    );
    return Object.freeze({
      ...element.frame,
      height:
        definition.maximumSize === null ? height : Math.min(height, definition.maximumSize.height),
      width:
        definition.maximumSize === null ? width : Math.min(width, definition.maximumSize.width),
    });
  }
  const measurement =
    definition.scene.kind === 'multiline-button'
      ? measureMultilineButtonText(
          value,
          measurementRequest.fontSize,
          measurementRequest.fontStyle,
          measurementRequest.fontWeight === 'bold',
          measurementService,
        )
      : definition.rows?.display === 'labels' && parsedRows !== undefined
        ? (() => {
            const labels = parsedRows.map((row) =>
              measurementService.measure({ ...measurementRequest, text: row.label }),
            );
            const first = labels[0];
            if (first === undefined)
              return measurementService.measure({ ...measurementRequest, text: '' });
            if (definition.rows.layout === 'stack') {
              const decorationWidth = DESIGN_TOKENS.control.iconSize + DESIGN_TOKENS.space[1];
              return Object.freeze({
                ...first,
                height:
                  Math.max(
                    ...labels.map((label) => label.height),
                    DESIGN_TOKENS.control.iconSize + DESIGN_TOKENS.space[1],
                  ) * labels.length,
                width: Math.max(
                  ...labels.map(
                    (label, index) =>
                      label.width +
                      (parsedRows[index]?.depth ?? 0) * decorationWidth +
                      (parsedRows[index]?.marker === null && parsedRows[index]?.adornment === null
                        ? 0
                        : decorationWidth),
                  ),
                ),
              });
            }
            return Object.freeze({
              ...first,
              width:
                (definition.rows.layout === 'segments'
                  ? Math.max(...labels.map((label) => label.width)) * labels.length
                  : labels.reduce((total, label) => total + label.width, 0)) +
                (parsedRows.length - 1) * (policy.insets.left + policy.insets.right),
            });
          })()
        : measurementService.measure({ ...measurementRequest, text: value });
  const iconId = element.properties.iconId;
  const iconWidth =
    definition.capabilities.icon &&
    typeof iconId === 'string' &&
    (getIconDefinition(iconId)?.id === iconId || parseCustomIconReference(iconId) !== undefined)
      ? DESIGN_TOKENS.control.iconSize + DESIGN_TOKENS.space[1]
      : 0;
  const size = calculateControlTextAutoSize({
    axis: policy.axis,
    currentSize: element.frame,
    insets: policy.insets,
    ...(definition.maximumSize === null ? {} : { maximumSize: definition.maximumSize }),
    measurement: Object.freeze({ ...measurement, width: measurement.width + iconWidth }),
    minimumSize: definition.minimumSize,
  });
  return Object.freeze({ ...element.frame, ...size });
};
