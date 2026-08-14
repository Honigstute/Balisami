import { ProjectIdSchema, type HistorySaveSnapshot, type ProjectId } from '../../domain';
import {
  saveProjectHistorySnapshot,
  type ProjectFileServiceError,
  type SavedProjectHistorySnapshot,
} from '../files/project-file-service';
import { isValidApplicationDataRoot } from '../files/path-validation';
import {
  RecoveryAutosaveScheduler,
  type RecoveryAutosaveClock,
  type RecoveryAutosaveError,
  type RecoveryAutosaveStatus,
  type ScheduleRecoveryAutosaveResult,
} from '../recovery/recovery-autosave-scheduler';
import {
  clearRecoverySnapshot,
  writeRecoverySnapshot,
  type ProjectRecoverySnapshot,
  type RecoveryOperationError,
} from '../recovery/recovery-journal';
import { RecoveryPointerV1Schema, type RecoveryPointerV1 } from '../recovery/recovery-schema';

const MAX_SESSION_WARNINGS = 5;

export interface ProjectPersistenceSessionServices {
  readonly clearRecovery: typeof clearRecoverySnapshot;
  readonly saveHistorySnapshot: typeof saveProjectHistorySnapshot;
  readonly writeRecovery: typeof writeRecoverySnapshot;
}

export interface ProjectPersistenceSessionOptions {
  readonly projectId: ProjectId;
  readonly recoveryRoot: string;
  readonly initialFilePath?: string | null;
  readonly initialRecoveryPointer?: RecoveryPointerV1;
  readonly autosaveClock?: RecoveryAutosaveClock;
  readonly autosaveDebounceMs?: number;
  readonly services?: Partial<ProjectPersistenceSessionServices>;
}

export type ProjectPersistenceSessionErrorCode =
  | 'file-path-required'
  | 'project-mismatch'
  | 'recovery-close-failed'
  | 'save-in-progress'
  | 'session-closed';

export interface ProjectPersistenceSessionError {
  readonly code: ProjectPersistenceSessionErrorCode;
  readonly message: string;
  readonly cause?: ProjectFileServiceError | RecoveryAutosaveError | RecoveryOperationError;
}

export type ProjectPersistenceSessionOperationError =
  ProjectFileServiceError | ProjectPersistenceSessionError | RecoveryAutosaveError;

export type ProjectPersistenceSessionWarningCode =
  'recovery-after-save-failed' | 'recovery-clear-failed' | 'recovery-cleanup-warning';

export interface ProjectPersistenceSessionWarning {
  readonly code: ProjectPersistenceSessionWarningCode;
  readonly message: string;
}

export interface SavedProjectSessionSnapshot extends SavedProjectHistorySnapshot {
  readonly filePath: string;
  readonly recoveryWarnings: readonly ProjectPersistenceSessionWarning[];
}

export type SaveProjectSessionResult =
  | { readonly ok: true; readonly value: SavedProjectSessionSnapshot }
  | { readonly ok: false; readonly error: ProjectPersistenceSessionOperationError };

export type ScheduleProjectSessionRecoveryResult =
  | ScheduleRecoveryAutosaveResult
  | { readonly ok: false; readonly error: ProjectPersistenceSessionError };

export type ProjectSessionCloseMode = 'discard-recovery' | 'retain-recovery';

export interface ClosedProjectSession {
  readonly alreadyClosed: boolean;
  readonly warnings: readonly ProjectPersistenceSessionWarning[];
}

export type CloseProjectSessionResult =
  | { readonly ok: true; readonly value: ClosedProjectSession }
  | { readonly ok: false; readonly error: ProjectPersistenceSessionError };

export interface ProjectPersistenceSessionStatus {
  readonly autosave: RecoveryAutosaveStatus;
  readonly closed: boolean;
  readonly filePath: string | null;
  readonly projectId: ProjectId;
  readonly saveInProgress: boolean;
}

