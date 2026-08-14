import {
  parseProjectDocument,
  type DocumentValidationIssue,
  type ProjectDocument,
} from '../../domain';
import { copyBytes, isUint8Array } from './binary';
import { sha256Bytes } from './digest';
import {
  decodeBoundedJson,
  encodeCanonicalJson,
  validateJsonComplexity,
  type JsonComplexityErrorCode,
} from './canonical-json';
import {
  getProjectAssetEntryPath,
  isProjectAssetEntryPath,
  PROJECT_FILE_ENTRY_PATHS,
  PROJECT_FILE_FORMAT_ID,
  PROJECT_FILE_MANIFEST_V1,
  ProjectFileManifestV1Schema,
} from './manifest';
import { routeProjectFileVersion } from './version-routing';

export const MAX_PROJECT_FILE_ENTRY_COUNT = 10_002;
export const MAX_PROJECT_MANIFEST_BYTES = 64 * 1_024;
export const MAX_PROJECT_DOCUMENT_BYTES = 32 * 1_024 * 1_024;
export const MAX_PROJECT_ASSET_BYTES = 64 * 1_024 * 1_024;
export const MAX_PROJECT_FILE_TOTAL_BYTES = 256 * 1_024 * 1_024;

export interface ProjectFileEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface ProjectFileEnvelope {
  readonly entries: readonly ProjectFileEntry[];
}

export interface DecodedProjectFile {
  readonly document: ProjectDocument;
  readonly assetsById: Readonly<Record<string, Uint8Array>>;
}

export type ProjectFileCodecErrorCode =
  | 'asset-digest-mismatch'
  | 'asset-size-mismatch'
  | 'duplicate-entry'
  | 'entry-too-large'
  | 'invalid-asset-bytes'
  | 'invalid-document'
  | 'invalid-envelope'
  | 'invalid-entry'
  | 'invalid-manifest'
  | 'invalid-utf8'
  | JsonComplexityErrorCode
  | 'malformed-json'
  | 'missing-asset'
  | 'missing-entry'
  | 'newer-version'
  | 'too-many-entries'
  | 'total-too-large'
  | 'unexpected-asset'
  | 'unexpected-entry'
  | 'unsupported-format'
  | 'unsupported-version';

export interface ProjectFileCodecError {
  readonly code: ProjectFileCodecErrorCode;
  readonly message: string;
  readonly entryPath?: string;
  readonly assetId?: string;
  readonly actualBytes?: number;
  readonly maxBytes?: number;
  readonly foundVersion?: number;
  readonly issues?: readonly DocumentValidationIssue[];
  readonly omittedIssueCount?: number;
}

export type EncodeProjectFileResult =
  | { readonly ok: true; readonly value: ProjectFileEnvelope }
  | { readonly ok: false; readonly error: ProjectFileCodecError };

export type DecodeProjectFileResult =
  | { readonly ok: true; readonly value: DecodedProjectFile }
  | { readonly ok: false; readonly error: ProjectFileCodecError };

