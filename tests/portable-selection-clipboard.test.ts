// @vitest-environment node

import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  AssetIdSchema,
  BoardIdSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  ProjectIdSchema,
  createCustomIconReference,
  createDocumentHistory,
  createEmptyProjectDocument,
  createElementRowId,
  dispatchHistoryTransaction,
  parseProjectDocument,
  type AssetId,
  type ElementId,
  type ProjectDocument,
} from '../src/domain';
import { createControlInsertionCommand } from '../src/renderer/controls/control-insertion';
import {
  PortableSelectionClipboardPayloadSchema,
  createPortableSelectionClipboardPayload,
  parsePortableSelectionClipboardPayload,
  planPortableSelectionPaste,
  serializePortableSelectionClipboardPayload,
} from '../src/renderer/editor/portable-selection-clipboard';
import { captureSelectionClipboardPayload } from '../src/renderer/editor/selection-clipboard';
import { createWorldPoint } from '../src/renderer/editor/viewport-transform';
import {
  DOCUMENT_FIXTURE_IDS,
  createValidProjectDocumentInput,
  getFixtureControlProperties,
  getFixtureControlVersion,
} from './fixtures/project-document';

const TARGET_PROJECT_ID = ProjectIdSchema.parse('project_portable_target');
const TARGET_BOARD_ID = BoardIdSchema.parse('board_portable_target');
const TARGET_ELEMENT_ID = ElementIdSchema.parse('element_portable_target');
const TARGET_ASSET_ID = AssetIdSchema.parse('asset_portable_target');
const REUSED_ASSET_ID = AssetIdSchema.parse('asset_portable_reused');
const ROW_SOURCE_ID = ElementIdSchema.parse('element_portable_rows_source');
const ROW_TARGET_ID = ElementIdSchema.parse('element_portable_rows_target');
const SOURCE_BYTES = Uint8Array.from({ length: 1_024 }, (_, index) => index % 251);
const SOURCE_DIGEST = createHash('sha256').update(SOURCE_BYTES).digest('hex');

const createTargetDocument = (): ProjectDocument => {
  const created = createEmptyProjectDocument({
    boardId: TARGET_BOARD_ID,
    projectId: TARGET_PROJECT_ID,
  });
  if (!created.ok) throw new Error('Portable clipboard target fixture is invalid.');
  return created.value;
};

const createButtonSource = (link: 'board' | 'external' = 'board') => {
  const input = createValidProjectDocumentInput();
  const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
  const asset = input.assetsById[DOCUMENT_FIXTURE_IDS.asset];
  if (child === undefined || asset === undefined) {
    throw new Error('Portable clipboard source fixture is incomplete.');
  }
  asset.sha256 = SOURCE_DIGEST;
  child.controlType = CONTROL_TYPES.button;
  child.controlVersion = getFixtureControlVersion(CONTROL_TYPES.button);
  child.properties = {
    ...getFixtureControlProperties(CONTROL_TYPES.button),
    iconId: createCustomIconReference(DOCUMENT_FIXTURE_IDS.asset),
    text: 'Portable action',
  };
  child.link =
    link === 'board'
      ? { boardId: DOCUMENT_FIXTURE_IDS.board, kind: 'board' }
      : { kind: 'external', url: 'https://example.com/portable' };
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) throw new Error('Portable clipboard source fixture is invalid.');
  const selection = captureSelectionClipboardPayload(
    parsed.value,
    [DOCUMENT_FIXTURE_IDS.child],
    DOCUMENT_FIXTURE_IDS.child,
    [DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child],
    'copy',
  );
  if (selection === undefined) throw new Error('Portable clipboard selection was not captured.');
  const portable = createPortableSelectionClipboardPayload(parsed.value, selection, (assetId) =>
    assetId === DOCUMENT_FIXTURE_IDS.asset ? SOURCE_BYTES : undefined,
  );
  if (portable === undefined) throw new Error('Portable clipboard payload was not created.');
  return Object.freeze({ document: parsed.value, portable, selection });
};

const elementAllocator = (id: ElementId) => vi.fn(() => id);
const assetAllocator = (id: AssetId) => vi.fn(() => id);

