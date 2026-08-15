import {
  createWorldPoint,
  createWorldRect,
  type WorldPoint,
  type WorldRect,
} from './viewport-transform';

export const SPATIAL_INDEX_POLICY = Object.freeze({
  defaultCellSize: 256,
  maximumCellsPerEntry: 256,
});

interface IndexedEntry<Id extends string> {
  readonly bounds: WorldRect;
  readonly cellKeys: readonly string[];
  readonly id: Id;
  readonly isGlobal: boolean;
}

export interface SpatialIndexEntry<Id extends string> {
  readonly bounds: WorldRect;
  readonly id: Id;
}

interface CellRange {
  readonly maximumColumn: number;
  readonly maximumRow: number;
  readonly minimumColumn: number;
  readonly minimumRow: number;
}

const getCellRange = (bounds: WorldRect, cellSize: number): CellRange =>
  Object.freeze({
    maximumColumn: Math.floor((bounds.x + bounds.width) / cellSize),
    maximumRow: Math.floor((bounds.y + bounds.height) / cellSize),
    minimumColumn: Math.floor(bounds.x / cellSize),
    minimumRow: Math.floor(bounds.y / cellSize),
  });

const listCellKeys = (range: CellRange): readonly string[] => {
  const keys: string[] = [];
  for (let row = range.minimumRow; row <= range.maximumRow; row += 1) {
    for (let column = range.minimumColumn; column <= range.maximumColumn; column += 1) {
      keys.push(`${String(column)}:${String(row)}`);
    }
  }
  return keys;
};

const getCellCount = (range: CellRange): number =>
  (range.maximumColumn - range.minimumColumn + 1) * (range.maximumRow - range.minimumRow + 1);

const intersects = (first: WorldRect, second: WorldRect): boolean =>
  first.x <= second.x + second.width &&
  first.x + first.width >= second.x &&
  first.y <= second.y + second.height &&
  first.y + first.height >= second.y;

const containsPoint = (bounds: WorldRect, point: WorldPoint): boolean =>
  point.x >= bounds.x &&
  point.x <= bounds.x + bounds.width &&
  point.y >= bounds.y &&
  point.y <= bounds.y + bounds.height;

const compareIds = <Id extends string>(first: Id, second: Id): number =>
  first < second ? -1 : first > second ? 1 : 0;

const copyValidatedBounds = (bounds: WorldRect): WorldRect => {
  const copy = createWorldRect(bounds.x, bounds.y, bounds.width, bounds.height);
  if (!Number.isFinite(copy.x + copy.width) || !Number.isFinite(copy.y + copy.height)) {
    throw new RangeError('Spatial index bounds must have finite extents.');
  }
  return copy;
};

/**
 * Incremental broad-phase index. It intentionally does not own stacking order;
 * callers resolve returned stable IDs through the document's canonical childIds.
 */
export class WorldSpatialIndex<Id extends string> {
  readonly #cellSize: number;
  #cells = new Map<string, Set<Id>>();
  #entries = new Map<Id, IndexedEntry<Id>>();
  #globalIds = new Set<Id>();

