import {
  beginDocumentHistorySave,
  completeDocumentHistorySave,
  createDocumentHistory,
  createEmptyProjectDocument,
  dispatchHistoryCommand,
  failDocumentHistorySave,
  isDocumentHistoryDirty,
  parseProjectDocument,
  type DocumentHistoryState,
  type HistoryOperationResult,
  type HistorySaveSnapshot,
  type HistoryTransactionOptions,
  type ProjectDocument,
} from '../../domain';
import type {
  DesktopApi,
  ProjectAssetBytes,
  ProjectCloseOutcome,
  ProjectCloseRequest,
  ProjectHistorySnapshotRequest,
  ProjectOpenedValue,
  ProjectRecoverySnapshotRequest,
} from '../../shared/desktop-api';
import type { UserOperationProblem, UserOperationWarning } from '../../shared/user-operation';

export type ProjectSaveTone = 'problem' | 'quiet' | 'ready';

export interface ProjectSessionView {
  readonly displayName: string;
  readonly history: DocumentHistoryState | undefined;
  readonly isClosing: boolean;
  readonly isDirty: boolean;
  readonly isReady: boolean;
  readonly isSaving: boolean;
  readonly statusLabel: string;
  readonly statusTone: ProjectSaveTone;
}

export interface ProjectSessionOptions {
  readonly createInitialDocument?: () => ProjectDocument;
  readonly desktop: DesktopApi;
}

type RecoveryState = 'current' | 'idle' | 'problem' | 'queued';

const createStableId = (prefix: 'board' | 'project'): string =>
  `${prefix}_${globalThis.crypto.randomUUID().replaceAll('-', '').toLowerCase()}`;

const createDefaultInitialDocument = (): ProjectDocument => {
  const result = createEmptyProjectDocument({
    boardId: createStableId('board'),
    projectId: createStableId('project'),
  });
  if (!result.ok) {
    throw new Error('The default project document could not be created.');
  }
  return result.value;
};

const copyAssets = (assetsById: ProjectAssetBytes): ProjectAssetBytes => {
  const copied: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  for (const [assetId, bytes] of Object.entries(assetsById)) {
    copied[assetId] = Uint8Array.from(bytes);
  }
  return Object.freeze(copied);
};

const createSnapshotRequest = (
  snapshot: HistorySaveSnapshot,
  assetsById: ProjectAssetBytes,
): ProjectHistorySnapshotRequest =>
  Object.freeze({
    assetsById,
    document: snapshot.document,
    stateId: snapshot.stateId,
    tokenId: snapshot.tokenId,
  });

const createRecoveryRequest = (
  history: DocumentHistoryState,
  assetsById: ProjectAssetBytes,
): ProjectRecoverySnapshotRequest =>
  Object.freeze({
    assetsById,
    document: history.document,
    stateId: history.currentStateId,
  });

const describeProblem = (problem: UserOperationProblem | undefined): string | undefined =>
  problem === undefined ? undefined : `${problem.title}: ${problem.message}`;

/**
 * Single renderer authority for live document/history and save-token state.
 * Main receives immutable snapshots only and never sends live mutations back.
 */
export class ProjectSession {
  readonly #createInitialDocument: () => ProjectDocument;
  readonly #desktop: DesktopApi;
  readonly #listeners = new Set<() => void>();

  #assetsById: ProjectAssetBytes = Object.freeze({});
  #closeSnapshot: HistorySaveSnapshot | undefined;
  #closingRequestId: string | undefined;
  #displayName = 'Untitled project';
  #history: DocumentHistoryState | undefined;
  #lastProblem: UserOperationProblem | undefined;
  #lastWarnings: readonly UserOperationWarning[] = Object.freeze([]);
  #recoveryRevision = 0;
  #recoveryState: RecoveryState = 'idle';
  #savePromise: Promise<void> | undefined;
  #startPromise: Promise<void> | undefined;
  #starting = true;
  #view: ProjectSessionView;

  constructor(options: ProjectSessionOptions) {
    this.#desktop = options.desktop;
    this.#createInitialDocument = options.createInitialDocument ?? createDefaultInitialDocument;
    this.#view = this.#createView();
  }

