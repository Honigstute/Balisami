import {
  getControlSpec,
  getControlHitSegments,
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
export const getControlSceneTextX = (
  definition: ControlDefinition,
  bounds: WorldRect,
  properties: ElementProperties = definition.defaultProperties,
): number => {
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
  if (
    definition.scene.kind === 'arrow' &&
    typeof properties.labelPosition === 'number' &&
    Number.isFinite(properties.labelPosition)
  ) {
    return bounds.x + bounds.width * properties.labelPosition;
  }
  return bounds.x + text.inset;
};

export const createControlSceneOutlinePath = (
  controlType: ControlTypeId,
  bounds: WorldRect,
  elementId: string,
  properties?: ElementProperties,
): string => {
  const definition = requireDefinition(controlType);
  if (definition.scene.kind === 'text' || definition.scene.kind === 'transparent') {
    return '';
  }
  if (definition.scene.kind === 'arrow') {
    return getControlHitSegments(definition, properties ?? definition.defaultProperties)
      .map((segment, index) =>
        createSeededSketchLinePath({
          end: createWorldPoint(
            bounds.x + segment.end.x * bounds.width,
            bounds.y + segment.end.y * bounds.height,
          ),
          seed: `${elementId}:arrow-segment:${String(index)}`,
          start: createWorldPoint(
            bounds.x + segment.start.x * bounds.width,
            bounds.y + segment.start.y * bounds.height,
          ),
        }),
      )
      .join(' ');
  }
  return createSeededSketchRectPath(
    getControlScenePrimitiveBounds(controlType, bounds),
    `${elementId}:${definition.scene.kind}`,
  );
};

const createImagePlaceholderMarkPath = (bounds: WorldRect, elementId: string): string =>
  [
    createSeededSketchLinePath({
      end: createWorldPoint(bounds.x + bounds.width, bounds.y + bounds.height),
      seed: `${elementId}:image-placeholder:first`,
      start: createWorldPoint(bounds.x, bounds.y),
    }),
    createSeededSketchLinePath({
      end: createWorldPoint(bounds.x, bounds.y + bounds.height),
      seed: `${elementId}:image-placeholder:second`,
      start: createWorldPoint(bounds.x + bounds.width, bounds.y),
    }),
  ].join(' ');

const createBrowserMarkPath = (
  bounds: WorldRect,
  elementId: string,
  properties: ElementProperties,
): string => {
  const toolbarHeight = Math.min(44, bounds.height * 0.2);
  const marks = [
    createSeededSketchLinePath({
      end: createWorldPoint(bounds.x + bounds.width, bounds.y + toolbarHeight),
      seed: `${elementId}:browser-toolbar`,
      start: createWorldPoint(bounds.x, bounds.y + toolbarHeight),
    }),
  ];
  if (properties.scrollbar === true) {
    const scrollbarY = bounds.y + bounds.height - Math.min(16, bounds.height * 0.08);
    marks.push(
      createSeededSketchLinePath({
        end: createWorldPoint(bounds.x + bounds.width, scrollbarY),
        seed: `${elementId}:browser-scrollbar`,
        start: createWorldPoint(bounds.x, scrollbarY),
      }),
    );
  }
  return marks.join(' ');
};

const createArrowHeadPath = (
  tip: ReturnType<typeof createWorldPoint>,
  tail: ReturnType<typeof createWorldPoint>,
  elementId: string,
  salt: string,
): string => {
  const angle = Math.atan2(tip.y - tail.y, tip.x - tail.x);
  const length = Math.min(12, Math.hypot(tip.x - tail.x, tip.y - tail.y) * 0.3);
  const spread = Math.PI / 6;
  return [angle - spread, angle + spread]
    .map((headAngle, index) =>
      createSeededSketchLinePath({
        end: createWorldPoint(
          tip.x - Math.cos(headAngle) * length,
          tip.y - Math.sin(headAngle) * length,
        ),
        seed: `${elementId}:${salt}:${String(index)}`,
        start: tip,
      }),
    )
    .join(' ');
};

const createArrowMarkPath = (
  controlType: ControlTypeId,
  bounds: WorldRect,
  elementId: string,
  properties: ElementProperties,
): string => {
  const definition = requireDefinition(controlType);
  const segments = getControlHitSegments(definition, properties);
  const first = segments[0];
  const last = segments.at(-1);
  if (first === undefined || last === undefined) {
    return '';
  }
  const point = (normalized: { readonly x: number; readonly y: number }) =>
    createWorldPoint(
      bounds.x + normalized.x * bounds.width,
      bounds.y + normalized.y * bounds.height,
    );
  return [
    ...(properties.startArrow === true
      ? [createArrowHeadPath(point(first.start), point(first.end), elementId, 'arrow-start')]
      : []),
    ...(properties.endArrow === true
      ? [createArrowHeadPath(point(last.end), point(last.start), elementId, 'arrow-end')]
      : []),
  ].join(' ');
};

export const createControlSceneMarkPath = (
  controlType: ControlTypeId,
  bounds: WorldRect,
  elementId: string,
  properties: ElementProperties,
): string => {
  const definition = requireDefinition(controlType);
  if (definition.scene.kind === 'image') {
    return createImagePlaceholderMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'browser') {
    return createBrowserMarkPath(bounds, elementId, properties);
  }
  if (definition.scene.kind === 'arrow') {
    return createArrowMarkPath(controlType, bounds, elementId, properties);
  }
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

export const controlSceneHasFill = (definition: ControlDefinition): boolean =>
  !['arrow', 'text', 'transparent'].includes(definition.scene.kind);

export const controlSceneHasOutline = (definition: ControlDefinition): boolean =>
  definition.scene.kind !== 'text' && definition.scene.kind !== 'transparent';
