import type { Dirent } from 'node:fs';
import { lstat, mkdir, opendir, rmdir, unlink } from 'node:fs/promises';
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
  sha256Bytes,
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

export const RECOVERY_LAYOUT = Object.freeze({
  directoryName: 'recovery-v1',
  pointerName: 'current.json',
  snapshotDirectoryName: 'snapshots',
});
export const MAX_RECOVERY_DISCOVERY_ENTRIES = 1_000;
export const MAX_RECOVERY_DISCOVERY_ISSUES = 50;
export const MAX_RECOVERY_SNAPSHOT_ENTRIES_PER_PROJECT = 128;

const RECOVERY_SNAPSHOT_NAME_PATTERN = /^[a-f0-9]{64}\.zip$/u;

/** Serializes mutations to one project journal inside this main process. */
const recoveryMutationTails = new Map<string, Promise<void>>();

export type RecoveryJournalErrorCode =
  | 'invalid-recovery-metadata'
  | 'invalid-recovery-root'
  | 'recovery-changed'
  | 'recovery-clear-failed'
  | 'recovery-cleanup-failed'
  | 'recovery-discovery-limit-exceeded'
  | 'recovery-discovery-failed'
  | 'recovery-integrity-failed'
  | 'recovery-not-found'
  | 'recovery-project-mismatch';

export interface RecoveryJournalError {
  readonly code: RecoveryJournalErrorCode;
  readonly message: string;
}

export interface RecoveryJournalWarning {
  readonly code:
    'cleared-recovery-cleanup-failed' | 'stale-recovery-cleanup-failed' | 'storage-cleanup-warning';
  readonly message: string;
  readonly recoveryPath?: string;
}

export type RecoveryDiscoveryIssueCode =
  | 'invalid-project-directory'
  | 'invalid-recovery-pointer'
  | 'invalid-recovery-snapshot'
  | 'unexpected-recovery-entry';

export interface RecoveryDiscoveryIssue {
  readonly code: RecoveryDiscoveryIssueCode;
  readonly message: string;
  readonly projectId?: string;
}

export interface DiscoveredRecoverySnapshot {
  readonly pointer: RecoveryPointerV1;
}

export interface RecoveryDiscovery {
  readonly snapshots: readonly DiscoveredRecoverySnapshot[];
  readonly issues: readonly RecoveryDiscoveryIssue[];
  readonly omittedIssueCount: number;
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

export type DiscoverRecoverySnapshotsResult =
  | { readonly ok: true; readonly value: RecoveryDiscovery }
  | { readonly ok: false; readonly error: RecoveryJournalError };

export interface ClearedRecoverySnapshot {
  readonly cleared: boolean;
  readonly warnings: readonly RecoveryJournalWarning[];
}

export type ClearRecoverySnapshotResult =
  | { readonly ok: true; readonly value: ClearedRecoverySnapshot }
  | { readonly ok: false; readonly error: RecoveryOperationError };

const fail = <ErrorType extends RecoveryOperationError>(
  error: ErrorType,
): { readonly ok: false; readonly error: ErrorType } => ({ ok: false, error });

export const isValidRecoveryRoot = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  !value.includes('\0') &&
  path.isAbsolute(value) &&
  value !== path.parse(value).root;

const isNodeErrorCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { readonly code?: unknown }).code === code;

const createRecoveryPaths = (recoveryRoot: string, projectId: string) => {
  const projectDirectory = path.join(recoveryRoot, RECOVERY_LAYOUT.directoryName, projectId);
  const snapshotDirectory = path.join(projectDirectory, RECOVERY_LAYOUT.snapshotDirectoryName);
  return Object.freeze({
    pointer: path.join(projectDirectory, RECOVERY_LAYOUT.pointerName),
    projectDirectory,
    snapshotDirectory,
  });
};

const getSnapshotPath = (snapshotDirectory: string, digest: string): string =>
  path.join(snapshotDirectory, `${digest}.zip`);

