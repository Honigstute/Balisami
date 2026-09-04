import { describe, expect, it } from 'vitest';

import { BoardIdSchema, ElementIdSchema, parseProjectDocument } from '../src/domain';
import { createBoardExportPlan } from '../src/renderer/projects/board-export-plan';
import { DOCUMENT_FIXTURE_IDS, createValidProjectDocumentInput } from './fixtures/project-document';

const SECOND_BOARD_ID = BoardIdSchema.parse('board_secondary1');

const createDocument = () => {
  const input = createValidProjectDocumentInput();
  input.boardIds.push(SECOND_BOARD_ID);
  input.boardsById[SECOND_BOARD_ID] = {
    alternateIds: [],
    childIds: [],
    id: SECOND_BOARD_ID,
    name: 'Second',
    note: { text: '' },
    selectedAlternateId: null,
  };
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) throw new Error('Export-plan fixture is invalid.');
  return parsed.value;
};

describe('board export plan', () => {
  it('preserves canonical document order for all and subset scopes', () => {
    const document = createDocument();
    const all = createBoardExportPlan(document, { kind: 'all' });
    const subset = createBoardExportPlan(document, {
      boardIds: [SECOND_BOARD_ID, DOCUMENT_FIXTURE_IDS.board],
      kind: 'boards',
    });

    expect(all.ok && all.value.pages.map((page) => page.canonicalBoardId)).toEqual([
      DOCUMENT_FIXTURE_IDS.board,
      SECOND_BOARD_ID,
    ]);
    expect(subset.ok && subset.value.pages.map((page) => page.canonicalBoardId)).toEqual([
      DOCUMENT_FIXTURE_IDS.board,
      SECOND_BOARD_ID,
    ]);
  });

  it('exports a selected group together with its nested visual descendants', () => {
    const result = createBoardExportPlan(createDocument(), {
      boardId: DOCUMENT_FIXTURE_IDS.board,
      elementIds: [DOCUMENT_FIXTURE_IDS.group],
      kind: 'selection',
    });

    expect(result.ok && result.value.pages[0]?.items.map((item) => item.id)).toEqual([
      DOCUMENT_FIXTURE_IDS.child,
    ]);
  });

  it('rejects empty, foreign, duplicate, and trashed board scopes', () => {
    const document = createDocument();
    expect(createBoardExportPlan(document, { boardIds: [], kind: 'boards' })).toMatchObject({
      code: 'invalid-scope',
      ok: false,
    });
    expect(
      createBoardExportPlan(document, {
        boardId: DOCUMENT_FIXTURE_IDS.board,
        elementIds: [ElementIdSchema.parse('element_missing01')],
        kind: 'selection',
      }),
    ).toMatchObject({ code: 'empty-selection', ok: false });
    expect(
      createBoardExportPlan(document, {
        boardIds: [SECOND_BOARD_ID, SECOND_BOARD_ID],
        kind: 'boards',
      }),
    ).toMatchObject({ code: 'invalid-scope', ok: false });
    expect(
      createBoardExportPlan(document, {
        boardId: BoardIdSchema.parse('board_missing001'),
        kind: 'current',
      }),
    ).toMatchObject({ code: 'invalid-scope', ok: false });
  });
});