describe('portable selection clipboard', () => {
  it('imports a nested leaf with authenticated asset identity, custom icon, and board link in one transaction', () => {
    const { portable } = createButtonSource();
    const serialized = serializePortableSelectionClipboardPayload(portable);
    expect(parsePortableSelectionClipboardPayload(serialized)).toEqual(portable);

    const target = createTargetDocument();
    const plan = planPortableSelectionPaste(
      target,
      portable,
      TARGET_BOARD_ID,
      0,
      elementAllocator(TARGET_ELEMENT_ID),
      assetAllocator(TARGET_ASSET_ID),
    );
    expect(plan?.commands.map(({ type }) => type)).toEqual([
      DOCUMENT_COMMAND_TYPES.createAsset,
      DOCUMENT_COMMAND_TYPES.createElement,
    ]);
    expect(plan?.additions[TARGET_ASSET_ID]).toEqual(SOURCE_BYTES);
    expect(plan?.cloneIds).toEqual([TARGET_ELEMENT_ID]);
    expect(plan?.primaryCloneId).toBe(TARGET_ELEMENT_ID);

    const createElement = plan?.commands.find(
      (command) => command.type === DOCUMENT_COMMAND_TYPES.createElement,
    );
    if (createElement?.type !== DOCUMENT_COMMAND_TYPES.createElement) {
      throw new Error('Portable element command is missing.');
    }
    expect(createElement.owner).toEqual({ boardId: TARGET_BOARD_ID, kind: 'board' });
    expect(createElement.element).toMatchObject({
      assetIds: [TARGET_ASSET_ID],
      frame: { x: 6, y: 46.5, width: 120, height: 48 },
      link: { boardId: TARGET_BOARD_ID, kind: 'board' },
      properties: { iconId: createCustomIconReference(TARGET_ASSET_ID) },
    });

    const applied = dispatchHistoryTransaction(
      createDocumentHistory(target),
      plan?.commands ?? [],
      {
        label: 'Paste element',
      },
    );
    expect(applied).toMatchObject({ changed: true, ok: true });
    expect(applied.history.undoEntries).toHaveLength(1);
    expect(applied.history.document.elementsById[TARGET_ELEMENT_ID]).toEqual(createElement.element);
  });

  it('reuses matching target content and preserves external links without adding an asset command', () => {
    const { portable } = createButtonSource('external');
    const targetDocument = createTargetDocument();
    const target = parseProjectDocument({
      ...targetDocument,
      assetsById: {
        ...targetDocument.assetsById,
        [REUSED_ASSET_ID]: {
          ...portable.assets[0]!.reference,
          id: REUSED_ASSET_ID,
        },
      },
    });
    if (!target.ok) throw new Error('Reusable target asset fixture is invalid.');

    const plan = planPortableSelectionPaste(
      target.value,
      portable,
      TARGET_BOARD_ID,
      2,
      elementAllocator(TARGET_ELEMENT_ID),
      assetAllocator(TARGET_ASSET_ID),
    );
    expect(plan?.commands.map(({ type }) => type)).toEqual([DOCUMENT_COMMAND_TYPES.createElement]);
    expect(plan?.additions).toEqual({});
    const command = plan?.commands[0];
    if (command?.type !== DOCUMENT_COMMAND_TYPES.createElement) {
      throw new Error('Reused portable element command is missing.');
    }
    expect(command.element.assetIds).toEqual([REUSED_ASSET_ID]);
    expect(command.element.properties.iconId).toBe(createCustomIconReference(REUSED_ASSET_ID));
    expect(command.element.link).toEqual({
      kind: 'external',
      url: 'https://example.com/portable',
    });
    expect(command.element.frame).toMatchObject({ x: 26, y: 66.5 });
  });

  it('rekeys parsed-row identity for the imported element', () => {
    const created = createEmptyProjectDocument({
      boardId: DOCUMENT_FIXTURE_IDS.board,
      projectId: DOCUMENT_FIXTURE_IDS.project,
    });
    if (!created.ok) throw new Error('Portable row source project is invalid.');
    const inserted = dispatchHistoryTransaction(createDocumentHistory(created.value), [
      createControlInsertionCommand({
        boardId: DOCUMENT_FIXTURE_IDS.board,
        center: createWorldPoint(200, 120),
        controlType: CONTROL_TYPES.buttonBar,
        document: created.value,
        elementId: ROW_SOURCE_ID,
      }),
    ]);
    if (!inserted.ok || !inserted.changed) throw new Error('Portable row source is missing.');
    const selection = captureSelectionClipboardPayload(
      inserted.history.document,
      [ROW_SOURCE_ID],
      ROW_SOURCE_ID,
      [ROW_SOURCE_ID],
      'copy',
    );
    if (selection === undefined) throw new Error('Portable row selection was not captured.');
    const portable = createPortableSelectionClipboardPayload(
      inserted.history.document,
      selection,
      () => undefined,
    );
    const plan = planPortableSelectionPaste(
      createTargetDocument(),
      portable,
      TARGET_BOARD_ID,
      0,
      elementAllocator(ROW_TARGET_ID),
      assetAllocator(TARGET_ASSET_ID),
    );
    const command = plan?.commands[0];
    if (command?.type !== DOCUMENT_COMMAND_TYPES.createElement) {
      throw new Error('Portable row element command is missing.');
    }
    expect(command.element.properties.selectedRowId).toBe(createElementRowId(ROW_TARGET_ID, 0));
    expect(command.element.rowData.bindings[0]?.id).toBe(createElementRowId(ROW_TARGET_ID, 0));
  });

  it('rejects incomplete, malformed, colliding, and same-project imports', () => {
    const { document, portable, selection } = createButtonSource();
    expect(
      createPortableSelectionClipboardPayload(document, selection, () => SOURCE_BYTES.slice(1)),
    ).toBeUndefined();
    expect(parsePortableSelectionClipboardPayload('{')).toBeUndefined();
    expect(
      PortableSelectionClipboardPayloadSchema.safeParse({ ...portable, assets: [] }).success,
    ).toBe(false);
    expect(
      planPortableSelectionPaste(
        document,
        portable,
        DOCUMENT_FIXTURE_IDS.board,
        0,
        elementAllocator(TARGET_ELEMENT_ID),
        assetAllocator(TARGET_ASSET_ID),
      ),
    ).toBeUndefined();
    const collisionDocument = createTargetDocument();
    const collisionTarget = parseProjectDocument({
      ...collisionDocument,
      assetsById: {
        ...collisionDocument.assetsById,
        [TARGET_ASSET_ID]: {
          byteLength: 1,
          id: TARGET_ASSET_ID,
          mediaType: 'image/png',
          sha256: 'f'.repeat(64),
        },
      },
    });
    if (!collisionTarget.ok) throw new Error('Portable collision fixture is invalid.');
    expect(
      planPortableSelectionPaste(
        collisionTarget.value,
        portable,
        TARGET_BOARD_ID,
        0,
        elementAllocator(TARGET_ELEMENT_ID),
        assetAllocator(TARGET_ASSET_ID),
      ),
    ).toBeUndefined();
  });
});
