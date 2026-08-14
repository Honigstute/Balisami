import path from 'node:path';

import { z } from 'zod';

import { decodeBoundedJson, encodeCanonicalJson, sha256Bytes } from '../../persistence';
import {
  readBoundedFile,
  writeBoundedFileAtomically,
  type ProjectFileStorageError,
} from '../files/project-file-storage';
import { isValidAbsoluteNonRootPath, isValidApplicationDataRoot } from '../files/path-validation';

export const RECENT_PROJECTS_FORMAT_ID = 'wireframe-recent-projects' as const;
export const RECENT_PROJECTS_FORMAT_VERSION = 1 as const;
export const MAX_RECENT_PROJECTS = 20;
export const MAX_RECENT_PROJECTS_BYTES = 64 * 1_024;
export const MAX_RECENT_PROJECT_PATH_LENGTH = 2_048;

const RECENT_PROJECTS_FILE_NAME = 'recent-projects-v1.json';
const RECENT_PROJECT_ID_PATTERN = /^[a-f0-9]{64}$/u;

/** Serializes mutations across every window/store instance in this main process. */
const recentProjectMutationTails = new Map<string, Promise<void>>();

const RecentProjectEntrySchema = z
  .strictObject({
    displayName: z.string().min(1).max(255),
    filePath: z.string().min(1).max(MAX_RECENT_PROJECT_PATH_LENGTH),
    id: z.string().regex(RECENT_PROJECT_ID_PATTERN),
    lastOpenedAtEpochMs: z.number().int().nonnegative().safe(),
  })
  .readonly();

const RecentProjectsFileV1Schema = z
  .strictObject({
    entries: z.array(RecentProjectEntrySchema).max(MAX_RECENT_PROJECTS),
    format: z.literal(RECENT_PROJECTS_FORMAT_ID),
    formatVersion: z.literal(RECENT_PROJECTS_FORMAT_VERSION),
  })
  .readonly();

export type RecentProjectEntry = z.infer<typeof RecentProjectEntrySchema>;

export type RecentProjectStoreErrorCode = 'invalid-recent-project' | 'recent-projects-corrupt';

export interface RecentProjectStoreError {
  readonly code: RecentProjectStoreErrorCode;
  readonly message: string;
}

export type RecentProjectStoreOperationError = ProjectFileStorageError | RecentProjectStoreError;

export type ListRecentProjectsResult =
  | { readonly ok: true; readonly value: readonly RecentProjectEntry[] }
  | { readonly ok: false; readonly error: RecentProjectStoreOperationError };

export interface UpdateRecentProjectsSuccess {
  readonly changed: boolean;
  readonly entries: readonly RecentProjectEntry[];
}

export type UpdateRecentProjectsResult =
  | { readonly ok: true; readonly value: UpdateRecentProjectsSuccess }
  | { readonly ok: false; readonly error: RecentProjectStoreOperationError };

const fail = <ErrorType extends RecentProjectStoreOperationError>(
  error: ErrorType,
): { readonly ok: false; readonly error: ErrorType } => ({ ok: false, error });

const isValidRecentFilePath = (value: unknown): value is string =>
  isValidAbsoluteNonRootPath(value) && value.length <= MAX_RECENT_PROJECT_PATH_LENGTH;

const normalizePath = (filePath: string): string => path.normalize(filePath);

const createPathIdentity = (filePath: string): string => {
  const normalized = normalizePath(filePath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
};

const createRecentProjectId = (filePath: string): string =>
  sha256Bytes(new TextEncoder().encode(createPathIdentity(filePath)));

const createDisplayName = (filePath: string): string => {
  const name = path.basename(filePath).trim();
  return (name.length === 0 ? 'Untitled project' : name).slice(0, 255);
};

const freezeEntries = (entries: readonly RecentProjectEntry[]): readonly RecentProjectEntry[] =>
  Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));

const runSerializedMutation = async <Result>(
  filePath: string,
  operation: () => Promise<Result>,
): Promise<Result> => {
  const prior = recentProjectMutationTails.get(filePath) ?? Promise.resolve();
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prior.then(() => gate);
  recentProjectMutationTails.set(filePath, tail);
  await prior;
  try {
    return await operation();
  } finally {
    release();
    if (recentProjectMutationTails.get(filePath) === tail) {
      recentProjectMutationTails.delete(filePath);
    }
  }
};