const fail = (
  error: ProjectFileCodecError,
): { readonly ok: false; readonly error: ProjectFileCodecError } => ({
  ok: false,
  error,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const createEntry = (path: string, bytes: Uint8Array): ProjectFileEntry =>
  Object.freeze({ path, bytes: copyBytes(bytes) });

export const getProjectFileEntryByteLimit = (path: string): number | undefined => {
  if (path === PROJECT_FILE_ENTRY_PATHS.manifest) {
    return MAX_PROJECT_MANIFEST_BYTES;
  }
  if (path === PROJECT_FILE_ENTRY_PATHS.document) {
    return MAX_PROJECT_DOCUMENT_BYTES;
  }
  if (isProjectAssetEntryPath(path)) {
    return MAX_PROJECT_ASSET_BYTES;
  }
  return undefined;
};

const validateEnvelope = (
  input: unknown,
):
  | { readonly ok: true; readonly entriesByPath: ReadonlyMap<string, Uint8Array> }
  | { readonly ok: false; readonly error: ProjectFileCodecError } => {
  if (!isRecord(input) || Object.keys(input).length !== 1 || !Array.isArray(input.entries)) {
    return fail({
      code: 'invalid-envelope',
      message: "Project file input must contain exactly one 'entries' array.",
    });
  }
  if (input.entries.length > MAX_PROJECT_FILE_ENTRY_COUNT) {
    return fail({
      code: 'too-many-entries',
      message: `Project files may contain at most ${String(MAX_PROJECT_FILE_ENTRY_COUNT)} entries.`,
    });
  }

  const entriesByPath = new Map<string, Uint8Array>();
  let totalBytes = 0;
  for (const candidate of input.entries) {
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).length !== 2 ||
      typeof candidate.path !== 'string' ||
      !isUint8Array(candidate.bytes)
    ) {
      return fail({
        code: 'invalid-entry',
        message:
          "Each project file entry must contain exactly a string 'path' and Uint8Array 'bytes'.",
      });
    }

    const byteLimit = getProjectFileEntryByteLimit(candidate.path);
    if (byteLimit === undefined) {
      return fail({
        code: 'unexpected-entry',
        message: `Project file contains unsupported entry '${candidate.path}'.`,
        entryPath: candidate.path,
      });
    }
    if (entriesByPath.has(candidate.path)) {
      return fail({
        code: 'duplicate-entry',
        message: `Project file contains duplicate entry '${candidate.path}'.`,
        entryPath: candidate.path,
      });
    }
    if (candidate.bytes.byteLength > byteLimit) {
      return fail({
        code: 'entry-too-large',
        message: `Project file entry '${candidate.path}' exceeds its size limit.`,
        entryPath: candidate.path,
        actualBytes: candidate.bytes.byteLength,
        maxBytes: byteLimit,
      });
    }

    totalBytes += candidate.bytes.byteLength;
    if (totalBytes > MAX_PROJECT_FILE_TOTAL_BYTES) {
      return fail({
        code: 'total-too-large',
        message: 'Project file exceeds the total uncompressed size limit.',
        actualBytes: totalBytes,
        maxBytes: MAX_PROJECT_FILE_TOTAL_BYTES,
      });
    }
    entriesByPath.set(candidate.path, copyBytes(candidate.bytes));
  }

  return { ok: true, entriesByPath };
};

const readRequiredEntry = (
  entriesByPath: ReadonlyMap<string, Uint8Array>,
  path: string,
):
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly error: ProjectFileCodecError } => {
  const bytes = entriesByPath.get(path);
  if (bytes === undefined) {
    return fail({
      code: 'missing-entry',
      message: `Project file is missing required entry '${path}'.`,
      entryPath: path,
    });
  }
  return { ok: true, bytes };
};

const decodeManifest = (
  bytes: Uint8Array,
): { readonly ok: true } | { readonly ok: false; readonly error: ProjectFileCodecError } => {
  const decoded = decodeBoundedJson(bytes);
  if (!decoded.ok) {
    return fail({
      code: decoded.code,
      message: decoded.message,
      entryPath: PROJECT_FILE_ENTRY_PATHS.manifest,
    });
  }
  if (!isRecord(decoded.value)) {
    return fail({
      code: 'invalid-manifest',
      message: 'Project file manifest must be a JSON object.',
      entryPath: PROJECT_FILE_ENTRY_PATHS.manifest,
    });
  }

  if (typeof decoded.value.format !== 'string') {
    return fail({
      code: 'invalid-manifest',
      message: 'Project file manifest is missing a valid format identifier.',
      entryPath: PROJECT_FILE_ENTRY_PATHS.manifest,
    });
  }
  if (decoded.value.format !== PROJECT_FILE_FORMAT_ID) {
    return fail({
      code: 'unsupported-format',
      message: 'The selected file is not a supported wireframe project.',
      entryPath: PROJECT_FILE_ENTRY_PATHS.manifest,
    });
  }
  const version = decoded.value.formatVersion;
  const versionRoute = routeProjectFileVersion(version);
  if (!versionRoute.ok) {
    return fail({
      ...versionRoute.error,
      entryPath: PROJECT_FILE_ENTRY_PATHS.manifest,
    });
  }
  if (versionRoute.steps.length > 0) {
    return fail({
      code: 'unsupported-version',
      message: `Project file format version ${String(versionRoute.sourceVersion)} requires an unimplemented migration.`,
      entryPath: PROJECT_FILE_ENTRY_PATHS.manifest,
      foundVersion: versionRoute.sourceVersion,
    });
  }

  const parsed = ProjectFileManifestV1Schema.safeParse(decoded.value);
  if (!parsed.success) {
    return fail({
      code: 'invalid-manifest',
      message: 'Project file manifest has invalid or unsupported fields.',
      entryPath: PROJECT_FILE_ENTRY_PATHS.manifest,
    });
  }
  return { ok: true };
};

