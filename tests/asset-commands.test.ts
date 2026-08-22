// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  AssetIdSchema,
  DOCUMENT_COMMAND_TYPES,
  createDocumentHistory,
  dispatchDocumentCommand,
  dispatchHistoryTransaction,
  redoDocumentHistory,
  undoDocumentHistory,
} from '../src/domain';
import { decodeProjectFileEnvelope, encodeProjectFileEnvelope } from '../src/persistence';
import { createAssetFreeProjectDocument } from './fixtures/project-file';
import { DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const IMPORTED_ASSET_ID = AssetIdSchema.parse('asset_imported001');
const IMPORTED_ASSET = Object.freeze({
  id: IMPORTED_ASSET_ID,
  sha256: 'b'.repeat(64),
  mediaType: 'image/png' as const,
  byteLength: 24,
  originalName: 'wireframe.png',
});

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

describe('asset document commands', () => {
  it('adds metadata and attaches it as one exactly undoable history transaction', () => {
    const document = createAssetFreeProjectDocument();
    const result = dispatchHistoryTransaction(
      createDocumentHistory(document),
      [
        { type: DOCUMENT_COMMAND_TYPES.createAsset, asset: IMPORTED_ASSET },
        {
          type: DOCUMENT_COMMAND_TYPES.setElementAssets,
          elementId: DOCUMENT_FIXTURE_IDS.child,
          assetIds: [IMPORTED_ASSET_ID],
        },
      ],
      { label: 'Import image' },
    );
    if (!result.ok || !result.changed) {
      throw new Error(`Asset transaction failed: ${JSON.stringify(result)}`);
    }

    expect(result.history.document.assetsById[IMPORTED_ASSET_ID]).toEqual(IMPORTED_ASSET);
    expect(result.history.document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.assetIds).toEqual([
      IMPORTED_ASSET_ID,
    ]);
    expect(result.history.undoEntries).toHaveLength(1);
    const undone = undoDocumentHistory(result.history);
    expect(undone).toMatchObject({ changed: true, history: { document }, ok: true });
    if (!undone.ok || !undone.changed) {
      throw new Error('Asset transaction did not undo.');
    }
    expect(redoDocumentHistory(undone.history)).toMatchObject({
      changed: true,
      history: { document: result.history.document },
      ok: true,
    });
  });

  it('round-trips an imported command result with its exact content-addressed bytes', async () => {
    const document = createAssetFreeProjectDocument();
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    const asset = Object.freeze({
      id: IMPORTED_ASSET_ID,
      sha256: await sha256(bytes),
      mediaType: 'image/png' as const,
      byteLength: bytes.byteLength,
      originalName: 'round-trip.png',
    });
    const imported = dispatchHistoryTransaction(
      createDocumentHistory(document),
      [
        { type: DOCUMENT_COMMAND_TYPES.createAsset, asset },
        {
          type: DOCUMENT_COMMAND_TYPES.setElementAssets,
          elementId: DOCUMENT_FIXTURE_IDS.child,
          assetIds: [IMPORTED_ASSET_ID],
        },
      ],
      { label: 'Import image' },
    );
    if (!imported.ok || !imported.changed) {
      throw new Error('Asset round-trip setup failed.');
    }

    const encoded = encodeProjectFileEnvelope(imported.history.document, {
      [IMPORTED_ASSET_ID]: bytes,
    });
    if (!encoded.ok) {
      throw new Error(`Asset encoding failed: ${JSON.stringify(encoded.error)}`);
    }
    const decoded = decodeProjectFileEnvelope(encoded.value);
    if (!decoded.ok) {
      throw new Error(`Asset decoding failed: ${JSON.stringify(decoded.error)}`);
    }

    expect(decoded.value.document).toEqual(imported.history.document);
    expect(decoded.value.assetsById[IMPORTED_ASSET_ID]).toEqual(bytes);
  });

  it('deletes only unused assets and restores detach/delete exactly', () => {
    const document = createAssetFreeProjectDocument();
    const created = dispatchHistoryTransaction(createDocumentHistory(document), [
      { type: DOCUMENT_COMMAND_TYPES.createAsset, asset: IMPORTED_ASSET },
      {
        type: DOCUMENT_COMMAND_TYPES.setElementAssets,
        elementId: DOCUMENT_FIXTURE_IDS.child,
        assetIds: [IMPORTED_ASSET_ID],
      },
    ]);
    if (!created.ok || !created.changed) {
      throw new Error('Asset setup failed.');
    }

    const rejected = dispatchDocumentCommand(created.history.document, {
      type: DOCUMENT_COMMAND_TYPES.deleteAsset,
      assetId: IMPORTED_ASSET_ID,
    });
    expect(rejected).toMatchObject({
      document: created.history.document,
      error: { code: 'conflict' },
      ok: false,
    });

    const removed = dispatchHistoryTransaction(created.history, [
      {
        type: DOCUMENT_COMMAND_TYPES.setElementAssets,
        elementId: DOCUMENT_FIXTURE_IDS.child,
        assetIds: [],
      },
      { type: DOCUMENT_COMMAND_TYPES.deleteAsset, assetId: IMPORTED_ASSET_ID },
    ]);
    if (!removed.ok || !removed.changed) {
      throw new Error('Asset removal failed.');
    }
    expect(removed.history.document.assetsById[IMPORTED_ASSET_ID]).toBeUndefined();
    expect(undoDocumentHistory(removed.history)).toMatchObject({
      changed: true,
      history: { document: created.history.document },
      ok: true,
    });
  });

  it('rejects missing attachments, duplicate IDs, and metadata collisions without mutation', () => {
    const document = createAssetFreeProjectDocument();
    const missing = dispatchDocumentCommand(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementAssets,
      elementId: DOCUMENT_FIXTURE_IDS.child,
      assetIds: [IMPORTED_ASSET_ID],
    });
    expect(missing).toMatchObject({ document, error: { code: 'not-found' }, ok: false });

    const duplicateIds = dispatchDocumentCommand(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementAssets,
      elementId: DOCUMENT_FIXTURE_IDS.child,
      assetIds: [IMPORTED_ASSET_ID, IMPORTED_ASSET_ID],
    });
    expect(duplicateIds).toMatchObject({ document, error: { code: 'invalid-command' }, ok: false });

    const created = dispatchDocumentCommand(document, {
      type: DOCUMENT_COMMAND_TYPES.createAsset,
      asset: IMPORTED_ASSET,
    });
    if (!created.ok || !created.changed) {
      throw new Error('Asset collision setup failed.');
    }
    expect(
      dispatchDocumentCommand(created.document, {
        type: DOCUMENT_COMMAND_TYPES.createAsset,
        asset: IMPORTED_ASSET,
      }),
    ).toMatchObject({ document: created.document, error: { code: 'conflict' }, ok: false });
  });
});