/** Versioned, bounded, non-authoritative metadata; project files remain the source of truth. */
export class RecentProjectStore {
  readonly #filePath: string;

  constructor(storageRoot: unknown) {
    if (!isValidApplicationDataRoot(storageRoot)) {
      throw new RangeError('Recent-project storage root is invalid.');
    }
    this.#filePath = path.join(storageRoot, RECENT_PROJECTS_FILE_NAME);
  }

  async list(): Promise<ListRecentProjectsResult> {
    const read = await readBoundedFile(this.#filePath, MAX_RECENT_PROJECTS_BYTES);
    if (!read.ok) {
      if (read.error.code === 'file-not-found') {
        return { ok: true, value: Object.freeze([]) };
      }
      return read;
    }
    const decoded = decodeBoundedJson(read.value);
    if (!decoded.ok) {
      return fail({
        code: 'recent-projects-corrupt',
        message: 'Recent-project metadata is malformed, truncated, or invalid UTF-8.',
      });
    }
    const parsed = RecentProjectsFileV1Schema.safeParse(decoded.value);
    if (!parsed.success) {
      return fail({
        code: 'recent-projects-corrupt',
        message: 'Recent-project metadata contains invalid or unsupported fields.',
      });
    }

    const seenIds = new Set<string>();
    for (const entry of parsed.data.entries) {
      if (
        !isValidRecentFilePath(entry.filePath) ||
        entry.id !== createRecentProjectId(entry.filePath) ||
        seenIds.has(entry.id)
      ) {
        return fail({
          code: 'recent-projects-corrupt',
          message: 'Recent-project metadata contains inconsistent path identities.',
        });
      }
      seenIds.add(entry.id);
    }
    return { ok: true, value: freezeEntries(parsed.data.entries) };
  }

  record(
    filePathInput: unknown,
    openedAtEpochMs = Date.now(),
  ): Promise<UpdateRecentProjectsResult> {
    return runSerializedMutation(this.#filePath, async () => {
      if (
        !isValidRecentFilePath(filePathInput) ||
        !Number.isSafeInteger(openedAtEpochMs) ||
        openedAtEpochMs < 0
      ) {
        return fail({
          code: 'invalid-recent-project',
          message: 'Recent-project metadata requires an absolute path and valid timestamp.',
        });
      }
      const current = await this.list();
      if (!current.ok) {
        return current;
      }

      const filePath = normalizePath(filePathInput);
      const id = createRecentProjectId(filePath);
      const entry = RecentProjectEntrySchema.parse({
        displayName: createDisplayName(filePath),
        filePath,
        id,
        lastOpenedAtEpochMs: openedAtEpochMs,
      });
      const entries = freezeEntries(
        [entry, ...current.value.filter((candidate) => candidate.id !== id)].slice(
          0,
          MAX_RECENT_PROJECTS,
        ),
      );
      return this.#write(entries);
    });
  }

  forget(idInput: unknown): Promise<UpdateRecentProjectsResult> {
    return runSerializedMutation(this.#filePath, async () => {
      if (typeof idInput !== 'string' || !RECENT_PROJECT_ID_PATTERN.test(idInput)) {
        return fail({
          code: 'invalid-recent-project',
          message: 'The recent-project identity is invalid.',
        });
      }
      const current = await this.list();
      if (!current.ok) {
        return current;
      }
      const entries = freezeEntries(current.value.filter((entry) => entry.id !== idInput));
      if (entries.length === current.value.length) {
        return { ok: true, value: Object.freeze({ changed: false, entries }) };
      }
      return this.#write(entries);
    });
  }

  async #write(entries: readonly RecentProjectEntry[]): Promise<UpdateRecentProjectsResult> {
    const bytes = encodeCanonicalJson({
      entries,
      format: RECENT_PROJECTS_FORMAT_ID,
      formatVersion: RECENT_PROJECTS_FORMAT_VERSION,
    });
    const written = await writeBoundedFileAtomically(
      this.#filePath,
      bytes,
      MAX_RECENT_PROJECTS_BYTES,
    );
    return written.ok ? { ok: true, value: Object.freeze({ changed: true, entries }) } : written;
  }
}
