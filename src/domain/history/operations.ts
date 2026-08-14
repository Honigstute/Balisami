import { dispatchDocumentCommand, type DocumentCommandError } from '../commands/dispatcher';
import type { DocumentCommand } from '../commands/schema';
import type { ProjectDocument } from '../document/validation';
import {
  MAX_HISTORY_TRANSACTION_COMMANDS,
  createHistoryEntry,
  createHistoryRevision,
  createHistoryStateId,
  isHistoryStateProtected,
  type DocumentHistoryState,
  type HistoryEntry,
  type HistoryOperationError,
  type HistoryOperationResult,
  type HistoryTransactionOptions,
} from './model';

const MAX_HISTORY_LABEL_LENGTH = 120;
const MAX_COALESCE_KEY_LENGTH = 256;

interface NormalizedHistoryOptions {
  readonly coalesceKey: string | null;
  readonly label: string | undefined;
}

type OptionsResult =
  | { readonly ok: true; readonly value: NormalizedHistoryOptions }
  | { readonly ok: false; readonly error: HistoryOperationError };

interface AppliedCommandSequence {
  readonly document: ProjectDocument;
  readonly forwardCommands: readonly DocumentCommand[];
  readonly inverseCommands: readonly DocumentCommand[];
  readonly labels: readonly string[];
}

type ApplySequenceResult =
  | { readonly ok: true; readonly value: AppliedCommandSequence }
  | {
      readonly ok: false;
      readonly commandError: DocumentCommandError;
      readonly commandIndex: number;
    };

const unchanged = (history: DocumentHistoryState): HistoryOperationResult => ({
  ok: true,
  changed: false,
  history,
});

const failure = (
  history: DocumentHistoryState,
  error: HistoryOperationError,
): HistoryOperationResult => ({ ok: false, history, error });

const normalizeOptionalText = (
  value: string | undefined,
  name: string,
  maxLength: number,
):
  | { readonly ok: true; readonly value: string | undefined }
  | {
      readonly ok: false;
      readonly error: HistoryOperationError;
    } => {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    return {
      ok: false,
      error: {
        code: 'invalid-transaction',
        message: `${name} must contain 1 through ${String(maxLength)} characters.`,
      },
    };
  }
  return { ok: true, value: normalized };
};

const normalizeOptions = (options: HistoryTransactionOptions): OptionsResult => {
  const label = normalizeOptionalText(options.label, 'History label', MAX_HISTORY_LABEL_LENGTH);
  if (!label.ok) {
    return label;
  }
  const coalesceKey = normalizeOptionalText(
    options.coalesceKey,
    'History coalescing key',
    MAX_COALESCE_KEY_LENGTH,
  );
  if (!coalesceKey.ok) {
    return coalesceKey;
  }

  return {
    ok: true,
    value: {
      coalesceKey: coalesceKey.value ?? null,
      label: label.value,
    },
  };
};

const applyCommandSequence = (
  document: ProjectDocument,
  inputs: readonly unknown[],
): ApplySequenceResult => {
  let candidate = document;
  const forwardCommands: DocumentCommand[] = [];
  const inverseCommands: DocumentCommand[] = [];
  const labels: string[] = [];

  for (const [commandIndex, input] of inputs.entries()) {
    const result = dispatchDocumentCommand(candidate, input);
    if (!result.ok) {
      return {
        ok: false,
        commandError: result.error,
        commandIndex,
      };
    }
    if (!result.changed) {
      continue;
    }

    candidate = result.document;
    forwardCommands.push(result.command);
    inverseCommands.unshift(result.inverse);
    labels.push(result.label);
  }

  return {
    ok: true,
    value: {
      document: candidate,
      forwardCommands: Object.freeze(forwardCommands),
      inverseCommands: Object.freeze(inverseCommands),
      labels: Object.freeze(labels),
    },
  };
};

const resolveTransactionLabel = (
  normalizedLabel: string | undefined,
  commandLabels: readonly string[],
): string => {
  if (normalizedLabel !== undefined) {
    return normalizedLabel;
  }
  if (commandLabels.length === 1) {
    return commandLabels[0] as string;
  }
  return `${String(commandLabels.length)} changes`;
};

const trimUndoEntries = (
  entries: readonly HistoryEntry[],
  historyLimit: number,
): readonly HistoryEntry[] =>
  Object.freeze(entries.slice(Math.max(0, entries.length - historyLimit)));

const shouldCoalesce = (
  history: DocumentHistoryState,
  key: string | null,
  previous: HistoryEntry | undefined,
): previous is HistoryEntry =>
  key !== null &&
  previous !== undefined &&
  history.redoEntries.length === 0 &&
  previous.coalesceKey === key &&
  previous.afterStateId === history.currentStateId &&
  !isHistoryStateProtected(history, history.currentStateId);

