import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { unzipSync, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  createControlRowEdits,
  createControlRowsUpdate,
  createElementRowId,
  dispatchDocumentCommand,
  getControlSpec,
} from '../src/domain';
import { createControlInsertionCommand } from '../src/renderer/controls/control-insertion';
import { createWorldPoint } from '../src/renderer/editor/viewport-transform';
import {
  MAX_PROJECT_FILE_ENTRY_COUNT,
  MAX_PROJECT_MANIFEST_BYTES,
  PROJECT_FILE_ENTRY_PATHS,
  decodeProjectFileArchive,
  encodeProjectFileArchive,
  type DecodeProjectFileArchiveResult,
  type ProjectFileOperationError,
} from '../src/persistence';
import {
  createAssetFreeProjectDocument,
  createProjectDocumentWithAsset,
  PROJECT_FILE_FIXTURE_ASSET_BYTES,
} from './fixtures/project-file';
import { DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const FIXED_ZIP_OPTIONS = {
  level: 0 as const,
  mtime: new Date(1980, 0, 1, 0, 0, 0, 0),
  os: 0 as const,
  attrs: 0,
};
const PROJECT_FILE_V1_GOLDEN_BASE64 = readFileSync(
  path.join(process.cwd(), 'tests', 'fixtures', 'project-file-v1.golden.base64'),
  'utf8',
).trim();
const PROJECT_FILE_V2_GOLDEN_BASE64 = readFileSync(
  path.join(process.cwd(), 'tests', 'fixtures', 'project-file-v2.golden.base64'),
  'utf8',
).trim();
const PROJECT_FILE_V3_GOLDEN_BASE64 = readFileSync(
  path.join(process.cwd(), 'tests', 'fixtures', 'project-file-v3.golden.base64'),
  'utf8',
).trim();
const PROJECT_FILE_V4_GOLDEN_BASE64 = readFileSync(
  path.join(process.cwd(), 'tests', 'fixtures', 'project-file-v4.golden.base64'),
  'utf8',
).trim();
const PROJECT_FILE_V5_GOLDEN_BASE64 = readFileSync(
  path.join(process.cwd(), 'tests', 'fixtures', 'project-file-v5.golden.base64'),
  'utf8',
).trim();
const PROJECT_FILE_V6_GOLDEN_PATH = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'project-file-v6.golden.base64',
);

const expectArchiveError = async (input: unknown): Promise<ProjectFileOperationError> => {
  const result: DecodeProjectFileArchiveResult = await decodeProjectFileArchive(input);
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error('Expected project archive decoding to fail.');
  }
  return result.error;
};

