import type { BoardId } from '../../domain';

/**
 * The visible board is workspace state, never project data: switching boards
 * must not create history or dirty the document.
 */
export class ActiveBoardStore {
  readonly #listeners = new Set<() => void>();
  #activeBoardId: BoardId | undefined;

  getSnapshot = (): BoardId | undefined => this.#activeBoardId;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  select(boardId: BoardId): boolean {
    if (this.#activeBoardId === boardId) {
      return false;
    }
    this.#activeBoardId = boardId;
    this.#publish();
    return true;
  }

  /** Retains a live choice or falls back to the first canonical board. */
  reconcile(boardIds: readonly BoardId[]): boolean {
    const nextBoardId =
      this.#activeBoardId !== undefined && boardIds.includes(this.#activeBoardId)
        ? this.#activeBoardId
        : boardIds[0];
    if (this.#activeBoardId === nextBoardId) {
      return false;
    }
    this.#activeBoardId = nextBoardId;
    this.#publish();
    return true;
  }

  #publish(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
