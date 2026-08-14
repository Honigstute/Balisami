import { ProjectIdSchema, type HistoryStateId, type ProjectId } from '../../domain';
import { copyBytes, isUint8Array } from '../../persistence/project-file/binary';
import type {
  ProjectRecoverySnapshot,
  RecoveryOperationError,
  WriteRecoverySnapshotOptions,
  WriteRecoverySnapshotResult,
} from './recovery-journal';
import { MAX_RECOVERY_SOURCE_FILE_PATH_LENGTH } from './recovery-schema';

export const DEFAULT_RECOVERY_AUTOSAVE_DEBOUNCE_MS = 750;
export const MAX_RECOVERY_AUTOSAVE_DEBOUNCE_MS = 60_000;

export interface RecoveryAutosaveClock {
  readonly now: () => number;
  readonly setTimeout: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
}

export interface RecoveryAutosaveWriteRequest {
  readonly snapshot: ProjectRecoverySnapshot;
  readonly assetsById: Readonly<Record<string, Uint8Array>>;
  readonly options: WriteRecoverySnapshotOptions;
}

export type RecoveryAutosaveWriter = (
  request: RecoveryAutosaveWriteRequest,
) => Promise<WriteRecoverySnapshotResult>;

export interface RecoveryAutosaveSchedulerOptions {
  readonly projectId: ProjectId;
  readonly write: RecoveryAutosaveWriter;
  readonly clock?: RecoveryAutosaveClock;
  readonly debounceMs?: number;
}

export interface ScheduleRecoveryAutosaveInput {
  readonly snapshot: ProjectRecoverySnapshot;
  readonly assetsById?: Readonly<Record<string, Uint8Array>>;
  readonly sourceFilePath?: string | null;
}

export type RecoveryAutosaveErrorCode =
  | 'invalid-autosave-snapshot'
  | 'recovery-write-failed'
  | 'recovery-writer-threw'
  | 'scheduler-shutdown';

export interface RecoveryAutosaveError {
  readonly code: RecoveryAutosaveErrorCode;
  readonly message: string;
  readonly cause?: RecoveryOperationError;
}

export type ScheduleRecoveryAutosaveResult =
  | { readonly ok: true; readonly scheduled: boolean }
  | { readonly ok: false; readonly error: RecoveryAutosaveError };

export interface FlushedRecoveryAutosave {
  readonly lastWrittenStateId: HistoryStateId | null;
}

export type FlushRecoveryAutosaveResult =
  | { readonly ok: true; readonly value: FlushedRecoveryAutosave }
  | { readonly ok: false; readonly error: RecoveryAutosaveError };

export type RecoveryAutosavePhase = 'failed' | 'idle' | 'scheduled' | 'shutdown' | 'writing';

export interface RecoveryAutosaveStatus {
  readonly phase: RecoveryAutosavePhase;
  readonly projectId: ProjectId;
  readonly lastWrittenStateId: HistoryStateId | null;
  readonly pendingStateId: HistoryStateId | null;
  readonly writingStateId: HistoryStateId | null;
  readonly error?: RecoveryAutosaveError;
}

export type RecoveryAutosaveShutdownMode = 'discard' | 'flush';

interface PreparedRecoveryAutosave extends RecoveryAutosaveWriteRequest {
  readonly identity: string;
}

const systemClock: RecoveryAutosaveClock = Object.freeze({
  now: Date.now,
  setTimeout: (callback: () => void, delayMs: number) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle: unknown) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
});

const fail = (
  error: RecoveryAutosaveError,
): { readonly ok: false; readonly error: RecoveryAutosaveError } => ({ ok: false, error });

const succeed = (lastWrittenStateId: HistoryStateId | null): FlushRecoveryAutosaveResult => ({
  ok: true,
  value: Object.freeze({ lastWrittenStateId }),
});

const isValidDebounce = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0 && value <= MAX_RECOVERY_AUTOSAVE_DEBOUNCE_MS;

const copyAssets = (
  assetsById: Readonly<Record<string, Uint8Array>>,
): Readonly<Record<string, Uint8Array>> | undefined => {
  const copied: Record<string, Uint8Array> = {};
  for (const [assetId, bytes] of Object.entries(assetsById)) {
    if (!isUint8Array(bytes)) {
      return undefined;
    }
    copied[assetId] = copyBytes(bytes);
  }
  return Object.freeze(copied);
};

const createIdentity = (stateId: HistoryStateId, sourceFilePath: string | null): string =>
  `${String(stateId)}\0${sourceFilePath ?? ''}`;

/**
 * Owns timing and write serialization for one open project. The scheduler never
 * mutates history: callers pass an already captured state-ID/document pair.
 */
