// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  VIEWPORT_FRAMING_POLICY,
  reframeViewportOnResize,
  resolveViewportFraming,
} from '../src/renderer/editor/viewport-framing';
import {
  VIEWPORT_NUMERIC_POLICY,
  createViewportPoint,
  createViewportSize,
  createViewportTransform,
  createWorldRect,
  viewportPointToWorld,
} from '../src/renderer/editor/viewport-transform';

const expectClose = (actual: number, expected: number): void => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(VIEWPORT_NUMERIC_POLICY.roundTripEpsilon);
};

describe('viewport framing policy', () => {
  it('fits world bounds on both axes with stable viewport-pixel padding', () => {
    const framed = resolveViewportFraming(
      createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
      createViewportSize(1_200, 800),
      { bounds: createWorldRect(0, 0, 1_000, 1_000), kind: 'fit', padding: 100 },
    );

    expect(framed).toMatchObject({ pan: { x: 300, y: 100 }, zoom: 0.6 });
  });

  it('fits width independently while keeping the bounds centered vertically', () => {
    const framed = resolveViewportFraming(
      createViewportTransform({ panX: 500, panY: -500, zoom: 2 }),
      createViewportSize(1_200, 800),
      { bounds: createWorldRect(-200, 300, 1_000, 2_000), kind: 'width', padding: 100 },
    );

    expect(framed).toMatchObject({ pan: { x: 300, y: -900 }, zoom: 1 });
  });

  it('treats selection framing as fit without creating a competing formula', () => {
    const viewport = createViewportSize(800, 600);
    const transform = createViewportTransform({ panX: 10, panY: 20, zoom: 2 });
    const bounds = createWorldRect(-500, -250, 1_000, 500);

    expect(
      resolveViewportFraming(transform, viewport, {
        bounds,
        kind: 'selection',
        padding: 50,
      }),
    ).toEqual(resolveViewportFraming(transform, viewport, { bounds, kind: 'fit', padding: 50 }));
  });

  it('clamps framing at both zoom limits and still centers the requested bounds', () => {
    const viewport = createViewportSize(1_000, 600);
    const transform = createViewportTransform({ panX: 0, panY: 0, zoom: 1 });
    const tiny = resolveViewportFraming(transform, viewport, {
      bounds: createWorldRect(100, 50, 1, 1),
      kind: 'fit',
      padding: 48,
    });
    const huge = resolveViewportFraming(transform, viewport, {
      bounds: createWorldRect(-1_000_000, -500_000, 2_000_000, 1_000_000),
      kind: 'fit',
      padding: 48,
    });

    expect(tiny.zoom).toBe(VIEWPORT_NUMERIC_POLICY.maximumZoom);
    expect(huge.zoom).toBe(VIEWPORT_NUMERIC_POLICY.minimumZoom);
    expect(tiny.pan).toMatchObject({ x: 98, y: 98 });
    expect(huge.pan).toMatchObject({ x: 500, y: 300 });
  });

  it('sets actual size around the current viewport center', () => {
    const viewport = createViewportSize(1_000, 600);
    const transform = createViewportTransform({ panX: -700, panY: 150, zoom: 2 });
    const center = createViewportPoint(viewport.width / 2, viewport.height / 2);
    const worldAtCenter = viewportPointToWorld(center, transform);
    const actual = resolveViewportFraming(transform, viewport, { kind: 'actual' });

    expect(actual.zoom).toBe(1);
    const worldAfter = viewportPointToWorld(center, actual);
    expectClose(worldAfter.x, worldAtCenter.x);
    expectClose(worldAfter.y, worldAtCenter.y);
  });

  it('returns the exact transform for manual framing and no-op resize', () => {
    const viewport = createViewportSize(1_000, 600);
    const transform = createViewportTransform({ panX: -700, panY: 150, zoom: 2 });

    expect(resolveViewportFraming(transform, viewport, { kind: 'manual' })).toBe(transform);
    expect(reframeViewportOnResize(transform, viewport, viewport, { kind: 'manual' })).toBe(
      transform,
    );
  });

  it('preserves the center world point when a manual viewport or pane size changes', () => {
    const previousViewport = createViewportSize(1_000, 600);
    const nextViewport = createViewportSize(1_240, 720);
    const transform = createViewportTransform({ panX: -700, panY: 150, zoom: 1.5 });
    const priorWorldCenter = viewportPointToWorld(createViewportPoint(500, 300), transform);
    const resized = reframeViewportOnResize(transform, previousViewport, nextViewport, {
      kind: 'manual',
    });
    const nextWorldCenter = viewportPointToWorld(createViewportPoint(620, 360), resized);

    expectClose(nextWorldCenter.x, priorWorldCenter.x);
    expectClose(nextWorldCenter.y, priorWorldCenter.y);
    expect(resized.zoom).toBe(transform.zoom);
  });

  it('recomputes fit framing against the new viewport without stale derived state', () => {
    const request = {
      bounds: createWorldRect(0, 0, 1_000, 500),
      kind: 'fit' as const,
      padding: VIEWPORT_FRAMING_POLICY.defaultPadding,
    };
    const previousViewport = createViewportSize(1_000, 600);
    const nextViewport = createViewportSize(1_400, 800);
    const initial = resolveViewportFraming(
      createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
      previousViewport,
      request,
    );

    expect(reframeViewportOnResize(initial, previousViewport, nextViewport, request)).toEqual(
      resolveViewportFraming(initial, nextViewport, request),
    );
  });

  it('rejects invalid padding instead of silently producing a broken transform', () => {
    const viewport = createViewportSize(100, 100);
    const transform = createViewportTransform({ panX: 0, panY: 0, zoom: 1 });
    const bounds = createWorldRect(0, 0, 100, 100);

    expect(() =>
      resolveViewportFraming(transform, viewport, { bounds, kind: 'fit', padding: -1 }),
    ).toThrow(RangeError);
    expect(() =>
      resolveViewportFraming(transform, viewport, { bounds, kind: 'fit', padding: 50 }),
    ).toThrow(RangeError);
    expect(() =>
      resolveViewportFraming(transform, viewport, {
        bounds,
        kind: 'fit',
        padding: Number.NaN,
      }),
    ).toThrow(RangeError);
  });
});
