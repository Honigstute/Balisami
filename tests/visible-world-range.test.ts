// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { WorldSpatialIndex } from '../src/renderer/editor/spatial-index';
import {
  getVisibleWorldRange,
  queryVisibleWorldItems,
} from '../src/renderer/editor/visible-world-range';
import {
  createViewportSize,
  createViewportTransform,
  createWorldRect,
} from '../src/renderer/editor/viewport-transform';

describe('visible world range', () => {
  it('converts the viewport plus screen-pixel overscan through the camera once', () => {
    expect(
      getVisibleWorldRange(
        createViewportTransform({ panX: 100, panY: 50, zoom: 2 }),
        createViewportSize(800, 600),
        50,
      ),
    ).toEqual(createWorldRect(-75, -50, 450, 350));
  });

  it('keeps overscan visually constant as zoom changes', () => {
    const viewport = createViewportSize(800, 600);
    const atOne = getVisibleWorldRange(
      createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
      viewport,
      96,
    );
    const atFour = getVisibleWorldRange(
      createViewportTransform({ panX: 0, panY: 0, zoom: 4 }),
      viewport,
      96,
    );

    expect(atOne).toEqual(createWorldRect(-96, -96, 992, 792));
    expect(atFour).toEqual(createWorldRect(-24, -24, 248, 198));
  });

  it('queries the spatial index through the same derived visible bounds', () => {
    const index = new WorldSpatialIndex<string>();
    index.rebuild([
      { bounds: createWorldRect(10, 10, 20, 20), id: 'visible' },
      { bounds: createWorldRect(900, 900, 20, 20), id: 'outside' },
      { bounds: createWorldRect(-20, -20, 10, 10), id: 'overscan' },
    ]);

    expect(
      queryVisibleWorldItems(
        index,
        createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
        createViewportSize(800, 600),
        24,
      ),
    ).toEqual(['overscan', 'visible']);
  });

  it('rejects invalid overscan instead of returning non-finite visible geometry', () => {
    const transform = createViewportTransform({ panX: 0, panY: 0, zoom: 1 });
    const viewport = createViewportSize(800, 600);

    expect(() => getVisibleWorldRange(transform, viewport, -1)).toThrow(RangeError);
    expect(() => getVisibleWorldRange(transform, viewport, Number.NaN)).toThrow(RangeError);
  });
});
