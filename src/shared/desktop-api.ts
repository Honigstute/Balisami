import {
  USER_OPERATION_PROBLEM_CODES,
  USER_OPERATION_WARNING_CODES,
  type UserOperationResult,
} from './user-operation';

export const DESKTOP_CHANNELS = {
  getRuntimeInfo: 'desktop:get-runtime-info',
  projectCloseOutcome: 'desktop:project-close-outcome',
  projectCloseRequest: 'desktop:project-close-request',
  projectCloseResponse: 'desktop:project-close-response',
  projectCommand: 'desktop:project-command',
  projectSave: 'desktop:project-save',
  projectSaveAs: 'desktop:project-save-as',
  projectScheduleRecovery: 'desktop:project-schedule-recovery',
  projectStart: 'desktop:project-start',
  reportRendererReady: 'desktop:report-renderer-ready',
} as const;

export type RuntimePlatform = 'darwin' | 'win32';

export interface RuntimeInfo {
  readonly appVersion: string;
  readonly arch: string;
  readonly isPackaged: boolean;
  readonly platform: RuntimePlatform;
}

export type ProjectCommand = 'save' | 'save-as';

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

export interface ProjectClosedValue {
  readonly closed: true;
  readonly discarded: boolean;
  readonly saved: boolean;
}

export type ProjectOpenedResult = UserOperationResult<ProjectOpenedValue>;
export type ProjectSavedResult = UserOperationResult<ProjectSavedValue>;
export type ProjectRecoveryScheduledResult = UserOperationResult<ProjectRecoveryScheduledValue>;
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
  getRuntimeInfo(): Promise<RuntimeInfo>;
  onProjectCloseOutcome(listener: (outcome: ProjectCloseOutcome) => void): DesktopEventUnsubscribe;
  onProjectCloseRequest(listener: (request: ProjectCloseRequest) => void): DesktopEventUnsubscribe;
  onProjectCommand(listener: (command: ProjectCommand) => void): DesktopEventUnsubscribe;
  respondToProjectClose(response: ProjectCloseResponse): void;
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

export const isProjectCommand = (value: unknown): value is ProjectCommand =>
  value === 'save' || value === 'save-as';

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
