import type { HistorySaveSnapshot, ProjectDocument } from '../../domain';
import {
  decodeProjectFileArchive,
  encodeProjectFileArchive,
  type DecodedProjectFile,
  type ProjectFileOperationError,
} from '../../persistence';
import {
  readProjectArchiveFile,
  writeProjectArchiveFileAtomically,
  type AtomicProjectFileWriteSuccess,
  type ProjectFileStorageError,
} from './project-file-storage';

export type ProjectFileServiceError = ProjectFileOperationError | ProjectFileStorageError;

export type OpenProjectFileResult =
  | { readonly ok: true; readonly value: DecodedProjectFile }
  | { readonly ok: false; readonly error: ProjectFileServiceError };

export type SaveProjectFileResult =
  | { readonly ok: true; readonly value: AtomicProjectFileWriteSuccess }
  | { readonly ok: false; readonly error: ProjectFileServiceError };

export interface SavedProjectHistorySnapshot extends AtomicProjectFileWriteSuccess {
  readonly stateId: HistorySaveSnapshot['stateId'];
  readonly tokenId: HistorySaveSnapshot['tokenId'];
}

export type SaveProjectHistorySnapshotResult =
  | { readonly ok: true; readonly value: SavedProjectHistorySnapshot }
  | { readonly ok: false; readonly error: ProjectFileServiceError };

export const openProjectFile = async (filePath: unknown): Promise<OpenProjectFileResult> => {
  const read = await readProjectArchiveFile(filePath);
  if (!read.ok) {
    return read;
  }
  return decodeProjectFileArchive(read.value);
};

export const saveProjectFile = async (
  filePath: unknown,
  document: ProjectDocument,
  assetsById: Readonly<Record<string, Uint8Array>> = {},
): Promise<SaveProjectFileResult> => {
  const encoded = await encodeProjectFileArchive(document, assetsById);
  if (!encoded.ok) {
    return encoded;
  }
  return writeProjectArchiveFileAtomically(filePath, encoded.value);
};

export const saveProjectHistorySnapshot = async (
  filePath: unknown,
  snapshot: HistorySaveSnapshot,
  assetsById: Readonly<Record<string, Uint8Array>> = {},
): Promise<SaveProjectHistorySnapshotResult> => {
  const saved = await saveProjectFile(filePath, snapshot.document, assetsById);
  if (!saved.ok) {
    return saved;
  }
  return {
    ok: true,
    value: Object.freeze({
      stateId: snapshot.stateId,
      tokenId: snapshot.tokenId,
      ...(saved.value.warning === undefined ? {} : { warning: saved.value.warning }),
    }),
  };
};
