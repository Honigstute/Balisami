import { describe, expect, it } from 'vitest';

import { parseProjectDocument, type ProjectDocument } from '../src/domain';
import {
  MAX_PROJECT_FILE_ENTRY_COUNT,
  MAX_PROJECT_JSON_DEPTH,
  MAX_PROJECT_MANIFEST_BYTES,
  PROJECT_FILE_ENTRY_PATHS,
  PROJECT_FILE_FORMAT_ID,
  PROJECT_FILE_FORMAT_VERSION,
  decodeProjectFileEnvelope,
  encodeCanonicalJson,
  encodeProjectFileEnvelope,
  getProjectAssetEntryPath,
  type ProjectFileCodecError,
  type ProjectFileEnvelope,
} from '../src/persistence';
import {
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  type ProjectDocumentInputFixture,
} from './fixtures/project-document';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const ASSET_BYTES = textEncoder.encode('abc');
const ASSET_SHA_256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

const parseFixture = (input: ProjectDocumentInputFixture): ProjectDocument => {
  const result = parseProjectDocument(input);
  if (!result.ok) {
    throw new Error(`Fixture is invalid: ${JSON.stringify(result.issues)}`);
  }
  return result.value;
};

const createAssetFreeDocument = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
  if (child === undefined) {
    throw new Error('Fixture child is missing.');
  }
  child.assetIds = [];
  input.assetsById = {};
  return parseFixture(input);
};

const createDocumentWithAsset = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const reference = input.assetsById[DOCUMENT_FIXTURE_IDS.asset];
  if (reference === undefined) {
    throw new Error('Fixture asset is missing.');
  }
  reference.sha256 = ASSET_SHA_256;
  reference.byteLength = ASSET_BYTES.byteLength;
  return parseFixture(input);
};

