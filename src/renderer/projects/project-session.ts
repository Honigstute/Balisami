import {
  beginDocumentHistorySave,
  completeDocumentHistorySave,
  createDocumentHistory,
  createEmptyProjectDocument,
  dispatchHistoryTransaction,
  failDocumentHistorySave,
  isDocumentHistoryDirty,
  parseProjectDocument,
  redoDocumentHistory,
  undoDocumentHistory,
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
  ProjectRecoveryChoice,
  ProjectRecoverySnapshotRequest,
  ProjectReplacementRequest,
} from '../../shared/desktop-api';
import type {
  RecentProjectSummary,
  UserOperationProblem,
  UserOperationWarning,
} from '../../shared/user-operation';

export type ProjectSaveTone = 'problem' | 'quiet' | 'ready';

export type ProjectSessionDialog =
  | {
      readonly ignoredEvidenceCount: number;
      readonly kind: 'startup-recovery';
      readonly recoveries: readonly ProjectRecoveryChoice[];
    }
  | {
      readonly kind: 'startup-problem';
      readonly problem: UserOperationProblem;
    }
  | {
      readonly kind: 'recent-projects';
      readonly projects: readonly RecentProjectSummary[];
    };

export interface ProjectSessionView {
  readonly displayName: string;
  readonly dialog: ProjectSessionDialog | undefined;
  readonly history: DocumentHistoryState | undefined;
  readonly isClosing: boolean;
  readonly isDirty: boolean;
  readonly isReady: boolean;
  readonly isSaving: boolean;
  readonly isTransitioning: boolean;
  readonly source: ProjectOpenedValue['source'] | undefined;
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
  #dialog: ProjectSessionDialog | undefined;
  #history: DocumentHistoryState | undefined;
  #interactionFrozen = false;
  #lastProblem: UserOperationProblem | undefined;
  #lastWarnings: readonly UserOperationWarning[] = Object.freeze([]);
  #recoveryRevision = 0;
  #recoveryState: RecoveryState = 'idle';
  #savePromise: Promise<void> | undefined;
  #startPromise: Promise<void> | undefined;
  #starting = true;
  #source: ProjectOpenedValue['source'] | undefined;
  #transitionPromise: Promise<void> | undefined;
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
    try {
      const result = await this.#desktop.getProjectStartupOptions();
      if (result.status === 'completed') {
        this.#lastWarnings = result.warnings;
        if (result.value.recoveries.length > 0) {
          this.#dialog = Object.freeze({
            ignoredEvidenceCount: result.value.ignoredRecoveryEvidenceCount,
            kind: 'startup-recovery',
            recoveries: result.value.recoveries,
          });
          this.#publish();
          return;
        }
        await this.#startNewProject();
        return;
      }
      this.#lastProblem =
        result.status === 'failed'
          ? result.problem
          : {
              code: 'unexpected-native-failure',
              title: 'Startup recovery was not checked',
              message: 'Choose Start New to continue without changing existing recovery files.',
            };
    } catch {
      this.#lastProblem = {
        code: 'unexpected-native-failure',
        title: 'Startup recovery could not be checked',
        message: 'Choose Start New to continue without changing existing recovery files.',
      };
    }
    this.#dialog = Object.freeze({ kind: 'startup-problem', problem: this.#lastProblem });
    this.#publish();
  }

  startNewProject(): Promise<void> {
    return this.#runTransition(() => this.#startNewProject());
  }

  async #startNewProject(): Promise<void> {
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
      this.#dialog = Object.freeze({ kind: 'startup-problem', problem: this.#lastProblem });
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
        this.#dialog = Object.freeze({ kind: 'startup-problem', problem: this.#lastProblem });
        this.#publish();
        return;
      }
      this.#installOpenedProject(result.value, result.warnings);
    } catch {
      this.#starting = false;
      this.#lastProblem = {
        code: 'unexpected-native-failure',
        title: 'The desktop project service is unavailable',
        message: 'No project data changed. Restart the app to retry.',
      };
      this.#dialog = Object.freeze({ kind: 'startup-problem', problem: this.#lastProblem });
      this.#publish();
    }
  }

  restoreRecovery(recoveryId: string): Promise<void> {
    return this.#runTransition(async () => {
      try {
        const result = await this.#desktop.restoreProjectRecovery({ recoveryId });
        if (result.status === 'completed') {
          this.#installOpenedProject(result.value, result.warnings);
        } else if (result.status === 'failed') {
          this.#lastProblem = result.problem;
        }
      } catch {
        this.#lastProblem = {
          code: 'recovery-failed',
          title: 'Recovery could not be restored',
          message: 'The recovery point was kept. Retry or start a new project.',
        };
      }
      this.#publish();
    });
  }

  discardRecovery(recoveryId: string): Promise<void> {
    return this.#runTransition(async () => {
      try {
        const result = await this.#desktop.discardProjectRecovery({ recoveryId });
        if (result.status === 'failed') {
          this.#lastProblem = result.problem;
          this.#publish();
          return;
        }
        if (result.status !== 'completed') {
          return;
        }
        this.#lastWarnings = result.warnings;
        const current = this.#dialog;
        if (current?.kind !== 'startup-recovery') {
          return;
        }
        const recoveries = current.recoveries.filter((choice) => choice.id !== recoveryId);
        if (recoveries.length === 0) {
          await this.#startNewProject();
          return;
        }
        this.#dialog = Object.freeze({ ...current, recoveries: Object.freeze(recoveries) });
      } catch {
        this.#lastProblem = {
          code: 'recovery-failed',
          title: 'Recovery could not be discarded',
          message: 'The recovery point was kept. Retry or restore it instead.',
        };
      }
      this.#publish();
    });
  }

  showRecentProjects(): Promise<void> {
    return this.#runTransition(async () => {
      try {
        const result = await this.#desktop.listRecentProjects();
        if (result.status === 'completed') {
          this.#dialog = Object.freeze({ kind: 'recent-projects', projects: result.value });
          this.#lastWarnings = result.warnings;
        } else if (result.status === 'failed') {
          this.#lastProblem = result.problem;
        }
      } catch {
        this.#lastProblem = {
          code: 'recent-project-not-found',
          title: 'Recent projects are unavailable',
          message: 'Use Open to choose a project file instead.',
        };
      }
      this.#publish();
    }, false);
  }

  dismissDialog(): void {
    if (this.#dialog?.kind === 'recent-projects' && this.#transitionPromise === undefined) {
      this.#dialog = undefined;
      this.#publish();
    }
  }

  openProject(): Promise<void> {
    return this.#replaceProject((currentProject) => this.#desktop.openProject(currentProject));
  }

  openRecentProject(recentProjectId: string): Promise<void> {
    return this.#replaceProject((currentProject) =>
      this.#desktop.openRecentProject({ currentProject, recentProjectId }),
    );
  }

  dispatch(
    input: unknown,
    options: HistoryTransactionOptions = {},
  ): HistoryOperationResult | undefined {
    return this.dispatchTransaction([input], options);
  }

  dispatchTransaction(
    inputs: readonly unknown[],
    options: HistoryTransactionOptions = {},
  ): HistoryOperationResult | undefined {
    const history = this.#history;
    if (
      history === undefined ||
      this.#closingRequestId !== undefined ||
      this.#interactionFrozen ||
      this.#dialog !== undefined
    ) {
      return undefined;
    }
    const result = dispatchHistoryTransaction(history, inputs, options);
    if (result.ok && result.changed) {
      this.#history = result.history;
      this.#lastProblem = undefined;
      this.#lastWarnings = Object.freeze([]);
      this.#publish();
      this.#scheduleRecovery();
    }
    return result;
  }

  undo(): boolean {
    return this.#navigateHistory(undoDocumentHistory);
  }

  redo(): boolean {
    return this.#navigateHistory(redoDocumentHistory);
  }

  #navigateHistory(operation: (history: DocumentHistoryState) => HistoryOperationResult): boolean {
    const history = this.#history;
    if (
      history === undefined ||
      this.#closingRequestId !== undefined ||
      this.#interactionFrozen ||
      this.#dialog !== undefined
    ) {
      return false;
    }
    const result = operation(history);
    if (!result.ok) {
      this.#lastProblem = Object.freeze({
        code: 'unexpected-native-failure',
        message: 'The project remains open and unchanged.',
        title: 'History could not be restored',
      });
      this.#publish();
      return false;
    }
    if (!result.changed) {
      return false;
    }
    this.#history = result.history;
    this.#lastProblem = undefined;
    this.#lastWarnings = Object.freeze([]);
    this.#publish();
    this.#scheduleRecovery();
    return true;
  }

  save(forceSaveAs = false): Promise<void> {
    if (
      this.#closingRequestId !== undefined ||
      this.#interactionFrozen ||
      this.#dialog !== undefined
    ) {
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
        if (command === 'open') {
          void this.openProject();
        } else if (command === 'open-recent') {
          void this.showRecentProjects();
        } else {
          void this.save(command === 'save-as');
        }
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

  #replaceProject(
    open: (
      currentProject: ProjectReplacementRequest,
    ) => Promise<Awaited<ReturnType<DesktopApi['openProject']>>>,
  ): Promise<void> {
    if (this.#history === undefined) {
      return Promise.resolve();
    }
    return this.#runTransition(async () => {
      await this.#savePromise;
      const history = this.#history;
      if (history === undefined) {
        return;
      }

      let replacementRequest: ProjectReplacementRequest;
      let replacementSnapshot: HistorySaveSnapshot | undefined;
      if (isDocumentHistoryDirty(history)) {
        const started = beginDocumentHistorySave(history);
        if (!started.ok) {
          this.#lastProblem = {
            code: 'open-failed',
            title: 'The current project could not be prepared',
            message: 'The current project remains open and unchanged.',
          };
          return;
        }
        this.#history = started.history;
        replacementSnapshot = started.snapshot;
        replacementRequest = Object.freeze({
          dirty: true,
          projectDisplayName: this.#displayName,
          saveSnapshot: createSnapshotRequest(started.snapshot, this.#assetsById),
        });
      } else {
        replacementRequest = Object.freeze({
          dirty: false,
          projectDisplayName: this.#displayName,
        });
      }
      this.#publish();

      try {
        const result = await open(replacementRequest);
        if (result.status === 'completed') {
          this.#installOpenedProject(result.value, result.warnings);
          return;
        }
        if (result.status === 'failed') {
          this.#lastProblem = result.problem;
        }
      } catch {
        this.#lastProblem = {
          code: 'open-failed',
          title: 'The desktop open action did not finish',
          message: 'The current project remains open and unchanged.',
        };
      }

      const current = this.#history;
      if (replacementSnapshot !== undefined && current !== undefined) {
        const restored = failDocumentHistorySave(current, replacementSnapshot);
        if (restored.ok) {
          this.#history = restored.history;
        }
      }
      this.#publish();
    });
  }

  #runTransition(operation: () => Promise<void>, freezeInteractions = true): Promise<void> {
    if (this.#transitionPromise !== undefined) {
      return this.#transitionPromise;
    }
    if (freezeInteractions) {
      this.#interactionFrozen = true;
    }
    const transition = operation().finally(() => {
      if (this.#transitionPromise === transition) {
        this.#transitionPromise = undefined;
        this.#interactionFrozen = false;
        this.#publish();
      }
    });
    this.#transitionPromise = transition;
    this.#publish();
    return transition;
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
    if (this.#interactionFrozen) {
      this.#desktop.respondToProjectClose({ requestId: request.requestId, status: 'rejected' });
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

  #installOpenedProject(
    value: ProjectOpenedValue,
    warnings: readonly UserOperationWarning[],
  ): boolean {
    const accepted = this.#acceptOpenedProject(value);
    if (accepted === undefined) {
      this.#starting = false;
      this.#lastProblem = {
        code: 'unexpected-native-failure',
        title: 'The desktop returned an invalid project',
        message: 'No replacement project was installed.',
      };
      this.#publish();
      return false;
    }
    this.#recoveryRevision += 1;
    this.#history = createDocumentHistory(accepted.document, {
      initiallySaved: accepted.source === 'project-file',
    });
    this.#assetsById = accepted.assetsById;
    this.#displayName = accepted.displayName;
    this.#dialog = undefined;
    this.#lastProblem = undefined;
    this.#lastWarnings = warnings;
    this.#recoveryState = 'idle';
    this.#source = accepted.source;
    this.#starting = false;
    this.#publish();
    if (accepted.source !== 'project-file') {
      this.#scheduleRecovery();
    }
    return true;
  }

  #acceptOpenedProject(value: ProjectOpenedValue):
    | {
        readonly assetsById: ProjectAssetBytes;
        readonly displayName: string;
        readonly document: ProjectDocument;
        readonly source: ProjectOpenedValue['source'];
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
      source: value.source,
    });
  }

  #createView(): ProjectSessionView {
    const history = this.#history;
    const isDirty = history === undefined ? false : isDocumentHistoryDirty(history);
    const problem = describeProblem(this.#lastProblem);
    let statusLabel = 'Preparing project…';
    let statusTone: ProjectSaveTone = 'quiet';
    if (this.#dialog?.kind === 'startup-recovery' && problem !== undefined) {
      statusLabel = problem;
      statusTone = 'problem';
    } else if (this.#dialog?.kind === 'startup-recovery') {
      statusLabel = 'Recovery available · Choose how to continue';
    } else if (this.#dialog?.kind === 'startup-problem') {
      statusLabel = problem ?? 'Recovery could not be checked';
      statusTone = 'problem';
    } else if (!this.#starting) {
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
      dialog: this.#dialog,
      history,
      isClosing: this.#closingRequestId !== undefined,
      isDirty,
      isReady: !this.#starting && history !== undefined,
      isSaving: this.#savePromise !== undefined,
      isTransitioning: this.#transitionPromise !== undefined,
      source: this.#source,
      statusLabel,
      statusTone,
    });
  }

  #publish(): void {
    this.#view = this.#createView();
    this.#listeners.forEach((listener) => listener());
  }
}
