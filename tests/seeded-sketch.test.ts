// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createSeededSketchLinePath,
  createSeededSketchRectPath,
  deriveSketchSeed,
} from '../src/renderer/editor/seeded-sketch';
import { createWorldPoint, createWorldRect } from '../src/renderer/editor/viewport-transform';

describe('seeded sketch geometry', () => {
  it('produces byte-identical paths for the same identity and geometry', () => {
    const input = {
      end: createWorldPoint(120, 45),
      roughness: 1,
      seed: 'element-0182',
      start: createWorldPoint(-20, 10),
    };

    const first = createSeededSketchLinePath(input);
    expect(createSeededSketchLinePath(input)).toBe(first);
    expect(first).toBe(
      'M -20 10 C 24.638 21.85 75.272 33.513 120 45 M -20 10 C 24.729 21.482 75.209 33.764 120 45',
    );
  });

  it('derives different deterministic geometry for different element identities', () => {
    const start = createWorldPoint(0, 0);
    const end = createWorldPoint(100, 0);
    const first = createSeededSketchLinePath({ end, seed: 'element-a', start });
    const second = createSeededSketchLinePath({ end, seed: 'element-b', start });

    expect(first).not.toBe(second);
    expect(deriveSketchSeed('element-a', 'line')).toBe(deriveSketchSeed('element-a', 'line'));
    expect(deriveSketchSeed('element-a', 'line')).not.toBe(deriveSketchSeed('element-b', 'line'));
  });

  it('keeps zero-roughness endpoints and control points exact', () => {
    expect(
      createSeededSketchLinePath({
        end: createWorldPoint(100, 0),
        roughness: 0,
        seed: 'straight',
        start: createWorldPoint(0, 0),
      }),
    ).toBe('M 0 0 C 32 0 68 0 100 0 M 0 0 C 32 0 68 0 100 0');
  });

  it('builds a stable two-pass rectangle from four explicitly salted edges', () => {
    const path = createSeededSketchRectPath(
      createWorldRect(-10, 20, 120, 60),
      'element-rectangle',
      1,
    );

    expect(path.match(/\bM\b/gu)).toHaveLength(8);
    expect(
      createSeededSketchRectPath(createWorldRect(-10, 20, 120, 60), 'element-rectangle', 1),
    ).toBe(path);
  });

  it('rejects invalid seeds, roughness, and degenerate lines', () => {
    expect(() =>
      createSeededSketchLinePath({
        end: createWorldPoint(10, 10),
        seed: '',
        start: createWorldPoint(0, 0),
      }),
    ).toThrow(RangeError);
    expect(() =>
      createSeededSketchLinePath({
        end: createWorldPoint(10, 10),
        roughness: 3,
        seed: 'rough',
        start: createWorldPoint(0, 0),
      }),
    ).toThrow(RangeError);
    expect(() =>
      createSeededSketchLinePath({
        end: createWorldPoint(0, 0),
        seed: 'same',
        start: createWorldPoint(0, 0),
      }),
    ).toThrow(RangeError);
  });
});
