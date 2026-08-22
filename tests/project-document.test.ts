import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  ComponentIdSchema,
  CONTROL_TYPES,
  ElementIdSchema,
  MAX_DOCUMENT_VALIDATION_ISSUES,
  FOUNDATION_CONTROL_TYPES,
  createCustomIconReference,
  getControlSpec,
  parseProjectDocument,
  type AssetId,
  type BoardId,
  type ComponentId,
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

const getComponent = (input: ProjectDocumentInputFixture, id: ComponentId) => {
  const component = input.componentsById[id];
  if (component === undefined) {
    throw new Error(`Fixture component '${id}' is missing.`);
  }
  return component;
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

  it('partitions every board between active order and durable trash', () => {
    const trashed = createValidProjectDocumentInput();
    trashed.boardIds = [];
    trashed.trashedBoardIds = [DOCUMENT_FIXTURE_IDS.board];
    expect(parseProjectDocument(trashed)).toMatchObject({ ok: true });

    const competingOwners = createValidProjectDocumentInput();
    competingOwners.trashedBoardIds = [DOCUMENT_FIXTURE_IDS.board];
    expect(issuePaths(expectFailure(competingOwners))).toContain('trashedBoardIds.0');

    const unowned = createValidProjectDocumentInput();
    unowned.boardIds = [];
    expect(issuePaths(expectFailure(unowned))).toContain(
      `boardsById.${DOCUMENT_FIXTURE_IDS.board}`,
    );

    const missing = createValidProjectDocumentInput();
    missing.trashedBoardIds = ['board_missing01'];
    expect(issuePaths(expectFailure(missing))).toContain('trashedBoardIds.0');
  });

  it('partitions hidden alternates under exactly one canonical board', () => {
    const alternateId = BoardIdSchema.parse('board_alternate01');
    const valid = createValidProjectDocumentInput();
    const canonical = getBoard(valid, DOCUMENT_FIXTURE_IDS.board);
    canonical.alternateIds = [alternateId];
    canonical.selectedAlternateId = alternateId;
    valid.boardsById[alternateId] = {
      id: alternateId,
      name: 'Alternate A',
      note: { text: 'Try the compact flow.' },
      childIds: [],
      alternateIds: [],
      selectedAlternateId: null,
    };
    expect(parseProjectDocument(valid)).toMatchObject({ ok: true });

    const selectedOutsideFamily = structuredClone(valid);
    getBoard(selectedOutsideFamily, DOCUMENT_FIXTURE_IDS.board).selectedAlternateId =
      'board_missing01';
    expect(issuePaths(expectFailure(selectedOutsideFamily))).toContain(
      `boardsById.${DOCUMENT_FIXTURE_IDS.board}.selectedAlternateId`,
    );

    const topLevelAlternate = structuredClone(valid);
    topLevelAlternate.boardIds.push(alternateId);
    expect(issuePaths(expectFailure(topLevelAlternate))).toContain(
      `boardsById.${DOCUMENT_FIXTURE_IDS.board}.alternateIds.0`,
    );

    const nestedAlternate = structuredClone(valid);
    getBoard(nestedAlternate, alternateId).alternateIds = ['board_nestedalt01'];
    expect(issuePaths(expectFailure(nestedAlternate))).toContain(
      `boardsById.${alternateId}.alternateIds`,
    );

    const sharedAlternate = structuredClone(valid);
    const secondCanonicalId = BoardIdSchema.parse('board_altowner002');
    sharedAlternate.boardIds.push(secondCanonicalId);
    sharedAlternate.boardsById[secondCanonicalId] = {
      id: secondCanonicalId,
      name: 'Second canonical',
      note: { text: '' },
      childIds: [],
      alternateIds: [alternateId],
      selectedAlternateId: null,
    };
    expect(issuePaths(expectFailure(sharedAlternate))).toContain(
      `boardsById.${secondCanonicalId}.alternateIds.0`,
    );

    const linkedToAlternate = structuredClone(valid);
    getElement(linkedToAlternate, DOCUMENT_FIXTURE_IDS.child).link = {
      kind: 'board',
      boardId: alternateId,
    };
    expect(issuePaths(expectFailure(linkedToAlternate))).toContain(
      `elementsById.${DOCUMENT_FIXTURE_IDS.child}.link.boardId`,
    );
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

  it('owns component definition trees through an exact ordered component library', () => {
    const componentId = ComponentIdSchema.parse('component_primary01');
    const valid = createValidProjectDocumentInput();
    valid.componentIds = [componentId];
    valid.componentsById[componentId] = {
      id: componentId,
      name: 'Primary action',
      rootElementId: DOCUMENT_FIXTURE_IDS.group,
    };
    getBoard(valid, DOCUMENT_FIXTURE_IDS.board).childIds = [];

    expect(parseProjectDocument(valid)).toMatchObject({ ok: true });

    const missingRecord = structuredClone(valid);
    missingRecord.componentsById = {};
    expect(issuePaths(expectFailure(missingRecord))).toContain('componentIds.0');

    const unorderedRecord = structuredClone(valid);
    unorderedRecord.componentIds = [];
    expect(issuePaths(expectFailure(unorderedRecord))).toContain(`componentsById.${componentId}`);

    const mismatchedRecord = structuredClone(valid);
    getComponent(mismatchedRecord, componentId).id = 'component_secondary1';
    expect(issuePaths(expectFailure(mismatchedRecord))).toContain(
      `componentsById.${componentId}.id`,
    );

    const missingRoot = structuredClone(valid);
    getComponent(missingRoot, componentId).rootElementId = 'element_missing01';
    expect(issuePaths(expectFailure(missingRoot))).toContain(
      `componentsById.${componentId}.rootElementId`,
    );

    const leafRoot = structuredClone(valid);
    getComponent(leafRoot, componentId).rootElementId = DOCUMENT_FIXTURE_IDS.child;
    getElement(leafRoot, DOCUMENT_FIXTURE_IDS.group).childIds = [];
    expect(issuePaths(expectFailure(leafRoot))).toContain(
      `componentsById.${componentId}.rootElementId`,
    );

    const multiplyOwnedRoot = structuredClone(valid);
    getBoard(multiplyOwnedRoot, DOCUMENT_FIXTURE_IDS.board).childIds = [DOCUMENT_FIXTURE_IDS.group];
    expect(issuePaths(expectFailure(multiplyOwnedRoot))).toContain(
      `elementsById.${DOCUMENT_FIXTURE_IDS.group}`,
    );
  });

  it('validates component-instance references and property-only overrides', () => {
    const componentId = ComponentIdSchema.parse('component_override01');
    const instanceId = ElementIdSchema.parse('element_instance01');
    const input = createValidProjectDocumentInput();
    const instanceSpec = getControlSpec(CONTROL_TYPES.componentInstance);
    if (instanceSpec === undefined) {
      throw new Error('Component instance definition is missing.');
    }
    const buttonSpec = getControlSpec(CONTROL_TYPES.button);
    if (buttonSpec === undefined) {
      throw new Error('Button definition is missing.');
    }
    const definitionChild = getElement(input, DOCUMENT_FIXTURE_IDS.child);
    definitionChild.controlType = CONTROL_TYPES.button;
    definitionChild.controlVersion = buttonSpec.fileVersion;
    definitionChild.properties = { ...buttonSpec.defaultProperties, text: 'Definition action' };
    input.componentIds = [componentId];
    input.componentsById[componentId] = {
      id: componentId,
      name: 'Reusable card',
      rootElementId: DOCUMENT_FIXTURE_IDS.group,
    };
    getBoard(input, DOCUMENT_FIXTURE_IDS.board).childIds = [instanceId];
    input.elementsById[instanceId] = {
      id: instanceId,
      controlType: CONTROL_TYPES.componentInstance,
      controlVersion: instanceSpec.fileVersion,
      frame: { x: 40, y: 50, width: 320, height: 180 },
      locked: false,
      properties: {
        componentId,
        overrides: {
          [DOCUMENT_FIXTURE_IDS.child]: { text: 'Instance action' },
        },
      },
      childIds: [],
      assetIds: [],
      link: null,
    };

    expect(parseProjectDocument(input)).toMatchObject({ ok: true });

    const missingDefinition = structuredClone(input);
    getElement(missingDefinition, instanceId).properties.componentId = 'component_missing01';
    expect(issuePaths(expectFailure(missingDefinition))).toContain(
      `elementsById.${instanceId}.properties.componentId`,
    );

    const outsideTarget = structuredClone(input);
    getElement(outsideTarget, instanceId).properties.overrides = {
      element_outside01: { text: 'Outside' },
    };
    expect(issuePaths(expectFailure(outsideTarget))).toContain(
      `elementsById.${instanceId}.properties.overrides.element_outside01`,
    );

    const invalidMergedProperties = structuredClone(input);
    getElement(invalidMergedProperties, instanceId).properties.overrides = {
      [DOCUMENT_FIXTURE_IDS.child]: { text: 42 },
    };
    expect(
      issuePaths(expectFailure(invalidMergedProperties)).some((path) =>
        path.startsWith(
          `elementsById.${instanceId}.properties.overrides.${DOCUMENT_FIXTURE_IDS.child}`,
        ),
      ),
    ).toBe(true);

    const persistedChild = structuredClone(input);
    getElement(persistedChild, instanceId).childIds = [DOCUMENT_FIXTURE_IDS.child];
    expect(issuePaths(expectFailure(persistedChild))).toContain(
      `elementsById.${instanceId}.childIds`,
    );
  });

  it('rejects nested component cycles at the document boundary', () => {
    const componentId = ComponentIdSchema.parse('component_cycle0001');
    const nestedInstanceId = ElementIdSchema.parse('element_nestedinst1');
    const input = createValidProjectDocumentInput();
    const instanceSpec = getControlSpec(CONTROL_TYPES.componentInstance);
    if (instanceSpec === undefined) {
      throw new Error('Component instance definition is missing.');
    }
    input.componentIds = [componentId];
    input.componentsById[componentId] = {
      id: componentId,
      name: 'Recursive component',
      rootElementId: DOCUMENT_FIXTURE_IDS.group,
    };
    getBoard(input, DOCUMENT_FIXTURE_IDS.board).childIds = [];
    getElement(input, DOCUMENT_FIXTURE_IDS.group).childIds = [nestedInstanceId];
    delete input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    input.assetsById = {};
    input.elementsById[nestedInstanceId] = {
      id: nestedInstanceId,
      controlType: CONTROL_TYPES.componentInstance,
      controlVersion: instanceSpec.fileVersion,
      frame: { x: 10, y: 10, width: 120, height: 80 },
      locked: false,
      properties: { componentId, overrides: {} },
      childIds: [],
      assetIds: [],
      link: null,
    };

    const result = expectFailure(input);

    expect(issuePaths(result)).toContain(`elementsById.${nestedInstanceId}.properties.componentId`);
    expect(result.issues.some((issue) => issue.message.includes('Component hierarchy'))).toBe(true);
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

  it('rejects unknown controls, stale control versions, and child ownership by leaf controls', () => {
    const unknownControl = createValidProjectDocumentInput();
    getElement(unknownControl, DOCUMENT_FIXTURE_IDS.child).controlType = 'foundation.unknown';

    const unknownResult = expectFailure(unknownControl);
    expect(issuePaths(unknownResult)).toContain(
      `elementsById.${DOCUMENT_FIXTURE_IDS.child}.controlType`,
    );

    const staleVersion = createValidProjectDocumentInput();
    getElement(staleVersion, DOCUMENT_FIXTURE_IDS.child).controlVersion += 1;
    expect(issuePaths(expectFailure(staleVersion))).toContain(
      `elementsById.${DOCUMENT_FIXTURE_IDS.child}.controlVersion`,
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

  it('requires a custom icon image to remain in the element asset reachability list', () => {
    const input = createValidProjectDocumentInput();
    const button = getControlSpec(CONTROL_TYPES.button);
    const child = getElement(input, DOCUMENT_FIXTURE_IDS.child);
    if (button === undefined) throw new Error('Button definition is missing.');
    child.controlType = button.type;
    child.controlVersion = button.fileVersion;
    child.properties = {
      iconId: createCustomIconReference(DOCUMENT_FIXTURE_IDS.asset),
      text: 'Brand',
    };
    child.assetIds = [];

    const result = expectFailure(input);
    expect(issuePaths(result)).toContain(`elementsById.${DOCUMENT_FIXTURE_IDS.child}.assetIds`);
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
