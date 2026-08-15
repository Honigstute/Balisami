import {
  getControlSpec,
  type ControlDefinition,
  type ControlTypeId,
  type ElementProperties,
} from '../../domain';
import { createSeededSketchLinePath, createSeededSketchRectPath } from '../editor/seeded-sketch';
import { createWorldPoint, createWorldRect, type WorldRect } from '../editor/viewport-transform';

const requireDefinition = (controlType: ControlTypeId): ControlDefinition => {
  const definition = getControlSpec(controlType);
  if (definition === undefined) {
    throw new Error(`Scene geometry received unknown control '${controlType}'.`);
  }
  return definition;
};

/** Bounds of the definition's primary outlined primitive, separate from its hit bounds. */
export const getControlScenePrimitiveBounds = (
  controlType: ControlTypeId,
  bounds: WorldRect,
): WorldRect => {
  const definition = requireDefinition(controlType);
  if (definition.scene.kind !== 'checkbox') {
    return bounds;
  }
  const checkbox = definition.scene.checkbox;
  if (checkbox === undefined) {
    throw new Error(`Checkbox control '${controlType}' is missing geometry metadata.`);
  }
  const boxSize = Math.min(checkbox.boxSize, bounds.height);
  return createWorldRect(bounds.x, bounds.y + (bounds.height - boxSize) / 2, boxSize, boxSize);
};

/** Text origin remains definition-owned for primitives whose outline occupies only part of bounds. */
export const getControlSceneTextX = (definition: ControlDefinition, bounds: WorldRect): number => {
  const text = definition.capabilities.text;
  if (text === null || text.alignment === 'center') {
    return bounds.x + bounds.width / 2;
  }
  if (definition.scene.kind === 'checkbox') {
    const checkbox = definition.scene.checkbox;
    if (checkbox === undefined) {
      throw new Error(`Checkbox control '${definition.type}' is missing geometry metadata.`);
    }
    const box = getControlScenePrimitiveBounds(definition.type, bounds);
    return box.x + box.width + checkbox.gap;
  }
  return bounds.x + text.inset;
};

export const createControlSceneOutlinePath = (
  controlType: ControlTypeId,
  bounds: WorldRect,
  elementId: string,
): string => {
  const definition = requireDefinition(controlType);
  if (definition.scene.kind === 'text' || definition.scene.kind === 'transparent') {
    return '';
  }
  return createSeededSketchRectPath(
    getControlScenePrimitiveBounds(controlType, bounds),
    `${elementId}:${definition.scene.kind}`,
  );
};

export const createControlSceneMarkPath = (
  controlType: ControlTypeId,
  bounds: WorldRect,
  elementId: string,
  properties: ElementProperties,
): string => {
  const definition = requireDefinition(controlType);
  if (definition.scene.kind !== 'checkbox' || properties.checked !== true) {
    return '';
  }
  const box = getControlScenePrimitiveBounds(controlType, bounds);
  const start = createWorldPoint(box.x + box.width * 0.2, box.y + box.height * 0.52);
  const middle = createWorldPoint(box.x + box.width * 0.43, box.y + box.height * 0.75);
  const end = createWorldPoint(box.x + box.width * 0.82, box.y + box.height * 0.25);
  return [
    createSeededSketchLinePath({
      end: middle,
      seed: `${elementId}:checkbox-mark:first`,
      start,
    }),
    createSeededSketchLinePath({
      end,
      seed: `${elementId}:checkbox-mark:second`,
      start: middle,
    }),
  ].join(' ');
};