describe('physical project file archive', () => {
  it('produces deterministic standard ZIP bytes and round-trips an asset-free project', async () => {
    const document = createAssetFreeProjectDocument();
    const left = await encodeProjectFileArchive(document);
    const right = await encodeProjectFileArchive(document);

    expect(left).toMatchObject({ ok: true });
    expect(right).toMatchObject({ ok: true });
    if (!left.ok || !right.ok) {
      throw new Error('Expected project archive encoding to succeed.');
    }
    expect(Array.from(left.value)).toEqual(Array.from(right.value));
    const actualBase64 = Buffer.from(left.value).toString('base64');
    if (process.env.BALSAMIC_UPDATE_PROJECT_GOLDEN === '1') {
      writeFileSync(PROJECT_FILE_V6_GOLDEN_PATH, `${actualBase64}\n`, 'utf8');
    } else {
      expect(actualBase64).toBe(readFileSync(PROJECT_FILE_V6_GOLDEN_PATH, 'utf8').trim());
    }
    expect(Array.from(left.value.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(Object.keys(unzipSync(left.value)).sort()).toEqual(
      [PROJECT_FILE_ENTRY_PATHS.document, PROJECT_FILE_ENTRY_PATHS.manifest].sort(),
    );

    const decoded = await decodeProjectFileArchive(left.value);
    expect(decoded).toMatchObject({ ok: true });
    if (!decoded.ok) {
      throw new Error('Expected project archive decoding to succeed.');
    }
    expect(decoded.value.document).toEqual(document);
    expect(decoded.value.assetsById).toEqual({});
  });

  it('migrates immutable v1 through v5 goldens to v6 without data loss', async () => {
    for (const [version, base64] of [
      [1, PROJECT_FILE_V1_GOLDEN_BASE64],
      [2, PROJECT_FILE_V2_GOLDEN_BASE64],
      [3, PROJECT_FILE_V3_GOLDEN_BASE64],
      [4, PROJECT_FILE_V4_GOLDEN_BASE64],
      [5, PROJECT_FILE_V5_GOLDEN_BASE64],
    ] as const) {
      const source = Uint8Array.from(Buffer.from(base64, 'base64'));
      const decoded = await decodeProjectFileArchive(source);
      expect(decoded).toMatchObject({ ok: true });
      if (!decoded.ok) {
        throw new Error(
          `Expected v${String(version)} migration to succeed: ${decoded.error.message}`,
        );
      }
      expect(decoded.value.document).toEqual(createAssetFreeProjectDocument());
      expect(decoded.value.document.schemaVersion).toBe(6);
      expect(decoded.value.document.componentIds).toEqual([]);
      expect(decoded.value.document.componentsById).toEqual({});
      expect(decoded.value.document.trashedBoardIds).toEqual([]);
      expect(decoded.value.document.boardsById[DOCUMENT_FIXTURE_IDS.board]).toMatchObject({
        alternateIds: [],
        selectedAlternateId: null,
      });
      for (const element of Object.values(decoded.value.document.elementsById)) {
        expect(element.controlVersion).toBe(getControlSpec(element.controlType)?.fileVersion);
        expect(element.rowData).toEqual({ version: 1, nextId: 0, bindings: [] });
      }
    }
  });

  it('round-trips content-addressed assets through the archive', async () => {
    const document = createProjectDocumentWithAsset();
    const encoded = await encodeProjectFileArchive(document, {
      [DOCUMENT_FIXTURE_IDS.asset]: PROJECT_FILE_FIXTURE_ASSET_BYTES,
    });
    if (!encoded.ok) {
      throw new Error(`Expected archive encoding to succeed: ${encoded.error.message}`);
    }
    const decoded = await decodeProjectFileArchive(encoded.value);
    if (!decoded.ok) {
      throw new Error(`Expected archive decoding to succeed: ${decoded.error.message}`);
    }

    expect(Array.from(decoded.value.assetsById[DOCUMENT_FIXTURE_IDS.asset] ?? [])).toEqual(
      Array.from(PROJECT_FILE_FIXTURE_ASSET_BYTES),
    );
  });

  it('save-reopens stable row generations with board and external row links', async () => {
    const source = createAssetFreeProjectDocument();
    const elementId = ElementIdSchema.parse('element_archive_rows');
    const inserted = dispatchDocumentCommand(
      source,
      createControlInsertionCommand({
        boardId: DOCUMENT_FIXTURE_IDS.board,
        center: createWorldPoint(420, 240),
        controlType: CONTROL_TYPES.breadcrumbs,
        document: source,
        elementId,
      }),
    );
    if (!inserted.ok || !inserted.changed) throw new Error('Archive row control was not inserted.');
    const definition = getControlSpec(CONTROL_TYPES.breadcrumbs);
    const element = inserted.document.elementsById[elementId];
    if (definition === undefined || element === undefined) {
      throw new Error('Archive row definition is missing.');
    }
    const edits = createControlRowEdits(definition, element);
    if (edits === undefined) throw new Error('Archive rows did not parse.');
    const update = createControlRowsUpdate(
      definition,
      element,
      edits.map((edit, index) =>
        index === 0
          ? Object.freeze({
              ...edit,
              link: Object.freeze({
                kind: 'board' as const,
                boardId: DOCUMENT_FIXTURE_IDS.board,
              }),
            })
          : index === 1
            ? Object.freeze({
                ...edit,
                link: Object.freeze({
                  kind: 'external' as const,
                  url: 'https://example.com/archive-row',
                }),
              })
            : edit,
      ),
      element.rowData.nextId,
    );
    if (update === undefined) throw new Error('Archive row update is invalid.');
    const linked = dispatchDocumentCommand(inserted.document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId,
      properties: update.properties,
      rowData: update.rowData,
    });
    if (!linked.ok || !linked.changed) throw new Error('Archive row links did not apply.');
    const encoded = await encodeProjectFileArchive(linked.document);
    if (!encoded.ok) throw new Error(`Archive rows did not save: ${encoded.error.message}`);
    const decoded = await decodeProjectFileArchive(encoded.value);
    if (!decoded.ok) throw new Error(`Archive rows did not reopen: ${decoded.error.message}`);

    expect(decoded.value.document).toEqual(linked.document);
    expect(decoded.value.document.elementsById[elementId]?.rowData).toEqual({
      version: 1,
      nextId: 4,
      bindings: [
        {
          generation: 0,
          id: createElementRowId(elementId, 0),
          link: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
        },
        {
          generation: 1,
          id: createElementRowId(elementId, 1),
          link: { kind: 'external', url: 'https://example.com/archive-row' },
        },
        { generation: 2, id: createElementRowId(elementId, 2), link: null },
        { generation: 3, id: createElementRowId(elementId, 3), link: null },
      ],
    });
  });

  it('rejects non-binary, malformed, and truncated containers', async () => {
    await expect(expectArchiveError('not bytes')).resolves.toMatchObject({
      code: 'invalid-archive-bytes',
    });
    await expect(expectArchiveError(Uint8Array.from([1, 2, 3, 4]))).resolves.toMatchObject({
      code: 'invalid-archive',
    });

    const encoded = await encodeProjectFileArchive(createAssetFreeProjectDocument());
    if (!encoded.ok) {
      throw new Error('Expected archive fixture encoding to succeed.');
    }
    await expect(expectArchiveError(encoded.value.slice(0, -8))).resolves.toMatchObject({
      code: 'invalid-archive',
    });
  });

  it('preflights paths and declared expanded sizes before decompression', async () => {
    const traversalArchive = zipSync({ '../project.json': new Uint8Array() }, FIXED_ZIP_OPTIONS);
    await expect(expectArchiveError(traversalArchive)).resolves.toMatchObject({
      code: 'unexpected-entry',
      entryPath: '../project.json',
    });

    const oversizedManifestArchive = zipSync(
      {
        [PROJECT_FILE_ENTRY_PATHS.manifest]: new Uint8Array(MAX_PROJECT_MANIFEST_BYTES + 1),
      },
      { ...FIXED_ZIP_OPTIONS, level: 9 },
    );
    expect(oversizedManifestArchive.byteLength).toBeLessThan(MAX_PROJECT_MANIFEST_BYTES);
    await expect(expectArchiveError(oversizedManifestArchive)).resolves.toMatchObject({
      code: 'entry-too-large',
      entryPath: PROJECT_FILE_ENTRY_PATHS.manifest,
      actualBytes: MAX_PROJECT_MANIFEST_BYTES + 1,
      maxBytes: MAX_PROJECT_MANIFEST_BYTES,
    });
  });

  it('caps archive entry count before materializing entry contents', async () => {
    const zippable: Zippable = Object.create(null) as Zippable;
    for (let index = 0; index <= MAX_PROJECT_FILE_ENTRY_COUNT; index += 1) {
      const digest = index.toString(16).padStart(64, '0');
      zippable[`assets/sha256/${digest}`] = new Uint8Array();
    }
    const archive = zipSync(zippable, FIXED_ZIP_OPTIONS);

    await expect(expectArchiveError(archive)).resolves.toMatchObject({
      code: 'too-many-entries',
    });
  });

  it('copies archive input before asynchronous expansion', async () => {
    const encoded = await encodeProjectFileArchive(createAssetFreeProjectDocument());
    if (!encoded.ok) {
      throw new Error('Expected archive fixture encoding to succeed.');
    }
    const callerBytes = Uint8Array.from(encoded.value);
    const decoding = decodeProjectFileArchive(callerBytes);
    callerBytes.fill(0);

    await expect(decoding).resolves.toMatchObject({ ok: true });
  });
});
