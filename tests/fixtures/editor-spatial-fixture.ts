import type { SpatialIndexEntry } from '../../src/renderer/editor/spatial-index';
import { createWorldRect } from '../../src/renderer/editor/viewport-transform';

/** Fixed geometry generator shared by source and later packaged performance probes. */
export const createEditorSpatialFixture = (count: number): readonly SpatialIndexEntry<string>[] => {
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError('Editor spatial fixture count must be a positive integer.');
  }
  const columnCount = Math.ceil(Math.sqrt(count));
  return Object.freeze(
    Array.from({ length: count }, (_, index) => {
      const column = index % columnCount;
      const row = Math.floor(index / columnCount);
      return Object.freeze({
        bounds: createWorldRect(column * 160 - 400, row * 120 - 300, 120, 80),
        id: `element-${String(index).padStart(5, '0')}`,
      });
    }),
  );
};
