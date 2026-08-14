// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  parseProjectDocument,
  type ProjectDocument,
} from '../src/domain';
import {
  countRenderableBoardElements,
  DocumentSceneModel,
  getRenderableBoardWorldBounds,
} from '../src/renderer/editor/document-scene-model';
import {
  createViewportSize,
  createViewportTransform,
  createWorldRect,
} from '../src/renderer/editor/viewport-transform';
import {
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  type ProjectDocumentInputFixture,
} from './fixtures/project-document';

const ROOT_ID = ElementIdSchema.parse('element_root0001');

const parseFixture = (input: ProjectDocumentInputFixture): ProjectDocument => {
  const result = parseProjectDocument(input);
  if (!result.ok) {
    throw new Error(`Document fixture failed validation: ${JSON.stringify(result.issues)}`);
  }
  return result.value;
};

const createTwoRectangleDocument = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  input.elementsById[ROOT_ID] = {
    id: ROOT_ID,
    controlType: FOUNDATION_CONTROL_TYPES.rectangle,
    frame: { x: 200, y: 100, width: 80, height: 60 },
    locked: false,
    properties: {},
    childIds: [],
    assetIds: [],
    link: null,
  };
  input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds = [ROOT_ID, DOCUMENT_FIXTURE_IDS.group];
  return parseFixture(input);
};

describe('document scene model', () => {
  it('derives nested world bounds and restores canonical child stacking after spatial lookup', () => {
    const document = createTwoRectangleDocument();
    const model = new DocumentSceneModel();

    expect(model.reconcile(document, DOCUMENT_FIXTURE_IDS.board)).toEqual({
      changed: true,
      removedItemCount: 0,
      revision: 1,
      updatedItemCount: 2,
    });
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.child)?.bounds).toEqual(
      createWorldRect(-4, 36.5, 120, 48),
    );
    expect(
      model
        .queryVisible(
          createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
          createViewportSize(800, 600),
        )
        .map((item) => item.id),
    ).toEqual([ROOT_ID, DOCUMENT_FIXTURE_IDS.child]);
    expect(countRenderableBoardElements(document, DOCUMENT_FIXTURE_IDS.board)).toBe(2);
    expect(getRenderableBoardWorldBounds(document, DOCUMENT_FIXTURE_IDS.board)).toEqual(
      createWorldRect(-4, 36.5, 284, 123.5),
    );
    expect(getRenderableBoardWorldBounds(document, undefined)).toBeUndefined();
  });

  it('reuses unchanged item geometry and updates only the changed rectangle revision', () => {
    const model = new DocumentSceneModel();
    const initial = parseFixture(createValidProjectDocumentInput());
    model.reconcile(initial, DOCUMENT_FIXTURE_IDS.board);
    const initialItem = model.getItem(DOCUMENT_FIXTURE_IDS.child);

    expect(model.reconcile(initial, DOCUMENT_FIXTURE_IDS.board)).toEqual({
      changed: false,
      removedItemCount: 0,
      revision: 1,
      updatedItemCount: 0,
    });
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.child)).toBe(initialItem);

    const propertyOnlyInput = createValidProjectDocumentInput();
    propertyOnlyInput.elementsById[DOCUMENT_FIXTURE_IDS.child]!.properties = { state: 'changed' };
    const propertyOnly = parseFixture(propertyOnlyInput);
    expect(model.reconcile(propertyOnly, DOCUMENT_FIXTURE_IDS.board)).toMatchObject({
      changed: false,
      updatedItemCount: 0,
    });
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.child)).toBe(initialItem);

    const movedInput = createValidProjectDocumentInput();
    movedInput.elementsById[DOCUMENT_FIXTURE_IDS.child]!.frame.x = 30;
    const moved = parseFixture(movedInput);
    expect(model.reconcile(moved, DOCUMENT_FIXTURE_IDS.board)).toMatchObject({
      changed: true,
      removedItemCount: 0,
      revision: 2,
      updatedItemCount: 1,
    });
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.child)).not.toBe(initialItem);
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.child)?.bounds.x).toBe(10);
  });

  it('updates stacking without regenerating geometry and removes stale items incrementally', () => {
    const model = new DocumentSceneModel();
    const initial = createTwoRectangleDocument();
    model.reconcile(initial, DOCUMENT_FIXTURE_IDS.board);
    const rootItem = model.getItem(ROOT_ID);
    const childItem = model.getItem(DOCUMENT_FIXTURE_IDS.child);

    const reorderedInput = createValidProjectDocumentInput();
    reorderedInput.elementsById[ROOT_ID] = {
      id: ROOT_ID,
      controlType: FOUNDATION_CONTROL_TYPES.rectangle,
      frame: { x: 200, y: 100, width: 80, height: 60 },
      locked: false,
      properties: {},
      childIds: [],
      assetIds: [],
      link: null,
    };
    reorderedInput.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds = [
      DOCUMENT_FIXTURE_IDS.group,
      ROOT_ID,
    ];
    const reordered = parseFixture(reorderedInput);
    expect(model.reconcile(reordered, DOCUMENT_FIXTURE_IDS.board)).toMatchObject({
      changed: true,
      removedItemCount: 0,
      updatedItemCount: 0,
    });
    expect(model.getItem(ROOT_ID)).toBe(rootItem);
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.child)).toBe(childItem);
    expect(
      model
        .queryVisible(
          createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
          createViewportSize(800, 600),
        )
        .map((item) => item.id),
    ).toEqual([DOCUMENT_FIXTURE_IDS.child, ROOT_ID]);

    const removed = parseFixture(createValidProjectDocumentInput());
    expect(model.reconcile(removed, DOCUMENT_FIXTURE_IDS.board)).toMatchObject({
      changed: true,
      removedItemCount: 1,
      updatedItemCount: 0,
    });
    expect(model.getItem(ROOT_ID)).toBeUndefined();
  });
});
