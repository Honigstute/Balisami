import { describe, expect, it, vi } from 'vitest';

import {
  ElementIdSchema,
  createDocumentHistory,
  dispatchHistoryTransaction,
  parseProjectDocument,
  redoDocumentHistory,
  undoDocumentHistory,
  type DocumentHistoryState,
  type ElementId,
  type ProjectDocument,
} from '../src/domain';
import {
  SELECTION_ARRANGEMENT_ACTIONS,
  arrangeSelectedElements,
  planSelectionArrangement,
  selectSelectionArrangementAvailability,
  type SelectionArrangementAction,
} from '../src/renderer/editor/selection-arrangement';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const IDS = ['a', 'b', 'c', 'd'].map((suffix) =>
  ElementIdSchema.parse(`element_arrange00${suffix}`),
) as [ElementId, ElementId, ElementId, ElementId];
const STALE_ID = ElementIdSchema.parse('element_arrangestale');

const parseInput = (input: ReturnType<typeof createValidProjectDocumentInput>): ProjectDocument => {
  const result = parseProjectDocument(input);
  if (!result.ok) {
    throw new Error(`Invalid arrangement fixture: ${JSON.stringify(result.issues)}`);
  }
  return result.value;
};

const createArrangementFixture = (nested = false): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const source = input.elementsById[DOCUMENT_FIXTURE_IDS.child]!;
  const frames = [
    { x: 0, y: 0, width: 20, height: 10 },
    { x: 35, y: 35, width: 30, height: 20 },
    { x: 100, y: 100, width: 10, height: 30 },
    { x: 160, y: 160, width: 40, height: 40 },
  ] as const;
  for (const [index, id] of IDS.entries()) {
    input.elementsById[id] = {
      ...structuredClone(source),
      id,
      frame: frames[index]!,
      assetIds: [],
      link: null,
    };
  }
  if (nested) {
    input.elementsById[DOCUMENT_FIXTURE_IDS.group]!.childIds = [DOCUMENT_FIXTURE_IDS.child, ...IDS];
  } else {
    input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds = [...IDS, DOCUMENT_FIXTURE_IDS.group];
  }
  return parseInput(input);
};

const framePositions = (document: ProjectDocument): readonly Readonly<{ x: number; y: number }>[] =>
  IDS.map((id) => {
    const frame = document.elementsById[id]?.frame;
    if (frame === undefined) {
      throw new Error(`Missing arrangement frame for ${id}.`);
    }
    return { x: frame.x, y: frame.y };
  });

const expectedAlignmentPositions: Readonly<
  Record<SelectionArrangementAction, readonly Readonly<{ x: number; y: number }>[] | undefined>
> = {
  [SELECTION_ARRANGEMENT_ACTIONS.alignLeft]: [
    { x: 35, y: 0 },
    { x: 35, y: 35 },
    { x: 35, y: 100 },
    { x: 35, y: 160 },
  ],
  [SELECTION_ARRANGEMENT_ACTIONS.alignCenter]: [
    { x: 40, y: 0 },
    { x: 35, y: 35 },
    { x: 45, y: 100 },
    { x: 30, y: 160 },
  ],
  [SELECTION_ARRANGEMENT_ACTIONS.alignRight]: [
    { x: 45, y: 0 },
    { x: 35, y: 35 },
    { x: 55, y: 100 },
    { x: 25, y: 160 },
  ],
  [SELECTION_ARRANGEMENT_ACTIONS.alignTop]: [
    { x: 0, y: 35 },
    { x: 35, y: 35 },
    { x: 100, y: 35 },
    { x: 160, y: 35 },
  ],
  [SELECTION_ARRANGEMENT_ACTIONS.alignMiddle]: [
    { x: 0, y: 40 },
    { x: 35, y: 35 },
    { x: 100, y: 30 },
    { x: 160, y: 25 },
  ],
  [SELECTION_ARRANGEMENT_ACTIONS.alignBottom]: [
    { x: 0, y: 45 },
    { x: 35, y: 35 },
    { x: 100, y: 25 },
    { x: 160, y: 15 },
  ],
  [SELECTION_ARRANGEMENT_ACTIONS.distributeHorizontally]: undefined,
  [SELECTION_ARRANGEMENT_ACTIONS.distributeVertically]: undefined,
};

