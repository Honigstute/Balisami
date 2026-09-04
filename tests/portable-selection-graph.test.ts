// @vitest-environment node

import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  AssetIdSchema,
  BoardIdSchema,
  ComponentIdSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  ProjectIdSchema,
  createCustomIconReference,
  createDocumentHistory,
  createEmptyProjectDocument,
  dispatchHistoryTransaction,
  parseProjectDocument,
  undoDocumentHistory,
  type AssetId,
  type ComponentId,
  type ElementId,
  type ProjectDocument,
} from '../src/domain';
import {
  PortableSelectionGraphPayloadSchema,
  capturePortableSelectionGraph,
  createPortableSelectionGraphPlainText,
  parsePortableSelectionGraph,
  planPortableSelectionGraphPaste,
  serializePortableSelectionGraph,
} from '../src/renderer/editor/portable-selection-graph';
import {
  DOCUMENT_FIXTURE_IDS,
  createEmptyElementRowDataInput,
  createValidProjectDocumentInput,
  getFixtureControlProperties,
  getFixtureControlVersion,
} from './fixtures/project-document';

const SOURCE_COMPONENT_ID = ComponentIdSchema.parse('component_portable_source');
const SOURCE_COMPONENT_ROOT_ID = ElementIdSchema.parse('element_portable_component_root');
const SOURCE_COMPONENT_CHILD_ID = ElementIdSchema.parse('element_portable_component_child');
const SOURCE_INSTANCE_ID = ElementIdSchema.parse('element_portable_instance');
const TARGET_PROJECT_ID = ProjectIdSchema.parse('project_graph_target');
const TARGET_BOARD_ID = BoardIdSchema.parse('board_graph_target');
const TARGET_ASSET_ID = AssetIdSchema.parse('asset_graph_target');
const TARGET_COMPONENT_ID = ComponentIdSchema.parse('component_graph_target');
const TARGET_COMPONENT_ROOT_ID = ElementIdSchema.parse('element_graph_component_root');
const TARGET_COMPONENT_CHILD_ID = ElementIdSchema.parse('element_graph_component_child');
const TARGET_GROUP_ID = ElementIdSchema.parse('element_graph_group');
const TARGET_CHILD_ID = ElementIdSchema.parse('element_graph_child');
const TARGET_INSTANCE_ID = ElementIdSchema.parse('element_graph_instance');
const BYTES = Uint8Array.from({ length: 1_024 }, (_, index) => (index * 7) % 251);
const DIGEST = createHash('sha256').update(BYTES).digest('hex');

const createSource = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const group = input.elementsById[DOCUMENT_FIXTURE_IDS.group];
  const asset = input.assetsById[DOCUMENT_FIXTURE_IDS.asset];
  if (group === undefined || asset === undefined) throw new Error('Graph fixture is incomplete.');
  asset.sha256 = DIGEST;
  group.childIds.push(SOURCE_INSTANCE_ID);
  input.componentIds = [SOURCE_COMPONENT_ID];
  input.componentsById[SOURCE_COMPONENT_ID] = {
    id: SOURCE_COMPONENT_ID,
    name: 'Portable component',
    rootElementId: SOURCE_COMPONENT_ROOT_ID,
  };
  input.elementsById[SOURCE_COMPONENT_ROOT_ID] = {
    assetIds: [],
    childIds: [SOURCE_COMPONENT_CHILD_ID],
    controlType: CONTROL_TYPES.group,
    controlVersion: getFixtureControlVersion(CONTROL_TYPES.group),
    frame: { height: 100, width: 180, x: 0, y: 0 },
    id: SOURCE_COMPONENT_ROOT_ID,
    link: null,
    locked: false,
    properties: {},
    rowData: createEmptyElementRowDataInput(),
  };
  input.elementsById[SOURCE_COMPONENT_CHILD_ID] = {
    assetIds: [DOCUMENT_FIXTURE_IDS.asset],
    childIds: [],
    controlType: CONTROL_TYPES.button,
    controlVersion: getFixtureControlVersion(CONTROL_TYPES.button),
    frame: { height: 40, width: 120, x: 20, y: 30 },
    id: SOURCE_COMPONENT_CHILD_ID,
    link: { boardId: DOCUMENT_FIXTURE_IDS.board, kind: 'board' },
    locked: false,
    properties: {
      ...getFixtureControlProperties(CONTROL_TYPES.button),
      iconId: createCustomIconReference(DOCUMENT_FIXTURE_IDS.asset),
      text: 'Definition action',
    },
    rowData: createEmptyElementRowDataInput(),
  };
  input.elementsById[SOURCE_INSTANCE_ID] = {
    assetIds: [DOCUMENT_FIXTURE_IDS.asset],
    childIds: [],
    controlType: CONTROL_TYPES.componentInstance,
    controlVersion: getFixtureControlVersion(CONTROL_TYPES.componentInstance),
    frame: { height: 100, width: 180, x: 140, y: 50 },
    id: SOURCE_INSTANCE_ID,
    link: null,
    locked: false,
    properties: {
      componentId: SOURCE_COMPONENT_ID,
      overrides: {
        [SOURCE_COMPONENT_CHILD_ID]: {
          iconId: createCustomIconReference(DOCUMENT_FIXTURE_IDS.asset),
          text: 'Overridden action',
        },
      },
    },
    rowData: createEmptyElementRowDataInput(),
  };
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) throw new Error('Graph fixture is invalid.');
  return parsed.value;
};