const defaultServices: ProjectPersistenceSessionServices = Object.freeze({
  clearRecovery: clearRecoverySnapshot,
  saveHistorySnapshot: saveProjectHistorySnapshot,
  writeRecovery: writeRecoverySnapshot,
});

const fail = <ErrorType extends ProjectPersistenceSessionOperationError>(
  error: ErrorType,
): { readonly ok: false; readonly error: ErrorType } => ({ ok: false, error });

const appendWarning = (
  warnings: ProjectPersistenceSessionWarning[],
  warning: ProjectPersistenceSessionWarning,
): void => {
  if (
    warnings.length < MAX_SESSION_WARNINGS &&
    !warnings.some(
      (current) => current.code === warning.code && current.message === warning.message,
    )
  ) {
    warnings.push(Object.freeze(warning));
  }
};

/**
 * Coordinates durable state for one project without becoming a second document
 * store. The renderer/history layer remains authoritative and submits frozen
 * state-ID snapshots for save or recovery.
 */
export class ProjectPersistenceSession {
  readonly #autosave: RecoveryAutosaveScheduler;
  readonly #projectId: ProjectId;
  readonly #recoveryRoot: string;
  readonly #services: ProjectPersistenceSessionServices;

  #closed = false;
  #filePath: string | null;
  #lastRecoveryPointer: RecoveryPointerV1 | undefined;
  #saveInProgress = false;

