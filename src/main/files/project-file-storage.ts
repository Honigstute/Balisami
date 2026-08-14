import { randomBytes } from 'node:crypto';
import { lstat, open, rename, unlink, type FileHandle } from 'node:fs/promises';
import path from 'node:path';

import { MAX_PROJECT_ARCHIVE_BYTES } from '../../persistence';
import { copyBytes, isUint8Array } from '../../persistence/project-file/binary';
import {
  replaceFileSafely,
  type AtomicReplaceOperations,
  type AtomicReplaceWarning,
} from './atomic-replace';

export type ProjectFileStorageErrorCode =
  | 'directory-sync-failed'
  | 'file-changed-during-read'
  | 'file-not-found'
  | 'file-too-large'
  | 'invalid-file-path'
  | 'not-a-file'
  | 'read-failed'
  | 'replace-failed'
  | 'restore-failed'
  | 'temporary-file-failed'
  | 'write-failed';

export interface ProjectFileStorageError {
  readonly code: ProjectFileStorageErrorCode;
  readonly message: string;
  readonly recoveryPath?: string;
  readonly recoveryPaths?: readonly string[];
}

export interface AtomicProjectFileWriteSuccess {
  readonly warning?: AtomicReplaceWarning;
}

export type ReadProjectArchiveResult =
  | { readonly ok: true; readonly value: Uint8Array }
  | { readonly ok: false; readonly error: ProjectFileStorageError };

export type WriteProjectArchiveResult =
  | { readonly ok: true; readonly value: AtomicProjectFileWriteSuccess }
  | { readonly ok: false; readonly error: ProjectFileStorageError };

const fail = (
  error: ProjectFileStorageError,
): { readonly ok: false; readonly error: ProjectFileStorageError } => ({ ok: false, error });

const isNodeErrorCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { readonly code?: unknown }).code === code;

const isValidAbsoluteFilePath = (filePath: unknown): filePath is string =>
  typeof filePath === 'string' &&
  filePath.length > 0 &&
  !filePath.includes('\0') &&
  path.isAbsolute(filePath) &&
  filePath !== path.parse(filePath).root;

