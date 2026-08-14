import { createHash } from 'node:crypto';
import { mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';

import {
  ProjectIdSchema,
  type DocumentHistoryState,
  type HistoryStateId,
  type ProjectDocument,
} from '../../domain';
import {
  decodeBoundedJson,
  decodeProjectFileArchive,
  encodeCanonicalJson,
  encodeProjectFileArchive,
  type DecodedProjectFile,
  type ProjectFileOperationError,
} from '../../persistence';
import {
  readBoundedFile,
  writeBoundedFileAtomically,
  type ProjectFileStorageError,
} from '../files/project-file-storage';
import {
  MAX_RECOVERY_POINTER_BYTES,
  RECOVERY_FORMAT_ID,
  RECOVERY_FORMAT_VERSION,
  RecoveryPointerV1Schema,
  type RecoveryPointerV1,
} from './recovery-schema';

const RECOVERY_DIRECTORY_NAME = 'recovery-v1';
const RECOVERY_POINTER_NAME = 'current.json';
const RECOVERY_SNAPSHOT_DIRECTORY_NAME = 'snapshots';
const RECOVERY_SNAPSHOT_NAME_PATTERN = /^[a-f0-9]{64}\.zip$/u;

export type RecoveryJournalErrorCode =
  | 'invalid-recovery-metadata'
  | 'invalid-recovery-root'
  | 'recovery-cleanup-failed'
  | 'recovery-integrity-failed'
  | 'recovery-not-found'
  | 'recovery-project-mismatch';

export interface RecoveryJournalError {
  readonly code: RecoveryJournalErrorCode;
  readonly message: string;
}

export interface RecoveryJournalWarning {
  readonly code: 'stale-recovery-cleanup-failed' | 'storage-cleanup-warning';
  readonly message: string;
  readonly recoveryPath?: string;
}

export type RecoveryOperationError =
  ProjectFileOperationError | ProjectFileStorageError | RecoveryJournalError;

export interface WriteRecoverySnapshotOptions {
  readonly capturedAtEpochMs?: number;
  readonly sourceFilePath?: string | null;
}

export interface ProjectRecoverySnapshot {
  readonly document: ProjectDocument;
  readonly stateId: HistoryStateId;
}

export interface WrittenRecoverySnapshot {
  readonly pointer: RecoveryPointerV1;
  readonly warnings: readonly RecoveryJournalWarning[];
}

export interface LoadedRecoverySnapshot extends DecodedProjectFile {
  readonly pointer: RecoveryPointerV1;
}

export type WriteRecoverySnapshotResult =
  | { readonly ok: true; readonly value: WrittenRecoverySnapshot }
  | { readonly ok: false; readonly error: RecoveryOperationError };

export type LoadRecoverySnapshotResult =
  | { readonly ok: true; readonly value: LoadedRecoverySnapshot }
  | { readonly ok: false; readonly error: RecoveryOperationError };

const fail = <ErrorType extends RecoveryOperationError>(
  error: ErrorType,
): { readonly ok: false; readonly error: ErrorType } => ({ ok: false, error });

const isValidRecoveryRoot = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  !value.includes('\0') &&
  path.isAbsolute(value) &&
  value !== path.parse(value).root;

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const createRecoveryPaths = (recoveryRoot: string, projectId: string) => {
  const projectDirectory = path.join(recoveryRoot, RECOVERY_DIRECTORY_NAME, projectId);
  const snapshotDirectory = path.join(projectDirectory, RECOVERY_SNAPSHOT_DIRECTORY_NAME);
  return Object.freeze({
    pointer: path.join(projectDirectory, RECOVERY_POINTER_NAME),
    projectDirectory,
    snapshotDirectory,
  });
};

const getSnapshotPath = (snapshotDirectory: string, digest: string): string =>
  path.join(snapshotDirectory, `${digest}.zip`);

const parsePointerBytes = (
  bytes: Uint8Array,
):
  | { readonly ok: true; readonly value: RecoveryPointerV1 }
  | { readonly ok: false; readonly error: RecoveryJournalError } => {
  const decoded = decodeBoundedJson(bytes);
  if (!decoded.ok) {
    return fail({
      code: 'invalid-recovery-metadata',
      message: 'Recovery metadata is malformed, truncated, or invalid UTF-8.',
    });
  }
  const parsed = RecoveryPointerV1Schema.safeParse(decoded.value);
  if (!parsed.success) {
    return fail({
      code: 'invalid-recovery-metadata',
      message: 'Recovery metadata contains invalid or unsupported fields.',
    });
  }
  return { ok: true, value: parsed.data };
};

const readCurrentPointer = async (
  pointerPath: string,
  allowMissing: boolean,
): Promise<
  | { readonly ok: true; readonly value: RecoveryPointerV1 | undefined }
  | { readonly ok: false; readonly error: RecoveryOperationError }
> => {
  const read = await readBoundedFile(pointerPath, MAX_RECOVERY_POINTER_BYTES);
  if (!read.ok) {
    if (allowMissing && read.error.code === 'file-not-found') {
      return { ok: true, value: undefined };
    }
    if (read.error.code === 'file-not-found') {
      return fail({
        code: 'recovery-not-found',
        message: 'No recovery snapshot exists for this project.',
      });
    }
    return read;
  }
  return parsePointerBytes(read.value);
};

const cleanupSnapshotsExcept = async (
  snapshotDirectory: string,
  preservedDigests: ReadonlySet<string>,
): Promise<boolean> => {
  let entries;
  try {
    entries = await readdir(snapshotDirectory, { withFileTypes: true });
  } catch {
    return false;
  }

  try {
    await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isFile() &&
            RECOVERY_SNAPSHOT_NAME_PATTERN.test(entry.name) &&
            !preservedDigests.has(entry.name.slice(0, 64)),
        )
        .map((entry) => unlink(path.join(snapshotDirectory, entry.name))),
    );
    return true;
  } catch {
    return false;
  }
};

