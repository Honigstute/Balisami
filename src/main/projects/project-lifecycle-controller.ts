import { parseProjectDocument, type HistorySaveSnapshot, type ProjectDocument } from '../../domain';
import {
  openProjectFile,
  type OpenProjectFileResult,
  type ProjectFileServiceError,
} from '../files/project-file-service';
import { isValidApplicationDataRoot } from '../files/path-validation';
import {
  ProjectPersistenceSession,
  type CloseProjectSessionResult,
  type ProjectPersistenceSessionOperationError,
  type ProjectPersistenceSessionServices,
  type ProjectPersistenceSessionStatus,
  type ProjectSessionCloseMode,
  type SaveProjectSessionResult,
  type ScheduleProjectSessionRecoveryResult,
} from './project-persistence-session';
import type { RecoveryAutosaveClock } from '../recovery/recovery-autosave-scheduler';
import {
  clearRecoverySnapshot,
  discoverRecoverySnapshots,
  loadRecoverySnapshot,
  recoveryPointersAreEqual,
  type DiscoverRecoverySnapshotsResult,
  type ProjectRecoverySnapshot,
  type RecoveryOperationError,
} from '../recovery/recovery-journal';
import { RecoveryPointerV1Schema, type RecoveryPointerV1 } from '../recovery/recovery-schema';

export interface ProjectLifecycleServices {
  readonly clearRecovery: typeof clearRecoverySnapshot;
  readonly discoverRecoveries: typeof discoverRecoverySnapshots;
  readonly loadRecovery: typeof loadRecoverySnapshot;
  readonly openProject: typeof openProjectFile;
}

export interface ProjectLifecycleControllerOptions {
  readonly recoveryRoot: string;
  readonly autosaveClock?: RecoveryAutosaveClock;
  readonly autosaveDebounceMs?: number;
  readonly services?: Partial<ProjectLifecycleServices>;
  readonly sessionServices?: Partial<ProjectPersistenceSessionServices>;
}

export type ProjectLifecycleErrorCode =
  | 'active-project-exists'
  | 'invalid-project'
  | 'invalid-recovery-pointer'
  | 'no-active-project'
  | 'recovery-changed';

export interface ProjectLifecycleError {
  readonly code: ProjectLifecycleErrorCode;
  readonly message: string;
  readonly cause?: ProjectFileServiceError | RecoveryOperationError;
}

export type ProjectLifecycleOperationError =
  | ProjectFileServiceError
  | ProjectLifecycleError
  | ProjectPersistenceSessionOperationError
  | RecoveryOperationError;

export type ActivatedProjectSource = 'new' | 'project-file' | 'recovery';

export interface ActivatedProject {
  readonly assetsById: Readonly<Record<string, Uint8Array>>;
  readonly document: ProjectDocument;
  readonly filePath: string | null;
  readonly recoveryPointer?: RecoveryPointerV1;
  readonly recoverySourceFilePath?: string | null;
  readonly source: ActivatedProjectSource;
}

/** Immutable, validated file candidate held only while a replacement decision is in progress. */
export interface PreparedProjectFile {
  readonly assetsById: Readonly<Record<string, Uint8Array>>;
  readonly document: ProjectDocument;
  readonly filePath: string;
}

export type PrepareProjectFileResult =
  | { readonly ok: true; readonly value: PreparedProjectFile }
  | { readonly ok: false; readonly error: ProjectLifecycleOperationError };

export type ActivateProjectResult =
  | { readonly ok: true; readonly value: ActivatedProject }
  | { readonly ok: false; readonly error: ProjectLifecycleOperationError };

export type DiscardRecoveryResult =
  | Awaited<ReturnType<typeof clearRecoverySnapshot>>
  | {
      readonly ok: false;
      readonly error: ProjectLifecycleError;
    };

export type ScheduleActiveProjectRecoveryResult =
  | ScheduleProjectSessionRecoveryResult
  | { readonly ok: false; readonly error: ProjectLifecycleError };

export type SaveActiveProjectResult =
  SaveProjectSessionResult | { readonly ok: false; readonly error: ProjectLifecycleError };

