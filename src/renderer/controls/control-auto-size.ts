import { getControlSpec, type ElementNode, type WorldRect } from '../../domain';
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
  if (text === null || policy === null) {
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
  const size = calculateControlTextAutoSize({
    axis: policy.axis,
    currentSize: element.frame,
    insets: policy.insets,
    ...(definition.maximumSize === null ? {} : { maximumSize: definition.maximumSize }),
    measurement,
    minimumSize: definition.minimumSize,
  });
  return Object.freeze({ ...element.frame, ...size });
};