const createPointer = (
  snapshot: ProjectRecoverySnapshot,
  archiveBytes: Uint8Array,
  options: WriteRecoverySnapshotOptions,
):
  | { readonly ok: true; readonly value: RecoveryPointerV1 }
  | { readonly ok: false; readonly error: RecoveryJournalError } => {
  const capturedAtEpochMs = options.capturedAtEpochMs ?? Date.now();
  const sourceFilePath = options.sourceFilePath ?? null;
  const parsed = RecoveryPointerV1Schema.safeParse({
    format: RECOVERY_FORMAT_ID,
    formatVersion: RECOVERY_FORMAT_VERSION,
    projectId: snapshot.document.id,
    stateId: snapshot.stateId,
    capturedAtEpochMs,
    archiveSha256: sha256(archiveBytes),
    archiveByteLength: archiveBytes.byteLength,
    sourceFilePath,
  });
  if (!parsed.success) {
    return fail({
      code: 'invalid-recovery-metadata',
      message: 'The recovery snapshot identity or source metadata is invalid.',
    });
  }
  return { ok: true, value: parsed.data };
};

/** Recovery capture is independent of user-save tokens and never changes dirty state. */
export const captureProjectRecoverySnapshot = (
  history: DocumentHistoryState,
): ProjectRecoverySnapshot =>
  Object.freeze({ document: history.document, stateId: history.currentStateId });

