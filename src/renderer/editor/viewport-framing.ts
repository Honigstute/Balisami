import {
  clampViewportZoom,
  createViewportPoint,
  createViewportTransform,
  createViewportVector,
  createViewportZoom,
  createWorldRect,
  setViewportZoomAtPoint,
  translateViewport,
  type ViewportSize,
  type ViewportTransform,
  type WorldRect,
} from './viewport-transform';

export const VIEWPORT_FRAMING_POLICY = Object.freeze({
  defaultPadding: 48,
});

export const MANUAL_VIEWPORT_FRAMING = Object.freeze({ kind: 'manual' as const });

export type ViewportFramingRequest =
  | { readonly kind: 'actual' }
  | { readonly kind: 'manual' }
  | {
      readonly bounds: WorldRect;
      readonly kind: 'fit' | 'selection' | 'width';
      readonly padding?: number;
    };

const getPadding = (request: Extract<ViewportFramingRequest, { readonly bounds: WorldRect }>) => {
  const padding = request.padding ?? VIEWPORT_FRAMING_POLICY.defaultPadding;
  if (!Number.isFinite(padding) || padding < 0) {
    throw new RangeError('Viewport framing padding must be finite and non-negative.');
  }
  return padding;
};

export const normalizeViewportFramingRequest = (
  request: ViewportFramingRequest,
): ViewportFramingRequest => {
  switch (request.kind) {
    case 'actual':
      return Object.freeze({ kind: 'actual' });
    case 'manual':
      return MANUAL_VIEWPORT_FRAMING;
    case 'fit':
    case 'selection':
    case 'width':
      return Object.freeze({
        bounds: createWorldRect(
          request.bounds.x,
          request.bounds.y,
          request.bounds.width,
          request.bounds.height,
        ),
        kind: request.kind,
        padding: getPadding(request),
      });
  }
};

export const viewportFramingRequestsEqual = (
  first: ViewportFramingRequest,
  second: ViewportFramingRequest,
): boolean => {
  if (first === second) {
    return true;
  }
  const normalizedFirst = normalizeViewportFramingRequest(first);
  const normalizedSecond = normalizeViewportFramingRequest(second);
  if (normalizedFirst.kind !== normalizedSecond.kind) {
    return false;
  }
  if (
    normalizedFirst.kind === 'manual' ||
    normalizedFirst.kind === 'actual' ||
    normalizedSecond.kind === 'manual' ||
    normalizedSecond.kind === 'actual'
  ) {
    return true;
  }
  return (
    normalizedFirst.padding === normalizedSecond.padding &&
    normalizedFirst.bounds.x === normalizedSecond.bounds.x &&
    normalizedFirst.bounds.y === normalizedSecond.bounds.y &&
    normalizedFirst.bounds.width === normalizedSecond.bounds.width &&
    normalizedFirst.bounds.height === normalizedSecond.bounds.height
  );
};

const frameBounds = (
  viewport: ViewportSize,
  request: Extract<ViewportFramingRequest, { readonly bounds: WorldRect }>,
): ViewportTransform => {
  const padding = getPadding(request);
  const availableWidth = viewport.width - padding * 2;
  const availableHeight = viewport.height - padding * 2;
  if (availableWidth <= 0 || availableHeight <= 0) {
    throw new RangeError('Viewport framing padding must leave a positive content area.');
  }

  const widthZoom = availableWidth / request.bounds.width;
  const rawZoom =
    request.kind === 'width'
      ? widthZoom
      : Math.min(widthZoom, availableHeight / request.bounds.height);
  const zoom = clampViewportZoom(rawZoom);
  const boundsCenterX = request.bounds.x + request.bounds.width / 2;
  const boundsCenterY = request.bounds.y + request.bounds.height / 2;
  return createViewportTransform({
    panX: viewport.width / 2 - boundsCenterX * zoom,
    panY: viewport.height / 2 - boundsCenterY * zoom,
    zoom,
  });
};

/** Resolves an explicit zoom command without storing derived world bounds in camera state. */
export const resolveViewportFraming = (
  transform: ViewportTransform,
  viewport: ViewportSize,
  request: ViewportFramingRequest,
): ViewportTransform => {
  switch (request.kind) {
    case 'manual':
      return transform;
    case 'actual':
      return setViewportZoomAtPoint(
        transform,
        createViewportZoom(1),
        createViewportPoint(viewport.width / 2, viewport.height / 2),
      );
    case 'fit':
    case 'selection':
    case 'width':
      return frameBounds(viewport, request);
  }
};

/**
 * Manual/actual cameras preserve the world point at the viewport center.
 * Bound modes are recomputed from their source bounds at the new size.
 */
export const reframeViewportOnResize = (
  transform: ViewportTransform,
  previousViewport: ViewportSize,
  nextViewport: ViewportSize,
  request: ViewportFramingRequest,
): ViewportTransform => {
  if (
    previousViewport.width === nextViewport.width &&
    previousViewport.height === nextViewport.height
  ) {
    return transform;
  }
  switch (request.kind) {
    case 'manual':
    case 'actual':
      return translateViewport(
        transform,
        createViewportVector(
          (nextViewport.width - previousViewport.width) / 2,
          (nextViewport.height - previousViewport.height) / 2,
        ),
      );
    case 'fit':
    case 'selection':
    case 'width':
      return frameBounds(nextViewport, request);
  }
};