export class RecoveryAutosaveScheduler {
  readonly #clock: RecoveryAutosaveClock;
  readonly #debounceMs: number;
  readonly #projectId: ProjectId;
  readonly #write: RecoveryAutosaveWriter;

  #accepting = true;
  #closed = false;
  #inFlight: PreparedRecoveryAutosave | undefined;
  #lastError: RecoveryAutosaveError | undefined;
  #lastSuccessfulIdentity: string | undefined;
  #lastWrittenStateId: HistoryStateId | null = null;
  #pending: PreparedRecoveryAutosave | undefined;
  #pendingReady = false;
  #pump: Promise<FlushRecoveryAutosaveResult> | undefined;
  #retry: PreparedRecoveryAutosave | undefined;
  #shutdown: Promise<FlushRecoveryAutosaveResult> | undefined;
  #timer: unknown;

  constructor(options: RecoveryAutosaveSchedulerOptions) {
    const projectId = ProjectIdSchema.safeParse(options.projectId);
    const debounceMs = options.debounceMs ?? DEFAULT_RECOVERY_AUTOSAVE_DEBOUNCE_MS;
    const clock = options.clock ?? systemClock;
    if (
      !projectId.success ||
      typeof options.write !== 'function' ||
      !isValidDebounce(debounceMs) ||
      typeof clock.now !== 'function' ||
      typeof clock.setTimeout !== 'function' ||
      typeof clock.clearTimeout !== 'function'
    ) {
      throw new RangeError('Recovery autosave configuration is invalid.');
    }

    this.#projectId = projectId.data;
    this.#write = options.write;
    this.#clock = clock;
    this.#debounceMs = debounceMs;
  }

  schedule(input: ScheduleRecoveryAutosaveInput): ScheduleRecoveryAutosaveResult {
    if (!this.#accepting) {
      return fail({
        code: 'scheduler-shutdown',
        message: 'Recovery autosave no longer accepts snapshots after shutdown begins.',
      });
    }

    const prepared = this.#prepare(input);
    if (!prepared.ok) {
      return prepared;
    }

    if (
      prepared.value.identity === this.#lastSuccessfulIdentity ||
      prepared.value.identity === this.#inFlight?.identity
    ) {
      this.#pending = undefined;
      this.#retry = undefined;
      this.#pendingReady = false;
      this.#cancelTimer();
      return { ok: true, scheduled: false };
    }

    this.#pending = prepared.value;
    this.#retry = undefined;
    this.#pendingReady = false;
    this.#lastError = undefined;
    this.#scheduleTimer();
    return { ok: true, scheduled: true };
  }

  async flush(): Promise<FlushRecoveryAutosaveResult> {
    if (this.#closed) {
      return fail({
        code: 'scheduler-shutdown',
        message: 'Recovery autosave has already shut down.',
      });
    }
    return this.#flushPending();
  }

  shutdown(mode: RecoveryAutosaveShutdownMode = 'flush'): Promise<FlushRecoveryAutosaveResult> {
    if (this.#shutdown !== undefined) {
      return this.#shutdown;
    }

    this.#accepting = false;
    this.#cancelTimer();
    const shutdown = this.#finishShutdown(mode);
    this.#shutdown = shutdown;
    return shutdown;
  }

  getStatus(): RecoveryAutosaveStatus {
    const phase: RecoveryAutosavePhase = this.#closed
      ? 'shutdown'
      : this.#inFlight !== undefined
        ? 'writing'
        : this.#pending !== undefined
          ? 'scheduled'
          : this.#lastError !== undefined
            ? 'failed'
            : this.#retry !== undefined
              ? 'scheduled'
              : 'idle';
    return Object.freeze({
      phase,
      projectId: this.#projectId,
      lastWrittenStateId: this.#lastWrittenStateId,
      pendingStateId: this.#pending?.snapshot.stateId ?? this.#retry?.snapshot.stateId ?? null,
      writingStateId: this.#inFlight?.snapshot.stateId ?? null,
      ...(this.#lastError === undefined ? {} : { error: this.#lastError }),
    });
  }

  #prepare(
    input: ScheduleRecoveryAutosaveInput,
  ):
    | { readonly ok: true; readonly value: PreparedRecoveryAutosave }
    | { readonly ok: false; readonly error: RecoveryAutosaveError } {
    const projectId = ProjectIdSchema.safeParse(input.snapshot.document.id);
    const sourceFilePath = input.sourceFilePath ?? null;
    const capturedAtEpochMs = this.#clock.now();
    const assetsById = copyAssets(input.assetsById ?? {});
    if (
      !projectId.success ||
      projectId.data !== this.#projectId ||
      !Number.isSafeInteger(input.snapshot.stateId) ||
      input.snapshot.stateId < 0 ||
      (sourceFilePath !== null &&
        (typeof sourceFilePath !== 'string' ||
          sourceFilePath.length > MAX_RECOVERY_SOURCE_FILE_PATH_LENGTH)) ||
      !Number.isSafeInteger(capturedAtEpochMs) ||
      capturedAtEpochMs < 0 ||
      assetsById === undefined
    ) {
      return fail({
        code: 'invalid-autosave-snapshot',
        message: 'Recovery autosave rejected invalid project, state, asset, or source metadata.',
      });
    }

    const options = Object.freeze({ capturedAtEpochMs, sourceFilePath });
    return {
      ok: true,
      value: Object.freeze({
        snapshot: Object.freeze({
          document: input.snapshot.document,
          stateId: input.snapshot.stateId,
        }),
        assetsById,
        options,
        identity: createIdentity(input.snapshot.stateId, sourceFilePath),
      }),
    };
  }