const runSerializedRecoveryMutation = async <Result>(
  recoveryRoot: string,
  projectId: string,
  operation: () => Promise<Result>,
): Promise<Result> => {
  const key = `${recoveryRoot}\0${projectId}`;
  const prior = recoveryMutationTails.get(key) ?? Promise.resolve();
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prior.then(() => gate);
  recoveryMutationTails.set(key, tail);

  await prior;
  try {
    return await operation();
  } finally {
    release();
    if (recoveryMutationTails.get(key) === tail) {
      recoveryMutationTails.delete(key);
    }
  }
};

export const recoveryPointersAreEqual = (
  left: RecoveryPointerV1,
  right: RecoveryPointerV1,
): boolean =>
  left.format === right.format &&
  left.formatVersion === right.formatVersion &&
  left.projectId === right.projectId &&
  left.stateId === right.stateId &&
  left.capturedAtEpochMs === right.capturedAtEpochMs &&
  left.archiveSha256 === right.archiveSha256 &&
  left.archiveByteLength === right.archiveByteLength &&
  left.sourceFilePath === right.sourceFilePath;

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
): Promise<{ readonly ok: true; readonly retainedEntryCount: number } | { readonly ok: false }> => {
  let directory;
  try {
    directory = await opendir(snapshotDirectory);
  } catch {
    return { ok: false };
  }

  const entries: Dirent[] = [];
  try {
    for await (const entry of directory) {
      entries.push(entry);
      if (entries.length > MAX_RECOVERY_SNAPSHOT_ENTRIES_PER_PROJECT) {
        return { ok: false };
      }
    }
  } catch {
    return { ok: false };
  }

  const staleSnapshotPaths = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        RECOVERY_SNAPSHOT_NAME_PATTERN.test(entry.name) &&
        !preservedDigests.has(entry.name.slice(0, 64)),
    )
    .map((entry) => path.join(snapshotDirectory, entry.name));
  try {
    await Promise.all(staleSnapshotPaths.map((snapshotPath) => unlink(snapshotPath)));
    return { ok: true, retainedEntryCount: entries.length - staleSnapshotPaths.length };
  } catch {
    return { ok: false };
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
    archiveSha256: sha256Bytes(archiveBytes),
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

const writeRecoverySnapshotUnlocked = async (
  recoveryRoot: string,
  snapshot: ProjectRecoverySnapshot,
  projectId: string,
  assetsById: Readonly<Record<string, Uint8Array>> = {},
  options: WriteRecoverySnapshotOptions = {},
): Promise<WriteRecoverySnapshotResult> => {
  const archive = await encodeProjectFileArchive(snapshot.document, assetsById);
  if (!archive.ok) {
    return archive;
  }
  const pointer = createPointer(snapshot, archive.value, options);
  if (!pointer.ok) {
    return pointer;
  }

  const paths = createRecoveryPaths(recoveryRoot, projectId);
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
  if (current.value !== undefined && current.value.projectId !== projectId) {
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
  if (!beforeWriteCleanup.ok) {
    return fail({
      code: 'recovery-cleanup-failed',
      message: 'Stale recovery snapshots could not be bounded safely.',
    });
  }

  const warnings: RecoveryJournalWarning[] = [];
  const snapshotPath = getSnapshotPath(paths.snapshotDirectory, pointer.value.archiveSha256);
  if (
    currentDigest !== pointer.value.archiveSha256 &&
    beforeWriteCleanup.retainedEntryCount >= MAX_RECOVERY_SNAPSHOT_ENTRIES_PER_PROJECT
  ) {
    return fail({
      code: 'recovery-cleanup-failed',
      message: 'Recovery storage has no safe capacity for another snapshot.',
    });
  }
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
  if (!afterWriteCleanup.ok) {
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

  return runSerializedRecoveryMutation(recoveryRoot, projectId.data, () =>
    writeRecoverySnapshotUnlocked(recoveryRoot, snapshot, projectId.data, assetsById, options),
  );
};

const createEmptyRecoveryDiscovery = (): RecoveryDiscovery =>
  Object.freeze({ snapshots: Object.freeze([]), issues: Object.freeze([]), omittedIssueCount: 0 });

/**
 * Lists only cheap, pointer-level recovery metadata. Full archive validation is
 * intentionally deferred to loadRecoverySnapshot after the user chooses one.
 */
export const discoverRecoverySnapshots = async (
  recoveryRoot: unknown,
): Promise<DiscoverRecoverySnapshotsResult> => {
  if (!isValidRecoveryRoot(recoveryRoot)) {
    return fail({
      code: 'invalid-recovery-root',
      message: 'The recovery root must be an absolute application-data directory.',
    });
  }

  const recoveryDirectory = path.join(recoveryRoot, RECOVERY_LAYOUT.directoryName);
  let directory;
  try {
    directory = await opendir(recoveryDirectory);
  } catch (error) {
    if (isNodeErrorCode(error, 'ENOENT')) {
      return { ok: true, value: createEmptyRecoveryDiscovery() };
    }
    return fail({
      code: 'recovery-discovery-failed',
      message: 'Recovery metadata could not be enumerated safely.',
    });
  }

  const entries: Dirent[] = [];
  try {
    for await (const entry of directory) {
      entries.push(entry);
      if (entries.length > MAX_RECOVERY_DISCOVERY_ENTRIES) {
        return fail({
          code: 'recovery-discovery-limit-exceeded',
          message: 'The recovery directory contains too many entries to inspect safely.',
        });
      }
    }
  } catch {
    return fail({
      code: 'recovery-discovery-failed',
      message: 'Recovery metadata could not be enumerated safely.',
    });
  }
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

  const snapshots: DiscoveredRecoverySnapshot[] = [];
  const issues: RecoveryDiscoveryIssue[] = [];
  let omittedIssueCount = 0;
  const recordIssue = (issue: RecoveryDiscoveryIssue): void => {
    if (issues.length < MAX_RECOVERY_DISCOVERY_ISSUES) {
      issues.push(Object.freeze(issue));
    } else {
      omittedIssueCount += 1;
    }
  };

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      recordIssue({
        code: 'unexpected-recovery-entry',
        message: 'An unexpected entry in recovery storage was ignored.',
      });
      continue;
    }

    const projectId = ProjectIdSchema.safeParse(entry.name);
    if (!projectId.success) {
      recordIssue({
        code: 'invalid-project-directory',
        message: 'A recovery directory with an invalid project identity was ignored.',
      });
      continue;
    }

    const paths = createRecoveryPaths(recoveryRoot, projectId.data);
    const pointer = await readCurrentPointer(paths.pointer, false);
    if (!pointer.ok || pointer.value === undefined || pointer.value.projectId !== projectId.data) {
      recordIssue({
        code: 'invalid-recovery-pointer',
        message: 'Recovery pointer metadata is missing, unreadable, or inconsistent.',
        projectId: projectId.data,
      });
      continue;
    }

    const snapshotPath = getSnapshotPath(paths.snapshotDirectory, pointer.value.archiveSha256);
    try {
      const metadata = await lstat(snapshotPath);
      if (
        !metadata.isFile() ||
        !Number.isSafeInteger(metadata.size) ||
        metadata.size !== pointer.value.archiveByteLength
      ) {
        recordIssue({
          code: 'invalid-recovery-snapshot',
          message: 'The recovery archive is missing or does not match its pointer metadata.',
          projectId: projectId.data,
        });
        continue;
      }
    } catch {
      recordIssue({
        code: 'invalid-recovery-snapshot',
        message: 'The recovery archive is missing or cannot be inspected safely.',
        projectId: projectId.data,
      });
      continue;
    }

    snapshots.push(Object.freeze({ pointer: Object.freeze({ ...pointer.value }) }));
  }

  snapshots.sort((left, right) => {
    const byTime = right.pointer.capturedAtEpochMs - left.pointer.capturedAtEpochMs;
    if (byTime !== 0) {
      return byTime;
    }
    return left.pointer.projectId < right.pointer.projectId
      ? -1
      : left.pointer.projectId > right.pointer.projectId
        ? 1
        : 0;
  });

  return {
    ok: true,
    value: Object.freeze({
      snapshots: Object.freeze(snapshots),
      issues: Object.freeze(issues),
      omittedIssueCount,
    }),
  };
};

const removeDirectoryWhenEmpty = async (directoryPath: string): Promise<boolean> => {
  try {
    await rmdir(directoryPath);
    return true;
  } catch (error) {
    return (
      isNodeErrorCode(error, 'ENOENT') ||
      isNodeErrorCode(error, 'ENOTEMPTY') ||
      isNodeErrorCode(error, 'EEXIST')
    );
  }
};

/**
 * Clears only the exact pointer the caller observed. A newer pointer wins and
 * is never removed by a stale discard action.
 */
export const clearRecoverySnapshot = async (
  recoveryRoot: unknown,
  expectedPointerInput: unknown,
): Promise<ClearRecoverySnapshotResult> => {
  if (!isValidRecoveryRoot(recoveryRoot)) {
    return fail({
      code: 'invalid-recovery-root',
      message: 'The recovery root must be an absolute application-data directory.',
    });
  }
  const expectedPointer = RecoveryPointerV1Schema.safeParse(expectedPointerInput);
  if (!expectedPointer.success) {
    return fail({
      code: 'invalid-recovery-metadata',
      message: 'The recovery point to clear has invalid pointer metadata.',
    });
  }

  return runSerializedRecoveryMutation(recoveryRoot, expectedPointer.data.projectId, async () => {
    const paths = createRecoveryPaths(recoveryRoot, expectedPointer.data.projectId);
    const current = await readCurrentPointer(paths.pointer, true);
    if (!current.ok) {
      return current;
    }
    if (current.value === undefined) {
      return {
        ok: true,
        value: Object.freeze({ cleared: false, warnings: Object.freeze([]) }),
      };
    }
    if (!recoveryPointersAreEqual(current.value, expectedPointer.data)) {
      return fail({
        code: 'recovery-changed',
        message: 'A newer or different recovery point exists and was not cleared.',
      });
    }

    try {
      await unlink(paths.pointer);
    } catch {
      return fail({
        code: 'recovery-clear-failed',
        message: 'The accepted recovery pointer could not be cleared safely.',
      });
    }

    const warnings: RecoveryJournalWarning[] = [];
    const snapshotPath = getSnapshotPath(
      paths.snapshotDirectory,
      expectedPointer.data.archiveSha256,
    );
    try {
      await unlink(snapshotPath);
    } catch (error) {
      if (!isNodeErrorCode(error, 'ENOENT')) {
        warnings.push({
          code: 'cleared-recovery-cleanup-failed',
          message: 'The recovery pointer was cleared, but its archive could not be removed.',
          recoveryPath: snapshotPath,
        });
      }
    }

    const snapshotDirectoryRemoved = await removeDirectoryWhenEmpty(paths.snapshotDirectory);
    const projectDirectoryRemoved = await removeDirectoryWhenEmpty(paths.projectDirectory);
    if (!snapshotDirectoryRemoved || !projectDirectoryRemoved) {
      warnings.push({
        code: 'cleared-recovery-cleanup-failed',
        message: 'The recovery point was cleared, but an empty journal directory remains.',
      });
    }

    return {
      ok: true,
      value: Object.freeze({ cleared: true, warnings: Object.freeze(warnings) }),
    };
  });
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
    sha256Bytes(archive.value) !== pointer.value.archiveSha256
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
