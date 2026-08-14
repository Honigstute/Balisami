import path from 'node:path';

import type { HistorySaveSnapshot, HistoryStateId, ProjectDocument } from '../../domain';
import type {
  RecentProjectSummary,
  UserOperationProblem,
  UserOperationResult,
  UserOperationWarning,
} from '../../shared/user-operation';
import {
  createSuggestedProjectFileName,
  type NativeProjectDialogs,
} from '../dialogs/project-dialogs';
import type {
  ProjectLifecycleController,
  ProjectLifecycleOperationError,
} from './project-lifecycle-controller';
import type { RecentProjectStore, RecentProjectEntry } from '../recent/recent-project-store';

const MAX_OPERATION_WARNINGS = 3;

export interface NativeOpenedProject {
  readonly assetsById: Readonly<Record<string, Uint8Array>>;
  readonly displayName: string;
  readonly document: ProjectDocument;
  readonly source: 'new' | 'project-file' | 'recovery';
}

export interface NativeSavedProject {
  readonly displayName: string;
  readonly stateId: HistorySaveSnapshot['stateId'];
  readonly tokenId: HistorySaveSnapshot['tokenId'];
}

export interface NativeScheduledRecovery {
  readonly scheduled: boolean;
  readonly stateId: HistoryStateId;
}

export interface NativeClosedProject {
  readonly closed: true;
  readonly discarded: boolean;
  readonly saved: boolean;
}

export interface NativeCloseRequest {
  readonly assetsById?: Readonly<Record<string, Uint8Array>>;
  readonly dirty: boolean;
  readonly projectDisplayName: string;
  readonly saveSnapshot?: HistorySaveSnapshot;
}

export type NativeProjectFailureReporter = (
  scope: 'close' | 'open' | 'recent' | 'recovery' | 'save',
  error: unknown,
) => void;

export interface ProjectNativeWorkflowOptions {
  readonly dialogs: NativeProjectDialogs;
  readonly lifecycle: ProjectLifecycleController;
  readonly recentProjects: RecentProjectStore;
  readonly reportFailure?: NativeProjectFailureReporter;
}

const completed = <Value>(
  value: Value,
  warnings: readonly UserOperationWarning[] = [],
): UserOperationResult<Value> => ({
  status: 'completed',
  value,
  warnings: Object.freeze([...warnings]),
});

const failed = <Value>(problem: UserOperationProblem): UserOperationResult<Value> => ({
  status: 'failed',
  problem: Object.freeze(problem),
});

const OPERATION_IN_PROGRESS_PROBLEM: UserOperationProblem = Object.freeze({
  code: 'operation-in-progress',
  title: 'Finish the current action',
  message: 'Another file or close action is already in progress.',
});

const INVALID_DIALOG_PROBLEM: UserOperationProblem = Object.freeze({
  code: 'invalid-dialog-response',
  title: 'The system dialog did not finish correctly',
  message: 'No project was changed. Please try the action again.',
});

const UNEXPECTED_NATIVE_PROBLEM: UserOperationProblem = Object.freeze({
  code: 'unexpected-native-failure',
  title: 'The desktop action could not finish',
  message: 'No project was closed or replaced. Please try again.',
});

const createDisplayName = (filePath: string): string => {
  const displayName = path.basename(filePath).trim();
  return (displayName.length === 0 ? 'Untitled project' : displayName).slice(0, 255);
};

const createOpenProblem = (error: ProjectLifecycleOperationError): UserOperationProblem => {
  if (error.code === 'file-not-found') {
    return {
      code: 'open-failed',
      title: 'Project file not found',
      message: 'The project may have been moved or deleted. Choose another file.',
    };
  }
  if (error.code === 'newer-version') {
    return {
      code: 'open-failed',
      title: 'This project needs a newer app version',
      message: 'The source file was kept unchanged.',
    };
  }
  if (error.code === 'active-project-exists') {
    return {
      code: 'open-failed',
      title: 'Close the current project first',
      message: 'The current project remains open and unchanged.',
    };
  }
  return {
    code: 'open-failed',
    title: 'The project could not be opened safely',
    message: 'The source file was kept unchanged. Choose another project or retry.',
  };
};

