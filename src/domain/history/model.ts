import type { DocumentCommandError } from '../commands/dispatcher';
import type { DocumentCommand } from '../commands/schema';
import type { ProjectDocument } from '../document/validation';

declare const historyStateIdBrand: unique symbol;
declare const historySaveTokenIdBrand: unique symbol;

export type HistoryStateId = number & { readonly [historyStateIdBrand]: 'HistoryStateId' };
export type HistorySaveTokenId = number & {
  readonly [historySaveTokenIdBrand]: 'HistorySaveTokenId';
};

export const DEFAULT_HISTORY_LIMIT = 200;
export const MAX_HISTORY_LIMIT = 20_000;
export const MAX_HISTORY_TRANSACTION_COMMANDS = 10_000;

export interface HistoryEntry {
  readonly afterStateId: HistoryStateId;
  readonly beforeStateId: HistoryStateId;
  readonly coalesceKey: string | null;
  readonly forwardCommands: readonly DocumentCommand[];
  readonly inverseCommands: readonly DocumentCommand[];
  readonly label: string;
}

export interface PendingHistorySave {
  readonly document: ProjectDocument;
  readonly stateId: HistoryStateId;
  readonly tokenId: HistorySaveTokenId;
}

export interface DocumentHistoryState {
  readonly currentStateId: HistoryStateId;
  readonly document: ProjectDocument;
  readonly historyLimit: number;
  readonly nextSaveTokenId: number;
  readonly nextStateId: number;
  readonly pendingSaves: readonly PendingHistorySave[];
  readonly redoEntries: readonly HistoryEntry[];
  readonly savedStateId: HistoryStateId | null;
  readonly undoEntries: readonly HistoryEntry[];
}

export interface CreateDocumentHistoryOptions {
  readonly historyLimit?: number;
  readonly initiallySaved?: boolean;
}

export interface HistoryTransactionOptions {
  readonly coalesceKey?: string;
  readonly label?: string;
}

export type HistoryOperationErrorCode =
  'command-failed' | 'history-corrupt' | 'invalid-transaction' | 'state-id-exhausted';

export interface HistoryOperationError {
  readonly code: HistoryOperationErrorCode;
  readonly commandError?: DocumentCommandError;
  readonly commandIndex?: number;
  readonly message: string;
}

interface HistoryOperationFailure {
  readonly ok: false;
  readonly error: HistoryOperationError;
  readonly history: DocumentHistoryState;
}

interface HistoryOperationUnchanged {
  readonly ok: true;
  readonly changed: false;
  readonly history: DocumentHistoryState;
}

interface HistoryOperationChanged {
  readonly ok: true;
  readonly changed: true;
  readonly entry: HistoryEntry;
  readonly history: DocumentHistoryState;
}

export type HistoryOperationResult =
  HistoryOperationChanged | HistoryOperationFailure | HistoryOperationUnchanged;

const asHistoryStateId = (value: number): HistoryStateId => value as HistoryStateId;

export const asHistorySaveTokenId = (value: number): HistorySaveTokenId =>
  value as HistorySaveTokenId;

export const createDocumentHistory = (
  document: ProjectDocument,
  options: CreateDocumentHistoryOptions = {},
): DocumentHistoryState => {
  const historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  if (!Number.isSafeInteger(historyLimit) || historyLimit < 1 || historyLimit > MAX_HISTORY_LIMIT) {
    throw new RangeError(
      `History limit must be a safe integer from 1 through ${String(MAX_HISTORY_LIMIT)}.`,
    );
  }

  const initialStateId = asHistoryStateId(0);
  return Object.freeze({
    currentStateId: initialStateId,
    document,
    historyLimit,
    nextSaveTokenId: 1,
    nextStateId: 1,
    pendingSaves: Object.freeze([]),
    redoEntries: Object.freeze([]),
    savedStateId: options.initiallySaved === false ? null : initialStateId,
    undoEntries: Object.freeze([]),
  });
};

export const createHistoryRevision = (
  history: DocumentHistoryState,
  patch: Partial<DocumentHistoryState>,
): DocumentHistoryState => Object.freeze({ ...history, ...patch });

export const createHistoryStateId = (value: number): HistoryStateId | undefined =>
  Number.isSafeInteger(value) && value >= 0 ? asHistoryStateId(value) : undefined;

export const createHistoryEntry = (input: HistoryEntry): HistoryEntry =>
  Object.freeze({
    ...input,
    forwardCommands: Object.freeze([...input.forwardCommands]),
    inverseCommands: Object.freeze([...input.inverseCommands]),
  });

export const isHistoryStateProtected = (
  history: DocumentHistoryState,
  stateId: HistoryStateId,
): boolean =>
  history.savedStateId === stateId ||
  history.pendingSaves.some((pending) => pending.stateId === stateId);

export const canUndoDocumentHistory = (history: DocumentHistoryState): boolean =>
  history.undoEntries.length > 0;

export const canRedoDocumentHistory = (history: DocumentHistoryState): boolean =>
  history.redoEntries.length > 0;

export const isDocumentHistoryDirty = (history: DocumentHistoryState): boolean =>
  history.savedStateId === null || history.currentStateId !== history.savedStateId;

export const selectUndoLabel = (history: DocumentHistoryState): string | undefined =>
  history.undoEntries.at(-1)?.label;

export const selectRedoLabel = (history: DocumentHistoryState): string | undefined =>
  history.redoEntries.at(-1)?.label;