const validateEncodedSize = (
  path: string,
  bytes: Uint8Array,
): { readonly ok: true } | { readonly ok: false; readonly error: ProjectFileCodecError } => {
  const maxBytes = getProjectFileEntryByteLimit(path);
  if (maxBytes !== undefined && bytes.byteLength > maxBytes) {
    return fail({
      code: 'entry-too-large',
      message: `Project file entry '${path}' exceeds its size limit.`,
      entryPath: path,
      actualBytes: bytes.byteLength,
      maxBytes,
    });
  }
  return { ok: true };
};

export const encodeProjectFileEnvelope = (
  document: ProjectDocument,
  assetsById: Readonly<Record<string, Uint8Array>> = {},
): EncodeProjectFileResult => {
  const parsedDocument = parseProjectDocument(document);
  if (!parsedDocument.ok) {
    return fail({
      code: 'invalid-document',
      message: 'Project document cannot be encoded because it is invalid.',
      issues: parsedDocument.issues,
      omittedIssueCount: parsedDocument.omittedIssueCount,
    });
  }

  const complexity = validateJsonComplexity(parsedDocument.value);
  if (!complexity.ok) {
    return fail(complexity.error);
  }

  const expectedAssets = Object.values(parsedDocument.value.assetsById).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const providedAssetIds = Object.keys(assetsById).sort();
  for (const reference of expectedAssets) {
    if (!Object.hasOwn(assetsById, reference.id)) {
      return fail({
        code: 'missing-asset',
        message: `Project asset '${reference.id}' has no binary data.`,
        assetId: reference.id,
      });
    }
  }
  for (const assetId of providedAssetIds) {
    if (!Object.hasOwn(parsedDocument.value.assetsById, assetId)) {
      return fail({
        code: 'unexpected-asset',
        message: `Binary data was provided for unknown project asset '${assetId}'.`,
        assetId,
      });
    }
  }

  const assetEntriesByPath = new Map<string, Uint8Array>();
  for (const reference of expectedAssets) {
    const bytes = assetsById[reference.id];
    if (!isUint8Array(bytes)) {
      return fail({
        code: 'invalid-asset-bytes',
        message: `Project asset '${reference.id}' must be provided as a Uint8Array.`,
        assetId: reference.id,
      });
    }
    if (bytes.byteLength !== reference.byteLength) {
      return fail({
        code: 'asset-size-mismatch',
        message: `Project asset '${reference.id}' does not match its declared byte length.`,
        assetId: reference.id,
        actualBytes: bytes.byteLength,
      });
    }
    if (bytes.byteLength > MAX_PROJECT_ASSET_BYTES) {
      return fail({
        code: 'entry-too-large',
        message: `Project asset '${reference.id}' exceeds its size limit.`,
        assetId: reference.id,
        actualBytes: bytes.byteLength,
        maxBytes: MAX_PROJECT_ASSET_BYTES,
      });
    }
    if (sha256Bytes(bytes) !== reference.sha256) {
      return fail({
        code: 'asset-digest-mismatch',
        message: `Project asset '${reference.id}' does not match its declared SHA-256 digest.`,
        assetId: reference.id,
      });
    }

    const path = getProjectAssetEntryPath(reference.sha256);
    if (path === undefined) {
      return fail({
        code: 'invalid-document',
        message: `Project asset '${reference.id}' has an invalid SHA-256 digest.`,
        assetId: reference.id,
      });
    }
    if (!assetEntriesByPath.has(path)) {
      assetEntriesByPath.set(path, copyBytes(bytes));
    }
  }

  const manifestBytes = encodeCanonicalJson(PROJECT_FILE_MANIFEST_V1);
  const documentBytes = encodeCanonicalJson(parsedDocument.value);
  for (const [path, bytes] of [
    [PROJECT_FILE_ENTRY_PATHS.manifest, manifestBytes],
    [PROJECT_FILE_ENTRY_PATHS.document, documentBytes],
  ] as const) {
    const size = validateEncodedSize(path, bytes);
    if (!size.ok) {
      return size;
    }
  }

  const entries = [
    createEntry(PROJECT_FILE_ENTRY_PATHS.manifest, manifestBytes),
    createEntry(PROJECT_FILE_ENTRY_PATHS.document, documentBytes),
    ...[...assetEntriesByPath.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, bytes]) => createEntry(path, bytes)),
  ];
  if (entries.length > MAX_PROJECT_FILE_ENTRY_COUNT) {
    return fail({
      code: 'too-many-entries',
      message: `Project files may contain at most ${String(MAX_PROJECT_FILE_ENTRY_COUNT)} entries.`,
    });
  }
  const totalBytes = entries.reduce((total, entry) => total + entry.bytes.byteLength, 0);
  if (totalBytes > MAX_PROJECT_FILE_TOTAL_BYTES) {
    return fail({
      code: 'total-too-large',
      message: 'Project file exceeds the total uncompressed size limit.',
      actualBytes: totalBytes,
      maxBytes: MAX_PROJECT_FILE_TOTAL_BYTES,
    });
  }
  return { ok: true, value: Object.freeze({ entries: Object.freeze(entries) }) };
};