  #scheduleTimer(): void {
    this.#cancelTimer();
    this.#timer = this.#clock.setTimeout(() => {
      this.#timer = undefined;
      this.#pendingReady = true;
      void this.#startPump();
    }, this.#debounceMs);
  }

  #cancelTimer(): void {
    if (this.#timer !== undefined) {
      this.#clock.clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  async #flushPending(): Promise<FlushRecoveryAutosaveResult> {
    this.#cancelTimer();
    if (this.#pending === undefined && this.#retry !== undefined) {
      this.#pending = this.#retry;
      this.#retry = undefined;
    }
    if (this.#pending !== undefined) {
      this.#pendingReady = true;
    }

    const active = this.#startPump();
    return active ?? succeed(this.#lastWrittenStateId);
  }

  #startPump(): Promise<FlushRecoveryAutosaveResult> | undefined {
    if (this.#pump !== undefined) {
      return this.#pump;
    }
    if (!this.#pendingReady || this.#pending === undefined) {
      return undefined;
    }

    const operation = this.#runPump();
    this.#pump = operation;
    void operation.then(() => {
      if (this.#pump === operation) {
        this.#pump = undefined;
      }
    });
    return operation;
  }

  async #runPump(): Promise<FlushRecoveryAutosaveResult> {
    let result = succeed(this.#lastWrittenStateId);
    while (this.#pendingReady && this.#pending !== undefined) {
      const request = this.#pending;
      this.#pending = undefined;
      this.#pendingReady = false;
      this.#inFlight = request;

      let written: WriteRecoverySnapshotResult;
      try {
        written = await this.#write(request);
      } catch {
        const error: RecoveryAutosaveError = Object.freeze({
          code: 'recovery-writer-threw',
          message: 'Recovery autosave failed unexpectedly; the snapshot remains retryable.',
        });
        result = fail(error);
        this.#lastError = error;
        this.#inFlight = undefined;
        if (this.#pending === undefined) {
          this.#retry = request;
          break;
        }
        continue;
      }

      this.#inFlight = undefined;
      if (!written.ok) {
        const error: RecoveryAutosaveError = Object.freeze({
          code: 'recovery-write-failed',
          message: 'Recovery autosave could not persist the captured snapshot.',
          cause: written.error,
        });
        result = fail(error);
        this.#lastError = error;
        if (this.#pending === undefined) {
          this.#retry = request;
          break;
        }
        continue;
      }

      this.#lastSuccessfulIdentity = request.identity;
      this.#lastWrittenStateId = request.snapshot.stateId;
      this.#lastError = undefined;
      this.#retry = undefined;
      result = succeed(this.#lastWrittenStateId);

      this.#discardPendingIdentity(request.identity);
    }
    return result;
  }

  #discardPendingIdentity(identity: string): void {
    if (this.#pending?.identity === identity) {
      this.#pending = undefined;
      this.#pendingReady = false;
      this.#cancelTimer();
    }
  }

  async #finishShutdown(mode: RecoveryAutosaveShutdownMode): Promise<FlushRecoveryAutosaveResult> {
    let result: FlushRecoveryAutosaveResult;
    if (mode === 'discard') {
      this.#pending = undefined;
      this.#retry = undefined;
      this.#pendingReady = false;
      result = (await this.#pump) ?? succeed(this.#lastWrittenStateId);
      this.#retry = undefined;
    } else {
      result = await this.#flushPending();
    }
    if (result.ok || mode === 'discard') {
      this.#closed = true;
    } else {
      // A failed close-time flush must remain retryable and must not strand the
      // session in a half-closed state.
      this.#accepting = true;
      this.#shutdown = undefined;
    }
    return result;
  }
}
