import { describe, expect, it, vi } from 'vitest';

import {
  ElementIdSchema,
  createDocumentHistory,
  dispatchDocumentCommand,
  dispatchHistoryTransaction,
  parseProjectDocument,
  undoDocumentHistory,
  type DocumentHistoryState,
  type ElementId,
  type ProjectDocument,
} from '../src/domain';
import {
  SELECTION_LAYER_ACTIONS,
  layerSelectedElements,
  planSelectionLayer,
  selectSelectionLayerAvailability,
  type SelectionLayerAction,
} from '../src/renderer/editor/selection-layering';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const IDS = ['a', 'b', 'c', 'd', 'e'].map((suffix) =>
  ElementIdSchema.parse(`element_layer000${suffix}`),
) as [ElementId, ElementId, ElementId, ElementId, ElementId];

const parseFixture = (lockedId?: ElementId): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const source = input.elementsById[DOCUMENT_FIXTURE_IDS.child]!;
  for (const [index, id] of IDS.entries()) {
    input.elementsById[id] = {
      ...structuredClone(source),
      id,
      frame: { ...source.frame, x: index * 30 },
      locked: id === lockedId,
      assetIds: [],
      link: null,
    };
  }
  input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds = [...IDS, DOCUMENT_FIXTURE_IDS.group];
  const result = parseProjectDocument(input);
  if (!result.ok) {
    throw new Error(`Invalid layering fixture: ${JSON.stringify(result.issues)}`);
  }
  return result.value;
};

const parseNestedFixture = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const source = input.elementsById[DOCUMENT_FIXTURE_IDS.child]!;
  for (const [index, id] of IDS.entries()) {
    input.elementsById[id] = {
      ...structuredClone(source),
      id,
      frame: { ...source.frame, x: index * 30 },
      assetIds: [],
      link: null,
    };
  }
  input.elementsById[DOCUMENT_FIXTURE_IDS.group]!.childIds = [DOCUMENT_FIXTURE_IDS.child, ...IDS];
  const result = parseProjectDocument(input);
  if (!result.ok) {
    throw new Error(`Invalid nested layering fixture: ${JSON.stringify(result.issues)}`);
  }
  return result.value;
};

const expectedOrders: Readonly<Record<SelectionLayerAction, readonly ElementId[]>> = {
  [SELECTION_LAYER_ACTIONS.sendToBack]: [
    IDS[1],
    IDS[3],
    IDS[0],
    IDS[2],
    IDS[4],
    DOCUMENT_FIXTURE_IDS.group,
  ],
  [SELECTION_LAYER_ACTIONS.bringToFront]: [
    IDS[0],
    IDS[2],
    IDS[4],
    DOCUMENT_FIXTURE_IDS.group,
    IDS[1],
    IDS[3],
  ],
  [SELECTION_LAYER_ACTIONS.sendBackward]: [
    IDS[1],
    IDS[0],
    IDS[3],
    IDS[2],
    IDS[4],
    DOCUMENT_FIXTURE_IDS.group,
  ],
  [SELECTION_LAYER_ACTIONS.bringForward]: [
    IDS[0],
    IDS[2],
    IDS[1],
    IDS[4],
    IDS[3],
    DOCUMENT_FIXTURE_IDS.group,
  ],
};