const createSaveProblem = (): UserOperationProblem => ({
  code: 'save-failed',
  title: 'The project could not be saved',
  message: 'Your work remains open. Choose another destination or try again.',
});

const createCloseProblem = (): UserOperationProblem => ({
  code: 'close-failed',
  title: 'The project could not close safely',
  message: 'The project remains open. Resolve the save or recovery problem and retry.',
});

const createRecoveryProblem = (): UserOperationProblem => ({
  code: 'recovery-failed',
  title: 'Recovery could not be prepared',
  message: 'Keep the project open and retry before closing the app.',
});

const appendWarning = (warnings: UserOperationWarning[], warning: UserOperationWarning): void => {
  if (
    warnings.length < MAX_OPERATION_WARNINGS &&
    !warnings.some((current) => current.code === warning.code)
  ) {
    warnings.push(Object.freeze(warning));
  }
};

const toRecentSummary = ({
  displayName,
  id,
  lastOpenedAtEpochMs,
}: RecentProjectEntry): RecentProjectSummary =>
  Object.freeze({ displayName, id, lastOpenedAtEpochMs });

/**
 * Converts native file/recovery operations into one path-free, bounded result
 * contract. The renderer never receives filesystem paths or raw exceptions.
 */
export class ProjectNativeWorkflow {
  readonly #dialogs: NativeProjectDialogs;
  readonly #lifecycle: ProjectLifecycleController;
  readonly #recentProjects: RecentProjectStore;
  readonly #reportFailure: NativeProjectFailureReporter | undefined;

  #operationInProgress = false;

  constructor(options: ProjectNativeWorkflowOptions) {
    this.#dialogs = options.dialogs;
    this.#lifecycle = options.lifecycle;
    this.#recentProjects = options.recentProjects;
    this.#reportFailure = options.reportFailure;
  }

