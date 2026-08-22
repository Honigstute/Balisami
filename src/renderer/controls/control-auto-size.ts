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
  const measurement =
    definition.rows?.display === 'labels' && parsedRows !== undefined
      ? (() => {
          const labels = parsedRows.map((row) =>
            measurementService.measure({ ...measurementRequest, text: row.label }),
          );
          const first = labels[0];
          if (first === undefined)
            return measurementService.measure({ ...measurementRequest, text: '' });
          if (definition.rows.layout === 'stack') {
            const markerWidth =
              definition.rows.marker === null
                ? 0
                : DESIGN_TOKENS.control.iconSize + DESIGN_TOKENS.space[1];
            return Object.freeze({
              ...first,
              height:
                Math.max(
                  ...labels.map((label) => label.height),
                  DESIGN_TOKENS.control.iconSize + DESIGN_TOKENS.space[1],
                ) * labels.length,
              width: Math.max(
                ...labels.map((label, index) =>
                  parsedRows[index]?.marker === null ? label.width : label.width + markerWidth,
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
