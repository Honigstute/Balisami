import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_COMMAND_TYPES,
  createDocumentHistory,
  dispatchHistoryCommand,
  type DocumentHistoryState,
} from '../src/domain';
import {
  RecoveryAutosaveScheduler,
  type RecoveryAutosaveClock,
  type RecoveryAutosaveWriteRequest,
  type RecoveryAutosaveWriter,
} from '../src/main/recovery/recovery-autosave-scheduler';
import {
  captureProjectRecoverySnapshot,
  type ProjectRecoverySnapshot,
  type WriteRecoverySnapshotResult,
} from '../src/main/recovery/recovery-journal';
import { RecoveryPointerV1Schema } from '../src/main/recovery/recovery-schema';
import { createAssetFreeProjectDocument } from './fixtures/project-file';
import { DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

class ManualRecoveryClock implements RecoveryAutosaveClock {
  #nextHandle = 1;
  #now = 1_000;
  readonly #timers = new Map<number, { readonly callback: () => void; readonly dueAt: number }>();

  readonly now = (): number => this.#now;

  readonly setTimeout = (callback: () => void, delayMs: number): number => {
    const handle = this.#nextHandle;
    this.#nextHandle += 1;
    this.#timers.set(handle, { callback, dueAt: this.#now + delayMs });
    return handle;
  };

  readonly clearTimeout = (handle: unknown): void => {
    if (typeof handle === 'number') {
      this.#timers.delete(handle);
    }
  };

  advanceBy(delayMs: number): void {
    this.#now += delayMs;
    const due = [...this.#timers.entries()]
      .filter(([, timer]) => timer.dueAt <= this.#now)
      .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0]);
    for (const [handle, timer] of due) {
      this.#timers.delete(handle);
      timer.callback();
    }
  }
}

const createSnapshots = (): readonly [
  ProjectRecoverySnapshot,
  ProjectRecoverySnapshot,
  ProjectRecoverySnapshot,
] => {
  const initial = createDocumentHistory(createAssetFreeProjectDocument(), {
    initiallySaved: false,
  });
  const firstEdit = editHistory(initial, 'First autosave edit');
  const secondEdit = editHistory(firstEdit, 'Latest autosave edit');
  return [
    captureProjectRecoverySnapshot(initial),
    captureProjectRecoverySnapshot(firstEdit),
    captureProjectRecoverySnapshot(secondEdit),
  ];
};

const editHistory = (history: DocumentHistoryState, text: string): DocumentHistoryState => {
  const edited = dispatchHistoryCommand(history, {
    type: DOCUMENT_COMMAND_TYPES.setBoardNote,
    boardId: DOCUMENT_FIXTURE_IDS.board,
    note: { text },
  });
  if (!edited.ok || !edited.changed) {
    throw new Error('Expected autosave fixture edit to succeed.');
  }
  return edited.history;
};

const successfulWrite = (request: RecoveryAutosaveWriteRequest): WriteRecoverySnapshotResult => ({
  ok: true,
  value: Object.freeze({
    pointer: RecoveryPointerV1Schema.parse({
      format: 'wireframe-recovery',
      formatVersion: 1,
      projectId: request.snapshot.document.id,
      stateId: request.snapshot.stateId,
      capturedAtEpochMs: request.options.capturedAtEpochMs ?? 0,
      archiveSha256: 'a'.repeat(64),
      archiveByteLength: 1,
      sourceFilePath: request.options.sourceFilePath ?? null,
    }),
    warnings: Object.freeze([]),
  }),
});

const waitForMicrotasks = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

describe('recovery autosave scheduler', () => {
  it('debounces rapid states, freezes asset bytes, and writes only the latest state', async () => {
    const clock = new ManualRecoveryClock();
    const requests: RecoveryAutosaveWriteRequest[] = [];
    const writer: RecoveryAutosaveWriter = (request) => {
      requests.push(request);
      return Promise.resolve(successfulWrite(request));
    };
    const scheduler = new RecoveryAutosaveScheduler({
      projectId: DOCUMENT_FIXTURE_IDS.project,
      write: writer,
      clock,
      debounceMs: 750,
    });
    const [initial, firstEdit, latest] = createSnapshots();
    const assetBytes = Uint8Array.from([1, 2, 3]);

    expect(scheduler.schedule({ snapshot: initial })).toEqual({ ok: true, scheduled: true });
    expect(scheduler.schedule({ snapshot: firstEdit })).toEqual({ ok: true, scheduled: true });
    expect(
      scheduler.schedule({
        snapshot: latest,
        assetsById: { asset_ephemeral01: assetBytes },
        sourceFilePath: '/projects/latest.wireframe',
      }),
    ).toEqual({ ok: true, scheduled: true });
    assetBytes[0] = 9;

    clock.advanceBy(749);
    expect(requests).toEqual([]);
    clock.advanceBy(1);
    await expect(scheduler.flush()).resolves.toMatchObject({
      ok: true,
      value: { lastWrittenStateId: latest.stateId },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.snapshot).toEqual(latest);
    expect(requests[0]?.assetsById.asset_ephemeral01).toEqual(Uint8Array.from([1, 2, 3]));
    expect(requests[0]?.options).toEqual({
      capturedAtEpochMs: 1_000,
      sourceFilePath: '/projects/latest.wireframe',
    });

    expect(
      scheduler.schedule({ snapshot: latest, sourceFilePath: '/projects/latest.wireframe' }),
    ).toEqual({
      ok: true,
      scheduled: false,
    });
    expect(requests).toHaveLength(1);
  });

  it('serializes an in-flight write and coalesces its pending states to the latest one', async () => {
    const clock = new ManualRecoveryClock();
    const requests: RecoveryAutosaveWriteRequest[] = [];
    const pendingWrites: Array<{
      readonly complete: () => void;
      readonly request: RecoveryAutosaveWriteRequest;
    }> = [];
    let activeWrites = 0;
    let maximumActiveWrites = 0;
    const writer: RecoveryAutosaveWriter = (request) => {
      requests.push(request);
      activeWrites += 1;
      maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
      return new Promise((resolve) => {
        pendingWrites.push({
          request,
          complete: () => {
            activeWrites -= 1;
            resolve(successfulWrite(request));
          },
        });
      });
    };
    const scheduler = new RecoveryAutosaveScheduler({
      projectId: DOCUMENT_FIXTURE_IDS.project,
      write: writer,
      clock,
      debounceMs: 10,
    });
    const [initial, firstEdit, latest] = createSnapshots();

    scheduler.schedule({ snapshot: initial });
    const flushing = scheduler.flush();
    await waitForMicrotasks();
    scheduler.schedule({ snapshot: firstEdit });
    scheduler.schedule({ snapshot: latest });
    clock.advanceBy(10);
    expect(requests.map((request) => request.snapshot.stateId)).toEqual([initial.stateId]);

    pendingWrites[0]?.complete();
    await waitForMicrotasks();
    expect(requests.map((request) => request.snapshot.stateId)).toEqual([
      initial.stateId,
      latest.stateId,
    ]);
    expect(maximumActiveWrites).toBe(1);

    pendingWrites[1]?.complete();
    await expect(flushing).resolves.toMatchObject({
      ok: true,
      value: { lastWrittenStateId: latest.stateId },
    });
    expect(maximumActiveWrites).toBe(1);
  });

  it('retains a failed snapshot for one explicit retry without looping', async () => {
    const [snapshot] = createSnapshots();
    let attempts = 0;
    const scheduler = new RecoveryAutosaveScheduler({
      projectId: DOCUMENT_FIXTURE_IDS.project,
      debounceMs: 0,
      write: (request) => {
        attempts += 1;
        if (attempts === 1) {
          return Promise.resolve({
            ok: false,
            error: { code: 'write-failed', message: 'Injected failure.' },
          });
        }
        return Promise.resolve(successfulWrite(request));
      },
    });

    scheduler.schedule({ snapshot });
    await expect(scheduler.flush()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'recovery-write-failed',
        cause: { code: 'write-failed' },
      },
    });
    expect(attempts).toBe(1);
    expect(scheduler.getStatus()).toMatchObject({
      phase: 'failed',
      pendingStateId: snapshot.stateId,
    });

    await expect(scheduler.flush()).resolves.toMatchObject({ ok: true });
    expect(attempts).toBe(2);
    expect(scheduler.getStatus().phase).toBe('idle');
  });

  it('reopens scheduling after a failed shutdown flush so close can be retried', async () => {
    const [, firstEdit, latest] = createSnapshots();
    let attempts = 0;
    const scheduler = new RecoveryAutosaveScheduler({
      projectId: DOCUMENT_FIXTURE_IDS.project,
      write: (request) => {
        attempts += 1;
        return Promise.resolve(
          attempts === 1
            ? { ok: false, error: { code: 'write-failed', message: 'Injected close failure.' } }
            : successfulWrite(request),
        );
      },
    });

    scheduler.schedule({ snapshot: firstEdit });
    await expect(scheduler.shutdown()).resolves.toMatchObject({
      ok: false,
      error: { code: 'recovery-write-failed' },
    });
    expect(scheduler.getStatus().phase).toBe('failed');
    expect(scheduler.schedule({ snapshot: latest })).toEqual({ ok: true, scheduled: true });

    await expect(scheduler.shutdown()).resolves.toMatchObject({
      ok: true,
      value: { lastWrittenStateId: latest.stateId },
    });
    expect(attempts).toBe(2);
    expect(scheduler.getStatus().phase).toBe('shutdown');
  });

  it('flushes the latest state during shutdown and rejects later schedules', async () => {
    const [, firstEdit, latest] = createSnapshots();
    const requests: RecoveryAutosaveWriteRequest[] = [];
    const scheduler = new RecoveryAutosaveScheduler({
      projectId: DOCUMENT_FIXTURE_IDS.project,
      write: (request) => {
        requests.push(request);
        return Promise.resolve(successfulWrite(request));
      },
    });

    scheduler.schedule({ snapshot: firstEdit });
    scheduler.schedule({ snapshot: latest });
    await expect(scheduler.shutdown()).resolves.toMatchObject({
      ok: true,
      value: { lastWrittenStateId: latest.stateId },
    });
    expect(requests.map((request) => request.snapshot.stateId)).toEqual([latest.stateId]);
    expect(scheduler.getStatus().phase).toBe('shutdown');
    expect(scheduler.schedule({ snapshot: latest })).toMatchObject({
      ok: false,
      error: { code: 'scheduler-shutdown' },
    });
  });

  it('waits for an in-flight write and then flushes the latest shutdown state', async () => {
    const [initial, , latest] = createSnapshots();
    const requests: RecoveryAutosaveWriteRequest[] = [];
    const completions: Array<() => void> = [];
    const scheduler = new RecoveryAutosaveScheduler({
      projectId: DOCUMENT_FIXTURE_IDS.project,
      write: (request) => {
        requests.push(request);
        return new Promise((resolve) => {
          completions.push(() => resolve(successfulWrite(request)));
        });
      },
    });

    scheduler.schedule({ snapshot: initial });
    void scheduler.flush();
    await waitForMicrotasks();
    scheduler.schedule({ snapshot: latest });
    const shutdown = scheduler.shutdown();
    expect(requests.map((request) => request.snapshot.stateId)).toEqual([initial.stateId]);

    completions[0]?.();
    await waitForMicrotasks();
    expect(requests.map((request) => request.snapshot.stateId)).toEqual([
      initial.stateId,
      latest.stateId,
    ]);
    completions[1]?.();
    await expect(shutdown).resolves.toMatchObject({
      ok: true,
      value: { lastWrittenStateId: latest.stateId },
    });
    expect(scheduler.getStatus().phase).toBe('shutdown');
  });

  it('can discard a pending timer during shutdown without starting a write', async () => {
    const [snapshot] = createSnapshots();
    let writes = 0;
    const scheduler = new RecoveryAutosaveScheduler({
      projectId: DOCUMENT_FIXTURE_IDS.project,
      write: (request) => {
        writes += 1;
        return Promise.resolve(successfulWrite(request));
      },
    });
    scheduler.schedule({ snapshot });

    await expect(scheduler.shutdown('discard')).resolves.toMatchObject({ ok: true });
    expect(writes).toBe(0);
    expect(scheduler.getStatus().phase).toBe('shutdown');
  });

  it('rejects invalid source metadata before invoking the writer', () => {
    const [snapshot] = createSnapshots();
    let writes = 0;
    const scheduler = new RecoveryAutosaveScheduler({
      projectId: DOCUMENT_FIXTURE_IDS.project,
      write: (request) => {
        writes += 1;
        return Promise.resolve(successfulWrite(request));
      },
    });

    expect(scheduler.schedule({ snapshot, sourceFilePath: 'x'.repeat(32_769) })).toMatchObject({
      ok: false,
      error: { code: 'invalid-autosave-snapshot' },
    });
    expect(writes).toBe(0);
    expect(
      () =>
        new RecoveryAutosaveScheduler({
          projectId: DOCUMENT_FIXTURE_IDS.project,
          write: (request) => Promise.resolve(successfulWrite(request)),
          debounceMs: -1,
        }),
    ).toThrow(RangeError);
  });
});
