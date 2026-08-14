import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DOCUMENT_COMMAND_TYPES,
  beginDocumentHistorySave,
  createDocumentHistory,
  dispatchHistoryCommand,
  type DocumentHistoryState,
} from '../src/domain';
import {
  openProjectFile,
  saveProjectHistorySnapshot,
} from '../src/main/files/project-file-service';
import { ProjectPersistenceSession } from '../src/main/projects/project-persistence-session';
import {
  captureProjectRecoverySnapshot,
  loadRecoverySnapshot,
  writeRecoverySnapshot,
} from '../src/main/recovery/recovery-journal';
import { createAssetFreeProjectDocument } from './fixtures/project-file';
import { DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const temporaryDirectories: string[] = [];

const createSessionPaths = async (): Promise<{
  readonly projectFile: string;
  readonly recoveryRoot: string;
}> => {
  const recoveryRoot = await mkdtemp(path.join(tmpdir(), 'balsamic-session-'));
  temporaryDirectories.push(recoveryRoot);
  return { projectFile: path.join(recoveryRoot, 'project.test'), recoveryRoot };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const createHistories = (): readonly [DocumentHistoryState, DocumentHistoryState] => {
  const initial = createDocumentHistory(createAssetFreeProjectDocument(), {
    initiallySaved: false,
  });
  const edited = dispatchHistoryCommand(initial, {
    type: DOCUMENT_COMMAND_TYPES.setBoardNote,
    boardId: DOCUMENT_FIXTURE_IDS.board,
    note: { text: 'Edited session recovery state' },
  });
  if (!edited.ok || !edited.changed) {
    throw new Error('Expected session fixture edit to succeed.');
  }
  return [initial, edited.history];
};

describe('project persistence session', () => {
  it('flushes the latest scheduled state when retaining recovery on close', async () => {
    const paths = await createSessionPaths();
    const [, edited] = createHistories();
    const session = new ProjectPersistenceSession({
      projectId: DOCUMENT_FIXTURE_IDS.project,
      recoveryRoot: paths.recoveryRoot,
    });

    expect(session.scheduleRecovery(captureProjectRecoverySnapshot(edited))).toEqual({
      ok: true,
      scheduled: true,
    });
    await expect(session.close('retain-recovery')).resolves.toMatchObject({
      ok: true,
      value: { alreadyClosed: false, warnings: [] },
    });

    const loaded = await loadRecoverySnapshot(paths.recoveryRoot, DOCUMENT_FIXTURE_IDS.project);
    if (!loaded.ok) {
      throw new Error('Expected retained session recovery to load.');
    }
    expect(loaded.value.document).toEqual(edited.document);
    expect(session.getStatus().closed).toBe(true);
  });

  it('clears recovery after the exact same archive reaches the chosen user file', async () => {
    const paths = await createSessionPaths();
    const [initial] = createHistories();
    const started = beginDocumentHistorySave(initial);
    if (!started.ok) {
      throw new Error('Expected session save fixture to start.');
    }
    const session = new ProjectPersistenceSession({
      projectId: DOCUMENT_FIXTURE_IDS.project,
      recoveryRoot: paths.recoveryRoot,
    });
    session.scheduleRecovery(captureProjectRecoverySnapshot(initial));

    const saved = await session.save(started.snapshot, {}, paths.projectFile);
    expect(saved).toMatchObject({
      ok: true,
      value: {
        filePath: paths.projectFile,
        stateId: started.snapshot.stateId,
        tokenId: started.snapshot.tokenId,
        recoveryWarnings: [],
      },
    });
    if (!saved.ok) {
      throw new Error('Expected the project session save to succeed.');
    }
    expect(saved.value.archiveSha256).toMatch(/^[a-f0-9]{64}$/u);
    await expect(
      loadRecoverySnapshot(paths.recoveryRoot, DOCUMENT_FIXTURE_IDS.project),
    ).resolves.toMatchObject({ ok: false, error: { code: 'recovery-not-found' } });
  });

  it('retains a newer recovery when an older user-file save finishes later', async () => {
    const paths = await createSessionPaths();
    const [initial, edited] = createHistories();
    const started = beginDocumentHistorySave(initial);
    if (!started.ok) {
      throw new Error('Expected session save fixture to start.');
    }
    let releaseSave = (): void => undefined;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const session = new ProjectPersistenceSession({
      projectId: DOCUMENT_FIXTURE_IDS.project,
      recoveryRoot: paths.recoveryRoot,
      services: {
        saveHistorySnapshot: async (...arguments_) => {
          await saveGate;
          return saveProjectHistorySnapshot(...arguments_);
        },
      },
    });

    const saving = session.save(started.snapshot, {}, paths.projectFile);
    expect(session.getStatus().saveInProgress).toBe(true);
    expect(session.scheduleRecovery(captureProjectRecoverySnapshot(edited))).toEqual({
      ok: true,
      scheduled: true,
    });
    await expect(session.save(started.snapshot, {}, paths.projectFile)).resolves.toMatchObject({
      ok: false,
      error: { code: 'save-in-progress' },
    });
    releaseSave();

    await expect(saving).resolves.toMatchObject({ ok: true });
    const userFile = await openProjectFile(paths.projectFile);
    const recovery = await loadRecoverySnapshot(paths.recoveryRoot, DOCUMENT_FIXTURE_IDS.project);
    if (!userFile.ok || !recovery.ok) {
      throw new Error('Expected both user file and newer recovery to load.');
    }
    expect(userFile.value.document).toEqual(initial.document);
    expect(recovery.value.document).toEqual(edited.document);
  });

  it('keeps a failed close retryable instead of half-closing the project session', async () => {
    const paths = await createSessionPaths();
    const [initial, edited] = createHistories();
    let attempts = 0;
    const session = new ProjectPersistenceSession({
      projectId: DOCUMENT_FIXTURE_IDS.project,
      recoveryRoot: paths.recoveryRoot,
      services: {
        writeRecovery: async (...arguments_) => {
          attempts += 1;
          if (attempts === 1) {
            return { ok: false, error: { code: 'write-failed', message: 'Injected failure.' } };
          }
          return writeRecoverySnapshot(...arguments_);
        },
      },
    });
    session.scheduleRecovery(captureProjectRecoverySnapshot(initial));

    await expect(session.close('retain-recovery')).resolves.toMatchObject({
      ok: false,
      error: { code: 'recovery-close-failed' },
    });
    expect(session.getStatus().closed).toBe(false);
    expect(session.scheduleRecovery(captureProjectRecoverySnapshot(edited))).toEqual({
      ok: true,
      scheduled: true,
    });

    await expect(session.close('retain-recovery')).resolves.toMatchObject({ ok: true });
    expect(attempts).toBe(2);
    const loaded = await loadRecoverySnapshot(paths.recoveryRoot, DOCUMENT_FIXTURE_IDS.project);
    if (!loaded.ok) {
      throw new Error('Expected recovery after retry to load.');
    }
    expect(loaded.value.document).toEqual(edited.document);
  });

  it('explicitly discards the exact recovery used to start a restored session', async () => {
    const paths = await createSessionPaths();
    const [initial] = createHistories();
    const written = await writeRecoverySnapshot(
      paths.recoveryRoot,
      captureProjectRecoverySnapshot(initial),
    );
    if (!written.ok) {
      throw new Error('Expected restored-session recovery fixture to write.');
    }
    const session = new ProjectPersistenceSession({
      projectId: DOCUMENT_FIXTURE_IDS.project,
      recoveryRoot: paths.recoveryRoot,
      initialRecoveryPointer: written.value.pointer,
    });

    await expect(session.close('discard-recovery')).resolves.toMatchObject({
      ok: true,
      value: { warnings: [] },
    });
    await expect(
      loadRecoverySnapshot(paths.recoveryRoot, DOCUMENT_FIXTURE_IDS.project),
    ).resolves.toMatchObject({ ok: false, error: { code: 'recovery-not-found' } });
  });
});
