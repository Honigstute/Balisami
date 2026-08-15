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
import { captureResizeTarget } from '../src/renderer/editor/resize-geometry';
import { ResizeInteraction } from '../src/renderer/editor/resize-interaction';
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
    throw new Error('Resize gesture fixture is invalid.');
  }
  return result.value;
};

describe('resize gesture integration', () => {
  it('turns 500 nested pointer updates into one exact undoable frame command', () => {
    const originalDocument = parseFixture();
    let history: DocumentHistoryState = createDocumentHistory(originalDocument);
    const scheduler = new TestAnimationFrameScheduler();
    const selection = new SelectionStore();
    selection.selectOnly(DOCUMENT_FIXTURE_IDS.child);
    const resize = new ResizeInteraction(
      {
        capture: (id) => captureResizeTarget(history.document, id),
        commit: (command) => {
          const result = dispatchHistoryTransaction(history, [command], {
            label: 'Resize element',
          });
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
        queryResizeHandle: () => 'southEast',
        querySelectionRegion: () => [],
      },
      undefined,
      resize,
    );
    const start = {
      viewportPoint: createViewportPoint(116, 84.5),
      worldPoint: createWorldPoint(116, 84.5),
    };
    expect(
      interaction.beginPress({ altKey: false, pointerId: 61, shiftKey: false, ...start }),
    ).toBe(true);
    expect(interaction.getSnapshot()).toEqual({
      handle: 'southEast',
      kind: 'resizing',
      pointerId: 61,
    });

    for (let index = 1; index <= 500; index += 1) {
      interaction.updatePress(61, {
        shiftKey: false,
        viewportPoint: createViewportPoint(116 + index / 10, 84.5 + index / 20),
        worldPoint: createWorldPoint(116 + index / 10, 84.5 + index / 20),
      });
    }
    expect(scheduler.callbacks.size).toBe(1);
    expect(
      interaction.completePress(61, {
        shiftKey: false,
        viewportPoint: createViewportPoint(166, 109.5),
        worldPoint: createWorldPoint(166, 109.5),
      }),
    ).toBe(true);

    expect(history.undoEntries).toHaveLength(1);
    expect(history.undoEntries[0]).toMatchObject({
      forwardCommands: [{ elementId: DOCUMENT_FIXTURE_IDS.child, type: 'element.set-frame' }],
      label: 'Resize element',
    });
    expect(history.document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.frame).toEqual({
      x: 16,
      y: 24,
      width: 170,
      height: 73,
    });
    expect(history.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.frame).toEqual(
      originalDocument.elementsById[DOCUMENT_FIXTURE_IDS.group]?.frame,
    );
    expect(selectElementWorldBounds(history.document, DOCUMENT_FIXTURE_IDS.child)).toEqual({
      x: -4,
      y: 36.5,
      width: 170,
      height: 73,
    });
    expect(selection.getSnapshot().selectedIds).toEqual([DOCUMENT_FIXTURE_IDS.child]);
    expect(resize.getSnapshot()).toEqual({ kind: 'idle' });

    const undone = undoDocumentHistory(history);
    expect(undone).toMatchObject({ changed: true, ok: true });
    expect(undone.history.document).toEqual(originalDocument);
  });

  it('keeps document, history, and selection exact when resize is cancelled', () => {
    const document = parseFixture();
    const history = createDocumentHistory(document);
    const scheduler = new TestAnimationFrameScheduler();
    const selection = new SelectionStore();
    selection.selectOnly(DOCUMENT_FIXTURE_IDS.child);
    const selectionBefore = selection.getSnapshot();
    const resize = new ResizeInteraction(
      {
        capture: (id) => captureResizeTarget(document, id),
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
        queryResizeHandle: () => 'west',
        querySelectionRegion: () => [],
      },
      undefined,
      resize,
    );
    interaction.beginPress({
      altKey: false,
      pointerId: 62,
      shiftKey: false,
      viewportPoint: createViewportPoint(-4, 60.5),
      worldPoint: createWorldPoint(-4, 60.5),
    });
    interaction.updatePress(62, {
      shiftKey: false,
      viewportPoint: createViewportPoint(40, 60.5),
      worldPoint: createWorldPoint(40, 60.5),
    });
    expect(resize.getSnapshot()).toMatchObject({ kind: 'resizing' });

    expect(interaction.cancelPress(62)).toBe(true);
    expect(selection.getSnapshot()).toBe(selectionBefore);
    expect(resize.getSnapshot()).toEqual({ kind: 'idle' });
    expect(history.document).toBe(document);
    expect(history.undoEntries).toHaveLength(0);
    expect(history.redoEntries).toHaveLength(0);
    expect(scheduler.callbacks.size).toBe(0);
  });
});
