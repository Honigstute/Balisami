import { readFileSync } from 'node:fs';
import path from 'node:path';

import { unzipSync, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';

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
    expect(Buffer.from(left.value).toString('base64')).toBe(PROJECT_FILE_V1_GOLDEN_BASE64);
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
