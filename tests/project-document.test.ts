import { describe, expect, it } from 'vitest';

import {
  MAX_DOCUMENT_VALIDATION_ISSUES,
  FOUNDATION_CONTROL_TYPES,
  parseProjectDocument,
  type AssetId,
  type BoardId,
  type ElementId,
  type ProjectDocumentParseResult,
} from '../src/domain';
import {
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  type ProjectDocumentInputFixture,
} from './fixtures/project-document';

type FailedParse = Extract<ProjectDocumentParseResult, { readonly ok: false }>;

const expectFailure = (input: unknown): FailedParse => {
  const result = parseProjectDocument(input);
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error('Expected project document parsing to fail.');
  }
  return result;
};

const issuePaths = (result: FailedParse): readonly string[] =>
  result.issues.map((issue) => issue.path.join('.'));

const getBoard = (input: ProjectDocumentInputFixture, id: BoardId) => {
  const board = input.boardsById[id];
  if (board === undefined) {
    throw new Error(`Fixture board '${id}' is missing.`);
  }
  return board;
};

const getElement = (input: ProjectDocumentInputFixture, id: ElementId) => {
  const element = input.elementsById[id];
  if (element === undefined) {
    throw new Error(`Fixture element '${id}' is missing.`);
  }
  return element;
};

const getAsset = (input: ProjectDocumentInputFixture, id: AssetId) => {
  const asset = input.assetsById[id];
  if (asset === undefined) {
    throw new Error(`Fixture asset '${id}' is missing.`);
  }
  return asset;
};

