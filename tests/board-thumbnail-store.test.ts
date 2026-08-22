// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  BoardIdSchema,
  BoardSchema,
  DOCUMENT_COMMAND_TYPES,
  dispatchDocumentCommand,
  parseProjectDocument,
  type ProjectDocument,
} from '../src/domain';
import {
  BoardThumbnailStore,
  type BoardThumbnailScheduler,
} from '../src/renderer/projects/board-thumbnail-store';
import { createBoardThumbnailProjection } from '../src/renderer/projects/board-thumbnail-projection';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

class ManualScheduler implements BoardThumbnailScheduler {
  readonly tasks: Array<{ cancelled: boolean; readonly run: () => void }> = [];

  readonly schedule = (task: () => void): (() => void) => {
    const entry = { cancelled: false, run: task };
    this.tasks.push(entry);
    return () => {
      entry.cancelled = true;
    };
  };

  flushNext(): void {
    while (this.tasks.length > 0) {
      const entry = this.tasks.shift();
      if (entry !== undefined && !entry.cancelled) {
        entry.run();
        return;
      }
    }
  }
}

const parseFixture = (): ProjectDocument => {
  const parsed = parseProjectDocument(createValidProjectDocumentInput());
  if (!parsed.ok) {
    throw new Error('Thumbnail store fixture is invalid.');
  }
  return parsed.value;
};

describe('board thumbnail store', () => {
  it('defers projection, preserves the prior preview, and coalesces stale revisions', () => {
    const scheduler = new ManualScheduler();
    const projector = vi.fn(createBoardThumbnailProjection);
    const store = new BoardThumbnailStore({ projector, scheduler });
    const document = parseFixture();

    store.generate(document);
    expect(projector).not.toHaveBeenCalled();
    expect(store.getSnapshot(DOCUMENT_FIXTURE_IDS.board)).toEqual({ status: 'loading' });
    scheduler.flushNext();
    expect(projector).toHaveBeenCalledOnce();
    expect(store.getSnapshot(DOCUMENT_FIXTURE_IDS.board).status).toBe('ready');

    const renamed = dispatchDocumentCommand(document, {
      type: DOCUMENT_COMMAND_TYPES.renameBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      name: 'Renamed',
    });
    if (!renamed.ok || !renamed.changed) {
      throw new Error('Thumbnail revision fixture could not be renamed.');
    }
    store.generate(renamed.document);
    expect(store.getSnapshot(DOCUMENT_FIXTURE_IDS.board).status).toBe('ready');
    const renamedAgain = dispatchDocumentCommand(renamed.document, {
      type: DOCUMENT_COMMAND_TYPES.renameBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      name: 'Latest',
    });
    if (!renamedAgain.ok || !renamedAgain.changed) {
      throw new Error('Latest thumbnail revision fixture could not be renamed.');
    }
    store.generate(renamedAgain.document);
    scheduler.flushNext();
    expect(projector).toHaveBeenCalledTimes(2);
    expect(projector).toHaveBeenLastCalledWith(
      renamedAgain.document,
      DOCUMENT_FIXTURE_IDS.board,
      undefined,
    );
  });

  it('projects one board per task and removes snapshots for boards that leave active order', () => {
    const input = createValidProjectDocumentInput();
    const secondBoardId = BoardIdSchema.parse('board_thumbnail02');
    input.boardIds.push(secondBoardId);
    input.boardsById[secondBoardId] = {
      ...BoardSchema.parse({
        id: secondBoardId,
        name: 'Second',
        note: { text: '' },
        childIds: [],
        alternateIds: [],
        selectedAlternateId: null,
      }),
      alternateIds: [],
      childIds: [],
      note: { text: '' },
      selectedAlternateId: null,
    };
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) {
      throw new Error('Multi-board thumbnail fixture is invalid.');
    }
    const scheduler = new ManualScheduler();
    const projector = vi.fn(createBoardThumbnailProjection);
    const store = new BoardThumbnailStore({ projector, scheduler });
    store.generate(parsed.value);

    scheduler.flushNext();
    expect(projector).toHaveBeenCalledOnce();
    expect(store.getSnapshot(secondBoardId).status).toBe('loading');
    scheduler.flushNext();
    expect(projector).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot(secondBoardId).status).toBe('ready');

    const trashed = dispatchDocumentCommand(parsed.value, {
      type: DOCUMENT_COMMAND_TYPES.trashBoard,
      boardId: secondBoardId,
      toIndex: 0,
    });
    if (!trashed.ok || !trashed.changed) {
      throw new Error('Thumbnail fixture board could not be trashed.');
    }
    store.generate(trashed.document);
    expect(store.getSnapshot(secondBoardId).status).toBe('loading');
  });
});
