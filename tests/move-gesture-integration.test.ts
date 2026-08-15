// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  createDocumentHistory,
  dispatchHistoryTransaction,
  parseProjectDocument,
  selectElementWorldBounds,
  undoDocumentHistory,
  type DocumentHistoryState,
} from '../src/domain';
import { DocumentSceneModel } from '../src/renderer/editor/document-scene-model';
import { captureMoveTargets } from '../src/renderer/editor/move-geometry';
import { MoveInteraction } from '../src/renderer/editor/move-interaction';
import { createSceneSnapCandidates } from '../src/renderer/editor/scene-snap-candidates';
import { SelectionInteraction } from '../src/renderer/editor/selection-interaction';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { resolveSnap } from '../src/renderer/editor/snap-engine';
import type { AnimationFrameScheduler } from '../src/renderer/editor/viewport-camera-store';
import {
  createViewportPoint,
  createViewportZoom,
  createWorldPoint,
} from '../src/renderer/editor/viewport-transform';
import {
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  getFixtureControlVersion,
} from './fixtures/project-document';

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

  it('commits one equal-gap move transaction and undo restores the exact document', () => {
    const input = createValidProjectDocumentInput();
    const beforeId = ElementIdSchema.parse('element_historybefore');
    const movingId = ElementIdSchema.parse('element_historymoving');
    const afterId = ElementIdSchema.parse('element_historyafter0');
    const createRectangle = (id: typeof beforeId, x: number, width: number) => ({
      id,
      controlType: FOUNDATION_CONTROL_TYPES.rectangle,
      controlVersion: getFixtureControlVersion(FOUNDATION_CONTROL_TYPES.rectangle),
      frame: { x, y: 5_000, width, height: 20 },
      locked: false,
      properties: {},
      childIds: [],
      assetIds: [],
      link: null,
    });
    input.elementsById[beforeId] = createRectangle(beforeId, 0, 40);
    input.elementsById[movingId] = createRectangle(movingId, 200, 20);
    input.elementsById[afterId] = createRectangle(afterId, 100, 40);
    input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds.unshift(beforeId, movingId, afterId);
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) {
      throw new Error('Equal-gap move history fixture is invalid.');
    }
    const originalDocument = parsed.value;
    let history: DocumentHistoryState = createDocumentHistory(originalDocument);
    const model = new DocumentSceneModel();
    model.reconcile(history.document, DOCUMENT_FIXTURE_IDS.board);
    const scheduler = new TestAnimationFrameScheduler();
    const zoom = createViewportZoom(1);
    const move = new MoveInteraction(
      {
        capture: (ids) => captureMoveTargets(history.document, ids),
        commit: (commands) => {
          const result = dispatchHistoryTransaction(history, commands, { label: 'Move element' });
          if (!result.ok || !result.changed) {
            return false;
          }
          history = result.history;
          model.reconcile(history.document, DOCUMENT_FIXTURE_IDS.board);
          return true;
        },
        resolveSnap: ({ activeAxes, capture, previousLocks, rawDelta, snapBypassed }) =>
          resolveSnap({
            activeAxes,
            bypass: snapBypassed,
            candidates: createSceneSnapCandidates(model, {
              activeAxes,
              ...(capture.sharedOwner === undefined ? {} : { equalGapOwner: capture.sharedOwner }),
              excludedIds: capture.affectedIds,
              movingBounds: capture.worldBounds,
              rawDelta,
              zoom,
            }),
            movingBounds: capture.worldBounds,
            previousLocks,
            rawDelta,
            zoom,
          }),
      },
      scheduler,
    );

    expect(
      move.begin({
        pointerId: 21,
        snapBypassed: false,
        shiftKey: false,
        startWorldPoint: createWorldPoint(0, 0),
        targetIds: [movingId],
        worldPoint: createWorldPoint(-142, 0),
      }),
    ).toBe(true);
    const preview = move.getSnapshot();
    expect(preview).toMatchObject({ delta: { x: -140, y: 0 }, kind: 'moving' });
    expect(preview.kind === 'moving' ? preview.guides : []).toContainEqual(
      expect.objectContaining({ axis: 'x', gap: 20, kind: 'equalGap' }),
    );
    expect(
      move.complete({
        pointerId: 21,
        snapBypassed: false,
        shiftKey: false,
        worldPoint: createWorldPoint(-142, 0),
      }),
    ).toBe('committed');

    expect(history.undoEntries).toHaveLength(1);
    expect(history.document.elementsById[movingId]?.frame.x).toBe(60);
    const undone = undoDocumentHistory(history);
    expect(undone).toMatchObject({ changed: true, ok: true });
    expect(undone.history.document).toEqual(originalDocument);
  });
});