export const writeRecoverySnapshot = async (
  recoveryRoot: unknown,
  snapshot: ProjectRecoverySnapshot,
  assetsById: Readonly<Record<string, Uint8Array>> = {},
  options: WriteRecoverySnapshotOptions = {},
): Promise<WriteRecoverySnapshotResult> => {
  if (!isValidRecoveryRoot(recoveryRoot)) {
    return fail({
      code: 'invalid-recovery-root',
      message: 'The recovery root must be an absolute application-data directory.',
    });
  }
  const projectId = ProjectIdSchema.safeParse(snapshot.document.id);
  if (!projectId.success) {
    return fail({
      code: 'invalid-recovery-metadata',
      message: 'The recovery snapshot has an invalid project identity.',
    });
  }

  const archive = await encodeProjectFileArchive(snapshot.document, assetsById);
  if (!archive.ok) {
    return archive;
  }
  const pointer = createPointer(snapshot, archive.value, options);
  if (!pointer.ok) {
    return pointer;
  }

  const paths = createRecoveryPaths(recoveryRoot, projectId.data);
  try {
    await mkdir(paths.snapshotDirectory, { recursive: true, mode: 0o700 });
  } catch {
    return fail({
      code: 'write-failed',
      message: 'The recovery directory could not be created.',
    });
  }

  const current = await readCurrentPointer(paths.pointer, true);
  if (!current.ok) {
    return current;
  }
  if (current.value !== undefined && current.value.projectId !== projectId.data) {
    return fail({
      code: 'recovery-project-mismatch',
      message: 'Existing recovery metadata belongs to a different project.',
    });
  }

  const currentDigest = current.value?.archiveSha256;
  const beforeWriteCleanup = await cleanupSnapshotsExcept(
    paths.snapshotDirectory,
    new Set(currentDigest === undefined ? [] : [currentDigest]),
  );
  if (!beforeWriteCleanup) {
    return fail({
      code: 'recovery-cleanup-failed',
      message: 'Stale recovery snapshots could not be bounded safely.',
    });
  }

  const warnings: RecoveryJournalWarning[] = [];
  const snapshotPath = getSnapshotPath(paths.snapshotDirectory, pointer.value.archiveSha256);
  const snapshotWrite = await writeBoundedFileAtomically(
    snapshotPath,
    archive.value,
    pointer.value.archiveByteLength,
  );
  if (!snapshotWrite.ok) {
    return snapshotWrite;
  }
  if (snapshotWrite.value.warning !== undefined) {
    warnings.push({
      code: 'storage-cleanup-warning',
      message: snapshotWrite.value.warning.message,
      recoveryPath: snapshotWrite.value.warning.recoveryPath,
    });
  }

  const pointerBytes = encodeCanonicalJson(pointer.value);
  const pointerWrite = await writeBoundedFileAtomically(
    paths.pointer,
    pointerBytes,
    MAX_RECOVERY_POINTER_BYTES,
  );
  if (!pointerWrite.ok) {
    return pointerWrite;
  }
  if (pointerWrite.value.warning !== undefined) {
    warnings.push({
      code: 'storage-cleanup-warning',
      message: pointerWrite.value.warning.message,
      recoveryPath: pointerWrite.value.warning.recoveryPath,
    });
  }

  const afterWriteCleanup = await cleanupSnapshotsExcept(
    paths.snapshotDirectory,
    new Set([pointer.value.archiveSha256]),
  );
  if (!afterWriteCleanup) {
    warnings.push({
      code: 'stale-recovery-cleanup-failed',
      message: 'The new recovery point is valid, but a stale snapshot remains.',
    });
  }

  return {
    ok: true,
    value: Object.freeze({
      pointer: pointer.value,
      warnings: Object.freeze(warnings),
    }),
  };
};

export const loadRecoverySnapshot = async (
  recoveryRoot: unknown,
  projectIdInput: unknown,
): Promise<LoadRecoverySnapshotResult> => {
  if (!isValidRecoveryRoot(recoveryRoot)) {
    return fail({
      code: 'invalid-recovery-root',
      message: 'The recovery root must be an absolute application-data directory.',
    });
  }
  const projectId = ProjectIdSchema.safeParse(projectIdInput);
  if (!projectId.success) {
    return fail({
      code: 'invalid-recovery-metadata',
      message: 'The requested recovery project identity is invalid.',
    });
  }

  const paths = createRecoveryPaths(recoveryRoot, projectId.data);
  const pointer = await readCurrentPointer(paths.pointer, false);
  if (!pointer.ok) {
    return pointer;
  }
  if (pointer.value === undefined) {
    return fail({
      code: 'recovery-not-found',
      message: 'No recovery snapshot exists for this project.',
    });
  }
  if (pointer.value.projectId !== projectId.data) {
    return fail({
      code: 'recovery-project-mismatch',
      message: 'Recovery metadata belongs to a different project.',
    });
  }

  const archivePath = getSnapshotPath(paths.snapshotDirectory, pointer.value.archiveSha256);
  const archive = await readBoundedFile(archivePath, pointer.value.archiveByteLength);
  if (!archive.ok) {
    return archive;
  }
  if (
    archive.value.byteLength !== pointer.value.archiveByteLength ||
    sha256(archive.value) !== pointer.value.archiveSha256
  ) {
    return fail({
      code: 'recovery-integrity-failed',
      message: 'The recovery snapshot does not match its accepted pointer metadata.',
    });
  }

  const decoded = await decodeProjectFileArchive(archive.value);
  if (!decoded.ok) {
    return decoded;
  }
  if (decoded.value.document.id !== pointer.value.projectId) {
    return fail({
      code: 'recovery-project-mismatch',
      message: 'The recovery snapshot document identity does not match its pointer.',
    });
  }
  return {
    ok: true,
    value: Object.freeze({
      document: decoded.value.document,
      assetsById: decoded.value.assetsById,
      pointer: pointer.value,
    }),
  };
};
