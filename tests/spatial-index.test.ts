// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { WorldSpatialIndex } from '../src/renderer/editor/spatial-index';
import { createWorldRect } from '../src/renderer/editor/viewport-transform';

describe('world spatial index', () => {
  it('returns exact intersections in stable ID order across negative cell coordinates', () => {
    const index = new WorldSpatialIndex<string>(100);
    index.rebuild([
      { bounds: createWorldRect(80, 80, 40, 40), id: 'z-last' },
      { bounds: createWorldRect(-120, -80, 50, 50), id: 'a-first' },
      { bounds: createWorldRect(500, 500, 10, 10), id: 'outside' },
    ]);

    expect(index.query(createWorldRect(-100, -100, 220, 220))).toEqual(['a-first', 'z-last']);
    expect(index.query(createWorldRect(120, 120, 20, 20))).toEqual(['z-last']);
    expect(Object.isFrozen(index.query(createWorldRect(0, 0, 10, 10)))).toBe(true);
  });

  it('updates and removes entries without leaving stale cell membership', () => {
    const index = new WorldSpatialIndex<string>(100);
    index.upsert({ bounds: createWorldRect(0, 0, 20, 20), id: 'moving' });
    index.upsert({ bounds: createWorldRect(1_000, 1_000, 20, 20), id: 'moving' });

    expect(index.query(createWorldRect(-10, -10, 50, 50))).toEqual([]);
    expect(index.query(createWorldRect(990, 990, 50, 50))).toEqual(['moving']);
    expect(index.getBounds('moving')).toEqual(createWorldRect(1_000, 1_000, 20, 20));
    expect(index.remove('moving')).toBe(true);
    expect(index.remove('moving')).toBe(false);
    expect(index.size).toBe(0);
  });

  it('keeps oversized entries queryable without expanding them into unbounded cell lists', () => {
    const index = new WorldSpatialIndex<string>(100);
    index.upsert({
      bounds: createWorldRect(-1_000_000, -1_000_000, 2_000_000, 2_000_000),
      id: 'huge',
    });
    index.upsert({ bounds: createWorldRect(4_000_000, 4_000_000, 10, 10), id: 'distant' });

    expect(index.query(createWorldRect(-10, -10, 20, 20))).toEqual(['huge']);
    expect(index.query(createWorldRect(3_999_999, 3_999_999, 20, 20))).toEqual(['distant']);
    expect(index.query(createWorldRect(-1e12, -1e12, 2e12, 2e12))).toEqual(['distant', 'huge']);
  });

  it('makes rebuild atomic and rejects duplicate IDs or malformed geometry', () => {
    const index = new WorldSpatialIndex<string>();
    index.upsert({ bounds: createWorldRect(0, 0, 10, 10), id: 'preserved' });
    const duplicateEntries = [
      { bounds: createWorldRect(20, 20, 10, 10), id: 'duplicate' },
      { bounds: createWorldRect(40, 40, 10, 10), id: 'duplicate' },
    ];

    expect(() => index.rebuild(duplicateEntries)).toThrow('duplicate ID');
    expect(index.query(createWorldRect(0, 0, 10, 10))).toEqual(['preserved']);
    expect(() =>
      index.upsert({ bounds: createWorldRect(1e308, 0, 1e308, 10), id: 'overflow' }),
    ).toThrow('finite extents');
    expect(() => new WorldSpatialIndex(0)).toThrow(RangeError);
    expect(index.size).toBe(1);
  });
});