const createSiblingWorkPath = (targetPath: string, role: 'backup' | 'temporary'): string => {
  const token = randomBytes(12).toString('hex');
  return path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${role}-${String(process.pid)}-${token}`,
  );
};

const readFixedSnapshot = async (
  handle: FileHandle,
  expectedBytes: number,
): Promise<
  { readonly ok: true; readonly bytes: Uint8Array } | { readonly ok: false; readonly changed: true }
> => {
  const bytes = new Uint8Array(expectedBytes);
  let offset = 0;
  while (offset < expectedBytes) {
    const { bytesRead } = await handle.read(bytes, offset, expectedBytes - offset, offset);
    if (bytesRead === 0) {
      return { ok: false, changed: true };
    }
    offset += bytesRead;
  }

  const probe = new Uint8Array(1);
  const { bytesRead: extraBytes } = await handle.read(probe, 0, 1, expectedBytes);
  return extraBytes === 0 ? { ok: true, bytes } : { ok: false, changed: true };
};

const writeAll = async (handle: FileHandle, bytes: Uint8Array): Promise<void> => {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset, offset);
    if (bytesWritten === 0) {
      throw new Error('File write made no progress.');
    }
    offset += bytesWritten;
  }
};

const syncParentDirectory = async (directoryPath: string): Promise<void> => {
  if (process.platform === 'win32') {
    return;
  }
  const directory = await open(directoryPath, 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
};

export const readProjectArchiveFile = async (
  filePath: unknown,
): Promise<ReadProjectArchiveResult> => readBoundedFile(filePath, MAX_PROJECT_ARCHIVE_BYTES);

export const readBoundedFile = async (
  filePath: unknown,
  maxBytes: number,
): Promise<ReadProjectArchiveResult> => {
  if (!isValidAbsoluteFilePath(filePath)) {
    return fail({
      code: 'invalid-file-path',
      message: 'A project file path must be an absolute file path.',
    });
  }

  let handle: FileHandle;
  try {
    handle = await open(filePath, 'r');
  } catch (error) {
    return fail({
      code: isNodeErrorCode(error, 'ENOENT') ? 'file-not-found' : 'read-failed',
      message: isNodeErrorCode(error, 'ENOENT')
        ? 'The selected project file no longer exists.'
        : 'The selected project file could not be opened.',
    });
  }

  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      return fail({
        code: 'not-a-file',
        message: 'The selected project path is not a regular file.',
      });
    }
    if (!Number.isSafeInteger(metadata.size) || metadata.size < 0 || metadata.size > maxBytes) {
      return fail({
        code: 'file-too-large',
        message: 'The selected project file exceeds the supported size limit.',
      });
    }

    const snapshot = await readFixedSnapshot(handle, metadata.size);
    if (!snapshot.ok) {
      return fail({
        code: 'file-changed-during-read',
        message: 'The project file changed while it was being read; no data was accepted.',
      });
    }
    return { ok: true, value: copyBytes(snapshot.bytes) };
  } catch {
    return fail({ code: 'read-failed', message: 'The selected project file could not be read.' });
  } finally {
    await handle.close().catch(() => undefined);
  }
};

export const writeProjectArchiveFileAtomically = async (
  targetPath: unknown,
  input: unknown,
): Promise<WriteProjectArchiveResult> =>
  writeBoundedFileAtomically(targetPath, input, MAX_PROJECT_ARCHIVE_BYTES);

export const writeBoundedFileAtomically = async (
  targetPath: unknown,
  input: unknown,
  maxBytes: number,
): Promise<WriteProjectArchiveResult> => {
  if (!isValidAbsoluteFilePath(targetPath)) {
    return fail({
      code: 'invalid-file-path',
      message: 'A project file path must be an absolute file path.',
    });
  }
  if (!isUint8Array(input)) {
    return fail({
      code: 'write-failed',
      message: 'Project file output must be provided as binary data.',
    });
  }
  if (input.byteLength > maxBytes) {
    return fail({
      code: 'file-too-large',
      message: 'The project file exceeds the supported size limit.',
    });
  }

  const bytes = copyBytes(input);

  try {
    const targetMetadata = await lstat(targetPath);
    if (!targetMetadata.isFile()) {
      return fail({
        code: 'not-a-file',
        message: 'The project destination is not a regular file.',
      });
    }
  } catch (error) {
    if (!isNodeErrorCode(error, 'ENOENT')) {
      return fail({
        code: 'write-failed',
        message: 'The project destination could not be checked safely.',
      });
    }
  }

  const temporaryPath = createSiblingWorkPath(targetPath, 'temporary');
  const backupPath = createSiblingWorkPath(targetPath, 'backup');
  let temporaryExists = false;
  let preserveTemporary = false;

  try {
    let handle: FileHandle;
    try {
      handle = await open(temporaryPath, 'wx', 0o600);
      temporaryExists = true;
    } catch {
      return fail({
        code: 'temporary-file-failed',
        message: 'A temporary project file could not be created beside the destination.',
      });
    }

    try {
      await writeAll(handle, bytes);
      await handle.sync();
    } catch {
      return fail({
        code: 'write-failed',
        message: 'The temporary project file could not be written and flushed.',
      });
    } finally {
      await handle.close().catch(() => undefined);
    }

    const operations: AtomicReplaceOperations = {
      isRegularFile: async (filePath) => (await lstat(filePath)).isFile(),
      rename,
      unlink,
    };
    const replacement = await replaceFileSafely(temporaryPath, targetPath, backupPath, operations);
    if (!replacement.ok) {
      preserveTemporary = replacement.error.preserveSource;
      return fail({
        code: replacement.error.code,
        message: replacement.error.message,
        ...(replacement.error.recoveryPaths === undefined
          ? {}
          : { recoveryPaths: replacement.error.recoveryPaths }),
      });
    }
    temporaryExists = false;

    try {
      await syncParentDirectory(path.dirname(targetPath));
    } catch {
      return fail({
        code: 'directory-sync-failed',
        message: 'The project file was replaced, but its directory could not be flushed safely.',
        recoveryPath: targetPath,
      });
    }
    return {
      ok: true,
      value: replacement.warning === undefined ? {} : { warning: replacement.warning },
    };
  } finally {
    if (temporaryExists && !preserveTemporary) {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
};
