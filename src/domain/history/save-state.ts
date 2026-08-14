import type { ProjectDocument } from '../document/validation';
import {
  asHistorySaveTokenId,
  createHistoryRevision,
  type DocumentHistoryState,
  type HistorySaveTokenId,
  type HistoryStateId,
  type PendingHistorySave,
} from './model';

export interface HistorySaveSnapshot {
  readonly document: ProjectDocument;
  readonly stateId: HistoryStateId;
  readonly tokenId: HistorySaveTokenId;
}

export type HistorySaveErrorCode = 'save-token-exhausted' | 'save-token-not-found';

export interface HistorySaveError {
  readonly code: HistorySaveErrorCode;
  readonly message: string;
}

export type BeginHistorySaveResult =
  | {
      readonly ok: true;
      readonly history: DocumentHistoryState;
      readonly snapshot: HistorySaveSnapshot;
    }
  | {
      readonly ok: false;
      readonly history: DocumentHistoryState;
      readonly error: HistorySaveError;
    };

export type ResolveHistorySaveResult =
  | { readonly ok: true; readonly history: DocumentHistoryState }
  | {
      readonly ok: false;
      readonly history: DocumentHistoryState;
      readonly error: HistorySaveError;
    };

export const beginDocumentHistorySave = (history: DocumentHistoryState): BeginHistorySaveResult => {
  if (
    !Number.isSafeInteger(history.nextSaveTokenId) ||
    history.nextSaveTokenId >= Number.MAX_SAFE_INTEGER
  ) {
    return {
      ok: false,
      history,
      error: {
        code: 'save-token-exhausted',
        message: 'The history save-token range is exhausted.',
      },
    };
  }

  const tokenId = asHistorySaveTokenId(history.nextSaveTokenId);
  const pendingSave: PendingHistorySave = Object.freeze({
    document: history.document,
    stateId: history.currentStateId,
    tokenId,
  });
  const snapshot: HistorySaveSnapshot = Object.freeze({
    document: history.document,
    stateId: history.currentStateId,
    tokenId,
  });

  return {
    ok: true,
    snapshot,
    history: createHistoryRevision(history, {
      nextSaveTokenId: history.nextSaveTokenId + 1,
      pendingSaves: Object.freeze([...history.pendingSaves, pendingSave]),
    }),
  };
};

const resolveDocumentHistorySave = (
  history: DocumentHistoryState,
  snapshot: HistorySaveSnapshot,
  succeeded: boolean,
): ResolveHistorySaveResult => {
  const pendingIndex = history.pendingSaves.findIndex(
    (pending) =>
      pending.tokenId === snapshot.tokenId &&
      pending.stateId === snapshot.stateId &&
      pending.document === snapshot.document,
  );
  if (pendingIndex < 0) {
    return {
      ok: false,
      history,
      error: {
        code: 'save-token-not-found',
        message: 'The history save token is missing or has already been resolved.',
      },
    };
  }

  return {
    ok: true,
    history: createHistoryRevision(history, {
      pendingSaves: Object.freeze(
        history.pendingSaves.filter((_, index) => index !== pendingIndex),
      ),
      savedStateId: succeeded ? snapshot.stateId : history.savedStateId,
    }),
  };
};

export const completeDocumentHistorySave = (
  history: DocumentHistoryState,
  snapshot: HistorySaveSnapshot,
): ResolveHistorySaveResult => resolveDocumentHistorySave(history, snapshot, true);

export const failDocumentHistorySave = (
  history: DocumentHistoryState,
  snapshot: HistorySaveSnapshot,
): ResolveHistorySaveResult => resolveDocumentHistorySave(history, snapshot, false);