const defaultServices: ProjectLifecycleServices = Object.freeze({
  clearRecovery: clearRecoverySnapshot,
  discoverRecoveries: discoverRecoverySnapshots,
  loadRecovery: loadRecoverySnapshot,
  openProject: openProjectFile,
});

const fail = <ErrorType extends ProjectLifecycleOperationError>(
  error: ErrorType,
): { readonly ok: false; readonly error: ErrorType } => ({ ok: false, error });

/**
 * Owns one window's persistence lifecycle. It coordinates native durability
 * services while leaving the renderer/history layer as the document authority.
 */
export class ProjectLifecycleController {
  readonly #autosaveClock: RecoveryAutosaveClock | undefined;
  readonly #autosaveDebounceMs: number | undefined;
  readonly #recoveryRoot: string;
  readonly #services: ProjectLifecycleServices;
  readonly #sessionServices: Partial<ProjectPersistenceSessionServices> | undefined;

  #activeSession: ProjectPersistenceSession | undefined;

  constructor(options: ProjectLifecycleControllerOptions) {
    if (!isValidApplicationDataRoot(options.recoveryRoot)) {
      throw new RangeError('Project lifecycle recovery root is invalid.');
    }
    this.#recoveryRoot = options.recoveryRoot;
    this.#autosaveClock = options.autosaveClock;
    this.#autosaveDebounceMs = options.autosaveDebounceMs;
    this.#services = Object.freeze({ ...defaultServices, ...options.services });
    this.#sessionServices = options.sessionServices;
  }

  discoverRecoveries(): Promise<DiscoverRecoverySnapshotsResult> {
    return this.#services.discoverRecoveries(this.#recoveryRoot);
  }

  startNewProject(
    documentInput: unknown,
    assetsById: Readonly<Record<string, Uint8Array>> = {},
  ): ActivateProjectResult {
    const inactive = this.#requireInactive();
    if (!inactive.ok) {
      return inactive;
    }
    const document = parseProjectDocument(documentInput);
    if (!document.ok) {
      return fail({
        code: 'invalid-project',
        message: 'A new project must satisfy the complete project document contract.',
      });
    }
    return this.#activate(document.value, assetsById, 'new', null);
  }

  async openProject(filePath: string): Promise<ActivateProjectResult> {
    const inactive = this.#requireInactive();
    if (!inactive.ok) {
      return inactive;
    }
    const prepared = await this.prepareProjectFile(filePath);
    return prepared.ok ? this.activatePreparedProject(prepared.value) : prepared;
  }

  /** Validates a file without replacing or authorizing the active session. */
  async prepareProjectFile(filePath: string): Promise<PrepareProjectFileResult> {
    const opened: OpenProjectFileResult = await this.#services.openProject(filePath);
    if (!opened.ok) {
      return opened;
    }
    return {
      ok: true,
      value: Object.freeze({
        assetsById: opened.value.assetsById,
        document: opened.value.document,
        filePath,
      }),
    };
  }

