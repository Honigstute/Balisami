import {
  AssetIdSchema,
  BoardIdSchema,
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  ProjectIdSchema,
  type AssetReference,
  type Board,
  type ElementNode,
  type ProjectDocument,
} from '../../src/domain';

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
  'assetsById' | 'boardsById' | 'elementsById'
> & {
  assetsById: Record<string, MutableInput<AssetReference>>;
  boardsById: Record<string, MutableInput<Board>>;
  elementsById: Record<string, MutableInput<ElementNode>>;
};

export const DOCUMENT_FIXTURE_IDS = {
  asset: AssetIdSchema.parse('asset_image0001'),
  board: BoardIdSchema.parse('board_primary01'),
  child: ElementIdSchema.parse('element_child001'),
  group: ElementIdSchema.parse('element_group001'),
  project: ProjectIdSchema.parse('project_primary01'),
} as const;

export const createValidProjectDocumentInput = (): ProjectDocumentInputFixture => ({
  schemaVersion: 1,
  id: DOCUMENT_FIXTURE_IDS.project,
  name: 'Foundation fixture',
  boardIds: [DOCUMENT_FIXTURE_IDS.board],
  boardsById: {
    [DOCUMENT_FIXTURE_IDS.board]: {
      id: DOCUMENT_FIXTURE_IDS.board,
      name: 'Main wireframe',
      note: { text: 'Fixture board note' },
      childIds: [DOCUMENT_FIXTURE_IDS.group],
    },
  },
  elementsById: {
    [DOCUMENT_FIXTURE_IDS.group]: {
      id: DOCUMENT_FIXTURE_IDS.group,
      controlType: FOUNDATION_CONTROL_TYPES.group,
      frame: { x: -20, y: 12.5, width: 320, height: 180 },
      locked: false,
      properties: { label: 'Container', nested: { state: 'normal' } },
      childIds: [DOCUMENT_FIXTURE_IDS.child],
      assetIds: [],
      link: null,
    },
    [DOCUMENT_FIXTURE_IDS.child]: {
      id: DOCUMENT_FIXTURE_IDS.child,
      controlType: FOUNDATION_CONTROL_TYPES.rectangle,
      frame: { x: 16, y: 24, width: 120, height: 48 },
      locked: false,
      properties: { opacity: 0.75, tags: ['example', true, null] },
      childIds: [],
      assetIds: [DOCUMENT_FIXTURE_IDS.asset],
      link: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
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
