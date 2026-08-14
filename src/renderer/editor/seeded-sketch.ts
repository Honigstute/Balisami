import {
  createWorldPoint,
  createWorldRect,
  type WorldPoint,
  type WorldRect,
} from './viewport-transform';

export const SEEDED_SKETCH_POLICY = Object.freeze({
  maximumRoughness: 2,
  pathDecimalPlaces: 3,
  referenceOffset: 1.2,
});

export interface SeededSketchLineInput {
  readonly end: WorldPoint;
  readonly roughness?: number;
  readonly seed: string;
  readonly start: WorldPoint;
}

const requireSeed = (seed: string): string => {
  if (seed.length === 0 || seed.length > 512) {
    throw new RangeError('Sketch seed must contain between 1 and 512 characters.');
  }
  return seed;
};

const getRoughness = (roughness = 1): number => {
  if (
    !Number.isFinite(roughness) ||
    roughness < 0 ||
    roughness > SEEDED_SKETCH_POLICY.maximumRoughness
  ) {
    throw new RangeError(
      `Sketch roughness must be between 0 and ${String(SEEDED_SKETCH_POLICY.maximumRoughness)}.`,
    );
  }
  return roughness;
};

/** FNV-1a keeps element-identity seeds identical across OSes and sessions. */
export const deriveSketchSeed = (identity: string, primitive: string): number => {
  const value = `${requireSeed(identity)}\u0000${requireSeed(primitive)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const createRandom = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const formatPathNumber = (value: number): string => {
  const rounded = Number(value.toFixed(SEEDED_SKETCH_POLICY.pathDecimalPlaces));
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

const getControlPoint = (
  start: WorldPoint,
  deltaX: number,
  deltaY: number,
  normalX: number,
  normalY: number,
  progress: number,
  offset: number,
): WorldPoint =>
  createWorldPoint(
    start.x + deltaX * progress + normalX * offset,
    start.y + deltaY * progress + normalY * offset,
  );

/** Produces two stable cubic passes with exact endpoints and seeded bowing. */
export const createSeededSketchLinePath = ({
  end,
  roughness: roughnessInput,
  seed,
  start,
}: SeededSketchLineInput): string => {
  const roughness = getRoughness(roughnessInput);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  if (!Number.isFinite(length) || length <= 0) {
    throw new RangeError('Sketch line endpoints must define a finite positive length.');
  }
  const normalX = -deltaY / length;
  const normalY = deltaX / length;
  const maximumOffset = Math.min(
    SEEDED_SKETCH_POLICY.referenceOffset * roughness,
    length * 0.025 * roughness,
  );
  const random = createRandom(deriveSketchSeed(seed, 'line'));
  const commands: string[] = [];

  for (let pass = 0; pass < 2; pass += 1) {
    const offsetOne = (random() * 2 - 1) * maximumOffset;
    const offsetTwo = (random() * 2 - 1) * maximumOffset;
    const controlOne = getControlPoint(start, deltaX, deltaY, normalX, normalY, 0.32, offsetOne);
    const controlTwo = getControlPoint(start, deltaX, deltaY, normalX, normalY, 0.68, offsetTwo);
    commands.push(
      `M ${formatPathNumber(start.x)} ${formatPathNumber(start.y)} C ${formatPathNumber(controlOne.x)} ${formatPathNumber(controlOne.y)} ${formatPathNumber(controlTwo.x)} ${formatPathNumber(controlTwo.y)} ${formatPathNumber(end.x)} ${formatPathNumber(end.y)}`,
    );
  }

  return commands.join(' ');
};

/** Rectangle edges share identity but use explicit salts, so reopen/export paths remain exact. */
export const createSeededSketchRectPath = (
  bounds: WorldRect,
  seed: string,
  roughness?: number,
): string => {
  requireSeed(seed);
  const normalizedRoughness = getRoughness(roughness);
  const normalizedBounds = createWorldRect(bounds.x, bounds.y, bounds.width, bounds.height);
  const topLeft = createWorldPoint(normalizedBounds.x, normalizedBounds.y);
  const topRight = createWorldPoint(
    normalizedBounds.x + normalizedBounds.width,
    normalizedBounds.y,
  );
  const bottomRight = createWorldPoint(
    normalizedBounds.x + normalizedBounds.width,
    normalizedBounds.y + normalizedBounds.height,
  );
  const bottomLeft = createWorldPoint(
    normalizedBounds.x,
    normalizedBounds.y + normalizedBounds.height,
  );
  return [
    createSeededSketchLinePath({
      end: topRight,
      roughness: normalizedRoughness,
      seed: String(deriveSketchSeed(seed, 'rectangle:top')),
      start: topLeft,
    }),
    createSeededSketchLinePath({
      end: bottomRight,
      roughness: normalizedRoughness,
      seed: String(deriveSketchSeed(seed, 'rectangle:right')),
      start: topRight,
    }),
    createSeededSketchLinePath({
      end: bottomLeft,
      roughness: normalizedRoughness,
      seed: String(deriveSketchSeed(seed, 'rectangle:bottom')),
      start: bottomRight,
    }),
    createSeededSketchLinePath({
      end: topLeft,
      roughness: normalizedRoughness,
      seed: String(deriveSketchSeed(seed, 'rectangle:left')),
      start: bottomLeft,
    }),
  ].join(' ');
};