  getSnapshot = (): ProjectSessionView => this.#view;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  start(): Promise<void> {
    if (this.#startPromise !== undefined) {
      return this.#startPromise;
    }
    if (!this.#starting || this.#history !== undefined) {
      return Promise.resolve();
    }
    this.#startPromise = this.#start();
    return this.#startPromise;
  }

  async #start(): Promise<void> {
    let document: ProjectDocument;
    try {
      document = this.#createInitialDocument();
    } catch {
      this.#starting = false;
      this.#lastProblem = {
        code: 'unexpected-native-failure',
        title: 'A new project could not be created',
        message: 'Restart the app to retry with a clean project.',
      };
      this.#publish();
      return;
    }

    try {
      const result = await this.#desktop.startProject({ assetsById: {}, document });
      if (result.status !== 'completed') {
        this.#starting = false;
        this.#lastProblem =
          result.status === 'failed'
            ? result.problem
            : {
                code: 'unexpected-native-failure',
                title: 'The new project did not start',
                message: 'Restart the app to retry with a clean project.',
              };
        this.#publish();
        return;
      }
      const accepted = this.#acceptOpenedProject(result.value);
      if (accepted === undefined) {
        this.#starting = false;
        this.#lastProblem = {
          code: 'unexpected-native-failure',
          title: 'The desktop returned an invalid project',
          message: 'No project was opened. Restart the app to retry.',
        };
        this.#publish();
        return;
      }
      this.#history = createDocumentHistory(accepted.document, { initiallySaved: false });
      this.#assetsById = accepted.assetsById;
      this.#displayName = accepted.displayName;
      this.#lastWarnings = result.warnings;
      this.#starting = false;
      this.#publish();
      this.#scheduleRecovery();
    } catch {
      this.#starting = false;
      this.#lastProblem = {
        code: 'unexpected-native-failure',
        title: 'The desktop project service is unavailable',
        message: 'No project data changed. Restart the app to retry.',
      };
      this.#publish();
    }
  }

  dispatch(
    input: unknown,
    options: HistoryTransactionOptions = {},
  ): HistoryOperationResult | undefined {
    const history = this.#history;
    if (history === undefined || this.#closingRequestId !== undefined) {
      return undefined;
    }
    const result = dispatchHistoryCommand(history, input, options);
    if (result.ok && result.changed) {
      this.#history = result.history;
      this.#lastProblem = undefined;
      this.#lastWarnings = Object.freeze([]);
      this.#publish();
      this.#scheduleRecovery();
    }
    return result;
  }

  save(forceSaveAs = false): Promise<void> {
    if (this.#closingRequestId !== undefined) {
      return Promise.resolve();
    }
    if (this.#savePromise !== undefined) {
      return this.#savePromise;
    }
    const operation = this.#save(forceSaveAs);
    this.#savePromise = operation.finally(() => {
      this.#savePromise = undefined;
      this.#publish();
    });
    this.#publish();
    return this.#savePromise;
  }

  bindDesktopEvents(): () => void {
    const subscriptions = [
      this.#desktop.onProjectCommand((command) => {
        void this.save(command === 'save-as');
      }),
      this.#desktop.onProjectCloseRequest((request) => {
        void this.#prepareClose(request);
      }),
      this.#desktop.onProjectCloseOutcome((outcome) => {
        this.#finishCloseAttempt(outcome);
      }),
    ];
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }

  async #save(forceSaveAs: boolean): Promise<void> {
    const history = this.#history;
    if (history === undefined) {
      return;
    }
    const started = beginDocumentHistorySave(history);
    if (!started.ok) {
      this.#lastProblem = {
        code: 'save-failed',
        title: 'The project could not start saving',
        message: started.error.message,
      };
      this.#publish();
      return;
    }
    this.#history = started.history;
    this.#lastProblem = undefined;
    this.#lastWarnings = Object.freeze([]);
    this.#publish();

    let succeeded = false;
    try {
      const request = createSnapshotRequest(started.snapshot, this.#assetsById);
      const result = forceSaveAs
        ? await this.#desktop.saveProjectAs(request)
        : await this.#desktop.saveProject(request);
      if (
        result.status === 'completed' &&
        result.value.stateId === started.snapshot.stateId &&
        result.value.tokenId === started.snapshot.tokenId
      ) {
        succeeded = true;
        this.#displayName = result.value.displayName;
        this.#lastWarnings = result.warnings;
      } else if (result.status === 'failed') {
        this.#lastProblem = result.problem;
      } else if (result.status === 'completed') {
        this.#lastProblem = {
          code: 'save-failed',
          title: 'The desktop returned the wrong save receipt',
          message: 'Your work remains open and marked unsaved. Retry the action.',
        };
      }
    } catch {
      this.#lastProblem = {
        code: 'save-failed',
        title: 'The desktop save did not finish',
        message: 'Your work remains open. Retry the action.',
      };
    }

    const current = this.#history;
    if (current === undefined) {
      return;
    }
    const resolved = succeeded
      ? completeDocumentHistorySave(current, started.snapshot)
      : failDocumentHistorySave(current, started.snapshot);
    if (resolved.ok) {
      this.#history = resolved.history;
    } else {
      this.#lastProblem = {
        code: 'save-failed',
        title: 'The save result could not be reconciled',
        message: 'Your work remains open and marked unsaved. Retry the action.',
      };
    }
    this.#publish();
  }

  #scheduleRecovery(): void {
    const history = this.#history;
    if (history === undefined) {
      return;
    }
    const revision = ++this.#recoveryRevision;
    this.#recoveryState = 'queued';
    this.#publish();
    const request = createRecoveryRequest(history, this.#assetsById);
    void this.#desktop
      .scheduleProjectRecovery(request)
      .then((result) => {
        if (revision !== this.#recoveryRevision) {
          return;
        }
        if (result.status === 'completed' && result.value.stateId === request.stateId) {
          this.#recoveryState = result.value.scheduled ? 'queued' : 'current';
          this.#lastWarnings = result.warnings;
        } else if (result.status === 'failed') {
          this.#recoveryState = 'problem';
          this.#lastProblem = result.problem;
        } else {
          this.#recoveryState = 'problem';
          this.#lastProblem = {
            code: 'recovery-failed',
            title: 'Recovery was not queued',
            message: 'Keep the project open and retry before closing the app.',
          };
        }
        this.#publish();
      })
      .catch(() => {
        if (revision === this.#recoveryRevision) {
          this.#recoveryState = 'problem';
          this.#lastProblem = {
            code: 'recovery-failed',
            title: 'Recovery could not be queued',
            message: 'Keep the project open and retry before closing the app.',
          };
          this.#publish();
        }
      });
  }

  async #prepareClose(request: ProjectCloseRequest): Promise<void> {
    if (this.#closingRequestId !== undefined) {
      return;
    }
    this.#closingRequestId = request.requestId;
    this.#publish();

    await this.#savePromise;
    const history = this.#history;
    if (history === undefined) {
      this.#desktop.respondToProjectClose({
        dirty: false,
        projectDisplayName: this.#displayName,
        requestId: request.requestId,
        status: 'prepared',
      });
      return;
    }

    const dirty = isDocumentHistoryDirty(history);
    if (!dirty) {
      this.#desktop.respondToProjectClose({
        dirty: false,
        projectDisplayName: this.#displayName,
        requestId: request.requestId,
        status: 'prepared',
      });
      return;
    }

    const started = beginDocumentHistorySave(history);
    if (!started.ok) {
      this.#desktop.respondToProjectClose({
        requestId: request.requestId,
        status: 'rejected',
      });
      return;
    }
    this.#history = started.history;
    this.#closeSnapshot = started.snapshot;
    this.#publish();
    this.#desktop.respondToProjectClose({
      dirty: true,
      projectDisplayName: this.#displayName,
      requestId: request.requestId,
      saveSnapshot: createSnapshotRequest(started.snapshot, this.#assetsById),
      status: 'prepared',
    });
  }

  #finishCloseAttempt(outcome: ProjectCloseOutcome): void {
    if (outcome.requestId !== this.#closingRequestId) {
      return;
    }
    const snapshot = this.#closeSnapshot;
    const history = this.#history;
    if (snapshot !== undefined && history !== undefined) {
      const resolved = failDocumentHistorySave(history, snapshot);
      if (resolved.ok) {
        this.#history = resolved.history;
      }
    }
    this.#closeSnapshot = undefined;
    this.#closingRequestId = undefined;
    if (outcome.result.status === 'failed') {
      this.#lastProblem = outcome.result.problem;
    }
    this.#publish();
  }

  #acceptOpenedProject(value: ProjectOpenedValue):
    | {
        readonly assetsById: ProjectAssetBytes;
        readonly displayName: string;
        readonly document: ProjectDocument;
      }
    | undefined {
    const parsed = parseProjectDocument(value.document);
    if (!parsed.ok) {
      return undefined;
    }
    return Object.freeze({
      assetsById: copyAssets(value.assetsById),
      displayName: value.displayName,
      document: parsed.value,
    });
  }

  #createView(): ProjectSessionView {
    const history = this.#history;
    const isDirty = history === undefined ? false : isDocumentHistoryDirty(history);
    const problem = describeProblem(this.#lastProblem);
    let statusLabel = 'Preparing project…';
    let statusTone: ProjectSaveTone = 'quiet';
    if (!this.#starting) {
      if (problem !== undefined) {
        statusLabel = problem;
        statusTone = 'problem';
      } else if (this.#closingRequestId !== undefined) {
        statusLabel = 'Waiting for the close decision…';
      } else if (this.#savePromise !== undefined) {
        statusLabel = isDirty ? 'Saving captured changes…' : 'Saving…';
      } else if (isDirty) {
        statusLabel =
          this.#recoveryState === 'problem'
            ? 'Unsaved changes · Recovery needs attention'
            : 'Unsaved changes · Recovery active';
        statusTone = this.#recoveryState === 'problem' ? 'problem' : 'quiet';
      } else if (this.#lastWarnings.length > 0) {
        statusLabel = `Saved · ${this.#lastWarnings[0]?.message ?? 'Attention needed'}`;
      } else {
        statusLabel = 'Saved';
        statusTone = 'ready';
      }
    }
    return Object.freeze({
      displayName: this.#displayName,
      history,
      isClosing: this.#closingRequestId !== undefined,
      isDirty,
      isReady: !this.#starting && history !== undefined,
      isSaving: this.#savePromise !== undefined,
      statusLabel,
      statusTone,
    });
  }

  #publish(): void {
    this.#view = this.#createView();
    this.#listeners.forEach((listener) => listener());
  }
}
