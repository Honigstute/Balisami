const POINT_SPACE: unique symbol = Symbol('point-space');
const VECTOR_SPACE: unique symbol = Symbol('vector-space');
const RECT_SPACE: unique symbol = Symbol('rect-space');
const SIZE_SPACE: unique symbol = Symbol('size-space');
const VIEWPORT_ZOOM: unique symbol = Symbol('viewport-zoom');
const DEVICE_SCALE: unique symbol = Symbol('device-scale');

type Point<Space extends string> = Readonly<{
  readonly [POINT_SPACE]: Space;
  readonly x: number;
  readonly y: number;
}>;

type Vector<Space extends string> = Readonly<{
  readonly [VECTOR_SPACE]: Space;
  readonly x: number;
  readonly y: number;
}>;

type Rect<Space extends string> = Readonly<{
  readonly [RECT_SPACE]: Space;
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}>;

type Size<Space extends string> = Readonly<{
  readonly [SIZE_SPACE]: Space;
  readonly height: number;
  readonly width: number;
}>;

export type ClientPoint = Point<'client'>;
export type WorldPoint = Point<'world'>;
export type ViewportPoint = Point<'viewport'>;
export type DevicePoint = Point<'device'>;
export type WorldVector = Vector<'world'>;
export type ViewportVector = Vector<'viewport'>;
export type DeviceVector = Vector<'device'>;
export type WorldRect = Rect<'world'>;
export type ViewportRect = Rect<'viewport'>;
export type ViewportSize = Size<'viewport'>;

export type ViewportZoom = number & { readonly [VIEWPORT_ZOOM]: true };
export type DeviceScale = number & { readonly [DEVICE_SCALE]: true };

export interface ViewportClientBounds {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

export interface ViewportTransform {
  readonly pan: ViewportVector;
  readonly zoom: ViewportZoom;
}

export interface ViewportTransformInput {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
}

/**
 * Model geometry retains floating-point precision. Conversions never round;
 * inspector formatting, snapping, and final rasterization own any later rounding.
 */
export const VIEWPORT_NUMERIC_POLICY = Object.freeze({
  maximumZoom: 4,
  minimumZoom: 0.1,
  roundTripEpsilon: 1e-9,
});

const requireFinite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`);
  }
  return value;
};

const requirePositive = (value: number, label: string): number => {
  requireFinite(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be positive.`);
  }
  return value;
};

const createPoint = <Space extends string>(x: number, y: number, label: string): Point<Space> =>
  Object.freeze({
    x: requireFinite(x, `${label} x`),
    y: requireFinite(y, `${label} y`),
  }) as Point<Space>;

const createVector = <Space extends string>(x: number, y: number, label: string): Vector<Space> =>
  Object.freeze({
    x: requireFinite(x, `${label} x`),
    y: requireFinite(y, `${label} y`),
  }) as Vector<Space>;

const createRect = <Space extends string>(
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
): Rect<Space> =>
  Object.freeze({
    height: requirePositive(height, `${label} height`),
    width: requirePositive(width, `${label} width`),
    x: requireFinite(x, `${label} x`),
    y: requireFinite(y, `${label} y`),
  }) as Rect<Space>;

export const createClientPoint = (x: number, y: number): ClientPoint =>
  createPoint<'client'>(x, y, 'Client point');

export const createWorldPoint = (x: number, y: number): WorldPoint =>
  createPoint<'world'>(x, y, 'World point');

export const createViewportPoint = (x: number, y: number): ViewportPoint =>
  createPoint<'viewport'>(x, y, 'Viewport point');

export const createDevicePoint = (x: number, y: number): DevicePoint =>
  createPoint<'device'>(x, y, 'Device point');

export const createWorldVector = (x: number, y: number): WorldVector =>
  createVector<'world'>(x, y, 'World vector');

export const createViewportVector = (x: number, y: number): ViewportVector =>
  createVector<'viewport'>(x, y, 'Viewport vector');

export const createDeviceVector = (x: number, y: number): DeviceVector =>
  createVector<'device'>(x, y, 'Device vector');

export const createWorldRect = (x: number, y: number, width: number, height: number): WorldRect =>
  createRect<'world'>(x, y, width, height, 'World rect');

export const createViewportRect = (
  x: number,
  y: number,
  width: number,
  height: number,
): ViewportRect => createRect<'viewport'>(x, y, width, height, 'Viewport rect');

export const createViewportSize = (width: number, height: number): ViewportSize =>
  Object.freeze({
    height: requirePositive(height, 'Viewport size height'),
    width: requirePositive(width, 'Viewport size width'),
  }) as ViewportSize;

export const createViewportClientBounds = (
  left: number,
  top: number,
  width: number,
  height: number,
): ViewportClientBounds =>
  Object.freeze({
    height: requirePositive(height, 'Viewport client bounds height'),
    left: requireFinite(left, 'Viewport client bounds left'),
    top: requireFinite(top, 'Viewport client bounds top'),
    width: requirePositive(width, 'Viewport client bounds width'),
  });

