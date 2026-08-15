// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  CONTROL_TYPES,
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  getControlSpec,
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
  createWorldPoint,
  createWorldRect,
} from '../src/renderer/editor/viewport-transform';
import {
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  getFixtureControlVersion,
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

const createTwoRectangleDocument = (rootX = 200, rootY = 100): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  input.elementsById[ROOT_ID] = {
    id: ROOT_ID,
    controlType: FOUNDATION_CONTROL_TYPES.rectangle,
    controlVersion: getFixtureControlVersion(FOUNDATION_CONTROL_TYPES.rectangle),
    frame: { x: rootX, y: rootY, width: 80, height: 60 },
    locked: false,
    properties: {},
    childIds: [],
    assetIds: [],
    link: null,
  };
  input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds = [ROOT_ID, DOCUMENT_FIXTURE_IDS.group];
  return parseFixture(input);
};

const createOverlappingRectangleDocument = (topLocked = false): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  input.elementsById[ROOT_ID] = {
    id: ROOT_ID,
    controlType: FOUNDATION_CONTROL_TYPES.rectangle,
    controlVersion: getFixtureControlVersion(FOUNDATION_CONTROL_TYPES.rectangle),
    frame: { x: -4, y: 36.5, width: 120, height: 48 },
    locked: false,
    properties: {},
    childIds: [],
    assetIds: [],
    link: null,
  };
  input.elementsById[DOCUMENT_FIXTURE_IDS.child]!.locked = topLocked;
  input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds = [ROOT_ID, DOCUMENT_FIXTURE_IDS.group];
  return parseFixture(input);
};

