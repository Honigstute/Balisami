import type { ProjectDocument } from '../../domain';
import type { ProjectAssetBytes } from '../../shared/desktop-api';
import {
  MAX_PROJECT_ASSET_BYTES,
  MAX_PROJECT_FILE_ENTRY_COUNT,
  MAX_PROJECT_FILE_TOTAL_BYTES,
} from '../../shared/project-file-limits';

export type ProjectAssetBytesResult =
  | { readonly ok: true; readonly value: ProjectAssetBytes }
  | { readonly ok: false; readonly message: string };

const fail = (message: string): ProjectAssetBytesResult => ({ ok: false, message });

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const sha256 = async (bytes: Uint8Array): Promise<string | undefined> => {
  try {
    const copied = Uint8Array.from(bytes);
    return toHex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', copied)));
  } catch {
    return undefined;
  }
};

const selectExactBytes = (
  document: ProjectDocument,
  pool: ProjectAssetBytes,
  copy: boolean,
): ProjectAssetBytesResult => {
  const references = Object.values(document.assetsById);
  if (references.length > MAX_PROJECT_FILE_ENTRY_COUNT - 2) {
    return fail('The project contains too many assets to save safely.');
  }

  let totalBytes = 0;
  const selected: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  for (const reference of references) {
    const bytes = pool[reference.id];
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== reference.byteLength) {
      return fail(`Asset '${reference.id}' has no matching binary data.`);
    }
    if (bytes.byteLength > MAX_PROJECT_ASSET_BYTES) {
      return fail(`Asset '${reference.id}' exceeds the project asset size limit.`);
    }
    totalBytes += bytes.byteLength;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_PROJECT_FILE_TOTAL_BYTES) {
      return fail('The project assets exceed the total project size limit.');
    }
    selected[reference.id] = copy ? Uint8Array.from(bytes) : bytes;
  }
  return { ok: true, value: Object.freeze(selected) };
};

/** Copies and fully authenticates asset bytes received across the preload boundary. */
export const acceptOpenedProjectAssetBytes = async (
  document: ProjectDocument,
  input: ProjectAssetBytes,
): Promise<ProjectAssetBytesResult> => {
  const expectedIds = Object.keys(document.assetsById).sort();
  const actualIds = Object.keys(input).sort();
  if (
    actualIds.length !== expectedIds.length ||
    actualIds.some((assetId, index) => assetId !== expectedIds[index])
  ) {
    return fail('The opened project did not provide its exact asset set.');
  }

  const copied = selectExactBytes(document, input, true);
  if (!copied.ok) {
    return copied;
  }
  for (const reference of Object.values(document.assetsById)) {
    const bytes = copied.value[reference.id];
    if (bytes === undefined || (await sha256(bytes)) !== reference.sha256) {
      return fail(`Asset '${reference.id}' failed its content digest check.`);
    }
  }
  return copied;
};

/**
 * Authenticates new bytes before their matching command result is published.
 * The returned pool intentionally retains unreachable bytes so undo/redo can
 * restore asset metadata without an asynchronous side effect.
 */
export const stageProjectAssetBytes = async (
  currentDocument: ProjectDocument,
  candidateDocument: ProjectDocument,
  pool: ProjectAssetBytes,
  additions: ProjectAssetBytes,
): Promise<ProjectAssetBytesResult> => {
  const nextPool: Record<string, Uint8Array> = Object.assign(Object.create(null), pool) as Record<
    string,
    Uint8Array
  >;

  for (const [assetId, inputBytes] of Object.entries(additions)) {
    const reference = Object.values(candidateDocument.assetsById).find(
      (candidateReference) => candidateReference.id === assetId,
    );
    if (reference === undefined) {
      return fail(`Binary data was supplied for unknown asset '${assetId}'.`);
    }
    if (Object.hasOwn(currentDocument.assetsById, assetId) || pool[assetId] !== undefined) {
      return fail(`Asset '${assetId}' reuses an existing stable identifier.`);
    }
    if (!(inputBytes instanceof Uint8Array) || inputBytes.byteLength !== reference.byteLength) {
      return fail(`Asset '${assetId}' does not match its declared byte length.`);
    }
    if (inputBytes.byteLength > MAX_PROJECT_ASSET_BYTES) {
      return fail(`Asset '${assetId}' exceeds the project asset size limit.`);
    }
    const copied = Uint8Array.from(inputBytes);
    if ((await sha256(copied)) !== reference.sha256) {
      return fail(`Asset '${assetId}' failed its content digest check.`);
    }
    nextPool[assetId] = copied;
  }

  const candidate = selectExactBytes(candidateDocument, nextPool, false);
  return candidate.ok ? { ok: true, value: Object.freeze(nextPool) } : candidate;
};

/** Selects only live bytes from the undo-capable pool for persistence. */
export const createLiveProjectAssetBytes = (
  document: ProjectDocument,
  pool: ProjectAssetBytes,
): ProjectAssetBytesResult => selectExactBytes(document, pool, false);