const encodeFixture = (
  document: ProjectDocument = createAssetFreeDocument(),
  assetsById: Readonly<Record<string, Uint8Array>> = {},
): ProjectFileEnvelope => {
  const result = encodeProjectFileEnvelope(document, assetsById);
  if (!result.ok) {
    throw new Error(`Encoding failed: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

const expectDecodeError = (input: unknown): ProjectFileCodecError => {
  const result = decodeProjectFileEnvelope(input);
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error('Expected project file decoding to fail.');
  }
  return result.error;
};

const replaceEntry = (
  envelope: ProjectFileEnvelope,
  path: string,
  bytes: Uint8Array,
): ProjectFileEnvelope => ({
  entries: envelope.entries.map((entry) => (entry.path === path ? { path, bytes } : entry)),
});

const withoutEntry = (envelope: ProjectFileEnvelope, path: string): ProjectFileEnvelope => ({
  entries: envelope.entries.filter((entry) => entry.path !== path),
});

const manifestBytes = (overrides: Readonly<Record<string, unknown>> = {}): Uint8Array =>
  encodeCanonicalJson({
    assetDirectory: PROJECT_FILE_ENTRY_PATHS.assetDirectory,
    documentEntry: PROJECT_FILE_ENTRY_PATHS.document,
    format: PROJECT_FILE_FORMAT_ID,
    formatVersion: PROJECT_FILE_FORMAT_VERSION,
    ...overrides,
  });

describe('project file codec', () => {
  it('round-trips a validated project document without assets', () => {
    const document = createAssetFreeDocument();
    const encoded = encodeFixture(document);
    const decoded = decodeProjectFileEnvelope(encoded);

    expect(encoded.entries.map((entry) => entry.path)).toEqual([
      PROJECT_FILE_ENTRY_PATHS.manifest,
      PROJECT_FILE_ENTRY_PATHS.document,
    ]);
    expect(decoded).toMatchObject({ ok: true });
    if (!decoded.ok) {
      throw new Error('Expected project file decoding to succeed.');
    }
    expect(decoded.value.document).toEqual(document);
    expect(decoded.value.assetsById).toEqual({});
    expect(Object.isFrozen(decoded.value.document)).toBe(true);
    expect(Object.isFrozen(decoded.value.assetsById)).toBe(true);
  });

  it('stores referenced asset bytes by digest and verifies them on round-trip', () => {
    const document = createDocumentWithAsset();
    const encoded = encodeFixture(document, { [DOCUMENT_FIXTURE_IDS.asset]: ASSET_BYTES });
    const assetPath = getProjectAssetEntryPath(ASSET_SHA_256);
    const decoded = decodeProjectFileEnvelope(encoded);

    expect(assetPath).toBe(`${PROJECT_FILE_ENTRY_PATHS.assetDirectory}${ASSET_SHA_256}`);
    expect(encoded.entries.map((entry) => entry.path)).toEqual([
      PROJECT_FILE_ENTRY_PATHS.manifest,
      PROJECT_FILE_ENTRY_PATHS.document,
      assetPath,
    ]);
    expect(decoded).toMatchObject({ ok: true });
    if (!decoded.ok) {
      throw new Error('Expected project file decoding to succeed.');
    }
    expect(Array.from(decoded.value.assetsById[DOCUMENT_FIXTURE_IDS.asset] ?? [])).toEqual(
      Array.from(ASSET_BYTES),
    );
  });

  it('deduplicates identical binary assets without merging their document identities', () => {
    const input = createValidProjectDocumentInput();
    const primaryReference = input.assetsById[DOCUMENT_FIXTURE_IDS.asset];
    if (primaryReference === undefined) {
      throw new Error('Fixture asset is missing.');
    }
    primaryReference.sha256 = ASSET_SHA_256;
    primaryReference.byteLength = ASSET_BYTES.byteLength;
    const duplicateAssetId = 'asset_duplicate01';
    input.assetsById[duplicateAssetId] = {
      ...primaryReference,
      id: duplicateAssetId,
      originalName: 'same-content.png',
    };
    const document = parseFixture(input);
    const encoded = encodeFixture(document, {
      [DOCUMENT_FIXTURE_IDS.asset]: ASSET_BYTES,
      [duplicateAssetId]: Uint8Array.from(ASSET_BYTES),
    });
    const decoded = decodeProjectFileEnvelope(encoded);

    expect(encoded.entries.filter((entry) => entry.path.startsWith('assets/'))).toHaveLength(1);
    expect(decoded).toMatchObject({ ok: true });
    if (!decoded.ok) {
      throw new Error('Expected deduplicated project decoding to succeed.');
    }
    expect(Object.keys(decoded.value.assetsById).sort()).toEqual(
      [DOCUMENT_FIXTURE_IDS.asset, duplicateAssetId].sort(),
    );
  });

  it('emits canonical, deterministic JSON with sorted keys and a trailing newline', () => {
    const left = encodeCanonicalJson({ zebra: 1, alpha: { two: 2, one: 1 } });
    const right = encodeCanonicalJson({ alpha: { one: 1, two: 2 }, zebra: 1 });

    expect(left).toEqual(right);
    expect(textDecoder.decode(left)).toBe(
      '{\n  "alpha": {\n    "one": 1,\n    "two": 2\n  },\n  "zebra": 1\n}\n',
    );
    expect(encodeFixture()).toEqual(encodeFixture());
    const encodedManifest = encodeFixture().entries[0];
    expect(encodedManifest?.path).toBe(PROJECT_FILE_ENTRY_PATHS.manifest);
    expect(textDecoder.decode(encodedManifest?.bytes).endsWith('\n')).toBe(true);
  });

  it('accepts valid non-canonical project JSON and canonicalizes it on the next encode', () => {
    const canonical = encodeFixture();
    const documentEntry = canonical.entries.find(
      (entry) => entry.path === PROJECT_FILE_ENTRY_PATHS.document,
    );
    if (documentEntry === undefined) {
      throw new Error('Encoded project entry is missing.');
    }
    const compactBytes = textEncoder.encode(
      JSON.stringify(JSON.parse(textDecoder.decode(documentEntry.bytes))),
    );
    const decoded = decodeProjectFileEnvelope(
      replaceEntry(canonical, PROJECT_FILE_ENTRY_PATHS.document, compactBytes),
    );
    if (!decoded.ok) {
      throw new Error(`Decoding failed: ${decoded.error.message}`);
    }

    expect(encodeFixture(decoded.value.document)).toEqual(canonical);
  });

  it('reports unsupported formats, older versions, and newer versions distinctly', () => {
    const envelope = encodeFixture();

    expect(
      expectDecodeError(
        replaceEntry(
          envelope,
          PROJECT_FILE_ENTRY_PATHS.manifest,
          manifestBytes({ format: 'different-project' }),
        ),
      ).code,
    ).toBe('unsupported-format');
    expect(
      expectDecodeError(
        replaceEntry(
          envelope,
          PROJECT_FILE_ENTRY_PATHS.manifest,
          manifestBytes({ formatVersion: 0 }),
        ),
      ),
    ).toMatchObject({ code: 'unsupported-version', foundVersion: 0 });
    expect(
      expectDecodeError(
        replaceEntry(
          envelope,
          PROJECT_FILE_ENTRY_PATHS.manifest,
          manifestBytes({ formatVersion: PROJECT_FILE_FORMAT_VERSION + 1 }),
        ),
      ),
    ).toMatchObject({ code: 'newer-version', foundVersion: 2 });
  });

  it('reports invalid manifests, malformed or truncated JSON, and invalid UTF-8', () => {
    const envelope = encodeFixture();

    expect(
      expectDecodeError(
        replaceEntry(
          envelope,
          PROJECT_FILE_ENTRY_PATHS.manifest,
          manifestBytes({ format: undefined }),
        ),
      ).code,
    ).toBe('invalid-manifest');
    expect(
      expectDecodeError(
        replaceEntry(
          envelope,
          PROJECT_FILE_ENTRY_PATHS.document,
          textEncoder.encode('{"schemaVersion":1'),
        ),
      ).code,
    ).toBe('malformed-json');
    expect(
      expectDecodeError(
        replaceEntry(envelope, PROJECT_FILE_ENTRY_PATHS.document, Uint8Array.from([0xc3, 0x28])),
      ).code,
    ).toBe('invalid-utf8');
  });

  it('rejects oversized and overly complex untrusted input before domain parsing', () => {
    const envelope = encodeFixture();
    const oversized = new Uint8Array(MAX_PROJECT_MANIFEST_BYTES + 1);
    expect(
      expectDecodeError(replaceEntry(envelope, PROJECT_FILE_ENTRY_PATHS.manifest, oversized)),
    ).toMatchObject({
      code: 'entry-too-large',
      actualBytes: MAX_PROJECT_MANIFEST_BYTES + 1,
      maxBytes: MAX_PROJECT_MANIFEST_BYTES,
    });

    const nested = `${'['.repeat(MAX_PROJECT_JSON_DEPTH + 1)}null${']'.repeat(
      MAX_PROJECT_JSON_DEPTH + 1,
    )}`;
    expect(
      expectDecodeError(
        replaceEntry(envelope, PROJECT_FILE_ENTRY_PATHS.document, textEncoder.encode(nested)),
      ).code,
    ).toBe('json-too-deep');

    expect(
      expectDecodeError({
        entries: Array.from(
          { length: MAX_PROJECT_FILE_ENTRY_COUNT + 1 },
          () => envelope.entries[0],
        ),
      }).code,
    ).toBe('too-many-entries');
  });

  it('rejects missing, duplicate, malformed, and unsupported entries', () => {
    const envelope = encodeFixture();
    const manifest = envelope.entries[0];
    if (manifest === undefined) {
      throw new Error('Manifest fixture is missing.');
    }

    expect(
      expectDecodeError(withoutEntry(envelope, PROJECT_FILE_ENTRY_PATHS.manifest)),
    ).toMatchObject({ code: 'missing-entry', entryPath: PROJECT_FILE_ENTRY_PATHS.manifest });
    expect(expectDecodeError({ entries: [...envelope.entries, manifest] }).code).toBe(
      'duplicate-entry',
    );
    expect(
      expectDecodeError({ entries: [{ path: '../project.json', bytes: new Uint8Array() }] }).code,
    ).toBe('unexpected-entry');
    expect(expectDecodeError({ entries: [{ path: 'project.json' }] }).code).toBe('invalid-entry');
  });

  it('rejects invalid documents and missing, extra, damaged, or mislabeled assets', () => {
    const assetDocument = createDocumentWithAsset();
    const envelope = encodeFixture(assetDocument, {
      [DOCUMENT_FIXTURE_IDS.asset]: ASSET_BYTES,
    });
    const assetPath = getProjectAssetEntryPath(ASSET_SHA_256);
    if (assetPath === undefined) {
      throw new Error('Asset path fixture is invalid.');
    }

    expect(expectDecodeError(withoutEntry(envelope, assetPath)).code).toBe('missing-asset');
    expect(
      expectDecodeError(replaceEntry(envelope, assetPath, textEncoder.encode('abd'))).code,
    ).toBe('asset-digest-mismatch');
    expect(
      expectDecodeError(replaceEntry(envelope, assetPath, textEncoder.encode('ab'))).code,
    ).toBe('asset-size-mismatch');

    const unreferencedDigest = 'c'.repeat(64);
    expect(
      expectDecodeError({
        entries: [
          ...envelope.entries,
          { path: getProjectAssetEntryPath(unreferencedDigest), bytes: ASSET_BYTES },
        ],
      }).code,
    ).toBe('unexpected-asset');

    const invalidDocument = replaceEntry(
      encodeFixture(),
      PROJECT_FILE_ENTRY_PATHS.document,
      encodeCanonicalJson({ schemaVersion: 1 }),
    );
    expect(expectDecodeError(invalidDocument)).toMatchObject({
      code: 'invalid-document',
      entryPath: PROJECT_FILE_ENTRY_PATHS.document,
    });
  });

  it('validates assets while encoding and never exposes caller-owned byte arrays', () => {
    const document = createDocumentWithAsset();
    expect(encodeProjectFileEnvelope(document)).toMatchObject({
      ok: false,
      error: { code: 'missing-asset' },
    });
    expect(
      encodeProjectFileEnvelope(document, {
        [DOCUMENT_FIXTURE_IDS.asset]: textEncoder.encode('ab'),
      }),
    ).toMatchObject({ ok: false, error: { code: 'asset-size-mismatch' } });
    expect(
      encodeProjectFileEnvelope(document, {
        [DOCUMENT_FIXTURE_IDS.asset]: textEncoder.encode('abd'),
      }),
    ).toMatchObject({ ok: false, error: { code: 'asset-digest-mismatch' } });
    expect(
      encodeProjectFileEnvelope(document, {
        [DOCUMENT_FIXTURE_IDS.asset]: ASSET_BYTES,
        asset_unknown01: ASSET_BYTES,
      }),
    ).toMatchObject({ ok: false, error: { code: 'unexpected-asset' } });

    const callerBytes = Uint8Array.from(ASSET_BYTES);
    const encoded = encodeFixture(document, { [DOCUMENT_FIXTURE_IDS.asset]: callerBytes });
    callerBytes[0] = 0;
    const assetEntry = encoded.entries.find((entry) => entry.path.startsWith('assets/'));
    expect(Array.from(assetEntry?.bytes ?? [])).toEqual(Array.from(ASSET_BYTES));

    const decoded = decodeProjectFileEnvelope(encoded);
    if (!decoded.ok || assetEntry === undefined) {
      throw new Error('Expected asset decoding to succeed.');
    }
    assetEntry.bytes[0] = 0;
    expect(Array.from(decoded.value.assetsById[DOCUMENT_FIXTURE_IDS.asset] ?? [])).toEqual(
      Array.from(ASSET_BYTES),
    );
  });
});