  constructor(options: ProjectPersistenceSessionOptions) {
    const projectId = ProjectIdSchema.safeParse(options.projectId);
    const initialPointer =
      options.initialRecoveryPointer === undefined
        ? undefined
        : RecoveryPointerV1Schema.safeParse(options.initialRecoveryPointer);
    if (
      !projectId.success ||
      !isValidApplicationDataRoot(options.recoveryRoot) ||
      (options.initialFilePath !== undefined &&
        options.initialFilePath !== null &&
        typeof options.initialFilePath !== 'string') ||
      (initialPointer !== undefined &&
        (!initialPointer.success || initialPointer.data.projectId !== projectId.data))
    ) {
      throw new RangeError('Project persistence session configuration is invalid.');
    }

    this.#projectId = projectId.data;
    this.#recoveryRoot = options.recoveryRoot;
    this.#filePath = options.initialFilePath ?? null;
    this.#lastRecoveryPointer = initialPointer?.success ? initialPointer.data : undefined;
    this.#services = Object.freeze({ ...defaultServices, ...options.services });
    this.#autosave = new RecoveryAutosaveScheduler({
      projectId: this.#projectId,
      write: async (request) => {
        const written = await this.#services.writeRecovery(
          this.#recoveryRoot,
          request.snapshot,
          request.assetsById,
          request.options,
        );
        if (written.ok) {
          this.#lastRecoveryPointer = written.value.pointer;
        }
        return written;
      },
      ...(options.autosaveClock === undefined ? {} : { clock: options.autosaveClock }),
      ...(options.autosaveDebounceMs === undefined
        ? {}
        : { debounceMs: options.autosaveDebounceMs }),
    });
  }

  scheduleRecovery(
    snapshot: ProjectRecoverySnapshot,
    assetsById: Readonly<Record<string, Uint8Array>> = {},
  ): ScheduleProjectSessionRecoveryResult {
    if (this.#closed) {
      return fail({ code: 'session-closed', message: 'The project session is already closed.' });
    }
    if (snapshot.document.id !== this.#projectId) {
      return fail({
        code: 'project-mismatch',
        message: 'The recovery snapshot belongs to a different project session.',
      });
    }
    return this.#autosave.schedule({
      snapshot,
      assetsById,
      sourceFilePath: this.#filePath,
    });
  }

  async save(
    snapshot: HistorySaveSnapshot,
    assetsById: Readonly<Record<string, Uint8Array>> = {},
    requestedFilePath?: string,
  ): Promise<SaveProjectSessionResult> {
    if (this.#closed) {
      return fail({ code: 'session-closed', message: 'The project session is already closed.' });
    }
    if (this.#saveInProgress) {
      return fail({
        code: 'save-in-progress',
        message: 'A project save is already in progress for this session.',
      });
    }
    if (snapshot.document.id !== this.#projectId) {
      return fail({
        code: 'project-mismatch',
        message: 'The save snapshot belongs to a different project session.',
      });
    }
    const filePath = requestedFilePath ?? this.#filePath;
    if (filePath === null) {
      return fail({
        code: 'file-path-required',
        message: 'A destination must be chosen before this project can be saved.',
      });
    }

    this.#saveInProgress = true;
    try {
      const saved = await this.#services.saveHistorySnapshot(filePath, snapshot, assetsById);
      if (!saved.ok) {
        return saved;
      }
      this.#filePath = filePath;

      const recoveryWarnings: ProjectPersistenceSessionWarning[] = [];
      const flushed = await this.#autosave.flush();
      if (!flushed.ok) {
        appendWarning(recoveryWarnings, {
          code: 'recovery-after-save-failed',
          message: 'The project file was saved, but recovery state could not be refreshed.',
        });
      } else {
        await this.#clearRecoveryMatchingArchive(
          saved.value.archiveSha256,
          saved.value.archiveByteLength,
          recoveryWarnings,
        );
      }

      return {
        ok: true,
        value: Object.freeze({
          ...saved.value,
          filePath,
          recoveryWarnings: Object.freeze(recoveryWarnings),
        }),
      };
    } finally {
      this.#saveInProgress = false;
    }
  }

  async close(mode: ProjectSessionCloseMode): Promise<CloseProjectSessionResult> {
    if (this.#closed) {
      return {
        ok: true,
        value: Object.freeze({ alreadyClosed: true, warnings: Object.freeze([]) }),
      };
    }
    if (this.#saveInProgress) {
      return fail({
        code: 'save-in-progress',
        message: 'The project session cannot close while its user-file save is in progress.',
      });
    }

    const shutdown = await this.#autosave.shutdown(
      mode === 'retain-recovery' ? 'flush' : 'discard',
    );
    if (!shutdown.ok) {
      return fail({
        code: 'recovery-close-failed',
        message: 'The latest recovery state could not be secured before closing.',
        cause: shutdown.error,
      });
    }

    const warnings: ProjectPersistenceSessionWarning[] = [];
    if (mode === 'discard-recovery') {
      await this.#clearLastRecovery(warnings);
    }
    this.#closed = true;
    return {
      ok: true,
      value: Object.freeze({ alreadyClosed: false, warnings: Object.freeze(warnings) }),
    };
  }

  getStatus(): ProjectPersistenceSessionStatus {
    return Object.freeze({
      autosave: this.#autosave.getStatus(),
      closed: this.#closed,
      filePath: this.#filePath,
      projectId: this.#projectId,
      saveInProgress: this.#saveInProgress,
    });
  }

  async #clearRecoveryMatchingArchive(
    archiveSha256: string,
    archiveByteLength: number,
    warnings: ProjectPersistenceSessionWarning[],
  ): Promise<void> {
    if (
      this.#lastRecoveryPointer?.archiveSha256 === archiveSha256 &&
      this.#lastRecoveryPointer.archiveByteLength === archiveByteLength
    ) {
      await this.#clearLastRecovery(warnings);
    }
  }

  async #clearLastRecovery(warnings: ProjectPersistenceSessionWarning[]): Promise<void> {
    const pointer = this.#lastRecoveryPointer;
    if (pointer === undefined) {
      return;
    }
    const cleared = await this.#services.clearRecovery(this.#recoveryRoot, pointer);
    if (!cleared.ok) {
      appendWarning(warnings, {
        code: 'recovery-clear-failed',
        message: 'The durable project is safe, but its prior recovery point remains.',
      });
      return;
    }
    this.#lastRecoveryPointer = undefined;
    if (cleared.value.warnings.length > 0) {
      appendWarning(warnings, {
        code: 'recovery-cleanup-warning',
        message: 'The recovery point was cleared, but temporary recovery debris remains.',
      });
    }
  }
}
