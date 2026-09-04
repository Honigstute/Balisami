import {
  USER_OPERATION_PROBLEM_CODES,
  USER_OPERATION_WARNING_CODES,
  type RecentProjectSummary,
  type UserOperationResult,
} from './user-operation';

export const DESKTOP_CHANNELS = {
  clipboardRead: 'desktop:clipboard-read',
  clipboardWrite: 'desktop:clipboard-write',
  getRuntimeInfo: 'desktop:get-runtime-info',
  openExternalUrl: 'desktop:open-external-url',
  projectCloseOutcome: 'desktop:project-close-outcome',
  projectCloseRequest: 'desktop:project-close-request',
  projectCloseResponse: 'desktop:project-close-response',
  projectCommand: 'desktop:project-command',
  projectDiscardRecovery: 'desktop:project-discard-recovery',
  projectListRecent: 'desktop:project-list-recent',
  projectOpen: 'desktop:project-open',
  projectOpenRecent: 'desktop:project-open-recent',
  projectRestoreRecovery: 'desktop:project-restore-recovery',
  projectSave: 'desktop:project-save',
  projectSaveAs: 'desktop:project-save-as',
  projectScheduleRecovery: 'desktop:project-schedule-recovery',
  projectStart: 'desktop:project-start',
  projectStartupOptions: 'desktop:project-startup-options',
  reportRendererReady: 'desktop:report-renderer-ready',
} as const;

export const DESKTOP_CLIPBOARD_LIMITS = Object.freeze({
  payloadCharacters: 8 * 1_024 * 1_024,
  textCharacters: 100_000,
});

export interface DesktopClipboardWriteRequest {
  /** Versioned renderer-owned payload. Main stores it opaquely. */
  readonly payload: string;
  readonly text: string;
}

export interface DesktopClipboardReadValue {
  readonly payload: string | null;
  readonly text: string;
}

export type RuntimePlatform = 'darwin' | 'win32';

export interface RuntimeInfo {
  readonly appVersion: string;
  readonly arch: string;
  readonly isPackaged: boolean;
  readonly platform: RuntimePlatform;
}

export interface ExternalUrlRequest {
  readonly url: string;
}

export type ProjectCommand = 'open' | 'open-recent' | 'save' | 'save-as';

export interface ProjectAssetBytes {
  readonly [assetId: string]: Uint8Array;
}

/**
 * The shared layer deliberately keeps project documents opaque. The domain
 * parser in both the renderer and main process is their single schema owner.
 */
export interface ProjectStartRequest {
  readonly assetsById: ProjectAssetBytes;
  readonly document: unknown;
}

export interface ProjectHistorySnapshotRequest extends ProjectStartRequest {
  readonly stateId: number;
  readonly tokenId: number;
}

export interface ProjectRecoverySnapshotRequest extends ProjectStartRequest {
  readonly stateId: number;
}

export interface ProjectOpenedValue {
  readonly assetsById: ProjectAssetBytes;
  readonly displayName: string;
  readonly document: unknown;
  readonly source: 'new' | 'project-file' | 'recovery';
}

export interface ProjectSavedValue {
  readonly displayName: string;
  readonly stateId: number;
  readonly tokenId: number;
}

export interface ProjectRecoveryScheduledValue {
  readonly scheduled: boolean;
  readonly stateId: number;
}

export interface ProjectRecoveryChoice {
  /** Opaque, window-scoped identity. It never contains a path or project ID. */
  readonly id: string;
  readonly capturedAtEpochMs: number;
  readonly displayName: string;
}

export interface ProjectStartupOptionsValue {
  readonly ignoredRecoveryEvidenceCount: number;
  readonly recentProjects: readonly RecentProjectSummary[];
  readonly recoveries: readonly ProjectRecoveryChoice[];
}

export interface ProjectRecoveryChoiceRequest {
  readonly recoveryId: string;
}

export interface ProjectRecoveryDiscardedValue {
  readonly discarded: boolean;
  readonly recoveryId: string;
}

