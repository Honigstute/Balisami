import {
  AssetIdSchema,
  BoardIdSchema,
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  PROJECT_DOCUMENT_SCHEMA_VERSION,
  ProjectIdSchema,
  getControlSpec,
  type AssetReference,
  type Board,
  type ComponentDefinition,
  type ElementNode,
  type ElementProperties,
  type ProjectDocument,
} from '../../src/domain';

export const getFixtureControlVersion = (type: string): number => {
  const definition = getControlSpec(type);
  if (definition === undefined) {
    throw new Error(`Fixture control '${type}' is not registered.`);
  }
  return definition.fileVersion;
};

type MutableInput<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends null
        ? null
        : T extends readonly (infer Item)[]
          ? MutableInput<Item>[]
          : T extends object
            ? { -readonly [Key in keyof T]: MutableInput<T[Key]> }
            : T;

export type ProjectDocumentInputFixture = Omit<
  MutableInput<ProjectDocument>,
  'assetsById' | 'boardsById' | 'componentsById' | 'elementsById'
> & {
  assetsById: Record<string, MutableInput<AssetReference>>;
  boardsById: Record<string, MutableInput<Board>>;
  componentsById: Record<string, MutableInput<ComponentDefinition>>;
  elementsById: Record<string, MutableInput<ElementNode>>;
};

export const getFixtureControlProperties = (type: string): MutableInput<ElementProperties> => {
  const definition = getControlSpec(type);
  if (definition === undefined) throw new Error(`Fixture control '${type}' is not registered.`);
  return structuredClone(definition.defaultProperties) as MutableInput<ElementProperties>;
};

export const createEmptyElementRowDataInput = () => ({
  version: 1 as const,
  bindings: [],
});

export const DOCUMENT_FIXTURE_IDS = {
  asset: AssetIdSchema.parse('asset_image0001'),
  board: BoardIdSchema.parse('board_primary01'),
  child: ElementIdSchema.parse('element_child001'),
  group: ElementIdSchema.parse('element_group001'),
  project: ProjectIdSchema.parse('project_primary01'),
} as const;

export const createValidProjectDocumentInput = (): ProjectDocumentInputFixture => ({
  schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
  id: DOCUMENT_FIXTURE_IDS.project,
  name: 'Foundation fixture',
  boardIds: [DOCUMENT_FIXTURE_IDS.board],
  componentIds: [],
  trashedBoardIds: [],
  boardsById: {
    [DOCUMENT_FIXTURE_IDS.board]: {
      id: DOCUMENT_FIXTURE_IDS.board,
      name: 'Main wireframe',
      note: { text: 'Fixture board note' },
      childIds: [DOCUMENT_FIXTURE_IDS.group],
      alternateIds: [],
      selectedAlternateId: null,
    },
  },
  componentsById: {},
  elementsById: {
    [DOCUMENT_FIXTURE_IDS.group]: {
      id: DOCUMENT_FIXTURE_IDS.group,
      controlType: FOUNDATION_CONTROL_TYPES.group,
      controlVersion: getFixtureControlVersion(FOUNDATION_CONTROL_TYPES.group),
      frame: { x: -20, y: 12.5, width: 320, height: 180 },
      locked: false,
      properties: { label: 'Container', nested: { state: 'normal' } },
      childIds: [DOCUMENT_FIXTURE_IDS.child],
      assetIds: [],
      link: null,
      rowData: createEmptyElementRowDataInput(),
    },
    [DOCUMENT_FIXTURE_IDS.child]: {
      id: DOCUMENT_FIXTURE_IDS.child,
      controlType: FOUNDATION_CONTROL_TYPES.rectangle,
      controlVersion: getFixtureControlVersion(FOUNDATION_CONTROL_TYPES.rectangle),
      frame: { x: 16, y: 24, width: 120, height: 48 },
      locked: false,
      properties: {
        ...getFixtureControlProperties(FOUNDATION_CONTROL_TYPES.rectangle),
        opacity: 0.75,
      },
      childIds: [],
      assetIds: [DOCUMENT_FIXTURE_IDS.asset],
      link: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      rowData: createEmptyElementRowDataInput(),
    },
  },
  assetsById: {
    [DOCUMENT_FIXTURE_IDS.asset]: {
      id: DOCUMENT_FIXTURE_IDS.asset,
      sha256: 'a'.repeat(64),
      mediaType: 'image/png',
      byteLength: 1_024,
      originalName: 'placeholder.png',
    },
  },
});
