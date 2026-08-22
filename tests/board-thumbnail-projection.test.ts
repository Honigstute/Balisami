// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createCustomIconReference,
  CONTROL_TYPES,
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  getControlSpec,
  parseProjectDocument,
} from '../src/domain';
import {
  BOARD_THUMBNAIL_POLICY,
  createBoardThumbnailProjection,
} from '../src/renderer/projects/board-thumbnail-projection';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

describe('board thumbnail projection', () => {
  it('uses canonical nested world geometry and registry-backed scene paths', () => {
    const parsed = parseProjectDocument(createValidProjectDocumentInput());
    if (!parsed.ok) {
      throw new Error('Thumbnail projection fixture is invalid.');
    }
    const projection = createBoardThumbnailProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board);
    if (projection === undefined) {
      throw new Error('Expected an active board projection.');
    }

    expect(projection.items.map((item) => item.id)).toEqual([DOCUMENT_FIXTURE_IDS.child]);
    expect(projection.items[0]?.bounds).toEqual({ x: -4, y: 36.5, width: 120, height: 48 });
    expect(projection.items[0]?.outlinePath).not.toBe('');
    expect(projection.viewBox.width).toBeGreaterThan(120);
    expect(projection.omittedItemCount).toBe(0);
  });

  it('keeps empty boards at a stable 4:3 frame and excludes inactive trash targets', () => {
    const input = createValidProjectDocumentInput();
    input.boardIds = [];
    input.trashedBoardIds = [DOCUMENT_FIXTURE_IDS.board];
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) {
      throw new Error('Trashed thumbnail fixture is invalid.');
    }
    expect(
      createBoardThumbnailProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board),
    ).toBeUndefined();

    input.boardIds = [DOCUMENT_FIXTURE_IDS.board];
    input.trashedBoardIds = [];
    input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds = [];
    input.elementsById = {};
    input.assetsById = {};
    const empty = parseProjectDocument(input);
    if (!empty.ok) {
      throw new Error('Empty thumbnail fixture is invalid.');
    }
    expect(createBoardThumbnailProjection(empty.value, DOCUMENT_FIXTURE_IDS.board)).toMatchObject({
      items: [],
      viewBox: { x: 0, y: 0, width: 4, height: 3 },
    });
  });

  it('carries the registry-backed icon projection into navigator thumbnails', () => {
    const input = createValidProjectDocumentInput();
    const button = getControlSpec(CONTROL_TYPES.button);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (button === undefined || child === undefined) {
      throw new Error('Thumbnail icon fixture is incomplete.');
    }
    child.controlType = button.type;
    child.controlVersion = button.fileVersion;
    child.properties = { iconId: 'arrow-right', text: 'Continue' };
    child.assetIds = [];
    input.assetsById = {};
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) {
      throw new Error('Thumbnail icon fixture is invalid.');
    }

    expect(
      createBoardThumbnailProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board)?.items[0]?.icon,
    ).toMatchObject({ definition: { id: 'arrow-right' }, kind: 'catalog' });
  });

  it('carries a project-image icon reference into the shared thumbnail projection', () => {
    const input = createValidProjectDocumentInput();
    const button = getControlSpec(CONTROL_TYPES.button);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (button === undefined || child === undefined) {
      throw new Error('Custom thumbnail icon fixture is incomplete.');
    }
    child.controlType = button.type;
    child.controlVersion = button.fileVersion;
    child.properties = {
      iconId: createCustomIconReference(DOCUMENT_FIXTURE_IDS.asset),
      text: 'Continue',
    };
    child.assetIds = [DOCUMENT_FIXTURE_IDS.asset];
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) throw new Error('Custom thumbnail icon fixture is invalid.');

    expect(
      createBoardThumbnailProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board)?.items[0]?.icon,
    ).toMatchObject({ assetId: DOCUMENT_FIXTURE_IDS.asset, kind: 'asset' });
  });

  it('bounds SVG complexity while retaining the topmost canonical controls', () => {
    const input = createValidProjectDocumentInput();
    const definition = getControlSpec(FOUNDATION_CONTROL_TYPES.rectangle);
    if (definition === undefined) {
      throw new Error('Rectangle definition is missing.');
    }
    input.elementsById = {};
    input.assetsById = {};
    const ids = Array.from(
      { length: BOARD_THUMBNAIL_POLICY.maximumRenderedElements + 5 },
      (_, index) => ElementIdSchema.parse(`element_thumb${String(index).padStart(6, '0')}`),
    );
    input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds = ids;
    ids.forEach((id, index) => {
      input.elementsById[id] = {
        id,
        controlType: definition.type,
        controlVersion: definition.fileVersion,
        frame: { x: index * 2, y: index, width: 20, height: 10 },
        locked: false,
        properties: {},
        childIds: [],
        assetIds: [],
        link: null,
      };
    });
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) {
      throw new Error('Dense thumbnail fixture is invalid.');
    }
    const projection = createBoardThumbnailProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board);
    if (projection === undefined) {
      throw new Error('Dense thumbnail projection is missing.');
    }
    expect(projection.items).toHaveLength(BOARD_THUMBNAIL_POLICY.maximumRenderedElements);
    expect(projection.omittedItemCount).toBe(5);
    expect(projection.items[0]?.id).toBe(ids[5]);
    expect(projection.items.at(-1)?.id).toBe(ids.at(-1));
  });
});