describe('selection arrangement', () => {
  it('aligns every canonical root to the primary root with exact transaction inverses', () => {
    const document = createArrangementFixture();
    for (const action of [
      SELECTION_ARRANGEMENT_ACTIONS.alignLeft,
      SELECTION_ARRANGEMENT_ACTIONS.alignCenter,
      SELECTION_ARRANGEMENT_ACTIONS.alignRight,
      SELECTION_ARRANGEMENT_ACTIONS.alignTop,
      SELECTION_ARRANGEMENT_ACTIONS.alignMiddle,
      SELECTION_ARRANGEMENT_ACTIONS.alignBottom,
    ]) {
      const plan = planSelectionArrangement(
        document,
        [IDS[3], IDS[0], IDS[1], IDS[2]],
        IDS[1],
        action,
      );
      expect(plan?.rootIds).toEqual(IDS);
      expect(plan?.primaryId).toBe(IDS[1]);
      if (plan === undefined) {
        throw new Error(`Expected ${action} plan.`);
      }
      const changed = dispatchHistoryTransaction(createDocumentHistory(document), plan.commands, {
        label: action,
      });
      if (!changed.ok || !changed.changed) {
        throw new Error(`Expected ${action} transaction.`);
      }
      expect(framePositions(changed.history.document)).toEqual(expectedAlignmentPositions[action]);
      const undone = undoDocumentHistory(changed.history);
      expect(undone.ok && undone.changed ? JSON.stringify(undone.history.document) : '').toBe(
        JSON.stringify(document),
      );
    }
  });

  it('keeps geometric outer roots fixed and creates equal nonnegative edge gaps', () => {
    const document = createArrangementFixture();
    const horizontal = planSelectionArrangement(
      document,
      [IDS[2], IDS[0], IDS[3], IDS[1]],
      IDS[2],
      SELECTION_ARRANGEMENT_ACTIONS.distributeHorizontally,
    );
    const vertical = planSelectionArrangement(
      document,
      IDS,
      IDS[1],
      SELECTION_ARRANGEMENT_ACTIONS.distributeVertically,
    );
    expect(horizontal?.commands.map((command) => command.elementId)).toEqual([IDS[1], IDS[2]]);
    expect(vertical?.commands.map((command) => command.elementId)).toEqual([IDS[1], IDS[2]]);
    if (horizontal === undefined || vertical === undefined) {
      throw new Error('Expected distribution plans.');
    }
    expect(horizontal.commands[0]?.frame.x).toBeCloseTo(53.333333333333336, 12);
    expect(horizontal.commands[1]?.frame.x).toBeCloseTo(116.66666666666667, 12);
    expect(vertical.commands[0]?.frame.y).toBeCloseTo(43.333333333333336, 12);
    expect(vertical.commands[1]?.frame.y).toBeCloseTo(96.66666666666667, 12);

    const changed = dispatchHistoryTransaction(
      createDocumentHistory(document),
      horizontal.commands,
      {
        label: 'Distribute horizontally',
      },
    );
    if (!changed.ok || !changed.changed) {
      throw new Error('Expected horizontal distribution transaction.');
    }
    expect(changed.history.document.elementsById[IDS[0]]?.frame).toBe(
      document.elementsById[IDS[0]]?.frame,
    );
    expect(changed.history.document.elementsById[IDS[3]]?.frame).toBe(
      document.elementsById[IDS[3]]?.frame,
    );
    expect(
      planSelectionArrangement(
        changed.history.document,
        IDS,
        IDS[2],
        SELECTION_ARRANGEMENT_ACTIONS.distributeHorizontally,
      ),
    ).toBeUndefined();
  });

  it('rejects insufficient, stale, locked, cross-owner, and overlapping distribution input', () => {
    const document = createArrangementFixture();
    expect(
      planSelectionArrangement(document, [IDS[0]], IDS[0], SELECTION_ARRANGEMENT_ACTIONS.alignLeft),
    ).toBeUndefined();
    expect(
      planSelectionArrangement(
        document,
        [IDS[0], IDS[1]],
        IDS[0],
        SELECTION_ARRANGEMENT_ACTIONS.distributeHorizontally,
      ),
    ).toBeUndefined();
    expect(
      planSelectionArrangement(
        document,
        [IDS[0], STALE_ID],
        IDS[0],
        SELECTION_ARRANGEMENT_ACTIONS.alignLeft,
      ),
    ).toBeUndefined();
    expect(
      planSelectionArrangement(
        document,
        [IDS[0], DOCUMENT_FIXTURE_IDS.child],
        IDS[0],
        SELECTION_ARRANGEMENT_ACTIONS.alignLeft,
      ),
    ).toBeUndefined();

    const lockedInput = createValidProjectDocumentInput();
    const source = lockedInput.elementsById[DOCUMENT_FIXTURE_IDS.child]!;
    for (const [index, id] of IDS.entries()) {
      lockedInput.elementsById[id] = {
        ...structuredClone(source),
        id,
        frame: { ...source.frame, x: index * 100 },
        assetIds: [],
        link: null,
      };
    }
    lockedInput.elementsById[DOCUMENT_FIXTURE_IDS.group]!.locked = true;
    lockedInput.elementsById[DOCUMENT_FIXTURE_IDS.group]!.childIds = [
      DOCUMENT_FIXTURE_IDS.child,
      ...IDS,
    ];
    expect(
      planSelectionArrangement(
        parseInput(lockedInput),
        [IDS[0], IDS[1]],
        IDS[0],
        SELECTION_ARRANGEMENT_ACTIONS.alignTop,
      ),
    ).toBeUndefined();

    const overlapInput = createValidProjectDocumentInput();
    for (const [index, id] of IDS.entries()) {
      overlapInput.elementsById[id] = {
        ...structuredClone(source),
        id,
        frame: { x: index * 10, y: 0, width: 100, height: 20 },
        assetIds: [],
        link: null,
      };
    }
    overlapInput.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds = [
      ...IDS,
      DOCUMENT_FIXTURE_IDS.group,
    ];
    expect(
      planSelectionArrangement(
        parseInput(overlapInput),
        IDS,
        IDS[0],
        SELECTION_ARRANGEMENT_ACTIONS.distributeHorizontally,
      ),
    ).toBeUndefined();
  });

  it('reports semantic availability from the same planner', () => {
    const document = createArrangementFixture();
    expect(selectSelectionArrangementAvailability(document, IDS, IDS[1])).toEqual({
      canAlignBottom: true,
      canAlignCenter: true,
      canAlignLeft: true,
      canAlignMiddle: true,
      canAlignRight: true,
      canAlignTop: true,
      canDistributeHorizontally: true,
      canDistributeVertically: true,
    });
  });

  it('commits once and canonicalizes nested selection only after accepted output', () => {
    const document = createArrangementFixture(true);
    const selection = new SelectionStore();
    selection.replace([IDS[2], IDS[0], IDS[1]], IDS[1]);
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
      arrangeSelectedElements(document, selection, SELECTION_ARRANGEMENT_ACTIONS.alignLeft, {
        commit,
      }),
    ).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(history.undoEntries).toHaveLength(1);
    expect(selection.getSnapshot()).toMatchObject({
      primaryId: IDS[1],
      selectedIds: [IDS[0], IDS[1], IDS[2]],
    });

    const rejectedSelection = new SelectionStore();
    rejectedSelection.replace([IDS[2], IDS[0]], IDS[0]);
    const before = rejectedSelection.getSnapshot();
    expect(
      arrangeSelectedElements(document, rejectedSelection, SELECTION_ARRANGEMENT_ACTIONS.alignTop, {
        commit: () => undefined,
      }),
    ).toBe(false);
    expect(rejectedSelection.getSnapshot()).toBe(before);
  });

  it('preserves exact nested and flat documents through seeded undo/redo', () => {
    let seed = 0x51ec7a11;
    const random = (): number => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const actions = Object.values(SELECTION_ARRANGEMENT_ACTIONS);
    for (let fixture = 0; fixture < 200; fixture += 1) {
      const input = createValidProjectDocumentInput();
      const source = input.elementsById[DOCUMENT_FIXTURE_IDS.child]!;
      for (const [index, id] of IDS.entries()) {
        input.elementsById[id] = {
          ...structuredClone(source),
          id,
          frame: {
            x: index * 120 + random() * 10,
            y: index * 100 + random() * 10,
            width: 10 + random() * 30,
            height: 10 + random() * 30,
          },
          assetIds: [],
          link: null,
        };
      }
      if (fixture % 2 === 0) {
        input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds = [
          ...IDS,
          DOCUMENT_FIXTURE_IDS.group,
        ];
      } else {
        input.elementsById[DOCUMENT_FIXTURE_IDS.group]!.childIds = [
          DOCUMENT_FIXTURE_IDS.child,
          ...IDS,
        ];
      }
      const document = parseInput(input);
      const action = actions[fixture % actions.length]!;
      const plan = planSelectionArrangement(document, IDS, IDS[fixture % IDS.length], action);
      if (plan === undefined) {
        throw new Error(`Seeded arrangement plan failed for ${action}.`);
      }
      const changed = dispatchHistoryTransaction(createDocumentHistory(document), plan.commands, {
        label: action,
      });
      if (!changed.ok || !changed.changed) {
        throw new Error(`Seeded arrangement transaction failed for ${action}.`);
      }
      const finalJson = JSON.stringify(changed.history.document);
      const undone = undoDocumentHistory(changed.history);
      expect(undone.ok && undone.changed ? JSON.stringify(undone.history.document) : '').toBe(
        JSON.stringify(document),
      );
      if (!undone.ok || !undone.changed) {
        throw new Error('Seeded arrangement undo failed.');
      }
      const redone = redoDocumentHistory(undone.history);
      expect(redone.ok && redone.changed ? JSON.stringify(redone.history.document) : '').toBe(
        finalJson,
      );
    }
  });
});
