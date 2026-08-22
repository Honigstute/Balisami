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
  if (definition.scene.kind === 'image') {
    return createImagePlaceholderMarkPath(bounds, elementId);
  }
  if (definition.scene.kind === 'browser') {
    return createBrowserMarkPath(bounds, elementId, properties);
  }
  if (definition.scene.kind === 'arrow') {
    return createArrowMarkPath(controlType, bounds, elementId, properties);
  }
  if (definition.scene.kind === 'playback') {
    return createPlaybackMarkPath(bounds, elementId);
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
