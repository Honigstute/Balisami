// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  VIEWPORT_NUMERIC_POLICY,
  clampViewportZoom,
  clientPointToViewport,
  createClientPoint,
  createDevicePoint,
  createDeviceScale,
  createViewportClientBounds,
  createViewportPoint,
  createViewportRect,
  createViewportTransform,
  createViewportVector,
  createViewportZoom,
  createWorldPoint,
  createWorldRect,
  createWorldVector,
  devicePointToViewport,
  deviceVectorToViewport,
  setViewportZoomAtPoint,
  translateViewport,
  viewportPointToClient,
  viewportPointToDevice,
  viewportPointToWorld,
  viewportRectToWorld,
  viewportVectorToDevice,
  viewportVectorToWorld,
  worldPointToViewport,
  worldRectToViewport,
  worldVectorToViewport,
} from '../src/renderer/editor/viewport-transform';

const expectClose = (actual: number, expected: number): void => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(VIEWPORT_NUMERIC_POLICY.roundTripEpsilon);
};

const createSeededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

describe('viewport coordinate contract', () => {
  it('applies the single world-to-viewport formula without rounding', () => {
    const transform = createViewportTransform({ panX: 12.5, panY: -40.25, zoom: 1.5 });

    expect(worldPointToViewport(createWorldPoint(-10.25, 30.5), transform)).toMatchObject({
      x: -2.875,
      y: 5.5,
    });
    expect(worldVectorToViewport(createWorldVector(-10.25, 30.5), transform)).toMatchObject({
      x: -15.375,
      y: 45.75,
    });
    expect(
      worldRectToViewport(createWorldRect(-10.25, 30.5, 120.25, 80.5), transform),
    ).toMatchObject({ x: -2.875, y: 5.5, width: 180.375, height: 120.75 });
  });

  it('keeps client offsets and device scaling out of world geometry', () => {
    const bounds = createViewportClientBounds(224.5, 180.25, 960, 600);
    const viewportPoint = clientPointToViewport(createClientPoint(500.75, 400.5), bounds);

    expect(viewportPoint).toMatchObject({ x: 276.25, y: 220.25 });
    expect(viewportPointToClient(viewportPoint, bounds)).toMatchObject({ x: 500.75, y: 400.5 });

    const scale = createDeviceScale(1.25);
    expect(viewportPointToDevice(viewportPoint, scale)).toMatchObject({
      x: 345.3125,
      y: 275.3125,
    });
    expect(devicePointToViewport(createDevicePoint(345.3125, 275.3125), scale)).toMatchObject(
      viewportPoint,
    );
    expect(viewportVectorToDevice(createViewportVector(12, -8), scale)).toMatchObject({
      x: 15,
      y: -10,
    });
    expect(
      deviceVectorToViewport(viewportVectorToDevice(createViewportVector(12, -8), scale), scale),
    ).toMatchObject({ x: 12, y: -8 });
  });

  it('preserves points, vectors, and rectangles through 10,000 seeded round trips', () => {
    const random = createSeededRandom(0x5eed_cafe);
    for (let index = 0; index < 10_000; index += 1) {
      const zoom =
        VIEWPORT_NUMERIC_POLICY.minimumZoom +
        random() * (VIEWPORT_NUMERIC_POLICY.maximumZoom - VIEWPORT_NUMERIC_POLICY.minimumZoom);
      const transform = createViewportTransform({
        panX: random() * 20_000 - 10_000,
        panY: random() * 20_000 - 10_000,
        zoom,
      });
      const worldPoint = createWorldPoint(
        random() * 2_000_000 - 1_000_000,
        random() * 2_000_000 - 1_000_000,
      );
      const worldVector = createWorldVector(random() * 20_000 - 10_000, random() * 20_000 - 10_000);
      const worldRect = createWorldRect(
        worldPoint.x,
        worldPoint.y,
        random() * 10_000 + 0.001,
        random() * 10_000 + 0.001,
      );

      const pointRoundTrip = viewportPointToWorld(
        worldPointToViewport(worldPoint, transform),
        transform,
      );
      const vectorRoundTrip = viewportVectorToWorld(
        worldVectorToViewport(worldVector, transform),
        transform,
      );
      const rectRoundTrip = viewportRectToWorld(
        worldRectToViewport(worldRect, transform),
        transform,
      );

      expectClose(pointRoundTrip.x, worldPoint.x);
      expectClose(pointRoundTrip.y, worldPoint.y);
      expectClose(vectorRoundTrip.x, worldVector.x);
      expectClose(vectorRoundTrip.y, worldVector.y);
      expectClose(rectRoundTrip.x, worldRect.x);
      expectClose(rectRoundTrip.y, worldRect.y);
      expectClose(rectRoundTrip.width, worldRect.width);
      expectClose(rectRoundTrip.height, worldRect.height);
    }
  });

  it.each([0.1, 0.125, 0.5, 1, 1.25, 1.5, 2, 4])(
    'keeps the viewport anchor fixed when zoom changes to %s',
    (rawZoom) => {
      const transform = createViewportTransform({ panX: -350.5, panY: 702.25, zoom: 0.75 });
      const anchor = createViewportPoint(431.125, 287.75);
      const anchoredWorldPoint = viewportPointToWorld(anchor, transform);
      const zoomed = setViewportZoomAtPoint(transform, createViewportZoom(rawZoom), anchor);

      const projected = worldPointToViewport(anchoredWorldPoint, zoomed);
      expectClose(projected.x, anchor.x);
      expectClose(projected.y, anchor.y);
    },
  );

  it('translates pan in viewport pixels and preserves the same zoom identity', () => {
    const transform = createViewportTransform({ panX: 10, panY: 20, zoom: 1.5 });
    const translated = translateViewport(transform, createViewportVector(-4.5, 8.25));

    expect(translated).toMatchObject({ pan: { x: 5.5, y: 28.25 }, zoom: 1.5 });
    expect(setViewportZoomAtPoint(translated, translated.zoom, createViewportPoint(0, 0))).toBe(
      translated,
    );
  });

  it('clamps explicit user zoom requests but rejects malformed transform state', () => {
    expect(clampViewportZoom(0.001)).toBe(VIEWPORT_NUMERIC_POLICY.minimumZoom);
    expect(clampViewportZoom(10)).toBe(VIEWPORT_NUMERIC_POLICY.maximumZoom);
    expect(() => createViewportZoom(0.099)).toThrow(RangeError);
    expect(() => createViewportZoom(4.001)).toThrow(RangeError);
    expect(() => createViewportZoom(Number.NaN)).toThrow(RangeError);
    expect(() => clampViewportZoom(0)).toThrow(RangeError);
    expect(() =>
      createViewportTransform({ panX: Number.POSITIVE_INFINITY, panY: 0, zoom: 1 }),
    ).toThrow(RangeError);
    expect(() => createDeviceScale(0)).toThrow(RangeError);
    expect(() => createViewportClientBounds(0, 0, 0, 600)).toThrow(RangeError);
    expect(() => createWorldRect(0, 0, -1, 10)).toThrow(RangeError);
    expect(() => createViewportRect(0, 0, 10, Number.NaN)).toThrow(RangeError);
  });

  it('freezes public values so interaction previews cannot mutate camera inputs', () => {
    const transform = createViewportTransform({ panX: 10, panY: 20, zoom: 1 });
    expect(Object.isFrozen(transform)).toBe(true);
    expect(Object.isFrozen(transform.pan)).toBe(true);
    expect(Object.isFrozen(createWorldPoint(1, 2))).toBe(true);
    expect(Object.isFrozen(createWorldRect(1, 2, 3, 4))).toBe(true);
  });
});