export const decodeProjectFileEnvelope = (input: unknown): DecodeProjectFileResult => {
  const envelope = validateEnvelope(input);
  if (!envelope.ok) {
    return envelope;
  }

  const manifestEntry = readRequiredEntry(
    envelope.entriesByPath,
    PROJECT_FILE_ENTRY_PATHS.manifest,
  );
  if (!manifestEntry.ok) {
    return manifestEntry;
  }
  const manifest = decodeManifest(manifestEntry.bytes);
  if (!manifest.ok) {
    return manifest;
  }

  const documentEntry = readRequiredEntry(
    envelope.entriesByPath,
    PROJECT_FILE_ENTRY_PATHS.document,
  );
  if (!documentEntry.ok) {
    return documentEntry;
  }
  const decodedDocument = decodeBoundedJson(documentEntry.bytes);
  if (!decodedDocument.ok) {
    return fail({
      code: decodedDocument.code,
      message: decodedDocument.message,
      entryPath: PROJECT_FILE_ENTRY_PATHS.document,
    });
  }
  const parsedDocument = parseProjectDocument(decodedDocument.value);
  if (!parsedDocument.ok) {
    return fail({
      code: 'invalid-document',
      message: 'Project file contains an invalid project document.',
      entryPath: PROJECT_FILE_ENTRY_PATHS.document,
      issues: parsedDocument.issues,
      omittedIssueCount: parsedDocument.omittedIssueCount,
    });
  }

  const expectedPaths = new Set<string>();
  for (const reference of Object.values(parsedDocument.value.assetsById)) {
    const path = getProjectAssetEntryPath(reference.sha256);
    if (path === undefined) {
      return fail({
        code: 'invalid-document',
        message: `Project asset '${reference.id}' has an invalid SHA-256 digest.`,
        assetId: reference.id,
      });
    }
    expectedPaths.add(path);
  }
  for (const path of envelope.entriesByPath.keys()) {
    if (isProjectAssetEntryPath(path) && !expectedPaths.has(path)) {
      return fail({
        code: 'unexpected-asset',
        message: `Project file contains unreferenced asset entry '${path}'.`,
        entryPath: path,
      });
    }
  }

  const assetsById: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  for (const [assetId, reference] of Object.entries(parsedDocument.value.assetsById)) {
    const path = getProjectAssetEntryPath(reference.sha256);
    const bytes = path === undefined ? undefined : envelope.entriesByPath.get(path);
    if (path === undefined || bytes === undefined) {
      return fail({
        code: 'missing-asset',
        message: `Project file is missing binary data for asset '${assetId}'.`,
        assetId,
        ...(path === undefined ? {} : { entryPath: path }),
      });
    }
    if (bytes.byteLength !== reference.byteLength) {
      return fail({
        code: 'asset-size-mismatch',
        message: `Project asset '${assetId}' does not match its declared byte length.`,
        entryPath: path,
        assetId,
        actualBytes: bytes.byteLength,
      });
    }
    if (sha256Bytes(bytes) !== reference.sha256) {
      return fail({
        code: 'asset-digest-mismatch',
        message: `Project asset '${assetId}' does not match its declared SHA-256 digest.`,
        entryPath: path,
        assetId,
      });
    }
    assetsById[assetId] = copyBytes(bytes);
  }

  return {
    ok: true,
    value: Object.freeze({
      document: parsedDocument.value,
      assetsById: Object.freeze(assetsById),
    }),
  };
};