const createTarget = (): ProjectDocument => {
  const created = createEmptyProjectDocument({
    boardId: TARGET_BOARD_ID,
    projectId: TARGET_PROJECT_ID,
  });
  if (!created.ok) throw new Error('Graph target is invalid.');
  return created.value;
};

const elementIds = [
  TARGET_COMPONENT_ROOT_ID,
  TARGET_COMPONENT_CHILD_ID,
  TARGET_GROUP_ID,
  TARGET_CHILD_ID,
  TARGET_INSTANCE_ID,
] as const;
const allocateElement = vi.fn((sourceId: ElementId, index: number) => {
  void sourceId;
  return elementIds[index];
});
const allocateAsset = vi.fn((sourceId: AssetId) => {
  void sourceId;
  return TARGET_ASSET_ID;
});
const allocateComponent = vi.fn((sourceId: ComponentId) => {
  void sourceId;
  return TARGET_COMPONENT_ID;
});

describe('portable selection graph', () => {
  it('captures and atomically imports a complete group plus its component and asset graph', () => {
    const source = createSource();
    const payload = capturePortableSelectionGraph(
      source,
      [DOCUMENT_FIXTURE_IDS.group],
      DOCUMENT_FIXTURE_IDS.group,
      'copy',
      (assetId) => (assetId === DOCUMENT_FIXTURE_IDS.asset ? BYTES : undefined),
    );
    expect(payload?.rootIds).toEqual([DOCUMENT_FIXTURE_IDS.group]);
    expect(payload?.elements.map(({ id }) => id)).toEqual([
      DOCUMENT_FIXTURE_IDS.group,
      DOCUMENT_FIXTURE_IDS.child,
      SOURCE_INSTANCE_ID,
    ]);
    expect(payload?.components[0]?.elements.map(({ id }) => id)).toEqual([
      SOURCE_COMPONENT_ROOT_ID,
      SOURCE_COMPONENT_CHILD_ID,
    ]);
    expect(createPortableSelectionGraphPlainText(payload!)).toBe('Group');
    const serialized = serializePortableSelectionGraph(payload!);
    expect(parsePortableSelectionGraph(serialized)).toEqual(payload);

    const target = createTarget();
    const plan = planPortableSelectionGraphPaste(
      target,
      payload,
      TARGET_BOARD_ID,
      0,
      allocateElement,
      allocateAsset,
      allocateComponent,
    );
    expect(plan?.commands.map(({ type }) => type)).toEqual([
      DOCUMENT_COMMAND_TYPES.createAsset,
      DOCUMENT_COMMAND_TYPES.createComponent,
      DOCUMENT_COMMAND_TYPES.createElement,
      DOCUMENT_COMMAND_TYPES.createElement,
      DOCUMENT_COMMAND_TYPES.createElement,
    ]);
    expect(plan?.cloneIds).toEqual([TARGET_GROUP_ID]);
    expect(plan?.primaryCloneId).toBe(TARGET_GROUP_ID);
    expect(plan?.additions[TARGET_ASSET_ID]).toEqual(BYTES);

    const componentCommand = plan?.commands[1];
    if (componentCommand?.type !== DOCUMENT_COMMAND_TYPES.createComponent) {
      throw new Error('Imported component command is missing.');
    }
    expect(componentCommand.component).toEqual({
      id: TARGET_COMPONENT_ID,
      name: 'Portable component',
      rootElementId: TARGET_COMPONENT_ROOT_ID,
    });
    expect(componentCommand.elements[0]?.childIds).toEqual([TARGET_COMPONENT_CHILD_ID]);
    expect(componentCommand.elements[1]).toMatchObject({
      assetIds: [TARGET_ASSET_ID],
      link: { boardId: TARGET_BOARD_ID, kind: 'board' },
      properties: { iconId: createCustomIconReference(TARGET_ASSET_ID) },
    });

    const instanceCommand = plan?.commands[4];
    if (instanceCommand?.type !== DOCUMENT_COMMAND_TYPES.createElement) {
      throw new Error('Imported instance command is missing.');
    }
    expect(instanceCommand.element.properties).toEqual({
      componentId: TARGET_COMPONENT_ID,
      overrides: {
        [TARGET_COMPONENT_CHILD_ID]: {
          iconId: createCustomIconReference(TARGET_ASSET_ID),
          text: 'Overridden action',
        },
      },
    });
    expect(instanceCommand.owner).toEqual({ elementId: TARGET_GROUP_ID, kind: 'element' });

    const applied = dispatchHistoryTransaction(
      createDocumentHistory(target),
      plan?.commands ?? [],
      {
        label: 'Paste group',
      },
    );
    expect(applied).toMatchObject({ changed: true, ok: true });
    expect(applied.history.undoEntries).toHaveLength(1);
    expect(applied.history.document.elementsById[TARGET_GROUP_ID]?.childIds).toEqual([
      TARGET_CHILD_ID,
      TARGET_INSTANCE_ID,
    ]);
    const undone = undoDocumentHistory(applied.history);
    expect(undone).toMatchObject({ changed: true, ok: true });
    expect(undone.history.document).toEqual(target);
  });

  it('reuses same-project component and asset identities while cloning only the selected tree', () => {
    const source = createSource();
    const payload = capturePortableSelectionGraph(
      source,
      [DOCUMENT_FIXTURE_IDS.group],
      DOCUMENT_FIXTURE_IDS.group,
      'copy',
      () => BYTES,
    );
    const targetIds = [TARGET_GROUP_ID, TARGET_CHILD_ID, TARGET_INSTANCE_ID];
    const plan = planPortableSelectionGraphPaste(
      source,
      payload,
      DOCUMENT_FIXTURE_IDS.board,
      1,
      (_sourceId, index) => targetIds[index],
      allocateAsset,
      allocateComponent,
    );
    expect(plan?.commands.map(({ type }) => type)).toEqual([
      DOCUMENT_COMMAND_TYPES.createElement,
      DOCUMENT_COMMAND_TYPES.createElement,
      DOCUMENT_COMMAND_TYPES.createElement,
    ]);
    const instance = plan?.commands[2];
    if (instance?.type !== DOCUMENT_COMMAND_TYPES.createElement) {
      throw new Error('Same-project instance command is missing.');
    }
    expect(instance.element.properties).toEqual({
      componentId: SOURCE_COMPONENT_ID,
      overrides: {
        [SOURCE_COMPONENT_CHILD_ID]: {
          iconId: createCustomIconReference(DOCUMENT_FIXTURE_IDS.asset),
          text: 'Overridden action',
        },
      },
    });
    expect(plan?.commands[0]).toMatchObject({
      element: { frame: { x: 0, y: 32.5 } },
    });
  });

  it('rejects incomplete graphs and injected identity collisions without a partial plan', () => {
    const source = createSource();
    const payload = capturePortableSelectionGraph(
      source,
      [DOCUMENT_FIXTURE_IDS.group],
      DOCUMENT_FIXTURE_IDS.group,
      'copy',
      () => BYTES,
    );
    if (payload === undefined) throw new Error('Graph rejection fixture is missing.');
    expect(PortableSelectionGraphPayloadSchema.safeParse({ ...payload, rootIds: [] }).success).toBe(
      false,
    );
    expect(
      planPortableSelectionGraphPaste(
        createTarget(),
        { ...payload, components: [] },
        TARGET_BOARD_ID,
        0,
        allocateElement,
        allocateAsset,
        allocateComponent,
      ),
    ).toBeUndefined();
    expect(
      planPortableSelectionGraphPaste(
        createTarget(),
        payload,
        TARGET_BOARD_ID,
        0,
        () => TARGET_GROUP_ID,
        allocateAsset,
        allocateComponent,
      ),
    ).toBeUndefined();
    expect(parsePortableSelectionGraph('{')).toBeUndefined();
  });
});
