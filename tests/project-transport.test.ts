// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  parseProjectRecoveryTransport,
  parseProjectSaveTransport,
  parseProjectStartTransport,
} from '../src/main/projects/project-transport';
import { DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';
import {
  createAssetFreeProjectDocument,
  createProjectDocumentWithAsset,
  PROJECT_FILE_FIXTURE_ASSET_BYTES,
} from './fixtures/project-file';

describe('project transport parsing', () => {
  it('parses and copies an exact document/asset set at the main boundary', () => {
    const document = createProjectDocumentWithAsset();
    const sourceBytes = Uint8Array.from(PROJECT_FILE_FIXTURE_ASSET_BYTES);
    const result = parseProjectStartTransport({
      assetsById: { [DOCUMENT_FIXTURE_IDS.asset]: sourceBytes },
      document,
    });
    expect(result).toMatchObject({ ok: true, value: { document } });
    if (!result.ok) {
      throw new Error('Expected exact project transport to parse.');
    }
    expect(result.value.assetsById[DOCUMENT_FIXTURE_IDS.asset]).not.toBe(sourceBytes);
    sourceBytes[0] = 0;
    expect(result.value.assetsById[DOCUMENT_FIXTURE_IDS.asset]).toEqual(
      PROJECT_FILE_FIXTURE_ASSET_BYTES,
    );
  });

  it('rejects missing, extra, malformed, and wrong-sized asset bytes', () => {
    const document = createProjectDocumentWithAsset();
    expect(parseProjectStartTransport({ assetsById: {}, document })).toEqual({ ok: false });
    expect(
      parseProjectStartTransport({
        assetsById: {
          [DOCUMENT_FIXTURE_IDS.asset]: PROJECT_FILE_FIXTURE_ASSET_BYTES,
          asset_extra0001: Uint8Array.of(1),
        },
        document,
      }),
    ).toEqual({ ok: false });
    expect(
      parseProjectStartTransport({
        assetsById: { [DOCUMENT_FIXTURE_IDS.asset]: Uint8Array.of(1, 2) },
        document,
      }),
    ).toEqual({ ok: false });
    expect(parseProjectStartTransport({ assetsById: [], document })).toEqual({ ok: false });
  });

  it('brands only safe save/recovery identities after document validation', () => {
    const document = createAssetFreeProjectDocument();
    expect(
      parseProjectSaveTransport({
        assetsById: {},
        document,
        stateId: 7,
        tokenId: 3,
      }),
    ).toMatchObject({
      ok: true,
      value: { snapshot: { document, stateId: 7, tokenId: 3 } },
    });
    expect(parseProjectRecoveryTransport({ assetsById: {}, document, stateId: 7 })).toMatchObject({
      ok: true,
      value: { document, stateId: 7 },
    });
    expect(
      parseProjectSaveTransport({ assetsById: {}, document, stateId: -1, tokenId: 3 }),
    ).toEqual({ ok: false });
    expect(parseProjectSaveTransport({ assetsById: {}, document, stateId: 0, tokenId: 0 })).toEqual(
      { ok: false },
    );
  });
});
