// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createDocumentHistory,
  dispatchHistoryTransaction,
  parseProjectDocument,
  selectElementWorldBounds,
  undoDocumentHistory,
  type DocumentHistoryState,
} from '../src/domain';
import { captureMoveTargets } from '../src/renderer/editor/move-geometry';
import { MoveInteraction } from '../src/renderer/editor/move-interaction';
import { SelectionInteraction } from '../src/renderer/editor/selection-interaction';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import type { AnimationFrameScheduler } from '../src/renderer/editor/viewport-camera-store';
import { createViewportPoint, createWorldPoint } from '../src/renderer/editor/viewport-transform';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

class TestAnimationFrameScheduler implements AnimationFrameScheduler {
  readonly callbacks = new Map<number, (timestamp: number) => void>();
  #nextId = 1;

  cancel = (requestId: number): void => {
    this.callbacks.delete(requestId);
  };

  request = (callback: (timestamp: number) => void): number => {
    const requestId = this.#nextId++;
    this.callbacks.set(requestId, callback);
    return requestId;
  };
}

const parseFixture = () => {
  const result = parseProjectDocument(createValidProjectDocumentInput());
  if (!result.ok) {
    throw new Error('Move gesture fixture is invalid.');
  }
  return result.value;
};

describe('move gesture integration', () => {
  it('turns 500 pointer updates into one undoable nested-frame transaction', () => {
    const originalDocument = parseFixture();
    let history: DocumentHistoryState = createDocumentHistory(originalDocument);
    const scheduler = new TestAnimationFrameScheduler();
    const selection = new SelectionStore();
    selection.replace([DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child]);
    const move = new MoveInteraction(
      {
        capture: (ids) => captureMoveTargets(history.document, ids),
        commit: (commands) => {
          const result = dispatchHistoryTransaction(history, commands, { label: 'Move elements' });
          if (!result.ok || !result.changed) {
            return false;
          }
          history = result.history;
          return true;
        },
      },
      scheduler,
    );
    const interaction = new SelectionInteraction(
      selection,
      {
        listSelectableIds: () => [DOCUMENT_FIXTURE_IDS.child],
        queryHitStack: () => [DOCUMENT_FIXTURE_IDS.child],
        querySelectionRegion: () => [],
      },
      move,
    );
    const start = {
      viewportPoint: createViewportPoint(100, 100),
      worldPoint: createWorldPoint(100, 100),
    };
    interaction.beginPress({ altKey: false, pointerId: 11, shiftKey: false, ...start });

    for (let index = 1; index <= 500; index += 1) {
      interaction.updatePress(11, {
        shiftKey: false,
        viewportPoint: createViewportPoint(100 + index / 10, 100 + index / 20),
        worldPoint: createWorldPoint(100 + index / 10, 100 + index / 20),
      });
    }

    expect(interaction.getSnapshot()).toEqual({ kind: 'moving', pointerId: 11 });
    expect(scheduler.callbacks.size).toBe(1);
    expect(
      interaction.completePress(11, {
        shiftKey: false,
        viewportPoint: createViewportPoint(150, 125),
        worldPoint: createWorldPoint(150, 125),
      }),
    ).toBe(true);

    expect(history.undoEntries).toHaveLength(1);
    expect(history.undoEntries[0]).toMatchObject({
      forwardCommands: [{ elementId: DOCUMENT_FIXTURE_IDS.group, type: 'element.set-frame' }],
      label: 'Move elements',
    });
    expect(history.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.frame).toEqual({
      x: 30,
      y: 37.5,
      width: 320,
      height: 180,
    });
    expect(history.document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.frame).toEqual(
      originalDocument.elementsById[DOCUMENT_FIXTURE_IDS.child]?.frame,
    );
    expect(selectElementWorldBounds(history.document, DOCUMENT_FIXTURE_IDS.child)).toEqual({
      x: 46,
      y: 61.5,
      width: 120,
      height: 48,
    });
    expect(selection.getSnapshot().selectedIds).toEqual([
      DOCUMENT_FIXTURE_IDS.group,
      DOCUMENT_FIXTURE_IDS.child,
    ]);
    expect(move.getSnapshot()).toEqual({ kind: 'idle' });

    const undone = undoDocumentHistory(history);
    expect(undone).toMatchObject({ changed: true, ok: true });
    expect(undone.history.document).toEqual(originalDocument);
  });

  it('restores exact selection and leaves history untouched when a promoted move is cancelled', () => {
    const document = parseFixture();
    const history = createDocumentHistory(document);
    const scheduler = new TestAnimationFrameScheduler();
    const selection = new SelectionStore();
    selection.selectOnly(DOCUMENT_FIXTURE_IDS.group);
    const selectionBefore = selection.getSnapshot();
    const move = new MoveInteraction(
      {
        capture: (ids) => captureMoveTargets(document, ids),
        commit: () => {
          throw new Error('Cancellation must not reach the commit boundary.');
        },
      },
      scheduler,
    );
    const interaction = new SelectionInteraction(
      selection,
      {
        listSelectableIds: () => [DOCUMENT_FIXTURE_IDS.child],
        queryHitStack: () => [DOCUMENT_FIXTURE_IDS.child],
        querySelectionRegion: () => [],
      },
      move,
    );
    interaction.beginPress({
      altKey: false,
      pointerId: 12,
      shiftKey: false,
      viewportPoint: createViewportPoint(0, 0),
      worldPoint: createWorldPoint(0, 0),
    });
    interaction.updatePress(12, {
      shiftKey: true,
      viewportPoint: createViewportPoint(40, 15),
      worldPoint: createWorldPoint(40, 15),
    });
    expect(selection.getSnapshot().selectedIds).toEqual([DOCUMENT_FIXTURE_IDS.child]);
    expect(move.getSnapshot()).toMatchObject({ delta: { x: 40, y: 0 }, kind: 'moving' });

    expect(interaction.cancelPress(12)).toBe(true);
    expect(selection.getSnapshot()).toMatchObject({
      primaryId: selectionBefore.primaryId,
      selectedIds: selectionBefore.selectedIds,
    });
    expect(move.getSnapshot()).toEqual({ kind: 'idle' });
    expect(history.document).toBe(document);
    expect(history.undoEntries).toHaveLength(0);
    expect(scheduler.callbacks.size).toBe(0);
  });
});
