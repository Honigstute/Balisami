import { selectBoardPresentationId, type BoardId, type ProjectDocument } from '../../domain';
import type { ControlTextMeasurementService } from '../controls/control-text-measurement';
import {
  createBoardThumbnailProjection,
  type BoardThumbnailProjection,
} from './board-thumbnail-projection';

export interface BoardThumbnailScheduler {
  readonly schedule: (task: () => void) => () => void;
}

export type BoardThumbnailSnapshot =
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable' }
  | { readonly projection: BoardThumbnailProjection; readonly status: 'ready' };

export const BOARD_THUMBNAIL_LOADING: BoardThumbnailSnapshot = Object.freeze({
  status: 'loading',
});

type BoardThumbnailProjector = (
  document: ProjectDocument,
  boardId: BoardId,
  textMeasurementService?: ControlTextMeasurementService,
) => BoardThumbnailProjection | undefined;

interface BoardThumbnailStoreOptions {
  readonly projector?: BoardThumbnailProjector;
  readonly scheduler: BoardThumbnailScheduler;
  readonly textMeasurementService?: ControlTextMeasurementService;
}

/**
 * Coalesces document revisions and projects at most one board per idle task.
 * Existing previews remain visible until their replacement is ready.
 */
export class BoardThumbnailStore {
  readonly #listeners = new Set<() => void>();
  readonly #projector: BoardThumbnailProjector;
  readonly #scheduler: BoardThumbnailScheduler;
  readonly #snapshots = new Map<BoardId, BoardThumbnailSnapshot>();
  #textMeasurementService: ControlTextMeasurementService | undefined;
  #cancelScheduled: (() => void) | undefined;
  #document: ProjectDocument | undefined;
  #generation = 0;
  #queue: readonly BoardId[] = Object.freeze([]);
  #queueIndex = 0;

  constructor(options: BoardThumbnailStoreOptions) {
    this.#projector = options.projector ?? createBoardThumbnailProjection;
    this.#scheduler = options.scheduler;
    this.#textMeasurementService = options.textMeasurementService;
  }

  dispose(): void {
    this.#cancelScheduled?.();
    this.#cancelScheduled = undefined;
    this.#document = undefined;
    this.#generation += 1;
    this.#queue = Object.freeze([]);
    this.#queueIndex = 0;
  }

  generate(document: ProjectDocument): void {
    if (this.#document === document) {
      return;
    }
    this.#document = document;
    this.#generation += 1;
    this.#queue = Object.freeze([...document.boardIds]);
    this.#queueIndex = 0;
    this.#cancelScheduled?.();
    this.#cancelScheduled = undefined;

    const activeIds = new Set(document.boardIds);
    let changed = false;
    for (const boardId of this.#snapshots.keys()) {
      if (!activeIds.has(boardId)) {
        this.#snapshots.delete(boardId);
        changed = true;
      }
    }
    for (const boardId of document.boardIds) {
      if (!this.#snapshots.has(boardId)) {
        this.#snapshots.set(boardId, BOARD_THUMBNAIL_LOADING);
        changed = true;
      }
    }
    if (changed) {
      this.#emit();
    }
    this.#scheduleNext(this.#generation);
  }

  getSnapshot = (boardId: BoardId): BoardThumbnailSnapshot =>
    this.#snapshots.get(boardId) ?? BOARD_THUMBNAIL_LOADING;

  setTextMeasurementService(service: ControlTextMeasurementService): void {
    if (this.#textMeasurementService === service) {
      return;
    }
    this.#textMeasurementService = service;
    const document = this.#document;
    if (document !== undefined) {
      this.#document = undefined;
      this.generate(document);
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #emit(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }

  #scheduleNext(generation: number): void {
    if (generation !== this.#generation || this.#queueIndex >= this.#queue.length) {
      return;
    }
    this.#cancelScheduled = this.#scheduler.schedule(() => {
      this.#cancelScheduled = undefined;
      if (generation !== this.#generation || this.#document === undefined) {
        return;
      }
      const boardId = this.#queue[this.#queueIndex];
      this.#queueIndex += 1;
      if (boardId !== undefined) {
        let snapshot: BoardThumbnailSnapshot;
        try {
          const presentationBoardId = selectBoardPresentationId(this.#document, boardId);
          const projection =
            presentationBoardId === undefined
              ? undefined
              : this.#projector(this.#document, presentationBoardId, this.#textMeasurementService);
          snapshot =
            projection === undefined
              ? Object.freeze({ status: 'unavailable' })
              : Object.freeze({ projection, status: 'ready' });
        } catch {
          snapshot = Object.freeze({ status: 'unavailable' });
        }
        this.#snapshots.set(boardId, snapshot);
        this.#emit();
      }
      this.#scheduleNext(generation);
    });
  }
}

type IdleGlobal = typeof globalThis & {
  readonly cancelIdleCallback?: (handle: number) => void;
  readonly requestIdleCallback?: (
    callback: () => void,
    options: { readonly timeout: number },
  ) => number;
};

export const createBrowserBoardThumbnailScheduler = (): BoardThumbnailScheduler => ({
  schedule: (task) => {
    const idleGlobal = globalThis as IdleGlobal;
    if (
      typeof idleGlobal.requestIdleCallback === 'function' &&
      typeof idleGlobal.cancelIdleCallback === 'function'
    ) {
      const handle = idleGlobal.requestIdleCallback(task, { timeout: 250 });
      return () => idleGlobal.cancelIdleCallback?.(handle);
    }
    const handle = globalThis.setTimeout(task, 0);
    return () => globalThis.clearTimeout(handle);
  },
});
