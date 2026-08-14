import type { ElementId } from '../../domain';

export interface SelectionSnapshot {
  readonly primaryId: ElementId | undefined;
  readonly revision: number;
  readonly selectedIds: readonly ElementId[];
}

const EMPTY_IDS: readonly ElementId[] = Object.freeze([]);

const createSnapshot = (
  revision: number,
  selectedIds: readonly ElementId[],
  primaryId: ElementId | undefined,
): SelectionSnapshot =>
  Object.freeze({
    primaryId,
    revision,
    selectedIds: Object.freeze([...selectedIds]),
  });

const idsEqual = (first: readonly ElementId[], second: readonly ElementId[]): boolean =>
  first.length === second.length && first.every((id, index) => id === second[index]);

const uniqueIds = (ids: readonly ElementId[]): readonly ElementId[] =>
  Object.freeze([...new Set(ids)]);

/**
 * Session-only selection authority. It intentionally accepts no document or
 * history mutation APIs, so selection changes cannot become persisted edits.
 */
export class SelectionStore {
  readonly #listeners = new Set<() => void>();
  #snapshot: SelectionSnapshot = createSnapshot(0, EMPTY_IDS, undefined);

  getSnapshot = (): SelectionSnapshot => this.#snapshot;

  getRevisionSnapshot = (): number => this.#snapshot.revision;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  clear(): boolean {
    return this.replace(EMPTY_IDS);
  }

  has(id: ElementId): boolean {
    return this.#snapshot.selectedIds.includes(id);
  }

  selectOnly(id: ElementId): boolean {
    return this.replace([id], id);
  }

  toggle(id: ElementId): boolean {
    const current = this.#snapshot.selectedIds;
    if (!current.includes(id)) {
      return this.replace([...current, id], id);
    }
    const remaining = current.filter((selectedId) => selectedId !== id);
    const nextPrimary =
      this.#snapshot.primaryId === id ? remaining[remaining.length - 1] : this.#snapshot.primaryId;
    return this.replace(remaining, nextPrimary);
  }

  /** Drops stale IDs while retaining surviving canonical selection order. */
  reconcile(availableIds: ReadonlySet<ElementId>): boolean {
    const remaining = this.#snapshot.selectedIds.filter((id) => availableIds.has(id));
    const nextPrimary =
      this.#snapshot.primaryId !== undefined && availableIds.has(this.#snapshot.primaryId)
        ? this.#snapshot.primaryId
        : remaining[remaining.length - 1];
    return this.replace(remaining, nextPrimary);
  }

  replace(selectedIdsInput: readonly ElementId[], primaryId?: ElementId): boolean {
    const selectedIds = uniqueIds(selectedIdsInput);
    const resolvedPrimary =
      primaryId !== undefined && selectedIds.includes(primaryId)
        ? primaryId
        : selectedIds[selectedIds.length - 1];
    if (
      idsEqual(this.#snapshot.selectedIds, selectedIds) &&
      this.#snapshot.primaryId === resolvedPrimary
    ) {
      return false;
    }
    this.#snapshot = createSnapshot(this.#snapshot.revision + 1, selectedIds, resolvedPrimary);
    for (const listener of this.#listeners) {
      listener();
    }
    return true;
  }
}