  /** Activates only a candidate that already passed the bounded file codec. */
  activatePreparedProject(prepared: PreparedProjectFile): ActivateProjectResult {
    const inactive = this.#requireInactive();
    if (!inactive.ok) {
      return inactive;
    }
    return this.#activate(
      prepared.document,
      prepared.assetsById,
      'project-file',
      prepared.filePath,
    );
  }

  async restoreRecovery(expectedPointerInput: unknown): Promise<ActivateProjectResult> {
    const inactive = this.#requireInactive();
    if (!inactive.ok) {
      return inactive;
    }
    const expectedPointer = RecoveryPointerV1Schema.safeParse(expectedPointerInput);
    if (!expectedPointer.success) {
      return fail({
        code: 'invalid-recovery-pointer',
        message: 'The selected recovery pointer is invalid or unsupported.',
      });
    }

    const loaded = await this.#services.loadRecovery(
      this.#recoveryRoot,
      expectedPointer.data.projectId,
    );
    if (!loaded.ok) {
      return loaded;
    }
    if (!recoveryPointersAreEqual(loaded.value.pointer, expectedPointer.data)) {
      return fail({
        code: 'recovery-changed',
        message: 'The selected recovery changed before it could be restored.',
      });
    }

    return this.#activate(
      loaded.value.document,
      loaded.value.assetsById,
      'recovery',
      null,
      loaded.value.pointer,
      loaded.value.pointer.sourceFilePath,
    );
  }

  discardRecovery(expectedPointerInput: unknown): Promise<DiscardRecoveryResult> {
    const expectedPointer = RecoveryPointerV1Schema.safeParse(expectedPointerInput);
    if (!expectedPointer.success) {
      return Promise.resolve(
        fail({
          code: 'invalid-recovery-pointer',
          message: 'The recovery point to discard is invalid or unsupported.',
        }),
      );
    }
    if (this.#activeSession?.getStatus().projectId === expectedPointer.data.projectId) {
      return Promise.resolve(
        fail({
          code: 'active-project-exists',
          message: 'Close the active project before discarding its recovery point.',
        }),
      );
    }
    return this.#services.clearRecovery(this.#recoveryRoot, expectedPointer.data);
  }

  scheduleRecovery(
    snapshot: ProjectRecoverySnapshot,
    assetsById: Readonly<Record<string, Uint8Array>> = {},
  ): ScheduleActiveProjectRecoveryResult {
    if (this.#activeSession === undefined) {
      return fail({ code: 'no-active-project', message: 'No project session is active.' });
    }
    return this.#activeSession.scheduleRecovery(snapshot, assetsById);
  }

  saveActiveProject(
    snapshot: HistorySaveSnapshot,
    assetsById: Readonly<Record<string, Uint8Array>> = {},
    requestedFilePath?: string,
  ): Promise<SaveActiveProjectResult> {
    if (this.#activeSession === undefined) {
      return Promise.resolve(
        fail({ code: 'no-active-project', message: 'No project session is active.' }),
      );
    }
    return this.#activeSession.save(snapshot, assetsById, requestedFilePath);
  }

  async closeActiveProject(mode: ProjectSessionCloseMode): Promise<CloseProjectSessionResult> {
    if (this.#activeSession === undefined) {
      return {
        ok: true,
        value: Object.freeze({ alreadyClosed: true, warnings: Object.freeze([]) }),
      };
    }
    const closed = await this.#activeSession.close(mode);
    if (closed.ok) {
      this.#activeSession = undefined;
    }
    return closed;
  }

  getActiveStatus(): ProjectPersistenceSessionStatus | undefined {
    return this.#activeSession?.getStatus();
  }

  #activate(
    document: ProjectDocument,
    assetsById: Readonly<Record<string, Uint8Array>>,
    source: ActivatedProjectSource,
    filePath: string | null,
    recoveryPointer?: RecoveryPointerV1,
    recoverySourceFilePath?: string | null,
  ): ActivateProjectResult {
    this.#activeSession = new ProjectPersistenceSession({
      projectId: document.id,
      recoveryRoot: this.#recoveryRoot,
      initialFilePath: filePath,
      ...(recoveryPointer === undefined ? {} : { initialRecoveryPointer: recoveryPointer }),
      ...(this.#autosaveClock === undefined ? {} : { autosaveClock: this.#autosaveClock }),
      ...(this.#autosaveDebounceMs === undefined
        ? {}
        : { autosaveDebounceMs: this.#autosaveDebounceMs }),
      ...(this.#sessionServices === undefined ? {} : { services: this.#sessionServices }),
    });
    return {
      ok: true,
      value: Object.freeze({
        document,
        assetsById,
        filePath,
        source,
        ...(recoveryPointer === undefined ? {} : { recoveryPointer }),
        ...(recoverySourceFilePath === undefined ? {} : { recoverySourceFilePath }),
      }),
    };
  }

  #requireInactive():
    { readonly ok: true } | { readonly ok: false; readonly error: ProjectLifecycleError } {
    return this.#activeSession === undefined
      ? { ok: true }
      : fail({
          code: 'active-project-exists',
          message: 'The active project must close before another project can open.',
        });
  }
}