  startNewProject(
    document: ProjectDocument,
    assetsById: Readonly<Record<string, Uint8Array>> = {},
  ): Promise<UserOperationResult<NativeOpenedProject>> {
    return this.#runExclusive('open', () => {
      const started = this.#lifecycle.startNewProject(document, assetsById);
      if (!started.ok) {
        this.#reportFailure?.('open', started.error);
        return Promise.resolve(failed<NativeOpenedProject>(createOpenProblem(started.error)));
      }
      return Promise.resolve(
        completed(
          Object.freeze({
            assetsById: started.value.assetsById,
            displayName: document.name,
            document: started.value.document,
            source: 'new' as const,
          }),
        ),
      );
    });
  }

  scheduleRecovery(
    document: ProjectDocument,
    stateId: HistoryStateId,
    assetsById: Readonly<Record<string, Uint8Array>> = {},
  ): Promise<UserOperationResult<NativeScheduledRecovery>> {
    const scheduled = this.#lifecycle.scheduleRecovery(
      Object.freeze({ document, stateId }),
      assetsById,
    );
    if (!scheduled.ok) {
      this.#reportFailure?.('recovery', scheduled.error);
      return Promise.resolve(failed<NativeScheduledRecovery>(createRecoveryProblem()));
    }
    return Promise.resolve(completed(Object.freeze({ scheduled: scheduled.scheduled, stateId })));
  }

  openFromDialog(): Promise<UserOperationResult<NativeOpenedProject>> {
    return this.#runExclusive('open', async () => {
      const selected = await this.#dialogs.chooseOpenProject();
      if (selected.status === 'cancelled') {
        return { status: 'cancelled' };
      }
      if (selected.status === 'invalid-response') {
        return failed(INVALID_DIALOG_PROBLEM);
      }
      return this.#openPath(selected.filePath);
    });
  }

  openRecent(idInput: unknown): Promise<UserOperationResult<NativeOpenedProject>> {
    return this.#runExclusive('open', async () => {
      const listed = await this.#recentProjects.list();
      if (!listed.ok) {
        this.#reportFailure?.('recent', listed.error);
        return failed({
          code: 'recent-project-not-found',
          title: 'Recent projects are unavailable',
          message: 'Choose a project with Open instead.',
        });
      }
      const entry =
        typeof idInput === 'string'
          ? listed.value.find((candidate) => candidate.id === idInput)
          : undefined;
      if (entry === undefined) {
        return failed({
          code: 'recent-project-not-found',
          title: 'Recent project not found',
          message: 'It may have been removed from the recent-project list.',
        });
      }
      return this.#openPath(entry.filePath, entry.id);
    });
  }

  async listRecentProjects(): Promise<UserOperationResult<readonly RecentProjectSummary[]>> {
    const listed = await this.#recentProjects.list();
    if (!listed.ok) {
      this.#reportFailure?.('recent', listed.error);
      return failed({
        code: 'recent-project-not-found',
        title: 'Recent projects are unavailable',
        message: 'You can still choose a project with Open.',
      });
    }
    return completed(Object.freeze(listed.value.map(toRecentSummary)));
  }

  save(
    snapshot: HistorySaveSnapshot,
    assetsById: Readonly<Record<string, Uint8Array>> = {},
  ): Promise<UserOperationResult<NativeSavedProject>> {
    return this.#runExclusive('save', () => this.#saveInternal(snapshot, assetsById, false));
  }

  saveAs(
    snapshot: HistorySaveSnapshot,
    assetsById: Readonly<Record<string, Uint8Array>> = {},
  ): Promise<UserOperationResult<NativeSavedProject>> {
    return this.#runExclusive('save', () => this.#saveInternal(snapshot, assetsById, true));
  }

  requestClose(request: NativeCloseRequest): Promise<UserOperationResult<NativeClosedProject>> {
    return this.#runExclusive('close', async () => {
      let saved = false;
      let discarded = false;
      if (request.dirty) {
        const closeChoice = await this.#dialogs.chooseUnsavedClose(
          createSuggestedProjectFileName(request.projectDisplayName),
        );
        if (closeChoice.status === 'invalid-response') {
          return failed(INVALID_DIALOG_PROBLEM);
        }
        if (closeChoice.choice === 'cancel') {
          return { status: 'cancelled' };
        }
        if (closeChoice.choice === 'save') {
          if (request.saveSnapshot === undefined) {
            return failed(createCloseProblem());
          }
          const saveResult = await this.#saveInternal(
            request.saveSnapshot,
            request.assetsById ?? {},
            false,
          );
          if (saveResult.status !== 'completed') {
            return saveResult;
          }
          saved = true;
        } else {
          discarded = true;
        }
      }

      const closed = await this.#lifecycle.closeActiveProject('discard-recovery');
      if (!closed.ok) {
        this.#reportFailure?.('close', closed.error);
        return failed(createCloseProblem());
      }
      closed.value.warnings.forEach((warning) => this.#reportFailure?.('close', warning));
      const warnings = this.#mapCloseWarnings(closed.value.warnings.length);
      return completed(Object.freeze({ closed: true, discarded, saved }), warnings);
    });
  }

  retainRecoveryAndClose(): Promise<UserOperationResult<NativeClosedProject>> {
    return this.#runExclusive('close', async () => {
      const closed = await this.#lifecycle.closeActiveProject('retain-recovery');
      if (!closed.ok) {
        this.#reportFailure?.('close', closed.error);
        return failed(createCloseProblem());
      }
      closed.value.warnings.forEach((warning) => this.#reportFailure?.('close', warning));
      return completed(
        Object.freeze({ closed: true, discarded: false, saved: false }),
        this.#mapCloseWarnings(closed.value.warnings.length),
      );
    });
  }

  async #openPath(
    filePath: string,
    recentIdToForget?: string,
  ): Promise<UserOperationResult<NativeOpenedProject>> {
    const opened = await this.#lifecycle.openProject(filePath);
    if (!opened.ok) {
      this.#reportFailure?.('open', opened.error);
      if (opened.error.code === 'file-not-found' && recentIdToForget !== undefined) {
        const forgotten = await this.#recentProjects.forget(recentIdToForget);
        if (!forgotten.ok) {
          this.#reportFailure?.('recent', forgotten.error);
        }
      }
      return failed(createOpenProblem(opened.error));
    }
    const warnings: UserOperationWarning[] = [];
    await this.#recordRecent(filePath, warnings);
    return completed(
      Object.freeze({
        assetsById: opened.value.assetsById,
        displayName: createDisplayName(filePath),
        document: opened.value.document,
        source: 'project-file' as const,
      }),
      warnings,
    );
  }

  async #saveInternal(
    snapshot: HistorySaveSnapshot,
    assetsById: Readonly<Record<string, Uint8Array>>,
    forceSaveAs: boolean,
  ): Promise<UserOperationResult<NativeSavedProject>> {
    const activeStatus = this.#lifecycle.getActiveStatus();
    if (activeStatus === undefined) {
      return failed(createSaveProblem());
    }
    let requestedFilePath: string | undefined;
    if (forceSaveAs || activeStatus.filePath === null) {
      const selected = await this.#dialogs.chooseSaveProject(
        createSuggestedProjectFileName(snapshot.document.name),
      );
      if (selected.status === 'cancelled') {
        return { status: 'cancelled' };
      }
      if (selected.status === 'invalid-response') {
        return failed(INVALID_DIALOG_PROBLEM);
      }
      requestedFilePath = selected.filePath;
    }

    const saved = await this.#lifecycle.saveActiveProject(snapshot, assetsById, requestedFilePath);
    if (!saved.ok) {
      this.#reportFailure?.('save', saved.error);
      return failed(createSaveProblem());
    }

    const warnings: UserOperationWarning[] = [];
    if (saved.value.warning !== undefined) {
      this.#reportFailure?.('save', saved.value.warning);
      appendWarning(warnings, {
        code: 'save-cleanup-failed',
        message: 'The project was saved, but a temporary replacement backup remains.',
      });
    }
    if (saved.value.recoveryWarnings.length > 0) {
      saved.value.recoveryWarnings.forEach((warning) => this.#reportFailure?.('save', warning));
      appendWarning(warnings, {
        code: 'recovery-cleanup-failed',
        message: 'The project was saved, but recovery cleanup needs attention.',
      });
    }
    await this.#recordRecent(saved.value.filePath, warnings);
    return completed(
      Object.freeze({
        displayName: createDisplayName(saved.value.filePath),
        stateId: saved.value.stateId,
        tokenId: saved.value.tokenId,
      }),
      warnings,
    );
  }

  async #recordRecent(filePath: string, warnings: UserOperationWarning[]): Promise<void> {
    const recorded = await this.#recentProjects.record(filePath);
    if (!recorded.ok) {
      this.#reportFailure?.('recent', recorded.error);
      appendWarning(warnings, {
        code: 'recent-files-update-failed',
        message: 'The project succeeded, but the recent-project list could not update.',
      });
    }
  }

  #mapCloseWarnings(warningCount: number): readonly UserOperationWarning[] {
    return warningCount === 0
      ? Object.freeze([])
      : Object.freeze([
          Object.freeze({
            code: 'recovery-cleanup-failed' as const,
            message: 'The project closed, but temporary recovery debris remains.',
          }),
        ]);
  }

  async #runExclusive<Value>(
    scope: Parameters<NativeProjectFailureReporter>[0],
    operation: () => Promise<UserOperationResult<Value>>,
  ): Promise<UserOperationResult<Value>> {
    if (this.#operationInProgress) {
      return failed(OPERATION_IN_PROGRESS_PROBLEM);
    }
    this.#operationInProgress = true;
    try {
      return await operation();
    } catch (error) {
      this.#reportFailure?.(scope, error);
      return failed(UNEXPECTED_NATIVE_PROBLEM);
    } finally {
      this.#operationInProgress = false;
    }
  }
}
