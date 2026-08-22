import {
  AssetIdSchema,
  BoardIdSchema,
  ComponentIdSchema,
  ElementIdSchema,
  ProjectIdSchema,
} from '../document/ids';
import { EMPTY_ELEMENT_ROW_DATA, PROJECT_DOCUMENT_SCHEMA_VERSION } from '../document/schema';
import { parseProjectDocument, type ProjectDocument } from '../document/validation';
import { CONTROL_TYPES, FOUNDATION_CONTROL_TYPES, getControlSpec } from '../controls/control-spec';

export type M11PerformanceScenario = 'asset-heavy' | 'component-heavy';

export interface M11ProjectPerformanceFixture {
  readonly boardId: ReturnType<typeof BoardIdSchema.parse>;
  readonly document: ProjectDocument;
  readonly expectedRenderableCount: number;
  readonly scenario: M11PerformanceScenario;
}

const ASSET_BYTE_LENGTH = 1_024 * 1_024;
const ASSET_DIGESTS = Object.freeze([
  'ee78cd29d3a534713b36e6ff6fa3668c8a8f851a542d5eb2401c25ca4e057d02',
  '2fa4430272111c7854b204001461e16f2c73725b07dde2b6d1dc4f2aa8fe18da',
  '9ed3b916b5b6b1dbe61b8844c8130657b9bc4f7ff80a07c7835989c911ad430a',
  'ef53809b40b5c00c6941da77ffbc903b1c152119d6648d2935ee7da7e1c53a5d',
  '653186269c00c0561bfcc636c14a56a857f4b9e0e27a560e5745a83c99d7ecd6',
] as const);

const getControlVersion = (type: string): number => {
  const definition = getControlSpec(type);
  if (definition === undefined) {
    throw new Error(`M11 performance fixture control '${type}' is not registered.`);
  }
  return definition.fileVersion;
};

const getControlProperties = (type: string): Readonly<Record<string, unknown>> => {
  const definition = getControlSpec(type);
  if (definition === undefined) {
    throw new Error(`M11 performance fixture control '${type}' is not registered.`);
  }
  return definition.defaultProperties;
};

const parseFixture = (
  scenario: M11PerformanceScenario,
  boardId: ReturnType<typeof BoardIdSchema.parse>,
  expectedRenderableCount: number,
  input: unknown,
): M11ProjectPerformanceFixture => {
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) {
    throw new Error(`The ${scenario} M11 performance fixture is invalid.`);
  }
  return Object.freeze({ boardId, document: parsed.value, expectedRenderableCount, scenario });
};

/** Five independent 1 MiB binaries keep the archive representative and prevent ZIP deduplication. */
export const createM11AssetPerformanceBytes = (): Readonly<Record<string, Uint8Array>> =>
  Object.freeze(
    Object.fromEntries(
      ASSET_DIGESTS.map((_, index) => [
        AssetIdSchema.parse(`asset_perf_${String(index).padStart(4, '0')}`),
        new Uint8Array(ASSET_BYTE_LENGTH).fill(index + 1),
      ]),
    ),
  );

export const createM11AssetHeavyFixture = (): M11ProjectPerformanceFixture => {
  const projectId = ProjectIdSchema.parse('project_asset_performance');
  const boardId = BoardIdSchema.parse('board_asset_performance');
  const childIds: ReturnType<typeof ElementIdSchema.parse>[] = [];
  const elementsById: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const assetsById: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const assetIds = ASSET_DIGESTS.map((_, index) =>
    AssetIdSchema.parse(`asset_perf_${String(index).padStart(4, '0')}`),
  );

  ASSET_DIGESTS.forEach((sha256, index) => {
    const id = assetIds[index];
    if (id === undefined) {
      throw new Error('The M11 asset fixture identity table is incomplete.');
    }
    assetsById[id] = {
      id,
      sha256,
      mediaType: 'image/png',
      byteLength: ASSET_BYTE_LENGTH,
      originalName: `performance-${String(index + 1)}.png`,
    };
  });

  for (let index = 0; index < 1_000; index += 1) {
    const id = ElementIdSchema.parse(`element_asset_perf_${String(index).padStart(6, '0')}`);
    const assetId = assetIds[index % assetIds.length];
    if (assetId === undefined) {
      throw new Error('The M11 asset fixture has no binary identities.');
    }
    childIds.push(id);
    elementsById[id] = {
      id,
      controlType: CONTROL_TYPES.imagePlaceholder,
      controlVersion: getControlVersion(CONTROL_TYPES.imagePlaceholder),
      frame: {
        x: (index % 40) * 140,
        y: Math.floor(index / 40) * 120,
        width: 120,
        height: 100,
      },
      locked: false,
      properties: { ...getControlProperties(CONTROL_TYPES.imagePlaceholder) },
      childIds: [],
      assetIds: [assetId],
      link: null,
      rowData: EMPTY_ELEMENT_ROW_DATA,
    };
  }

  return parseFixture('asset-heavy', boardId, 1_000, {
    schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
    id: projectId,
    name: 'M11 asset performance',
    boardIds: [boardId],
    componentIds: [],
    trashedBoardIds: [],
    boardsById: {
      [boardId]: {
        id: boardId,
        name: '1,000 images / 5 MiB assets',
        note: { text: '' },
        childIds,
        alternateIds: [],
        selectedAlternateId: null,
      },
    },
    componentsById: {},
    elementsById,
    assetsById,
  });
};