describe('project document schema', () => {
  it('parses a normalized nested document and returns readonly records', () => {
    const result = parseProjectDocument(createValidProjectDocumentInput());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected project document parsing to succeed.');
    }

    expect(result.value.boardIds).toEqual([DOCUMENT_FIXTURE_IDS.board]);
    expect(result.value.elementsById[DOCUMENT_FIXTURE_IDS.group]?.childIds).toEqual([
      DOCUMENT_FIXTURE_IDS.child,
    ]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.elementsById)).toBe(true);
    expect(Object.isFrozen(result.value.elementsById[DOCUMENT_FIXTURE_IDS.child]?.frame)).toBe(
      true,
    );
  });

  it('accepts an empty project without inventing a placeholder board', () => {
    const input = createValidProjectDocumentInput();
    input.boardIds = [];
    input.boardsById = {};
    input.elementsById = {};
    input.assetsById = {};

    expect(parseProjectDocument(input)).toMatchObject({ ok: true });
  });

  it('rejects unstable IDs, non-finite geometry, unsafe properties, and UI-only fields', () => {
    const input = createValidProjectDocumentInput();
    input.id = 'project-too-short';
    getElement(input, DOCUMENT_FIXTURE_IDS.child).frame.width = Number.POSITIVE_INFINITY;
    getElement(input, DOCUMENT_FIXTURE_IDS.child).properties = {
      'Unsafe key': Number.NaN,
    };
    const withSessionState = { ...input, selection: [DOCUMENT_FIXTURE_IDS.child] };

    const result = expectFailure(withSessionState);
    const paths = issuePaths(result);

    expect(paths).toContain('id');
    expect(paths).toContain(`elementsById.${DOCUMENT_FIXTURE_IDS.child}.frame.width`);
    expect(paths.some((path) => path.includes('properties'))).toBe(true);
    expect(paths).toContain('');
  });

  it('rejects mismatched map identities and unordered board records', () => {
    const input = createValidProjectDocumentInput();
    const mismatchedBoardKey = 'board_secondary1';
    input.boardsById = {
      [mismatchedBoardKey]: getBoard(input, DOCUMENT_FIXTURE_IDS.board),
    };

    const result = expectFailure(input);
    const paths = issuePaths(result);

    expect(paths).toContain('boardIds.0');
    expect(paths).toContain(`boardsById.${mismatchedBoardKey}.id`);
    expect(paths).toContain(`boardsById.${mismatchedBoardKey}`);
  });

  it('rejects element and asset records stored under competing IDs', () => {
    const input = createValidProjectDocumentInput();
    const mismatchedElementKey = 'element_alias001';
    const mismatchedAssetKey = 'asset_alias0001';
    input.elementsById = {
      [DOCUMENT_FIXTURE_IDS.group]: getElement(input, DOCUMENT_FIXTURE_IDS.group),
      [mismatchedElementKey]: getElement(input, DOCUMENT_FIXTURE_IDS.child),
    };
    input.assetsById = {
      [mismatchedAssetKey]: getAsset(input, DOCUMENT_FIXTURE_IDS.asset),
    };

    const result = expectFailure(input);
    const paths = issuePaths(result);

    expect(paths).toContain(`elementsById.${mismatchedElementKey}.id`);
    expect(paths).toContain(`assetsById.${mismatchedAssetKey}.id`);
  });

  it('rejects unknown controls and child ownership by leaf controls', () => {
    const unknownControl = createValidProjectDocumentInput();
    getElement(unknownControl, DOCUMENT_FIXTURE_IDS.child).controlType = 'foundation.unknown';

    const unknownResult = expectFailure(unknownControl);
    expect(issuePaths(unknownResult)).toContain(
      `elementsById.${DOCUMENT_FIXTURE_IDS.child}.controlType`,
    );

    const illegalContainer = createValidProjectDocumentInput();
    getElement(illegalContainer, DOCUMENT_FIXTURE_IDS.group).controlType =
      FOUNDATION_CONTROL_TYPES.rectangle;

    const containerResult = expectFailure(illegalContainer);
    expect(issuePaths(containerResult)).toContain(
      `elementsById.${DOCUMENT_FIXTURE_IDS.group}.childIds`,
    );
  });

  it('rejects duplicate board and child ordering entries', () => {
    const input = createValidProjectDocumentInput();
    input.boardIds.push(DOCUMENT_FIXTURE_IDS.board);
    getBoard(input, DOCUMENT_FIXTURE_IDS.board).childIds.push(DOCUMENT_FIXTURE_IDS.group);

    const result = expectFailure(input);
    const paths = issuePaths(result);

    expect(paths).toContain('boardIds.1');
    expect(paths).toContain(`boardsById.${DOCUMENT_FIXTURE_IDS.board}.childIds.1`);
  });

  it('rejects missing board and element child references', () => {
    const input = createValidProjectDocumentInput();
    const missingElementId = 'element_missing01';
    getBoard(input, DOCUMENT_FIXTURE_IDS.board).childIds = [missingElementId];
    getElement(input, DOCUMENT_FIXTURE_IDS.group).childIds = [missingElementId];

    const result = expectFailure(input);
    const paths = issuePaths(result);

    expect(paths).toContain(`boardsById.${DOCUMENT_FIXTURE_IDS.board}.childIds.0`);
    expect(paths).toContain(`elementsById.${DOCUMENT_FIXTURE_IDS.group}.childIds.0`);
  });

  it('rejects elements with no owner or more than one owner', () => {
    const unowned = createValidProjectDocumentInput();
    getBoard(unowned, DOCUMENT_FIXTURE_IDS.board).childIds = [];
    getElement(unowned, DOCUMENT_FIXTURE_IDS.group).childIds = [];

    const unownedResult = expectFailure(unowned);
    expect(issuePaths(unownedResult)).toContain(`elementsById.${DOCUMENT_FIXTURE_IDS.group}`);
    expect(issuePaths(unownedResult)).toContain(`elementsById.${DOCUMENT_FIXTURE_IDS.child}`);

    const multiplyOwned = createValidProjectDocumentInput();
    getBoard(multiplyOwned, DOCUMENT_FIXTURE_IDS.board).childIds.push(DOCUMENT_FIXTURE_IDS.child);

    const multiplyOwnedResult = expectFailure(multiplyOwned);
    expect(issuePaths(multiplyOwnedResult)).toContain(`elementsById.${DOCUMENT_FIXTURE_IDS.child}`);
  });

  it('rejects cycles even when every element has exactly one owner', () => {
    const input = createValidProjectDocumentInput();
    getBoard(input, DOCUMENT_FIXTURE_IDS.board).childIds = [];
    getElement(input, DOCUMENT_FIXTURE_IDS.child).childIds = [DOCUMENT_FIXTURE_IDS.group];

    const result = expectFailure(input);

    expect(result.issues.some((issue) => issue.message.includes('contains a cycle'))).toBe(true);
  });

  it('rejects missing asset and board-link targets', () => {
    const input = createValidProjectDocumentInput();
    input.assetsById = {};
    getElement(input, DOCUMENT_FIXTURE_IDS.child).link = {
      kind: 'board',
      boardId: 'board_missing01',
    };

    const result = expectFailure(input);
    const paths = issuePaths(result);

    expect(paths).toContain(`elementsById.${DOCUMENT_FIXTURE_IDS.child}.assetIds.0`);
    expect(paths).toContain(`elementsById.${DOCUMENT_FIXTURE_IDS.child}.link.boardId`);
  });

  it('permits only HTTP(S) external links', () => {
    const input = createValidProjectDocumentInput();
    getElement(input, DOCUMENT_FIXTURE_IDS.child).link = {
      kind: 'external',
      url: 'file:///private/project.txt',
    };

    const result = expectFailure(input);

    expect(issuePaths(result)).toContain(`elementsById.${DOCUMENT_FIXTURE_IDS.child}.link.url`);
  });

  it('accepts a valid HTTPS external link', () => {
    const input = createValidProjectDocumentInput();
    getElement(input, DOCUMENT_FIXTURE_IDS.child).link = {
      kind: 'external',
      url: 'HTTPS://example.com/wireframe?mode=review',
    };

    expect(parseProjectDocument(input)).toMatchObject({ ok: true });
  });

  it('caps validation feedback instead of returning an error storm', () => {
    const input = createValidProjectDocumentInput();
    input.boardIds = Array.from({ length: 75 }, (_, index) => `invalid-${String(index)}`);

    const result = expectFailure(input);

    expect(result.issues).toHaveLength(MAX_DOCUMENT_VALIDATION_ISSUES);
    expect(result.omittedIssueCount).toBeGreaterThan(0);
  });
});