export type ProjectReplacementRequest =
  | {
      readonly dirty: false;
      readonly projectDisplayName: string;
    }
  | {
      readonly dirty: true;
      readonly projectDisplayName: string;
      readonly saveSnapshot: ProjectHistorySnapshotRequest;
    };

export interface ProjectOpenRecentRequest {
  readonly currentProject: ProjectReplacementRequest;
  readonly recentProjectId: string;
}

export interface ProjectClosedValue {
  readonly closed: true;
  readonly discarded: boolean;
  readonly saved: boolean;
}

export type ProjectOpenedResult = UserOperationResult<ProjectOpenedValue>;
export type ProjectSavedResult = UserOperationResult<ProjectSavedValue>;
export type ProjectRecoveryScheduledResult = UserOperationResult<ProjectRecoveryScheduledValue>;
export type ProjectStartupOptionsResult = UserOperationResult<ProjectStartupOptionsValue>;
export type ProjectRecoveryDiscardedResult = UserOperationResult<ProjectRecoveryDiscardedValue>;
export type RecentProjectsResult = UserOperationResult<readonly RecentProjectSummary[]>;
export type ProjectClosedResult = UserOperationResult<ProjectClosedValue>;

export interface ProjectCloseRequest {
  readonly requestId: string;
}

export type ProjectCloseResponse =
  | {
      readonly dirty: boolean;
      readonly projectDisplayName: string;
      readonly requestId: string;
      readonly saveSnapshot?: ProjectHistorySnapshotRequest;
      readonly status: 'prepared';
    }
  | { readonly requestId: string; readonly status: 'rejected' };

export interface ProjectCloseOutcome {
  readonly requestId: string;
  readonly result: ProjectClosedResult;
}

export type DesktopEventUnsubscribe = () => void;

export interface DesktopApi {
  readClipboard(): Promise<DesktopClipboardReadValue>;
  writeClipboard(request: DesktopClipboardWriteRequest): Promise<DesktopAcknowledgement>;
  getRuntimeInfo(): Promise<RuntimeInfo>;
  openExternalUrl(request: ExternalUrlRequest): Promise<DesktopAcknowledgement>;
  onProjectCloseOutcome(listener: (outcome: ProjectCloseOutcome) => void): DesktopEventUnsubscribe;
  onProjectCloseRequest(listener: (request: ProjectCloseRequest) => void): DesktopEventUnsubscribe;
  onProjectCommand(listener: (command: ProjectCommand) => void): DesktopEventUnsubscribe;
  discardProjectRecovery(
    request: ProjectRecoveryChoiceRequest,
  ): Promise<ProjectRecoveryDiscardedResult>;
  getProjectStartupOptions(): Promise<ProjectStartupOptionsResult>;
  listRecentProjects(): Promise<RecentProjectsResult>;
  openProject(request: ProjectReplacementRequest): Promise<ProjectOpenedResult>;
  openRecentProject(request: ProjectOpenRecentRequest): Promise<ProjectOpenedResult>;
  respondToProjectClose(response: ProjectCloseResponse): void;
  restoreProjectRecovery(request: ProjectRecoveryChoiceRequest): Promise<ProjectOpenedResult>;
  saveProject(request: ProjectHistorySnapshotRequest): Promise<ProjectSavedResult>;
  saveProjectAs(request: ProjectHistorySnapshotRequest): Promise<ProjectSavedResult>;
  scheduleProjectRecovery(
    request: ProjectRecoverySnapshotRequest,
  ): Promise<ProjectRecoveryScheduledResult>;
  startProject(request: ProjectStartRequest): Promise<ProjectOpenedResult>;
  reportRendererReady(): Promise<void>;
}

export interface DesktopAcknowledgement {
  readonly accepted: true;
}

export const DESKTOP_ACKNOWLEDGEMENT: DesktopAcknowledgement = Object.freeze({ accepted: true });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const isSafeStateId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isSafeSaveTokenId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

const isBoundedText = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength;

const isBoundedPossiblyEmptyText = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.length <= maxLength;

