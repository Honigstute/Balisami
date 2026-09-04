import {
  AssetIdSchema,
  createHistorySaveTokenId,
  createHistoryStateId,
  parseProjectDocument,
  type HistorySaveSnapshot,
  type HistoryStateId,
  type ProjectDocument,
} from '../../domain';
import { copyBytes, isUint8Array } from '../../persistence/project-file/binary';
import {
  MAX_PROJECT_ASSET_BYTES,
  MAX_PROJECT_FILE_ENTRY_COUNT,
  MAX_PROJECT_FILE_TOTAL_BYTES,
} from '../../shared/project-file-limits';
import {
  isProjectHistorySnapshotRequest,
  isProjectRecoverySnapshotRequest,
  isProjectStartRequest,
  type ProjectAssetBytes,
} from '../../shared/desktop-api';

export interface ParsedProjectStart {
  readonly assetsById: Readonly<Record<string, Uint8Array>>;
  readonly document: ProjectDocument;
}

export interface ParsedProjectSave extends ParsedProjectStart {
  readonly snapshot: HistorySaveSnapshot;
}

export interface ParsedProjectRecovery extends ParsedProjectStart {
  readonly stateId: HistoryStateId;
}

export type ParseProjectTransportResult<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false };

const parseAssets = (
  document: ProjectDocument,
  input: ProjectAssetBytes,
): Readonly<Record<string, Uint8Array>> | undefined => {
  const expectedIds = Object.keys(document.assetsById).sort();
  const entries = Object.entries(input);
  if (
    entries.length !== expectedIds.length ||
    entries.length > MAX_PROJECT_FILE_ENTRY_COUNT - 2 ||
    entries
      .map(([assetId]) => assetId)
      .sort()
      .some((assetId, index) => assetId !== expectedIds[index])
  ) {
    return undefined;
  }

  let totalBytes = 0;
  const copied: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  for (const [assetIdInput, bytes] of entries) {
    const assetId = AssetIdSchema.safeParse(assetIdInput);
    const reference = assetId.success ? document.assetsById[assetId.data] : undefined;
    if (
      !assetId.success ||
      reference === undefined ||
      !isUint8Array(bytes) ||
      bytes.byteLength !== reference.byteLength ||
      bytes.byteLength > MAX_PROJECT_ASSET_BYTES
    ) {
      return undefined;
    }
    totalBytes += bytes.byteLength;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_PROJECT_FILE_TOTAL_BYTES) {
      return undefined;
    }
    copied[assetId.data] = copyBytes(bytes);
  }
  return Object.freeze(copied);
};

const parseStart = (
  documentInput: unknown,
  assetsInput: ProjectAssetBytes,
): ParsedProjectStart | undefined => {
  const parsedDocument = parseProjectDocument(documentInput);
  if (!parsedDocument.ok) {
    return undefined;
  }
  const assetsById = parseAssets(parsedDocument.value, assetsInput);
  return assetsById === undefined
    ? undefined
    : Object.freeze({ assetsById, document: parsedDocument.value });
};

export const parseProjectStartTransport = (
  input: unknown,
): ParseProjectTransportResult<ParsedProjectStart> => {
  if (!isProjectStartRequest(input)) {
    return { ok: false };
  }
  const parsed = parseStart(input.document, input.assetsById);
  return parsed === undefined ? { ok: false } : { ok: true, value: parsed };
};

export const parseProjectSaveTransport = (
  input: unknown,
): ParseProjectTransportResult<ParsedProjectSave> => {
  if (!isProjectHistorySnapshotRequest(input)) {
    return { ok: false };
  }
  const parsed = parseStart(input.document, input.assetsById);
  const stateId = createHistoryStateId(input.stateId);
  const tokenId = createHistorySaveTokenId(input.tokenId);
  if (parsed === undefined || stateId === undefined || tokenId === undefined) {
    return { ok: false };
  }
  return {
    ok: true,
    value: Object.freeze({
      ...parsed,
      snapshot: Object.freeze({ document: parsed.document, stateId, tokenId }),
    }),
  };
};

export const parseProjectRecoveryTransport = (
  input: unknown,
): ParseProjectTransportResult<ParsedProjectRecovery> => {
  if (!isProjectRecoverySnapshotRequest(input)) {
    return { ok: false };
  }
  const parsed = parseStart(input.document, input.assetsById);
  const stateId = createHistoryStateId(input.stateId);
  if (parsed === undefined || stateId === undefined) {
    return { ok: false };
  }
  return { ok: true, value: Object.freeze({ ...parsed, stateId }) };
};
