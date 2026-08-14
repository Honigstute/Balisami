import { unzip, zip, type AsyncZippable, type UnzipFileInfo } from 'fflate';

import type { ProjectDocument } from '../../domain';
import { copyBytes, isUint8Array } from './binary';
import {
  decodeProjectFileEnvelope,
  encodeProjectFileEnvelope,
  getProjectFileEntryByteLimit,
  MAX_PROJECT_FILE_ENTRY_COUNT,
  MAX_PROJECT_FILE_TOTAL_BYTES,
  type DecodedProjectFile,
  type ProjectFileCodecError,
} from './codec';
import { isProjectAssetEntryPath } from './manifest';

// Includes room for ZIP headers and filenames on top of the uncompressed logical limit.
export const MAX_PROJECT_ARCHIVE_BYTES =
  MAX_PROJECT_FILE_TOTAL_BYTES + MAX_PROJECT_FILE_ENTRY_COUNT * 512 + 64 * 1_024;

export type ProjectArchiveErrorCode =
  'archive-too-large' | 'archive-write-failed' | 'invalid-archive' | 'invalid-archive-bytes';

export interface ProjectArchiveError {
  readonly code: ProjectArchiveErrorCode;
  readonly message: string;
  readonly actualBytes?: number;
  readonly maxBytes?: number;
}

export type ProjectFileOperationError = ProjectArchiveError | ProjectFileCodecError;

export type EncodeProjectFileArchiveResult =
  | { readonly ok: true; readonly value: Uint8Array }
  | { readonly ok: false; readonly error: ProjectFileOperationError };

export type DecodeProjectFileArchiveResult =
  | { readonly ok: true; readonly value: DecodedProjectFile }
  | { readonly ok: false; readonly error: ProjectFileOperationError };

const fail = (
  error: ProjectFileOperationError,
): { readonly ok: false; readonly error: ProjectFileOperationError } => ({ ok: false, error });

const createFixedZipDate = (): Date => new Date(1980, 0, 1, 0, 0, 0, 0);

const compressEnvelope = (data: AsyncZippable): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    try {
      zip(data, { level: 6, mtime: createFixedZipDate(), os: 0, attrs: 0 }, (error, bytes) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(copyBytes(bytes));
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error('ZIP compression failed.'));
    }
  });

interface ArchivePreflight {
  readonly filter: (file: UnzipFileInfo) => boolean;
  readonly getError: () => ProjectFileCodecError | undefined;
}

const createArchivePreflight = (): ArchivePreflight => {
  const seenPaths = new Set<string>();
  let entryCount = 0;
  let totalBytes = 0;
  let error: ProjectFileCodecError | undefined;

  return {
    filter: (file) => {
      if (error !== undefined) {
        return false;
      }
      entryCount += 1;
      if (entryCount > MAX_PROJECT_FILE_ENTRY_COUNT) {
        error = {
          code: 'too-many-entries',
          message: `Project files may contain at most ${String(MAX_PROJECT_FILE_ENTRY_COUNT)} entries.`,
        };
        return false;
      }
      if (seenPaths.has(file.name)) {
        error = {
          code: 'duplicate-entry',
          message: `Project file contains duplicate entry '${file.name}'.`,
          entryPath: file.name,
        };
        return false;
      }
      seenPaths.add(file.name);

      const maxBytes = getProjectFileEntryByteLimit(file.name);
      if (maxBytes === undefined) {
        error = {
          code: 'unexpected-entry',
          message: `Project file contains unsupported entry '${file.name}'.`,
          entryPath: file.name,
        };
        return false;
      }
      if (!Number.isSafeInteger(file.originalSize) || file.originalSize < 0) {
        error = {
          code: 'invalid-entry',
          message: `Project file entry '${file.name}' has an invalid expanded size.`,
          entryPath: file.name,
        };
        return false;
      }
      if (file.originalSize > maxBytes) {
        error = {
          code: 'entry-too-large',
          message: `Project file entry '${file.name}' exceeds its size limit.`,
          entryPath: file.name,
          actualBytes: file.originalSize,
          maxBytes,
        };
        return false;
      }
      totalBytes += file.originalSize;
      if (totalBytes > MAX_PROJECT_FILE_TOTAL_BYTES) {
        error = {
          code: 'total-too-large',
          message: 'Project file exceeds the total uncompressed size limit.',
          actualBytes: totalBytes,
          maxBytes: MAX_PROJECT_FILE_TOTAL_BYTES,
        };
        return false;
      }
      return true;
    },
    getError: () => error,
  };
};

const expandArchive = (
  bytes: Uint8Array,
): Promise<
  | { readonly ok: true; readonly entries: Readonly<Record<string, Uint8Array>> }
  | { readonly ok: false; readonly error: ProjectFileOperationError }
> => {
  const preflight = createArchivePreflight();
  return new Promise((resolve) => {
    try {
      unzip(copyBytes(bytes), { filter: preflight.filter }, (archiveError, entries) => {
        const validationError = preflight.getError();
        if (validationError !== undefined) {
          resolve(fail(validationError));
          return;
        }
        if (archiveError !== null) {
          resolve(
            fail({
              code: 'invalid-archive',
              message: 'Project file container is malformed, truncated, or unsupported.',
            }),
          );
          return;
        }
        resolve({ ok: true, entries });
      });
    } catch {
      resolve(
        fail({
          code: 'invalid-archive',
          message: 'Project file container is malformed, truncated, or unsupported.',
        }),
      );
    }
  });
};

export const encodeProjectFileArchive = async (
  document: ProjectDocument,
  assetsById: Readonly<Record<string, Uint8Array>> = {},
): Promise<EncodeProjectFileArchiveResult> => {
  const envelope = encodeProjectFileEnvelope(document, assetsById);
  if (!envelope.ok) {
    return envelope;
  }

  const zippable: AsyncZippable = Object.create(null) as AsyncZippable;
  for (const entry of envelope.value.entries) {
    zippable[entry.path] = [
      copyBytes(entry.bytes),
      {
        level: isProjectAssetEntryPath(entry.path) ? 0 : 6,
        mtime: createFixedZipDate(),
        os: 0,
        attrs: 0,
      },
    ];
  }

  let bytes: Uint8Array;
  try {
    bytes = await compressEnvelope(zippable);
  } catch {
    return fail({
      code: 'archive-write-failed',
      message: 'The project container could not be created.',
    });
  }
  if (bytes.byteLength > MAX_PROJECT_ARCHIVE_BYTES) {
    return fail({
      code: 'archive-too-large',
      message: 'The encoded project container exceeds its size limit.',
      actualBytes: bytes.byteLength,
      maxBytes: MAX_PROJECT_ARCHIVE_BYTES,
    });
  }
  return { ok: true, value: copyBytes(bytes) };
};

export const decodeProjectFileArchive = async (
  input: unknown,
): Promise<DecodeProjectFileArchiveResult> => {
  if (!isUint8Array(input)) {
    return fail({
      code: 'invalid-archive-bytes',
      message: 'Project container input must be a Uint8Array.',
    });
  }
  if (input.byteLength > MAX_PROJECT_ARCHIVE_BYTES) {
    return fail({
      code: 'archive-too-large',
      message: 'The selected project container exceeds its size limit.',
      actualBytes: input.byteLength,
      maxBytes: MAX_PROJECT_ARCHIVE_BYTES,
    });
  }

  const expanded = await expandArchive(input);
  if (!expanded.ok) {
    return expanded;
  }
  const envelope = {
    entries: Object.entries(expanded.entries).map(([path, bytes]) => ({ path, bytes })),
  };
  return decodeProjectFileEnvelope(envelope);
};