const createArrowDocument = (routing: 'visual-1' | 'visual-2' = 'visual-1'): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const definition = getControlSpec(CONTROL_TYPES.arrow);
  if (definition === undefined) {
    throw new Error('Arrow definition is missing.');
  }
  input.elementsById[ROOT_ID] = {
    assetIds: [],
    childIds: [],
    controlType: CONTROL_TYPES.arrow,
    controlVersion: definition.fileVersion,
    frame: { height: 100, width: 100, x: 200, y: 100 },
    id: ROOT_ID,
    link: null,
    locked: false,
    properties: {
      color: 'default',
      endArrow: true,
      labelPosition: 0.5,
      opacity: 1,
      routing,
      startArrow: false,
      strokeStyle: 'solid',
      text: '',
    },
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
      updatedItemCount: 3,
    });
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.child)?.bounds).toEqual(
      createWorldRect(-4, 36.5, 120, 48),
    );
    expect(model.getItem(ROOT_ID)?.owner).toEqual({
      kind: 'board',
      boardId: DOCUMENT_FIXTURE_IDS.board,
    });
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.child)?.owner).toEqual({
      kind: 'element',
      elementId: DOCUMENT_FIXTURE_IDS.group,
    });
    expect(
      model
        .queryVisible(
          createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
          createViewportSize(800, 600),
        )
        .map((item) => item.id),
    ).toEqual([ROOT_ID, DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child]);
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.group)).toMatchObject({
      kind: 'container',
      path: '',
    });
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

  it('refreshes derived ownership when reparenting preserves exact world geometry', () => {
    const model = new DocumentSceneModel();
    const initial = parseFixture(createValidProjectDocumentInput());
    model.reconcile(initial, DOCUMENT_FIXTURE_IDS.board);
    const initialItem = model.getItem(DOCUMENT_FIXTURE_IDS.child);
    const reparentedInput = createValidProjectDocumentInput();
    reparentedInput.elementsById[DOCUMENT_FIXTURE_IDS.group]!.childIds = [];
    reparentedInput.elementsById[DOCUMENT_FIXTURE_IDS.child]!.frame = {
      x: -4,
      y: 36.5,
      width: 120,
      height: 48,
    };
    reparentedInput.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds.push(
      DOCUMENT_FIXTURE_IDS.child,
    );
    const reparented = parseFixture(reparentedInput);

    expect(model.reconcile(reparented, DOCUMENT_FIXTURE_IDS.board)).toMatchObject({
      changed: true,
      updatedItemCount: 1,
    });
    const reparentedItem = model.getItem(DOCUMENT_FIXTURE_IDS.child);
    expect(reparentedItem).not.toBe(initialItem);
    expect(reparentedItem?.bounds).toEqual(initialItem?.bounds);
    expect(reparentedItem?.path).toBe(initialItem?.path);
    expect(reparentedItem?.owner).toEqual({
      kind: 'board',
      boardId: DOCUMENT_FIXTURE_IDS.board,
    });
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
      controlVersion: getFixtureControlVersion(FOUNDATION_CONTROL_TYPES.rectangle),
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
    ).toEqual([DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child, ROOT_ID]);

    const removed = parseFixture(createValidProjectDocumentInput());
    expect(model.reconcile(removed, DOCUMENT_FIXTURE_IDS.board)).toMatchObject({
      changed: true,
      removedItemCount: 1,
      updatedItemCount: 0,
    });
    expect(model.getItem(ROOT_ID)).toBeUndefined();
  });

  it('resolves exact overlap hits by canonical visual order and clicks through locked items', () => {
    const model = new DocumentSceneModel();
    const unlocked = createOverlappingRectangleDocument();
    model.reconcile(unlocked, DOCUMENT_FIXTURE_IDS.board);
    const point = createWorldPoint(20, 50);

    expect(model.queryHitStack(point).map((item) => item.id)).toEqual([
      DOCUMENT_FIXTURE_IDS.child,
      DOCUMENT_FIXTURE_IDS.group,
      ROOT_ID,
    ]);
    expect(model.hitTestTopmost(point)?.id).toBe(DOCUMENT_FIXTURE_IDS.child);
    expect(model.hitTestTopmost(createWorldPoint(500, 500))).toBeUndefined();

    const topItem = model.getItem(DOCUMENT_FIXTURE_IDS.child);
    const locked = createOverlappingRectangleDocument(true);
    expect(model.reconcile(locked, DOCUMENT_FIXTURE_IDS.board)).toMatchObject({
      changed: true,
      updatedItemCount: 1,
    });
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.child)).not.toBe(topItem);
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.child)?.path).toBe(topItem?.path);
    expect(model.hitTestTopmost(point)?.id).toBe(DOCUMENT_FIXTURE_IDS.group);
    expect(model.hitTestTopmost(point, { includeLocked: true })?.id).toBe(
      DOCUMENT_FIXTURE_IDS.child,
    );
  });

  it('expands the spatial broad phase for definition-owned line tolerance', () => {
    const rectangle = getControlSpec(FOUNDATION_CONTROL_TYPES.rectangle);
    if (rectangle === undefined) {
      throw new Error('Rectangle definition is missing.');
    }
    const lineRectangle = {
      ...rectangle,
      scene: {
        ...rectangle.scene,
        hitShape: {
          end: { x: 1, y: 1 },
          kind: 'line' as const,
          start: { x: 0, y: 0 },
          tolerance: 10,
        },
      },
    };
    const model = new DocumentSceneModel({
      resolveControlDefinition: (type) =>
        type === FOUNDATION_CONTROL_TYPES.rectangle ? lineRectangle : getControlSpec(type),
    });
    model.reconcile(createTwoRectangleDocument(400, 300), DOCUMENT_FIXTURE_IDS.board);

    // ROOT_ID ends at (480, 360); this point is outside its frame but within tolerance.
    expect(model.hitTestTopmost(createWorldPoint(486, 366))?.id).toBe(ROOT_ID);
    expect(model.hitTestTopmost(createWorldPoint(492, 372))).toBeUndefined();
  });

  it('uses the registered Arrow tolerance outside its raw frame', () => {
    const model = new DocumentSceneModel();
    model.reconcile(createArrowDocument(), DOCUMENT_FIXTURE_IDS.board);

    expect(model.hitTestTopmost(createWorldPoint(304, 204))?.id).toBe(ROOT_ID);
    expect(model.hitTestTopmost(createWorldPoint(308, 208))).toBeUndefined();
  });

  it('rebuilds property-driven Arrow geometry without a control-type scene branch', () => {
    const model = new DocumentSceneModel();
    model.reconcile(createArrowDocument(), DOCUMENT_FIXTURE_IDS.board);
    const straightPath = model.getItem(ROOT_ID)?.path;
    model.reconcile(createArrowDocument('visual-2'), DOCUMENT_FIXTURE_IDS.board);

    expect(model.getItem(ROOT_ID)?.path).not.toBe(straightPath);
  });

  it('renders Browser as a visible child-owning container', () => {
    const input = createValidProjectDocumentInput();
    const browser = getControlSpec(CONTROL_TYPES.browser);
    if (browser === undefined) {
      throw new Error('Browser definition is missing.');
    }
    input.elementsById[DOCUMENT_FIXTURE_IDS.group]!.controlType = CONTROL_TYPES.browser;
    input.elementsById[DOCUMENT_FIXTURE_IDS.group]!.controlVersion = browser.fileVersion;
    input.elementsById[DOCUMENT_FIXTURE_IDS.group]!.properties = {
      borderMode: 'visual-1',
      color: 'default',
      scrollbar: false,
    };
    const document = parseFixture(input);
    const model = new DocumentSceneModel();
    model.reconcile(document, DOCUMENT_FIXTURE_IDS.board);

    expect(model.getItem(DOCUMENT_FIXTURE_IDS.group)).toMatchObject({
      kind: 'object',
      visualKind: 'browser',
    });
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.group)?.path).not.toBe('');
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.child)?.owner).toEqual({
      elementId: DOCUMENT_FIXTURE_IDS.group,
      kind: 'element',
    });
  });

  it('queries contained or intersecting selection regions in canonical order', () => {
    const model = new DocumentSceneModel();
    const document = createTwoRectangleDocument();
    model.reconcile(document, DOCUMENT_FIXTURE_IDS.board);

    expect(model.querySelectionRegion(createWorldRect(-10, 30, 140, 70), 'contained')).toEqual([
      DOCUMENT_FIXTURE_IDS.child,
    ]);
    expect(model.querySelectionRegion(createWorldRect(0, 40, 50, 20), 'contained')).toEqual([]);
    expect(model.querySelectionRegion(createWorldRect(0, 40, 50, 20), 'intersecting')).toEqual([
      DOCUMENT_FIXTURE_IDS.group,
      DOCUMENT_FIXTURE_IDS.child,
    ]);
    expect(model.querySelectionRegion(createWorldRect(-20, 20, 400, 200), 'contained')).toEqual([
      ROOT_ID,
      DOCUMENT_FIXTURE_IDS.child,
    ]);
    expect(model.listSelectableItemIds()).toEqual([
      ROOT_ID,
      DOCUMENT_FIXTURE_IDS.group,
      DOCUMENT_FIXTURE_IDS.child,
    ]);
  });

  it('excludes locked items from region and Select All candidates unless explicitly requested', () => {
    const model = new DocumentSceneModel();
    model.reconcile(createOverlappingRectangleDocument(true), DOCUMENT_FIXTURE_IDS.board);
    const bounds = createWorldRect(-10, 30, 140, 70);

    expect(model.querySelectionRegion(bounds, 'contained')).toEqual([ROOT_ID]);
    expect(model.listSelectableItemIds()).toEqual([ROOT_ID, DOCUMENT_FIXTURE_IDS.group]);
    expect(model.querySelectionRegion(bounds, 'contained', { includeLocked: true })).toEqual([
      ROOT_ID,
      DOCUMENT_FIXTURE_IDS.child,
    ]);
    expect(model.listSelectableItemIds({ includeLocked: true })).toEqual([
      ROOT_ID,
      DOCUMENT_FIXTURE_IDS.group,
      DOCUMENT_FIXTURE_IDS.child,
    ]);
  });

  it('derives effective lock metadata through canonical ancestors', () => {
    const input = createValidProjectDocumentInput();
    input.elementsById[DOCUMENT_FIXTURE_IDS.group]!.locked = true;
    input.elementsById[ROOT_ID] = {
      id: ROOT_ID,
      controlType: FOUNDATION_CONTROL_TYPES.rectangle,
      controlVersion: getFixtureControlVersion(FOUNDATION_CONTROL_TYPES.rectangle),
      frame: { x: -4, y: 36.5, width: 120, height: 48 },
      locked: false,
      properties: {},
      childIds: [],
      assetIds: [],
      link: null,
    };
    input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds.unshift(ROOT_ID);
    const document = parseFixture(input);
    const model = new DocumentSceneModel();
    model.reconcile(document, DOCUMENT_FIXTURE_IDS.board);
    const point = createWorldPoint(20, 50);

    expect(model.getItem(DOCUMENT_FIXTURE_IDS.group)?.locked).toBe(true);
    expect(model.getItem(DOCUMENT_FIXTURE_IDS.child)?.locked).toBe(true);
    expect(model.hitTestTopmost(point)?.id).toBe(ROOT_ID);
    expect(model.hitTestTopmost(point, { includeLocked: true })?.id).toBe(
      DOCUMENT_FIXTURE_IDS.child,
    );
    expect(model.listSelectableItemIds()).toEqual([ROOT_ID]);
  });

  it('returns nearby snap sources in canonical order while retaining locked geometry', () => {
    const model = new DocumentSceneModel();
    model.reconcile(createOverlappingRectangleDocument(true), DOCUMENT_FIXTURE_IDS.board);

    const candidates = model.querySnapItems([createWorldRect(-20, 20, 320, 200)], []);

    expect(candidates.map((item) => item.id)).toEqual([
      ROOT_ID,
      DOCUMENT_FIXTURE_IDS.group,
      DOCUMENT_FIXTURE_IDS.child,
    ]);
    expect(candidates[2]?.locked).toBe(true);
    expect(Object.isFrozen(candidates)).toBe(true);
  });

  it('excludes every affected move item before snap candidate generation', () => {
    const model = new DocumentSceneModel();
    model.reconcile(createTwoRectangleDocument(), DOCUMENT_FIXTURE_IDS.board);

    expect(
      model
        .querySnapItems(
          [createWorldRect(-20, 20, 320, 200)],
          [DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child],
        )
        .map((item) => item.id),
    ).toEqual([ROOT_ID]);
    expect(model.querySnapItems([createWorldRect(500, 500, 40, 40)], [])).toEqual([]);
  });
});