describe('selection layering', () => {
  it('implements all four stable multi-selection order transforms with exact inverses', () => {
    const document = parseFixture();
    for (const action of Object.values(SELECTION_LAYER_ACTIONS)) {
      const plan = planSelectionLayer(document, [IDS[3], IDS[1]], action);
      expect(plan?.rootIds).toEqual([IDS[1], IDS[3]]);
      expect(plan?.command.childIds).toEqual(expectedOrders[action]);
      if (plan === undefined) {
        throw new Error(`Expected ${action} plan.`);
      }
      const applied = dispatchDocumentCommand(document, plan.command);
      expect(applied).toMatchObject({ ok: true, changed: true });
      if (!applied.ok || !applied.changed) {
        throw new Error(`Expected ${action} command to apply.`);
      }
      const restored = dispatchDocumentCommand(applied.document, applied.inverse);
      expect(restored.ok && restored.changed ? JSON.stringify(restored.document) : '').toBe(
        JSON.stringify(document),
      );
    }
  });

  it('reports boundary no-ops and rejects locked, cross-owner, and stale input', () => {
    const document = parseFixture();
    expect(
      planSelectionLayer(document, [IDS[0]], SELECTION_LAYER_ACTIONS.sendBackward),
    ).toBeUndefined();
    expect(
      planSelectionLayer(
        document,
        [DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child],
        SELECTION_LAYER_ACTIONS.bringToFront,
      ),
    ).toBeUndefined();
    expect(
      planSelectionLayer(parseFixture(IDS[1]), [IDS[1]], SELECTION_LAYER_ACTIONS.bringForward),
    ).toBeUndefined();
    expect(
      planSelectionLayer(
        document,
        [ElementIdSchema.parse('element_missing01')],
        SELECTION_LAYER_ACTIONS.bringForward,
      ),
    ).toBeUndefined();

    expect(selectSelectionLayerAvailability(document, [IDS[0]])).toEqual({
      canBringForward: true,
      canBringToFront: true,
      canSendBackward: false,
      canSendToBack: false,
    });
  });

  it('collapses selected descendants to roots, commits once, and keeps canonical selection', () => {
    const document = parseFixture();
    const selection = new SelectionStore();
    selection.replace(
      [DOCUMENT_FIXTURE_IDS.child, DOCUMENT_FIXTURE_IDS.group],
      DOCUMENT_FIXTURE_IDS.child,
    );
    let history: DocumentHistoryState = createDocumentHistory(document);
    const commit = vi.fn(
      (commands: Parameters<typeof dispatchHistoryTransaction>[1], label: string) => {
        const result = dispatchHistoryTransaction(history, commands, { label });
        if (!result.ok || !result.changed) {
          return undefined;
        }
        history = result.history;
        return history.document;
      },
    );

    expect(
      layerSelectedElements(document, selection, SELECTION_LAYER_ACTIONS.sendToBack, { commit }),
    ).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(history.undoEntries).toHaveLength(1);
    expect(selection.getSnapshot()).toMatchObject({
      selectedIds: [DOCUMENT_FIXTURE_IDS.group],
      primaryId: DOCUMENT_FIXTURE_IDS.group,
    });
    const undone = undoDocumentHistory(history);
    expect(undone.ok && undone.changed ? JSON.stringify(undone.history.document) : '').toBe(
      JSON.stringify(document),
    );
  });

  it('keeps inverse replay byte-identical across seeded sibling permutations', () => {
    let seed = 0x1a2b3c4d;
    const random = (): number => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    for (let fixture = 0; fixture < 200; fixture += 1) {
      const nested = fixture % 2 === 1;
      const document = nested ? parseNestedFixture() : parseFixture();
      const siblingPool = nested ? [DOCUMENT_FIXTURE_IDS.child, ...IDS] : IDS;
      const selected = siblingPool.filter(() => random() > 0.5);
      if (selected.length === 0 || selected.length === siblingPool.length) {
        selected.splice(0, selected.length, siblingPool[fixture % siblingPool.length]!);
      }
      const action = Object.values(SELECTION_LAYER_ACTIONS)[fixture % 4]!;
      const plan = planSelectionLayer(document, selected, action);
      if (plan === undefined) {
        continue;
      }
      const applied = dispatchDocumentCommand(document, plan.command);
      if (!applied.ok || !applied.changed) {
        throw new Error('Seeded layer command failed.');
      }
      const restored = dispatchDocumentCommand(applied.document, applied.inverse);
      expect(restored.ok && restored.changed ? JSON.stringify(restored.document) : '').toBe(
        JSON.stringify(document),
      );
    }
  });
});