export const createM11ComponentHeavyFixture = (): M11ProjectPerformanceFixture => {
  const projectId = ProjectIdSchema.parse('project_component_performance');
  const boardId = BoardIdSchema.parse('board_component_performance');
  const boardChildIds: ReturnType<typeof ElementIdSchema.parse>[] = [];
  const componentIds: ReturnType<typeof ComponentIdSchema.parse>[] = [];
  const componentsById: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const elementsById: Record<string, unknown> = Object.create(null) as Record<string, unknown>;

  for (let componentIndex = 0; componentIndex < 100; componentIndex += 1) {
    const componentId = ComponentIdSchema.parse(
      `component_perf_${String(componentIndex).padStart(4, '0')}`,
    );
    const rootId = ElementIdSchema.parse(
      `element_component_root_${String(componentIndex).padStart(4, '0')}`,
    );
    const sourceChildIds = Array.from({ length: 4 }, (_, childIndex) =>
      ElementIdSchema.parse(
        `element_component_${String(componentIndex).padStart(4, '0')}_${String(childIndex).padStart(2, '0')}`,
      ),
    );
    componentIds.push(componentId);
    componentsById[componentId] = {
      id: componentId,
      name: `Performance component ${String(componentIndex + 1)}`,
      rootElementId: rootId,
    };
    elementsById[rootId] = {
      id: rootId,
      controlType: FOUNDATION_CONTROL_TYPES.group,
      controlVersion: getControlVersion(FOUNDATION_CONTROL_TYPES.group),
      frame: { x: 0, y: 0, width: 240, height: 160 },
      locked: false,
      properties: {},
      childIds: sourceChildIds,
      assetIds: [],
      link: null,
      rowData: EMPTY_ELEMENT_ROW_DATA,
    };
    sourceChildIds.forEach((id, childIndex) => {
      elementsById[id] = {
        id,
        controlType: FOUNDATION_CONTROL_TYPES.rectangle,
        controlVersion: getControlVersion(FOUNDATION_CONTROL_TYPES.rectangle),
        frame: {
          x: (childIndex % 2) * 120,
          y: Math.floor(childIndex / 2) * 80,
          width: 112,
          height: 72,
        },
        locked: false,
        properties: { ...getControlProperties(FOUNDATION_CONTROL_TYPES.rectangle) },
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      };
    });

    for (let instanceIndex = 0; instanceIndex < 5; instanceIndex += 1) {
      const flatIndex = componentIndex * 5 + instanceIndex;
      const id = ElementIdSchema.parse(
        `element_instance_perf_${String(flatIndex).padStart(6, '0')}`,
      );
      boardChildIds.push(id);
      elementsById[id] = {
        id,
        controlType: CONTROL_TYPES.componentInstance,
        controlVersion: getControlVersion(CONTROL_TYPES.componentInstance),
        frame: {
          x: (flatIndex % 25) * 260,
          y: Math.floor(flatIndex / 25) * 180,
          width: 240,
          height: 160,
        },
        locked: false,
        properties: { componentId, overrides: {} },
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      };
    }
  }

  // Each of 500 instances renders its canonical frame plus four definition children.
  return parseFixture('component-heavy', boardId, 2_500, {
    schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
    id: projectId,
    name: 'M11 component performance',
    boardIds: [boardId],
    componentIds,
    trashedBoardIds: [],
    boardsById: {
      [boardId]: {
        id: boardId,
        name: '100 definitions / 500 instances',
        note: { text: '' },
        childIds: boardChildIds,
        alternateIds: [],
        selectedAlternateId: null,
      },
    },
    componentsById,
    elementsById,
    assetsById: {},
  });
};

export const createM11PerformanceFixtures = (): readonly M11ProjectPerformanceFixture[] =>
  Object.freeze([createM11AssetHeavyFixture(), createM11ComponentHeavyFixture()]);