  constructor(cellSize: number = SPATIAL_INDEX_POLICY.defaultCellSize) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new RangeError('Spatial index cell size must be finite and positive.');
    }
    this.#cellSize = cellSize;
  }

  get size(): number {
    return this.#entries.size;
  }

  clear(): void {
    this.#cells.clear();
    this.#entries.clear();
    this.#globalIds.clear();
  }

  getBounds(id: Id): WorldRect | undefined {
    return this.#entries.get(id)?.bounds;
  }

  rebuild(entries: readonly SpatialIndexEntry<Id>[]): void {
    const replacement = new WorldSpatialIndex<Id>(this.#cellSize);
    const seen = new Set<Id>();
    for (const entry of entries) {
      if (seen.has(entry.id)) {
        throw new Error(`Spatial index rebuild contains duplicate ID: ${entry.id}`);
      }
      seen.add(entry.id);
      replacement.upsert(entry);
    }
    this.#cells = replacement.#cells;
    this.#entries = replacement.#entries;
    this.#globalIds = replacement.#globalIds;
  }

  remove(id: Id): boolean {
    const entry = this.#entries.get(id);
    if (entry === undefined) {
      return false;
    }
    this.#removeFromCells(entry);
    this.#entries.delete(id);
    return true;
  }

  upsert(entry: SpatialIndexEntry<Id>): void {
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new TypeError('Spatial index ID must be a non-empty string.');
    }
    const bounds = copyValidatedBounds(entry.bounds);
    const current = this.#entries.get(entry.id);
    if (
      current !== undefined &&
      current.bounds.x === bounds.x &&
      current.bounds.y === bounds.y &&
      current.bounds.width === bounds.width &&
      current.bounds.height === bounds.height
    ) {
      return;
    }
    if (current !== undefined) {
      this.#removeFromCells(current);
    }
    const cellRange = getCellRange(bounds, this.#cellSize);
    const isGlobal = getCellCount(cellRange) > SPATIAL_INDEX_POLICY.maximumCellsPerEntry;
    const indexedEntry = Object.freeze({
      bounds,
      cellKeys: Object.freeze(isGlobal ? [] : listCellKeys(cellRange)),
      id: entry.id,
      isGlobal,
    });
    this.#entries.set(entry.id, indexedEntry);
    if (indexedEntry.isGlobal) {
      this.#globalIds.add(entry.id);
    }
    for (const cellKey of indexedEntry.cellKeys) {
      const cell = this.#cells.get(cellKey) ?? new Set<Id>();
      cell.add(entry.id);
      this.#cells.set(cellKey, cell);
    }
  }

  query(boundsInput: WorldRect): readonly Id[] {
    const bounds = copyValidatedBounds(boundsInput);
    const range = getCellRange(bounds, this.#cellSize);
    const cellCount = getCellCount(range);
    const candidates = new Set<Id>(this.#globalIds);

    // A huge sparse query should scan entries, not allocate work proportional
    // to empty world space between them.
    if (cellCount > this.#entries.size) {
      for (const id of this.#entries.keys()) {
        candidates.add(id);
      }
    } else {
      for (let row = range.minimumRow; row <= range.maximumRow; row += 1) {
        for (let column = range.minimumColumn; column <= range.maximumColumn; column += 1) {
          const cell = this.#cells.get(`${String(column)}:${String(row)}`);
          if (cell !== undefined) {
            for (const id of cell) {
              candidates.add(id);
            }
          }
        }
      }
    }

    return Object.freeze(
      [...candidates]
        .filter((id) => {
          const entry = this.#entries.get(id);
          return entry !== undefined && intersects(entry.bounds, bounds);
        })
        .sort(compareIds),
    );
  }

  /** Exact point query in stable ID order; stacking remains a caller concern. */
  queryPoint(pointInput: WorldPoint): readonly Id[] {
    const point = createWorldPoint(pointInput.x, pointInput.y);
    const cell = this.#cells.get(
      `${String(Math.floor(point.x / this.#cellSize))}:${String(Math.floor(point.y / this.#cellSize))}`,
    );
    const candidates = new Set<Id>(this.#globalIds);
    if (cell !== undefined) {
      for (const id of cell) {
        candidates.add(id);
      }
    }

    return Object.freeze(
      [...candidates]
        .filter((id) => {
          const entry = this.#entries.get(id);
          return entry !== undefined && containsPoint(entry.bounds, point);
        })
        .sort(compareIds),
    );
  }

  #removeFromCells(entry: IndexedEntry<Id>): void {
    if (entry.isGlobal) {
      this.#globalIds.delete(entry.id);
    }
    for (const cellKey of entry.cellKeys) {
      const cell = this.#cells.get(cellKey);
      if (cell === undefined) {
        continue;
      }
      cell.delete(entry.id);
      if (cell.size === 0) {
        this.#cells.delete(cellKey);
      }
    }
  }
}
