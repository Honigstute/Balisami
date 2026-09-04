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

const getTrailingAdornmentWidth = (definition: ControlDefinition): number | undefined => {
  const adornment = definition.scene.trailingAdornment;
  if (adornment === undefined) return undefined;
  return adornment.kind === 'calendar' ? adornment.size : adornment.width;
};

/** Bounds of the definition's primary outlined primitive, separate from its hit bounds. */
export const getControlScenePrimitiveBounds = (
  controlType: ControlTypeId,
  bounds: WorldRect,
  properties?: ElementProperties,
): WorldRect => {
  const definition = requireDefinition(controlType);
  const trailingAdornment = definition.scene.trailingAdornment;
  if (trailingAdornment !== undefined) {
    const bodyInset = Math.min(trailingAdornment.bodyInset, bounds.height / 2);
    const adornmentWidth = getTrailingAdornmentWidth(definition);
    if (adornmentWidth === undefined) {
      throw new Error(`Control '${controlType}' has invalid trailing-adornment geometry.`);
    }
    return createWorldRect(
      bounds.x,
      bounds.y + bodyInset,
      Math.max(0, bounds.width - adornmentWidth - trailingAdornment.gap),
      Math.max(0, bounds.height - bodyInset * 2),
    );
  }
  if (definition.scene.kind === 'circle-button') {
    const size = Math.min(bounds.width, bounds.height);
    return createWorldRect(
      bounds.x + (bounds.width - size) / 2,
      bounds.y + (bounds.height - size) / 2,
      size,
      size,
    );
  }
  if (definition.scene.kind === 'comment') {
    const tapeInset = Math.min(12, bounds.height * 0.1);
    return createWorldRect(
      bounds.x,
      bounds.y + tapeInset,
      bounds.width,
      Math.max(0, bounds.height - tapeInset),
    );
  }
  if (definition.scene.kind === 'tooltip') {
    const direction = properties?.direction ?? definition.defaultProperties.direction;
    const tailSize = Math.min(8, bounds.height * 0.25);
    const pointsDown = direction === 'NE' || direction === 'NW';
    return createWorldRect(
      bounds.x,
      pointsDown ? bounds.y : bounds.y + tailSize,
      bounds.width,
      Math.max(0, bounds.height - tailSize),
    );
  }
  if (definition.scene.kind === 'radio-button') {
    const radio = definition.scene.radio;
    if (radio === undefined) {
      throw new Error(`Radio Button control '${controlType}' is missing geometry metadata.`);
    }
    const diameter = Math.min(radio.diameter, bounds.height);
    return createWorldRect(bounds.x, bounds.y + (bounds.height - diameter) / 2, diameter, diameter);
  }
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
  alignment: 'center' | 'end' | 'start' = definition.capabilities.text?.alignment ?? 'start',
): number => {
  const text = definition.capabilities.text;
  if (text === null || alignment === 'center') {
    return bounds.x + bounds.width / 2;
  }
  if (alignment === 'end') return bounds.x + bounds.width - text.inset;
  if (definition.scene.kind === 'checkbox') {
    const checkbox = definition.scene.checkbox;
    if (checkbox === undefined) {
      throw new Error(`Checkbox control '${definition.type}' is missing geometry metadata.`);
    }
    const box = getControlScenePrimitiveBounds(definition.type, bounds);
    return box.x + box.width + checkbox.gap;
  }
  if (definition.scene.kind === 'radio-button') {
    const radio = definition.scene.radio;
    if (radio === undefined) {
      throw new Error(`Radio Button control '${definition.type}' is missing geometry metadata.`);
    }
    const circle = getControlScenePrimitiveBounds(definition.type, bounds);
    return circle.x + circle.width + radio.gap;
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
  legend?: Readonly<{ fontSize: number; textWidth: number; x: number }>,
): string => {
  const definition = requireDefinition(controlType);
  if (
    definition.scene.kind === 'comment' ||
    definition.scene.kind === 'text' ||
    definition.scene.kind === 'tooltip' ||
    definition.scene.kind === 'transparent'
  ) {
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
  if (definition.scene.kind === 'input' && properties?.borderMode === 'underline') {
    return createSeededSketchLinePath({
      end: createWorldPoint(bounds.x + bounds.width, bounds.y + bounds.height),
      seed: `${elementId}:input-underline`,
      start: createWorldPoint(bounds.x, bounds.y + bounds.height),
    });
  }
  if (
    definition.scene.kind === 'search-box' &&
    (properties ?? definition.defaultProperties).shape === 'rounded'
  ) {
    const radius = Math.max(0, Math.min(bounds.height / 2, bounds.width / 2));
    const left = bounds.x;
    const right = bounds.x + bounds.width;
    const top = bounds.y;
    const bottom = bounds.y + bounds.height;
    return [
      `M ${String(left + radius)} ${String(top)}`,
      `L ${String(right - radius)} ${String(top)}`,
      `Q ${String(right)} ${String(top)} ${String(right)} ${String(top + radius)}`,
      `L ${String(right)} ${String(bottom - radius)}`,
      `Q ${String(right)} ${String(bottom)} ${String(right - radius)} ${String(bottom)}`,
      `L ${String(left + radius)} ${String(bottom)}`,
      `Q ${String(left)} ${String(bottom)} ${String(left)} ${String(bottom - radius)}`,
      `L ${String(left)} ${String(top + radius)}`,
      `Q ${String(left)} ${String(top)} ${String(left + radius)} ${String(top)}`,
    ].join(' ');
  }
  if (definition.scene.kind === 'multiline-button') {
    const radius = Math.max(0, Math.min(14, bounds.height / 2, bounds.width / 2));
    const left = bounds.x;
    const right = bounds.x + bounds.width;
    const top = bounds.y;
    const bottom = bounds.y + bounds.height;
    return [
      `M ${String(left + radius)} ${String(top)}`,
      `L ${String(right - radius)} ${String(top)}`,
      `Q ${String(right)} ${String(top)} ${String(right)} ${String(top + radius)}`,
      `L ${String(right)} ${String(bottom - radius)}`,
      `Q ${String(right)} ${String(bottom)} ${String(right - radius)} ${String(bottom)}`,
      `L ${String(left + radius)} ${String(bottom)}`,
      `Q ${String(left)} ${String(bottom)} ${String(left)} ${String(bottom - radius)}`,
      `L ${String(left)} ${String(top + radius)}`,
      `Q ${String(left)} ${String(top)} ${String(left + radius)} ${String(top)}`,
    ].join(' ');
  }
  if (definition.scene.kind === 'h-rule' || definition.scene.kind === 'v-rule') {
    const horizontal = definition.scene.kind === 'h-rule';
    return createSeededSketchLinePath({
      end: createWorldPoint(
        horizontal ? bounds.x + bounds.width : bounds.x + bounds.width / 2,
        horizontal ? bounds.y + bounds.height / 2 : bounds.y + bounds.height,
      ),
      seed: `${elementId}:${definition.scene.kind}`,
      start: createWorldPoint(
        horizontal ? bounds.x : bounds.x + bounds.width / 2,
        horizontal ? bounds.y + bounds.height / 2 : bounds.y,
      ),
    });
  }
  if (definition.scene.kind === 'help-button') {
    const radius = Math.min(bounds.width, bounds.height) * 0.45;
    return createSeededCirclePath(
      createWorldPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
      radius,
      elementId,
      'help-button-outline',
    );
  }
  if (definition.scene.kind === 'circle-button') {
    const circle = getControlScenePrimitiveBounds(controlType, bounds);
    return createSeededCirclePath(
      createWorldPoint(circle.x + circle.width / 2, circle.y + circle.height / 2),
      circle.width * 0.48,
      elementId,
      'circle-button-outline',
    );
  }
  if (definition.scene.kind === 'radio-button') {
    const circle = getControlScenePrimitiveBounds(controlType, bounds);
    return createSeededCirclePath(
      createWorldPoint(circle.x + circle.width / 2, circle.y + circle.height / 2),
      circle.width * 0.48,
      elementId,
      'radio-button-outline',
    );
  }
  if (definition.scene.kind === 'callout') {
    return createSeededEllipsePath(bounds, elementId, 'callout-outline');
  }
  if (definition.scene.kind === 'field-set' && legend !== undefined) {
    const left = bounds.x;
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    const top = Math.min(bottom, bounds.y + Math.max(0, legend.fontSize) / 2);
    if (legend.textWidth <= 0) {
      return createSeededSketchRectPath(
        createWorldRect(left, top, bounds.width, Math.max(0, bottom - top)),
        `${elementId}:field-set`,
      );
    }
    const gapStart = Math.max(left, Math.min(right, legend.x - 4));
    const gapEnd = Math.max(gapStart, Math.min(right, legend.x + legend.textWidth + 4));
    const segments = [
      ...(gapStart > left
        ? [
            createSeededSketchLinePath({
              end: createWorldPoint(gapStart, top),
              seed: `${elementId}:field-set:top-left`,
              start: createWorldPoint(left, top),
            }),
          ]
        : []),
      ...(gapEnd < right
        ? [
            createSeededSketchLinePath({
              end: createWorldPoint(right, top),
              seed: `${elementId}:field-set:top-right`,
              start: createWorldPoint(gapEnd, top),
            }),
          ]
        : []),
      createSeededSketchLinePath({
        end: createWorldPoint(right, bottom),
        seed: `${elementId}:field-set:right`,
        start: createWorldPoint(right, top),
      }),
      createSeededSketchLinePath({
        end: createWorldPoint(left, bottom),
        seed: `${elementId}:field-set:bottom`,
        start: createWorldPoint(right, bottom),
      }),
      createSeededSketchLinePath({
        end: createWorldPoint(left, top),
        seed: `${elementId}:field-set:left`,
        start: createWorldPoint(left, bottom),
      }),
    ];
    return segments.join(' ');
  }
  return createSeededSketchRectPath(
    getControlScenePrimitiveBounds(controlType, bounds),
    `${elementId}:${definition.scene.kind}`,
  );
};

const createTooltipMarkPath = (bounds: WorldRect, properties: ElementProperties): string => {
  const direction = properties.direction;
  const extendsEast = direction === 'SE' || direction === 'NE';
  const extendsSouth = direction === 'SE' || direction === 'SW';
  const tailSize = Math.min(8, bounds.height * 0.25);
  const left = bounds.x + 1;
  const right = bounds.x + Math.max(1, bounds.width - 1);
  const top = bounds.y + (extendsSouth ? tailSize : 1);
  const bottom = bounds.y + bounds.height - (extendsSouth ? 1 : tailSize);
  const radius = Math.max(0, Math.min(10, (right - left) / 2, (bottom - top) / 2));
  const tailTipX = extendsEast ? left + 2 : right - 2;
  const tailTipY = extendsSouth ? bounds.y + 1 : bounds.y + bounds.height - 1;
  const tailSpan = Math.min(12, Math.max(0, (right - left) / 2 - radius));
  const topEdge =
    extendsSouth && extendsEast
      ? [
          `M ${String(left + radius)} ${String(top)}`,
          `L ${String(tailTipX)} ${String(tailTipY)}`,
          `L ${String(left + radius + tailSpan)} ${String(top)}`,
          `L ${String(right - radius)} ${String(top)}`,
        ]
      : extendsSouth
        ? [
            `M ${String(left + radius)} ${String(top)}`,
            `L ${String(right - radius - tailSpan)} ${String(top)}`,
            `L ${String(tailTipX)} ${String(tailTipY)}`,
            `L ${String(right - radius)} ${String(top)}`,
          ]
        : [
            `M ${String(left + radius)} ${String(top)}`,
            `L ${String(right - radius)} ${String(top)}`,
          ];
  const bottomEdge =
    !extendsSouth && !extendsEast
      ? [
          `L ${String(tailTipX)} ${String(tailTipY)}`,
          `L ${String(right - radius - tailSpan)} ${String(bottom)}`,
          `L ${String(left + radius)} ${String(bottom)}`,
        ]
      : !extendsSouth
        ? [
            `L ${String(left + radius + tailSpan)} ${String(bottom)}`,
            `L ${String(tailTipX)} ${String(tailTipY)}`,
            `L ${String(left + radius)} ${String(bottom)}`,
          ]
        : [`L ${String(left + radius)} ${String(bottom)}`];

  return [
    ...topEdge,
    `Q ${String(right)} ${String(top)} ${String(right)} ${String(top + radius)}`,
    `L ${String(right)} ${String(bottom - radius)}`,
    `Q ${String(right)} ${String(bottom)} ${String(right - radius)} ${String(bottom)}`,
    ...bottomEdge,
    `Q ${String(left)} ${String(bottom)} ${String(left)} ${String(bottom - radius)}`,
    `L ${String(left)} ${String(top + radius)}`,
    `Q ${String(left)} ${String(top)} ${String(left + radius)} ${String(top)}`,
    'Z',
  ].join(' ');
};

const createCalendarAdornmentMarkPath = (
  bounds: WorldRect,
  elementId: string,
  size: number,
): string => {
  const calendar = createWorldRect(
    bounds.x + bounds.width - size,
    bounds.y + (bounds.height - size) / 2,
    size,
    size,
  );
  const left = calendar.x;
  const right = calendar.x + calendar.width;
  const top = calendar.y;
  const bottom = calendar.y + calendar.height;
  const paths = [createSeededSketchRectPath(calendar, `${elementId}:calendar-body`)];
  const line = (startX: number, startY: number, endX: number, endY: number, salt: string) =>
    createSeededSketchLinePath({
      end: createWorldPoint(endX, endY),
      seed: `${elementId}:calendar:${salt}`,
      start: createWorldPoint(startX, startY),
    });
  paths.push(line(left, top + 6, right, top + 6, 'header'));
  paths.push(line(left + 7, top, left + 7, top + 5, 'binding-left'));
  paths.push(line(right - 7, top, right - 7, top + 5, 'binding-right'));
  for (const [index, ratio] of [1 / 3, 2 / 3].entries()) {
    paths.push(
      line(left + size * ratio, top + 7, left + size * ratio, bottom, `column-${String(index)}`),
    );
    paths.push(
      line(
        left,
        top + 7 + (size - 7) * ratio,
        right,
        top + 7 + (size - 7) * ratio,
        `row-${String(index)}`,
      ),
    );
  }
  return paths.join(' ');
};

const createStepperAdornmentMarkPath = (
  bounds: WorldRect,
  elementId: string,
  width: number,
): string => {
  const stepper = createWorldRect(bounds.x + bounds.width - width, bounds.y, width, bounds.height);
  const left = stepper.x;
  const right = stepper.x + stepper.width;
  const top = stepper.y;
  const bottom = stepper.y + stepper.height;
  const centerX = left + stepper.width / 2;
  const middleY = top + stepper.height / 2;
  const halfTriangleWidth = Math.min(4, stepper.width * 0.28);
  const triangleHeight = Math.min(5, stepper.height * 0.21);
  const line = (startX: number, startY: number, endX: number, endY: number, salt: string) =>
    createSeededSketchLinePath({
      end: createWorldPoint(endX, endY),
      seed: `${elementId}:stepper:${salt}`,
      start: createWorldPoint(startX, startY),
    });
  const upPointY = top + stepper.height * 0.18;
  const downPointY = bottom - stepper.height * 0.18;
  return [
    line(left, top, right, top, 'top'),
    line(right, top, right, bottom, 'right'),
    line(right, bottom, left, bottom, 'bottom'),
    line(left, bottom, left, top, 'left'),
    line(left, middleY, right, middleY, 'divider'),
    `M ${String(centerX)} ${String(upPointY)} L ${String(centerX + halfTriangleWidth)} ${String(upPointY + triangleHeight)} L ${String(centerX - halfTriangleWidth)} ${String(upPointY + triangleHeight)} Z`,
    `M ${String(centerX - halfTriangleWidth)} ${String(downPointY - triangleHeight)} L ${String(centerX + halfTriangleWidth)} ${String(downPointY - triangleHeight)} L ${String(centerX)} ${String(downPointY)} Z`,
  ].join(' ');
};

/** Small registry-bound decoration shared by live, thumbnail, presentation, and export projections. */
export const createControlSceneScrollbarPath = (bounds: WorldRect, identity: string): string => {
  const inset = Math.min(8, bounds.height / 4, bounds.width / 4);
  return createSeededSketchLinePath({
    end: createWorldPoint(bounds.x + bounds.width - inset, bounds.y + bounds.height - inset),
    seed: `${identity}:scrollbar`,
    start: createWorldPoint(bounds.x + bounds.width - inset, bounds.y + inset),
  });
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

const createSearchBoxMarkPath = (
  bounds: WorldRect,
  elementId: string,
  properties: ElementProperties,
): string => {
  const extent = Math.max(0, Math.min(16, bounds.height - 6, bounds.width / 4));
  if (extent === 0) return '';
  const centerY = bounds.y + bounds.height / 2;
  const paths: string[] = [];
  if (properties.searchIcon === true) {
    const radius = extent * 0.32;
    const center = createWorldPoint(bounds.x + 8 + radius, centerY - radius * 0.12);
    paths.push(createSeededCirclePath(center, radius, elementId, 'search-box-search'));
    paths.push(
      createSeededSketchLinePath({
        end: createWorldPoint(center.x + radius * 1.55, center.y + radius * 1.55),
        seed: `${elementId}:search-box-search-handle`,
        start: createWorldPoint(center.x + radius * 0.72, center.y + radius * 0.72),
      }),
    );
  }
  if (properties.microphoneIcon === true) {
    const centerX = bounds.x + bounds.width - 8 - extent * 0.35;
    const radius = extent * 0.22;
    const top = centerY - extent * 0.34;
    const bottom = centerY + extent * 0.12;
    paths.push(
      [
        `M ${String(centerX)} ${String(top)}`,
        `Q ${String(centerX - radius)} ${String(top)} ${String(centerX - radius)} ${String(top + radius)}`,
        `L ${String(centerX - radius)} ${String(bottom - radius)}`,
        `Q ${String(centerX - radius)} ${String(bottom)} ${String(centerX)} ${String(bottom)}`,
        `Q ${String(centerX + radius)} ${String(bottom)} ${String(centerX + radius)} ${String(bottom - radius)}`,
        `L ${String(centerX + radius)} ${String(top + radius)}`,
        `Q ${String(centerX + radius)} ${String(top)} ${String(centerX)} ${String(top)}`,
        `M ${String(centerX - radius * 1.8)} ${String(centerY)}`,
        `Q ${String(centerX)} ${String(centerY + extent * 0.44)} ${String(centerX + radius * 1.8)} ${String(centerY)}`,
        `M ${String(centerX)} ${String(centerY + extent * 0.28)}`,
        `L ${String(centerX)} ${String(centerY + extent * 0.48)}`,
      ].join(' '),
    );
  }
  return paths.join(' ');
};

const createSeededPolylinePath = (
  points: readonly ReturnType<typeof createWorldPoint>[],
  elementId: string,
  salt: string,
  closed = false,
): string => {
  const pathPoints = closed && points.length > 1 ? [...points, points[0]!] : points;
  return pathPoints
    .slice(1)
    .map((end, index) =>
      createSeededSketchLinePath({
        end,
        seed: `${elementId}:${salt}:${String(index)}`,
        start: pathPoints[index]!,
      }),
    )
    .join(' ');
};

const createSeededCirclePath = (
  center: ReturnType<typeof createWorldPoint>,
  radius: number,
  elementId: string,
  salt: string,
): string => {
  const segmentCount = 12;
  return createSeededPolylinePath(
    Array.from({ length: segmentCount }, (_, index) => {
      const angle = (index / segmentCount) * Math.PI * 2;
      return createWorldPoint(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius,
      );
    }),
    elementId,
    salt,
    true,
  );
};

/** A callout keeps the seeded hand-drawn contour while text Auto-Size may widen either axis. */
const createSeededEllipsePath = (bounds: WorldRect, elementId: string, salt: string): string => {
  const segmentCount = 12;
  const center = createWorldPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  const radiusX = bounds.width * 0.48;
  const radiusY = bounds.height * 0.48;
  return createSeededPolylinePath(
    Array.from({ length: segmentCount }, (_, index) => {
      const angle = (index / segmentCount) * Math.PI * 2;
      return createWorldPoint(
        center.x + Math.cos(angle) * radiusX,
        center.y + Math.sin(angle) * radiusY,
      );
    }),
    elementId,
    salt,
    true,
  );
};

const createScratchOutMarkPath = (bounds: WorldRect, elementId: string): string => {
  const rows = 7;
  return Array.from({ length: rows }, (_, index) => {
    const y = bounds.y + bounds.height * (0.12 + (index / (rows - 1)) * 0.76);
    const reverse = index % 2 === 1;
    return createSeededSketchLinePath({
      end: createWorldPoint(
        reverse ? bounds.x + bounds.width * 0.08 : bounds.x + bounds.width * 0.92,
        y,
      ),
      seed: `${elementId}:scratch-out:${String(index)}`,
      start: createWorldPoint(
        reverse ? bounds.x + bounds.width * 0.92 : bounds.x + bounds.width * 0.08,
        y,
      ),
    });
  }).join(' ');
};

const createHelpButtonMarkPath = (bounds: WorldRect, elementId: string): string => {
  const centerX = bounds.x + bounds.width / 2;
  const top = bounds.y + bounds.height * 0.2;
  const middle = bounds.y + bounds.height * 0.58;
  const bottom = bounds.y + bounds.height * 0.78;
  return [
    createSeededPolylinePath(
      [
        createWorldPoint(centerX - bounds.width * 0.14, top),
        createWorldPoint(centerX + bounds.width * 0.14, top),
        createWorldPoint(centerX + bounds.width * 0.12, bounds.y + bounds.height * 0.42),
        createWorldPoint(centerX, middle),
      ],
      elementId,
      'help-button-question',
    ),
    createSeededCirclePath(
      createWorldPoint(centerX, bottom),
      Math.max(0.8, Math.min(bounds.width, bounds.height) * 0.025),
      elementId,
      'help-button-dot',
    ),
  ].join(' ');
};

const createColorPickerMarkPath = (bounds: WorldRect, elementId: string): string =>
  createSeededPolylinePath(
    [
      createWorldPoint(bounds.x + bounds.width * 0.58, bounds.y + bounds.height * 0.72),
      createWorldPoint(bounds.x + bounds.width * 0.88, bounds.y + bounds.height * 0.72),
      createWorldPoint(bounds.x + bounds.width * 0.73, bounds.y + bounds.height * 0.9),
    ],
    elementId,
    'color-picker-indicator',
    true,
  );

const createOnOffSwitchMarkPath = (
  bounds: WorldRect,
  elementId: string,
  properties: ElementProperties,
): string => {
  const radius = bounds.height * 0.38;
  const centerX =
    properties.state === 'off'
      ? bounds.x + radius + bounds.width * 0.08
      : bounds.x + bounds.width - radius - bounds.width * 0.08;
  return createSeededCirclePath(
    createWorldPoint(centerX, bounds.y + bounds.height / 2),
    radius,
    elementId,
    'on-off-switch-thumb',
  );
};

const createPlaybackMarkPath = (bounds: WorldRect, elementId: string): string => {
  const centerY = bounds.y + bounds.height / 2;
  const radius = Math.min(bounds.height * 0.38, bounds.width * 0.12);
  const centers = [0.18, 0.5, 0.82].map((x) =>
    createWorldPoint(bounds.x + bounds.width * x, centerY),
  );
  const iconRadius = radius * 0.48;
  const previous = centers[0]!;
  const play = centers[1]!;
  const next = centers[2]!;
  return [
    ...centers.map((center, index) =>
      createSeededCirclePath(center, radius, elementId, `playback-button-${String(index)}`),
    ),
    createSeededPolylinePath(
      [
        createWorldPoint(play.x - iconRadius * 0.55, play.y - iconRadius),
        createWorldPoint(play.x + iconRadius, play.y),
        createWorldPoint(play.x - iconRadius * 0.55, play.y + iconRadius),
      ],
      elementId,
      'playback-play',
      true,
    ),
    ...[-0.45, 0.35].map((offset, index) =>
      createSeededPolylinePath(
        [
          createWorldPoint(
            previous.x + iconRadius * offset + iconRadius * 0.45,
            previous.y - iconRadius,
          ),
          createWorldPoint(previous.x + iconRadius * offset - iconRadius * 0.55, previous.y),
          createWorldPoint(
            previous.x + iconRadius * offset + iconRadius * 0.45,
            previous.y + iconRadius,
          ),
        ],
        elementId,
        `playback-previous-${String(index)}`,
        true,
      ),
    ),
    ...[-0.35, 0.45].map((offset, index) =>
      createSeededPolylinePath(
        [
          createWorldPoint(next.x + iconRadius * offset - iconRadius * 0.45, next.y - iconRadius),
          createWorldPoint(next.x + iconRadius * offset + iconRadius * 0.55, next.y),
          createWorldPoint(next.x + iconRadius * offset - iconRadius * 0.45, next.y + iconRadius),
        ],
        elementId,
        `playback-next-${String(index)}`,
        true,
      ),
    ),
  ].join(' ');
};

const createIosPickerMarkPath = (bounds: WorldRect, elementId: string): string => {
  const marks: string[] = [];
  for (const [index, ratio] of [0.42, 0.58].entries()) {
    marks.push(
      createSeededSketchLinePath({
        end: createWorldPoint(bounds.x + bounds.width, bounds.y + bounds.height * ratio),
        seed: `${elementId}:ios-picker-selection:${String(index)}`,
        start: createWorldPoint(bounds.x, bounds.y + bounds.height * ratio),
      }),
    );
  }
  for (let column = 1; column < 3; column += 1) {
    const x = bounds.x + (bounds.width * column) / 3;
    marks.push(
      createSeededSketchLinePath({
        end: createWorldPoint(x, bounds.y + bounds.height * 0.88),
        seed: `${elementId}:ios-picker-column:${String(column)}`,
        start: createWorldPoint(x, bounds.y + bounds.height * 0.12),
      }),
    );
  }
  for (let row = 1; row < 6; row += 1) {
    const y = bounds.y + (bounds.height * row) / 6;
    for (let column = 0; column < 3; column += 1) {
      const centerX = bounds.x + bounds.width * ((column + 0.5) / 3);
      marks.push(
        createSeededSketchLinePath({
          end: createWorldPoint(centerX + bounds.width * 0.06, y),
          seed: `${elementId}:ios-picker-value:${String(row)}:${String(column)}`,
          start: createWorldPoint(centerX - bounds.width * 0.06, y),
        }),
      );
    }
  }
  return marks.join(' ');
};

const createSplitterMarkPath = (
  bounds: WorldRect,
  elementId: string,
  orientation: 'horizontal' | 'vertical',
): string => {
  const horizontal = orientation === 'horizontal';
  return [-1, 0, 1]
    .map((offset, index) => {
      const x = bounds.x + bounds.width / 2 + (horizontal ? offset * bounds.height * 0.55 : 0);
      const y = bounds.y + bounds.height / 2 + (horizontal ? 0 : offset * bounds.width * 0.55);
      return createSeededCirclePath(
        createWorldPoint(x, y),
        Math.max(0.8, Math.min(bounds.width, bounds.height) * 0.09),
        elementId,
        `${orientation}-splitter-grip:${String(index)}`,
      );
    })
    .join(' ');
};

const createRedXMarkPath = (bounds: WorldRect, elementId: string): string =>
  [
    createSeededSketchLinePath({
      end: createWorldPoint(bounds.x + bounds.width * 0.96, bounds.y + bounds.height * 0.94),
      seed: `${elementId}:red-x:first`,
      start: createWorldPoint(bounds.x + bounds.width * 0.04, bounds.y + bounds.height * 0.06),
    }),
    createSeededSketchLinePath({
      end: createWorldPoint(bounds.x + bounds.width * 0.04, bounds.y + bounds.height * 0.94),
      seed: `${elementId}:red-x:second`,
      start: createWorldPoint(bounds.x + bounds.width * 0.96, bounds.y + bounds.height * 0.06),
    }),
  ].join(' ');

const createSquigglyBlockMarkPath = (bounds: WorldRect, elementId: string): string => {
  const lines: string[] = [];
  const rowCount = Math.max(2, Math.min(6, Math.round(bounds.height / 18)));
  for (let row = 0; row < rowCount; row += 1) {
    const y = bounds.y + bounds.height * ((row + 0.7) / rowCount);
    const pointCount = 12;
    const widthRatio = row === rowCount - 1 ? 0.72 : 0.92;
    const points = Array.from({ length: pointCount }, (_, index) =>
      createWorldPoint(
        bounds.x + bounds.width * (0.04 + (widthRatio * index) / (pointCount - 1)),
        y + (index % 2 === 0 ? -1 : 1) * Math.max(1, bounds.height * 0.025),
      ),
    );
    lines.push(createSeededPolylinePath(points, elementId, `squiggly-block:${String(row)}`));
  }
  return lines.join(' ');
};

const createStreetMapMarkPath = (bounds: WorldRect, elementId: string): string => {
  const point = (x: number, y: number) =>
    createWorldPoint(bounds.x + bounds.width * x, bounds.y + bounds.height * y);
  return [
    createSeededPolylinePath(
      [
        point(0.02, 0.72),
        point(0.24, 0.65),
        point(0.48, 0.62),
        point(0.74, 0.5),
        point(0.98, 0.46),
      ],
      elementId,
      'street-map-primary-horizontal',
    ),
    createSeededPolylinePath(
      [point(0.18, 0), point(0.24, 0.32), point(0.28, 0.62), point(0.32, 1)],
      elementId,
      'street-map-primary-vertical',
    ),
    createSeededPolylinePath(
      [point(0.58, 0), point(0.62, 0.36), point(0.7, 0.74), point(0.72, 1)],
      elementId,
      'street-map-secondary-vertical',
    ),
    createSeededPolylinePath(
      [point(0, 0.34), point(0.32, 0.27), point(0.64, 0.22), point(1, 0.12)],
      elementId,
      'street-map-secondary-horizontal',
    ),
    createSeededPolylinePath(
      [point(0.04, 0.72), point(0.2, 0.58), point(0.4, 0.56), point(0.44, 0.72), point(0.06, 0.8)],
      elementId,
      'street-map-park',
      true,
    ),
  ].join(' ');
};

const createToolbarMarkPath = (bounds: WorldRect, elementId: string): string => {
  const marks: string[] = [];
  const itemCount = 9;
  for (let item = 1; item < itemCount; item += 1) {
    const x = bounds.x + (bounds.width * item) / itemCount;
    marks.push(
      createSeededSketchLinePath({
        end: createWorldPoint(x, bounds.y + bounds.height * 0.84),
        seed: `${elementId}:toolbar-divider:${String(item)}`,
        start: createWorldPoint(x, bounds.y + bounds.height * 0.16),
      }),
    );
  }
  for (let item = 0; item < itemCount; item += 1) {
    const centerX = bounds.x + bounds.width * ((item + 0.5) / itemCount);
    const centerY = bounds.y + bounds.height / 2;
    if (item % 3 === 0) {
      marks.push(
        createSeededCirclePath(
          createWorldPoint(centerX, centerY),
          bounds.height * 0.18,
          elementId,
          `toolbar-mark:${String(item)}`,
        ),
      );
    } else {
      marks.push(
        createSeededSketchLinePath({
          end: createWorldPoint(centerX + bounds.width * 0.02, centerY),
          seed: `${elementId}:toolbar-mark:${String(item)}`,
          start: createWorldPoint(centerX - bounds.width * 0.02, centerY),
        }),
      );
    }
  }
  return marks.join(' ');
};

const createChartBarMarkPath = (bounds: WorldRect, elementId: string): string =>
  [
    [0.14, 0.72],
    [0.34, 0.58],
    [0.54, 0.86],
    [0.74, 0.66],
  ]
    .map(([verticalRatio, widthRatio], index) =>
      createSeededSketchRectPath(
        createWorldRect(
          bounds.x + bounds.width * 0.06,
          bounds.y + bounds.height * verticalRatio!,
          bounds.width * widthRatio!,
          bounds.height * 0.13,
        ),
        `${elementId}:chart-bar:${String(index)}`,
      ),
    )
    .join(' ');

const createCalendarMarkPath = (bounds: WorldRect, elementId: string): string => {
  const marks: string[] = [];
  const headerRatios = [0.12, 0.24];
  for (const [index, ratio] of headerRatios.entries()) {
    marks.push(
      createSeededSketchLinePath({
        end: createWorldPoint(bounds.x + bounds.width, bounds.y + bounds.height * ratio),
        seed: `${elementId}:calendar-header:${String(index)}`,
        start: createWorldPoint(bounds.x, bounds.y + bounds.height * ratio),
      }),
    );
  }
  for (let column = 1; column < 7; column += 1) {
    const x = bounds.x + (bounds.width * column) / 7;
    marks.push(
      createSeededSketchLinePath({
        end: createWorldPoint(x, bounds.y + bounds.height),
        seed: `${elementId}:calendar-column:${String(column)}`,
        start: createWorldPoint(x, bounds.y + bounds.height * 0.12),
      }),
    );
  }
  for (let row = 1; row < 6; row += 1) {
    const y = bounds.y + bounds.height * (0.24 + (row * 0.76) / 6);
    marks.push(
      createSeededSketchLinePath({
        end: createWorldPoint(bounds.x + bounds.width, y),
        seed: `${elementId}:calendar-row:${String(row)}`,
        start: createWorldPoint(bounds.x, y),
      }),
    );
  }
  marks.push(
    createSeededCirclePath(
      createWorldPoint(bounds.x + bounds.width * 0.89, bounds.y + bounds.height * 0.57),
      Math.min(bounds.width / 14, bounds.height / 12) * 0.45,
      elementId,
      'calendar-selected-date',
    ),
  );
  return marks.join(' ');
};

const createChartLineMarkPath = (bounds: WorldRect, elementId: string): string => {
  const point = (x: number, y: number) =>
    createWorldPoint(bounds.x + bounds.width * x, bounds.y + bounds.height * y);
  return [
    createSeededSketchLinePath({
      end: point(0.94, 0.9),
      seed: `${elementId}:chart-line-horizontal-axis`,
      start: point(0.08, 0.9),
    }),
    createSeededSketchLinePath({
      end: point(0.08, 0.08),
      seed: `${elementId}:chart-line-vertical-axis`,
      start: point(0.08, 0.9),
    }),
    createSeededPolylinePath(
      [point(0.08, 0.82), point(0.36, 0.64), point(0.68, 0.2), point(0.92, 0.4)],
      elementId,
      'chart-line-primary',
    ),
    createSeededPolylinePath(
      [point(0.08, 0.88), point(0.3, 0.42), point(0.66, 0.68), point(0.92, 0.14)],
      elementId,
      'chart-line-secondary',
    ),
  ].join(' ');
};

const createChartPieMarkPath = (bounds: WorldRect, elementId: string): string => {
  const center = createWorldPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  const radius = Math.min(bounds.width, bounds.height) * 0.42;
  return [
    createSeededCirclePath(center, radius, elementId, 'chart-pie-circle'),
    createSeededSketchLinePath({
      end: createWorldPoint(center.x, center.y - radius),
      seed: `${elementId}:chart-pie-first-radius`,
      start: center,
    }),
    createSeededSketchLinePath({
      end: createWorldPoint(center.x - radius * 0.72, center.y + radius * 0.7),
      seed: `${elementId}:chart-pie-second-radius`,
      start: center,
    }),
  ].join(' ');
};

const createVolumeMarkPath = (
  bounds: WorldRect,
  elementId: string,
  saltPrefix: string,
  sliderStartRatio = 0.28,
  thumbRatio = 0.62,
): string => {
  const centerY = bounds.y + bounds.height / 2;
  const speakerLeft = bounds.x + bounds.width * 0.04;
  const speakerRight = bounds.x + bounds.width * 0.21;
  const sliderStart = bounds.x + bounds.width * sliderStartRatio;
  const sliderEnd = bounds.x + bounds.width * 0.94;
  const thumbX = bounds.x + bounds.width * thumbRatio;
  return [
    createSeededPolylinePath(
      [
        createWorldPoint(speakerLeft, centerY - bounds.height * 0.16),
        createWorldPoint(speakerLeft + bounds.width * 0.05, centerY - bounds.height * 0.16),
        createWorldPoint(speakerRight, centerY - bounds.height * 0.34),
        createWorldPoint(speakerRight, centerY + bounds.height * 0.34),
        createWorldPoint(speakerLeft + bounds.width * 0.05, centerY + bounds.height * 0.16),
        createWorldPoint(speakerLeft, centerY + bounds.height * 0.16),
      ],
      elementId,
      `${saltPrefix}-speaker`,
      true,
    ),
    createSeededSketchLinePath({
      end: createWorldPoint(sliderEnd, centerY),
      seed: `${elementId}:${saltPrefix}-track`,
      start: createWorldPoint(sliderStart, centerY),
    }),
    createSeededCirclePath(
      createWorldPoint(thumbX, centerY),
      Math.max(2, Math.min(bounds.height * 0.28, bounds.width * 0.06)),
      elementId,
      `${saltPrefix}-thumb`,
    ),
  ].join(' ');
};

const createVideoPlayerMarkPath = (bounds: WorldRect, elementId: string): string => {
  const controlsY = bounds.y + bounds.height * 0.82;
  const playCenter = createWorldPoint(
    bounds.x + bounds.width * 0.08,
    controlsY + bounds.height * 0.09,
  );
  const playRadius = Math.min(bounds.width * 0.04, bounds.height * 0.07);
  return [
    createSeededSketchLinePath({
      end: createWorldPoint(bounds.x + bounds.width, controlsY),
      seed: `${elementId}:video-controls-divider`,
      start: createWorldPoint(bounds.x, controlsY),
    }),
    createSeededCirclePath(playCenter, playRadius, elementId, 'video-play-button'),
    createSeededPolylinePath(
      [
        createWorldPoint(playCenter.x - playRadius * 0.32, playCenter.y - playRadius * 0.55),
        createWorldPoint(playCenter.x + playRadius * 0.58, playCenter.y),
        createWorldPoint(playCenter.x - playRadius * 0.32, playCenter.y + playRadius * 0.55),
      ],
      elementId,
      'video-play-mark',
      true,
    ),
    createSeededSketchLinePath({
      end: createWorldPoint(bounds.x + bounds.width * 0.72, playCenter.y),
      seed: `${elementId}:video-progress-track`,
      start: createWorldPoint(bounds.x + bounds.width * 0.16, playCenter.y),
    }),
    createSeededSketchLinePath({
      end: createWorldPoint(bounds.x + bounds.width * 0.46, playCenter.y),
      seed: `${elementId}:video-progress-value`,
      start: createWorldPoint(bounds.x + bounds.width * 0.16, playCenter.y),
    }),
    createVolumeMarkPath(
      createWorldRect(
        bounds.x + bounds.width * 0.75,
        controlsY + bounds.height * 0.025,
        bounds.width * 0.18,
        bounds.height * 0.13,
      ),
      elementId,
      'video-volume',
      0.5,
      0.72,
    ),
  ].join(' ');
};

const createWebcamMarkPath = (bounds: WorldRect, elementId: string): string => {
  const centerX = bounds.x + bounds.width / 2;
  const headCenter = createWorldPoint(centerX, bounds.y + bounds.height * 0.38);
  const headRadius = Math.min(bounds.width * 0.22, bounds.height * 0.25);
  return [
    createSeededCirclePath(headCenter, headRadius, elementId, 'webcam-head'),
    createSeededCirclePath(
      createWorldPoint(headCenter.x - headRadius * 0.38, headCenter.y - headRadius * 0.15),
      Math.max(1, headRadius * 0.06),
      elementId,
      'webcam-left-eye',
    ),
    createSeededCirclePath(
      createWorldPoint(headCenter.x + headRadius * 0.38, headCenter.y - headRadius * 0.15),
      Math.max(1, headRadius * 0.06),
      elementId,
      'webcam-right-eye',
    ),
    createSeededPolylinePath(
      [
        createWorldPoint(headCenter.x - headRadius * 0.45, headCenter.y + headRadius * 0.28),
        createWorldPoint(headCenter.x, headCenter.y + headRadius * 0.48),
        createWorldPoint(headCenter.x + headRadius * 0.45, headCenter.y + headRadius * 0.28),
      ],
      elementId,
      'webcam-smile',
    ),
    createSeededPolylinePath(
      [
        createWorldPoint(bounds.x + bounds.width * 0.16, bounds.y + bounds.height),
        createWorldPoint(bounds.x + bounds.width * 0.24, bounds.y + bounds.height * 0.72),
        createWorldPoint(centerX, bounds.y + bounds.height * 0.62),
        createWorldPoint(bounds.x + bounds.width * 0.76, bounds.y + bounds.height * 0.72),
        createWorldPoint(bounds.x + bounds.width * 0.84, bounds.y + bounds.height),
      ],
      elementId,
      'webcam-shoulders',
    ),
  ].join(' ');
};

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
  const trailingAdornment = definition.scene.trailingAdornment;
  if (trailingAdornment?.kind === 'calendar') {
    return createCalendarAdornmentMarkPath(bounds, elementId, trailingAdornment.size);
  }
  if (trailingAdornment?.kind === 'stepper') {
    return createStepperAdornmentMarkPath(bounds, elementId, trailingAdornment.width);
  }
  if (definition.scene.kind === 'comment') {
    const left = bounds.x + bounds.width * 0.28;
    const right = bounds.x + bounds.width * 0.72;
    const top = bounds.y + bounds.height * 0.02;
    const bottom = bounds.y + bounds.height * 0.17;
    return [
      `M ${String(left)} ${String(top + 2)}`,
      `L ${String(right)} ${String(top)}`,
      `L ${String(right - 1)} ${String(bottom)}`,
      `L ${String(left + 2)} ${String(bottom + 1)}`,
      'Z',
    ].join(' ');
  }
  if (definition.scene.kind === 'tooltip') {
    return createTooltipMarkPath(bounds, properties);
  }
  if (definition.scene.kind === 'image') {
    return createImagePlaceholderMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'browser') {
    return createBrowserMarkPath(bounds, elementId, properties);
  }
  if (definition.scene.kind === 'arrow') {
    return createArrowMarkPath(controlType, bounds, elementId, properties);
  }
  if (definition.scene.kind === 'chart-bar') {
    return createChartBarMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'calendar') {
    return createCalendarMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'chart-line') {
    return createChartLineMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'chart-pie') {
    return createChartPieMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'playback') {
    return createPlaybackMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'ios-picker') {
    return createIosPickerMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'h-splitter') {
    return createSplitterMarkPath(bounds, elementId, 'horizontal');
  }
  if (definition.scene.kind === 'v-splitter') {
    return createSplitterMarkPath(bounds, elementId, 'vertical');
  }
  if (definition.scene.kind === 'red-x') {
    return createRedXMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'scratch-out') {
    return createScratchOutMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'search-box') {
    return createSearchBoxMarkPath(bounds, elementId, properties);
  }
  if (definition.scene.kind === 'help-button') {
    return createHelpButtonMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'color-picker') {
    return createColorPickerMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'on-off-switch') {
    return createOnOffSwitchMarkPath(bounds, elementId, properties);
  }
  if (definition.scene.kind === 'squiggly-block') {
    return createSquigglyBlockMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'street-map') {
    return createStreetMapMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'toolbar') {
    return createToolbarMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'video-player') {
    return createVideoPlayerMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'volume-slider') {
    return createVolumeMarkPath(bounds, elementId, 'volume-slider');
  }
  if (definition.scene.kind === 'webcam') {
    return createWebcamMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'radio-button') {
    if (properties.state !== 'selected') return '';
    const circle = getControlScenePrimitiveBounds(controlType, bounds);
    return createSeededCirclePath(
      createWorldPoint(circle.x + circle.width / 2, circle.y + circle.height / 2),
      circle.width * 0.23,
      elementId,
      'radio-button-selected',
    );
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
  ![
    'arrow',
    'h-rule',
    'help-button',
    'scratch-out',
    'text',
    'tooltip',
    'transparent',
    'v-rule',
  ].includes(definition.scene.kind);

export const controlSceneHasOutline = (definition: ControlDefinition): boolean =>
  !['comment', 'red-x', 'scratch-out', 'squiggly-block', 'text', 'tooltip', 'transparent'].includes(
    definition.scene.kind,
  );