export const createViewportZoom = (value: number): ViewportZoom => {
  requirePositive(value, 'Viewport zoom');
  if (value < VIEWPORT_NUMERIC_POLICY.minimumZoom || value > VIEWPORT_NUMERIC_POLICY.maximumZoom) {
    throw new RangeError(
      `Viewport zoom must be between ${String(VIEWPORT_NUMERIC_POLICY.minimumZoom)} and ${String(VIEWPORT_NUMERIC_POLICY.maximumZoom)}.`,
    );
  }
  return value as ViewportZoom;
};

export const clampViewportZoom = (value: number): ViewportZoom => {
  requirePositive(value, 'Viewport zoom');
  return Math.min(
    VIEWPORT_NUMERIC_POLICY.maximumZoom,
    Math.max(VIEWPORT_NUMERIC_POLICY.minimumZoom, value),
  ) as ViewportZoom;
};

export const createDeviceScale = (value: number): DeviceScale =>
  requirePositive(value, 'Device scale') as DeviceScale;

export const createViewportTransform = ({
  panX,
  panY,
  zoom,
}: ViewportTransformInput): ViewportTransform =>
  Object.freeze({ pan: createViewportVector(panX, panY), zoom: createViewportZoom(zoom) });

export const worldPointToViewport = (
  point: WorldPoint,
  transform: ViewportTransform,
): ViewportPoint =>
  createViewportPoint(
    point.x * transform.zoom + transform.pan.x,
    point.y * transform.zoom + transform.pan.y,
  );

export const viewportPointToWorld = (
  point: ViewportPoint,
  transform: ViewportTransform,
): WorldPoint =>
  createWorldPoint(
    (point.x - transform.pan.x) / transform.zoom,
    (point.y - transform.pan.y) / transform.zoom,
  );

export const worldVectorToViewport = (
  vector: WorldVector,
  transform: ViewportTransform,
): ViewportVector => createViewportVector(vector.x * transform.zoom, vector.y * transform.zoom);

export const viewportVectorToWorld = (
  vector: ViewportVector,
  transform: ViewportTransform,
): WorldVector => createWorldVector(vector.x / transform.zoom, vector.y / transform.zoom);

export const worldRectToViewport = (
  rect: WorldRect,
  transform: ViewportTransform,
): ViewportRect => {
  const origin = worldPointToViewport(createWorldPoint(rect.x, rect.y), transform);
  return createViewportRect(
    origin.x,
    origin.y,
    rect.width * transform.zoom,
    rect.height * transform.zoom,
  );
};

export const viewportRectToWorld = (
  rect: ViewportRect,
  transform: ViewportTransform,
): WorldRect => {
  const origin = viewportPointToWorld(createViewportPoint(rect.x, rect.y), transform);
  return createWorldRect(
    origin.x,
    origin.y,
    rect.width / transform.zoom,
    rect.height / transform.zoom,
  );
};

/** Converts once from browser-window client coordinates into viewport-local CSS pixels. */
export const clientPointToViewport = (
  point: ClientPoint,
  bounds: ViewportClientBounds,
): ViewportPoint => createViewportPoint(point.x - bounds.left, point.y - bounds.top);

export const viewportPointToClient = (
  point: ViewportPoint,
  bounds: ViewportClientBounds,
): ClientPoint => createClientPoint(point.x + bounds.left, point.y + bounds.top);

export const viewportPointToDevice = (point: ViewportPoint, scale: DeviceScale): DevicePoint =>
  createDevicePoint(point.x * scale, point.y * scale);

export const devicePointToViewport = (point: DevicePoint, scale: DeviceScale): ViewportPoint =>
  createViewportPoint(point.x / scale, point.y / scale);

export const viewportVectorToDevice = (vector: ViewportVector, scale: DeviceScale): DeviceVector =>
  createDeviceVector(vector.x * scale, vector.y * scale);

export const deviceVectorToViewport = (vector: DeviceVector, scale: DeviceScale): ViewportVector =>
  createViewportVector(vector.x / scale, vector.y / scale);

export const translateViewport = (
  transform: ViewportTransform,
  delta: ViewportVector,
): ViewportTransform =>
  createViewportTransform({
    panX: transform.pan.x + delta.x,
    panY: transform.pan.y + delta.y,
    zoom: transform.zoom,
  });

/** Changes zoom while preserving the exact world point beneath the viewport anchor. */
export const setViewportZoomAtPoint = (
  transform: ViewportTransform,
  zoom: ViewportZoom,
  anchor: ViewportPoint,
): ViewportTransform => {
  if (zoom === transform.zoom) {
    return transform;
  }
  const anchoredWorldPoint = viewportPointToWorld(anchor, transform);
  return createViewportTransform({
    panX: anchor.x - anchoredWorldPoint.x * zoom,
    panY: anchor.y - anchoredWorldPoint.y * zoom,
    zoom,
  });
};