export const dispatchHistoryTransaction = (
  history: DocumentHistoryState,
  inputs: readonly unknown[],
  options: HistoryTransactionOptions = {},
): HistoryOperationResult => {
  if (inputs.length > MAX_HISTORY_TRANSACTION_COMMANDS) {
    return failure(history, {
      code: 'invalid-transaction',
      message: `A history transaction may contain at most ${String(MAX_HISTORY_TRANSACTION_COMMANDS)} commands.`,
    });
  }

  const optionsResult = normalizeOptions(options);
  if (!optionsResult.ok) {
    return failure(history, optionsResult.error);
  }

  const application = applyCommandSequence(history.document, inputs);
  if (!application.ok) {
    return failure(history, {
      code: 'command-failed',
      commandError: application.commandError,
      commandIndex: application.commandIndex,
      message: `History transaction command ${String(application.commandIndex)} failed: ${application.commandError.message}`,
    });
  }
  if (application.value.forwardCommands.length === 0) {
    return unchanged(history);
  }

  const afterStateId = createHistoryStateId(history.nextStateId);
  if (afterStateId === undefined || history.nextStateId >= Number.MAX_SAFE_INTEGER) {
    return failure(history, {
      code: 'state-id-exhausted',
      message: 'The history state identifier range is exhausted.',
    });
  }

  const entry = createHistoryEntry({
    afterStateId,
    beforeStateId: history.currentStateId,
    coalesceKey: optionsResult.value.coalesceKey,
    forwardCommands: application.value.forwardCommands,
    inverseCommands: application.value.inverseCommands,
    label: resolveTransactionLabel(optionsResult.value.label, application.value.labels),
  });

  const previous = history.undoEntries.at(-1);
  let committedEntry = entry;
  let undoEntries: readonly HistoryEntry[];
  if (shouldCoalesce(history, entry.coalesceKey, previous)) {
    committedEntry = createHistoryEntry({
      afterStateId: entry.afterStateId,
      beforeStateId: previous.beforeStateId,
      coalesceKey: previous.coalesceKey,
      forwardCommands: [...previous.forwardCommands, ...entry.forwardCommands],
      inverseCommands: [...entry.inverseCommands, ...previous.inverseCommands],
      label: previous.label,
    });
    undoEntries = Object.freeze([...history.undoEntries.slice(0, -1), committedEntry]);
  } else {
    undoEntries = trimUndoEntries([...history.undoEntries, entry], history.historyLimit);
  }

  const nextHistory = createHistoryRevision(history, {
    currentStateId: afterStateId,
    document: application.value.document,
    nextStateId: history.nextStateId + 1,
    redoEntries: Object.freeze([]),
    undoEntries,
  });

  return { ok: true, changed: true, entry: committedEntry, history: nextHistory };
};

export const dispatchHistoryCommand = (
  history: DocumentHistoryState,
  input: unknown,
  options: HistoryTransactionOptions = {},
): HistoryOperationResult => dispatchHistoryTransaction(history, [input], options);

type ReplayResult =
  | { readonly ok: true; readonly document: ProjectDocument }
  | { readonly ok: false; readonly error: HistoryOperationError };

const replayCommands = (
  document: ProjectDocument,
  commands: readonly DocumentCommand[],
): ReplayResult => {
  let candidate = document;

  for (const [commandIndex, command] of commands.entries()) {
    const result = dispatchDocumentCommand(candidate, command);
    if (!result.ok) {
      return {
        ok: false,
        error: {
          code: 'history-corrupt',
          commandError: result.error,
          commandIndex,
          message: `Stored history command ${String(commandIndex)} failed: ${result.error.message}`,
        },
      };
    }
    if (!result.changed) {
      return {
        ok: false,
        error: {
          code: 'history-corrupt',
          commandIndex,
          message: `Stored history command ${String(commandIndex)} produced an unexpected no-op.`,
        },
      };
    }
    candidate = result.document;
  }

  return { ok: true, document: candidate };
};

export const undoDocumentHistory = (history: DocumentHistoryState): HistoryOperationResult => {
  const entry = history.undoEntries.at(-1);
  if (entry === undefined) {
    return unchanged(history);
  }

  const replay = replayCommands(history.document, entry.inverseCommands);
  if (!replay.ok) {
    return failure(history, replay.error);
  }

  return {
    ok: true,
    changed: true,
    entry,
    history: createHistoryRevision(history, {
      currentStateId: entry.beforeStateId,
      document: replay.document,
      redoEntries: Object.freeze([...history.redoEntries, entry]),
      undoEntries: Object.freeze(history.undoEntries.slice(0, -1)),
    }),
  };
};

export const redoDocumentHistory = (history: DocumentHistoryState): HistoryOperationResult => {
  const entry = history.redoEntries.at(-1);
  if (entry === undefined) {
    return unchanged(history);
  }

  const replay = replayCommands(history.document, entry.forwardCommands);
  if (!replay.ok) {
    return failure(history, replay.error);
  }

  return {
    ok: true,
    changed: true,
    entry,
    history: createHistoryRevision(history, {
      currentStateId: entry.afterStateId,
      document: replay.document,
      redoEntries: Object.freeze(history.redoEntries.slice(0, -1)),
      undoEntries: Object.freeze([...history.undoEntries, entry]),
    }),
  };
};
