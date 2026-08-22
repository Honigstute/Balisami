import {
  getControlSpec,
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

  const measurement = measurementService.measure({
    fontSize: text.fontSize,
    mode: text.mode,
    text: value,
  });
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