export const isDesktopClipboardWriteRequest = (
  value: unknown,
): value is DesktopClipboardWriteRequest =>
  isRecord(value) &&
  hasExactKeys(value, ['payload', 'text']) &&
  isBoundedText(value.payload, DESKTOP_CLIPBOARD_LIMITS.payloadCharacters) &&
  isBoundedPossiblyEmptyText(value.text, DESKTOP_CLIPBOARD_LIMITS.textCharacters);

export const isDesktopClipboardReadValue = (value: unknown): value is DesktopClipboardReadValue =>
  isRecord(value) &&
  hasExactKeys(value, ['payload', 'text']) &&
  (value.payload === null ||
    isBoundedText(value.payload, DESKTOP_CLIPBOARD_LIMITS.payloadCharacters)) &&
  isBoundedPossiblyEmptyText(value.text, DESKTOP_CLIPBOARD_LIMITS.textCharacters);

export const isExternalUrlRequest = (value: unknown): value is ExternalUrlRequest => {
  if (!isRecord(value) || !hasExactKeys(value, ['url']) || !isBoundedText(value.url, 2_048)) {
    return false;
  }
  try {
    const url = new URL(value.url);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const isSafeTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isRecoveryChoiceId = (value: unknown): value is string =>
  isBoundedText(value, 80) && /^[a-f0-9-]+$/u.test(value);

const isRecentProjectId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

export const isProjectAssetBytes = (value: unknown): value is ProjectAssetBytes =>
  isRecord(value) &&
  !Array.isArray(value) &&
  Object.values(value).every(
    (bytes) =>
      ArrayBuffer.isView(bytes) && Object.prototype.toString.call(bytes) === '[object Uint8Array]',
  );

export const isProjectStartRequest = (value: unknown): value is ProjectStartRequest =>
  isRecord(value) &&
  hasExactKeys(value, ['assetsById', 'document']) &&
  isRecord(value.document) &&
  isProjectAssetBytes(value.assetsById);

export const isProjectHistorySnapshotRequest = (
  value: unknown,
): value is ProjectHistorySnapshotRequest =>
  isRecord(value) &&
  hasExactKeys(value, ['assetsById', 'document', 'stateId', 'tokenId']) &&
  isRecord(value.document) &&
  isProjectAssetBytes(value.assetsById) &&
  isSafeStateId(value.stateId) &&
  isSafeSaveTokenId(value.tokenId);

export const isProjectRecoverySnapshotRequest = (
  value: unknown,
): value is ProjectRecoverySnapshotRequest =>
  isRecord(value) &&
  hasExactKeys(value, ['assetsById', 'document', 'stateId']) &&
  isRecord(value.document) &&
  isProjectAssetBytes(value.assetsById) &&
  isSafeStateId(value.stateId);

const PROJECT_PROBLEM_CODES = new Set<string>(USER_OPERATION_PROBLEM_CODES);

const PROJECT_WARNING_CODES = new Set<string>(USER_OPERATION_WARNING_CODES);

const isUserOperationProblem = (value: unknown): boolean =>
  isRecord(value) &&
  hasExactKeys(value, ['code', 'message', 'title']) &&
  typeof value.code === 'string' &&
  PROJECT_PROBLEM_CODES.has(value.code) &&
  isBoundedText(value.title, 160) &&
  isBoundedText(value.message, 500);

const isUserOperationWarnings = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length <= 3 &&
  value.every(
    (warning) =>
      isRecord(warning) &&
      hasExactKeys(warning, ['code', 'message']) &&
      typeof warning.code === 'string' &&
      PROJECT_WARNING_CODES.has(warning.code) &&
      isBoundedText(warning.message, 500),
  );

const isUserOperationResult = <Value>(
  value: unknown,
  isValue: (candidate: unknown) => candidate is Value,
): value is UserOperationResult<Value> => {
  if (!isRecord(value) || typeof value.status !== 'string') {
    return false;
  }
  if (value.status === 'cancelled') {
    return hasExactKeys(value, ['status']);
  }
  if (value.status === 'failed') {
    return hasExactKeys(value, ['problem', 'status']) && isUserOperationProblem(value.problem);
  }
  return (
    value.status === 'completed' &&
    hasExactKeys(value, ['status', 'value', 'warnings']) &&
    isValue(value.value) &&
    isUserOperationWarnings(value.warnings)
  );
};

const isProjectOpenedValue = (value: unknown): value is ProjectOpenedValue =>
  isRecord(value) &&
  hasExactKeys(value, ['assetsById', 'displayName', 'document', 'source']) &&
  isProjectAssetBytes(value.assetsById) &&
  isBoundedText(value.displayName, 255) &&
  isRecord(value.document) &&
  (value.source === 'new' || value.source === 'project-file' || value.source === 'recovery');

const isProjectSavedValue = (value: unknown): value is ProjectSavedValue =>
  isRecord(value) &&
  hasExactKeys(value, ['displayName', 'stateId', 'tokenId']) &&
  isBoundedText(value.displayName, 255) &&
  isSafeStateId(value.stateId) &&
  isSafeSaveTokenId(value.tokenId);

const isProjectRecoveryScheduledValue = (value: unknown): value is ProjectRecoveryScheduledValue =>
  isRecord(value) &&
  hasExactKeys(value, ['scheduled', 'stateId']) &&
  typeof value.scheduled === 'boolean' &&
  isSafeStateId(value.stateId);

const isRecentProjectSummary = (value: unknown): value is RecentProjectSummary =>
  isRecord(value) &&
  hasExactKeys(value, ['displayName', 'id', 'lastOpenedAtEpochMs']) &&
  isBoundedText(value.displayName, 255) &&
  isRecentProjectId(value.id) &&
  isSafeTimestamp(value.lastOpenedAtEpochMs);

const isProjectRecoveryChoice = (value: unknown): value is ProjectRecoveryChoice =>
  isRecord(value) &&
  hasExactKeys(value, ['capturedAtEpochMs', 'displayName', 'id']) &&
  isRecoveryChoiceId(value.id) &&
  isSafeTimestamp(value.capturedAtEpochMs) &&
  isBoundedText(value.displayName, 255);

const isProjectStartupOptionsValue = (value: unknown): value is ProjectStartupOptionsValue =>
  isRecord(value) &&
  hasExactKeys(value, ['ignoredRecoveryEvidenceCount', 'recentProjects', 'recoveries']) &&
  Number.isSafeInteger(value.ignoredRecoveryEvidenceCount) &&
  typeof value.ignoredRecoveryEvidenceCount === 'number' &&
  value.ignoredRecoveryEvidenceCount >= 0 &&
  value.ignoredRecoveryEvidenceCount <= 1_050 &&
  Array.isArray(value.recentProjects) &&
  value.recentProjects.length <= 20 &&
  value.recentProjects.every(isRecentProjectSummary) &&
  Array.isArray(value.recoveries) &&
  value.recoveries.length <= 1_000 &&
  value.recoveries.every(isProjectRecoveryChoice);

const isProjectRecoveryDiscardedValue = (value: unknown): value is ProjectRecoveryDiscardedValue =>
  isRecord(value) &&
  hasExactKeys(value, ['discarded', 'recoveryId']) &&
  typeof value.discarded === 'boolean' &&
  isRecoveryChoiceId(value.recoveryId);

const isProjectClosedValue = (value: unknown): value is ProjectClosedValue =>
  isRecord(value) &&
  hasExactKeys(value, ['closed', 'discarded', 'saved']) &&
  value.closed === true &&
  typeof value.discarded === 'boolean' &&
  typeof value.saved === 'boolean';

export const isProjectOpenedResult = (value: unknown): value is ProjectOpenedResult =>
  isUserOperationResult(value, isProjectOpenedValue);

export const isProjectSavedResult = (value: unknown): value is ProjectSavedResult =>
  isUserOperationResult(value, isProjectSavedValue);

export const isProjectRecoveryScheduledResult = (
  value: unknown,
): value is ProjectRecoveryScheduledResult =>
  isUserOperationResult(value, isProjectRecoveryScheduledValue);

export const isProjectStartupOptionsResult = (
  value: unknown,
): value is ProjectStartupOptionsResult =>
  isUserOperationResult(value, isProjectStartupOptionsValue);

export const isProjectRecoveryDiscardedResult = (
  value: unknown,
): value is ProjectRecoveryDiscardedResult =>
  isUserOperationResult(value, isProjectRecoveryDiscardedValue);

export const isRecentProjectsResult = (value: unknown): value is RecentProjectsResult =>
  isUserOperationResult(
    value,
    (candidate): candidate is readonly RecentProjectSummary[] =>
      Array.isArray(candidate) && candidate.length <= 20 && candidate.every(isRecentProjectSummary),
  );

export const isProjectClosedResult = (value: unknown): value is ProjectClosedResult =>
  isUserOperationResult(value, isProjectClosedValue);

export const isProjectCloseRequest = (value: unknown): value is ProjectCloseRequest =>
  isRecord(value) &&
  hasExactKeys(value, ['requestId']) &&
  isBoundedText(value.requestId, 80) &&
  /^[a-z0-9-]+$/u.test(value.requestId);

export const isProjectCloseResponse = (value: unknown): value is ProjectCloseResponse => {
  if (!isRecord(value)) {
    return false;
  }
  if (value.status === 'rejected') {
    return (
      hasExactKeys(value, ['requestId', 'status']) &&
      isProjectCloseRequest({ requestId: value.requestId })
    );
  }
  const expectedKeys =
    value.saveSnapshot === undefined
      ? ['dirty', 'projectDisplayName', 'requestId', 'status']
      : ['dirty', 'projectDisplayName', 'requestId', 'saveSnapshot', 'status'];
  return (
    value.status === 'prepared' &&
    hasExactKeys(value, expectedKeys) &&
    typeof value.dirty === 'boolean' &&
    isBoundedText(value.projectDisplayName, 255) &&
    isProjectCloseRequest({ requestId: value.requestId }) &&
    (value.saveSnapshot === undefined || isProjectHistorySnapshotRequest(value.saveSnapshot)) &&
    (value.dirty || value.saveSnapshot === undefined) &&
    (!value.dirty || value.saveSnapshot !== undefined)
  );
};

export const isProjectCloseOutcome = (value: unknown): value is ProjectCloseOutcome =>
  isRecord(value) &&
  hasExactKeys(value, ['requestId', 'result']) &&
  isProjectCloseRequest({ requestId: value.requestId }) &&
  isProjectClosedResult(value.result);

export const isProjectRecoveryChoiceRequest = (
  value: unknown,
): value is ProjectRecoveryChoiceRequest =>
  isRecord(value) && hasExactKeys(value, ['recoveryId']) && isRecoveryChoiceId(value.recoveryId);

export const isProjectReplacementRequest = (value: unknown): value is ProjectReplacementRequest => {
  if (!isRecord(value) || typeof value.dirty !== 'boolean') {
    return false;
  }
  if (!value.dirty) {
    return (
      hasExactKeys(value, ['dirty', 'projectDisplayName']) &&
      isBoundedText(value.projectDisplayName, 255)
    );
  }
  return (
    hasExactKeys(value, ['dirty', 'projectDisplayName', 'saveSnapshot']) &&
    isBoundedText(value.projectDisplayName, 255) &&
    isProjectHistorySnapshotRequest(value.saveSnapshot)
  );
};

export const isProjectOpenRecentRequest = (value: unknown): value is ProjectOpenRecentRequest =>
  isRecord(value) &&
  hasExactKeys(value, ['currentProject', 'recentProjectId']) &&
  isProjectReplacementRequest(value.currentProject) &&
  isRecentProjectId(value.recentProjectId);

export const isProjectCommand = (value: unknown): value is ProjectCommand =>
  value === 'open' || value === 'open-recent' || value === 'save' || value === 'save-as';

export const isRuntimeInfo = (value: unknown): value is RuntimeInfo => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.appVersion === 'string' &&
    typeof value.arch === 'string' &&
    typeof value.isPackaged === 'boolean' &&
    (value.platform === 'darwin' || value.platform === 'win32')
  );
};

export const isDesktopAcknowledgement = (value: unknown): value is DesktopAcknowledgement =>
  isRecord(value) && value.accepted === true;
