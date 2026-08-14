import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DOCUMENT_COMMAND_TYPES,
  createDocumentHistory,
  dispatchHistoryCommand,
  type DocumentHistoryState,
} from '../src/domain';
import {
  captureProjectRecoverySnapshot,
  loadRecoverySnapshot,
  writeRecoverySnapshot,
  type ProjectRecoverySnapshot,
} from '../src/main/recovery/recovery-journal';
import {
  MAX_RECOVERY_POINTER_BYTES,
  RecoveryPointerV1Schema,
} from '../src/main/recovery/recovery-schema';
import { encodeProjectFileArchive } from '../src/persistence';
import { createAssetFreeProjectDocument } from './fixtures/project-file';
import { DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const temporaryDirectories: string[] = [];

const createRecoveryRoot = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'balsamic-recovery-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const createFirstSnapshot = (): {
  readonly history: DocumentHistoryState;
  readonly snapshot: ProjectRecoverySnapshot;
} => {
  const history = createDocumentHistory(createAssetFreeProjectDocument(), {
    initiallySaved: false,
  });
  return { history, snapshot: captureProjectRecoverySnapshot(history) };
};

const createEditedSnapshot = (history: DocumentHistoryState): ProjectRecoverySnapshot => {
  const edited = dispatchHistoryCommand(history, {
    type: DOCUMENT_COMMAND_TYPES.setBoardNote,
    boardId: DOCUMENT_FIXTURE_IDS.board,
    note: { text: 'Newer unsaved recovery content' },
  });
  if (!edited.ok || !edited.changed) {
    throw new Error('Expected recovery fixture edit to succeed.');
  }
  return captureProjectRecoverySnapshot(edited.history);
};

const recoveryPaths = (root: string, projectId: string) => {
  const project = path.join(root, 'recovery-v1', projectId);
  return {
    pointer: path.join(project, 'current.json'),
    snapshots: path.join(project, 'snapshots'),
  };
};

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

describe('recovery journal', () => {
  it('captures recovery identity without creating a user-save token or changing dirty state', () => {
    const history = createDocumentHistory(createAssetFreeProjectDocument(), {
      initiallySaved: false,
    });
    const captured = captureProjectRecoverySnapshot(history);

    expect(captured.document).toBe(history.document);
    expect(captured.stateId).toBe(history.currentStateId);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(history.pendingSaves).toEqual([]);
    expect(history.savedStateId).toBeNull();
  });

  it('writes and loads a content-addressed recovery point without touching the chosen file', async () => {
    const root = await createRecoveryRoot();
    const { snapshot } = createFirstSnapshot();
    const sourceFilePath = path.join(root, 'chosen-project.test');
    const sourceBytes = Uint8Array.from([7, 7, 7]);
    await writeFile(sourceFilePath, sourceBytes);

    const written = await writeRecoverySnapshot(
      root,
      snapshot,
      {},
      {
        capturedAtEpochMs: 1_800_000_000_000,
        sourceFilePath,
      },
    );
    expect(written).toMatchObject({
      ok: true,
      value: {
        pointer: {
          projectId: snapshot.document.id,
          stateId: snapshot.stateId,
          capturedAtEpochMs: 1_800_000_000_000,
          sourceFilePath,
        },
        warnings: [],
      },
    });
    const loaded = await loadRecoverySnapshot(root, snapshot.document.id);
    expect(loaded).toMatchObject({ ok: true });
    if (!loaded.ok) {
      throw new Error('Expected recovery snapshot loading to succeed.');
    }
    expect(loaded.value.document).toEqual(snapshot.document);
    expect(await readFile(sourceFilePath)).toEqual(Buffer.from(sourceBytes));

    const paths = recoveryPaths(root, snapshot.document.id);
    const snapshotNames = await readdir(paths.snapshots);
    expect(snapshotNames).toEqual([`${loaded.value.pointer.archiveSha256}.zip`]);
    expect((await readFile(paths.pointer)).byteLength).toBeLessThan(MAX_RECOVERY_POINTER_BYTES);
  });

  it('keeps the prior pointer current when a new content snapshot exists without pointer commit', async () => {
    const root = await createRecoveryRoot();
    const first = createFirstSnapshot();
    const secondSnapshot = createEditedSnapshot(first.history);
    const firstWrite = await writeRecoverySnapshot(
      root,
      first.snapshot,
      {},
      {
        capturedAtEpochMs: 100,
      },
    );
    if (!firstWrite.ok) {
      throw new Error('Expected first recovery write to succeed.');
    }

    const secondArchive = await encodeProjectFileArchive(secondSnapshot.document);
    if (!secondArchive.ok) {
      throw new Error('Expected second recovery archive encoding to succeed.');
    }
    const paths = recoveryPaths(root, first.snapshot.document.id);
    const orphanDigest = sha256(secondArchive.value);
    await writeFile(path.join(paths.snapshots, `${orphanDigest}.zip`), secondArchive.value);

    const interruptedLoad = await loadRecoverySnapshot(root, first.snapshot.document.id);
    if (!interruptedLoad.ok) {
      throw new Error('Expected prior recovery point to survive an orphan snapshot.');
    }
    expect(interruptedLoad.value.document).toEqual(first.snapshot.document);

    const secondWrite = await writeRecoverySnapshot(
      root,
      secondSnapshot,
      {},
      {
        capturedAtEpochMs: 200,
      },
    );
    if (!secondWrite.ok) {
      throw new Error('Expected second recovery write to succeed.');
    }
    const finalLoad = await loadRecoverySnapshot(root, first.snapshot.document.id);
    if (!finalLoad.ok) {
      throw new Error('Expected new recovery point to load.');
    }
    expect(finalLoad.value.document).toEqual(secondSnapshot.document);
    expect(await readdir(paths.snapshots)).toEqual([
      `${secondWrite.value.pointer.archiveSha256}.zip`,
    ]);
  });

  it('preserves corrupt pointer evidence and prior snapshots instead of overwriting them', async () => {
    const root = await createRecoveryRoot();
    const first = createFirstSnapshot();
    const secondSnapshot = createEditedSnapshot(first.history);
    const firstWrite = await writeRecoverySnapshot(root, first.snapshot);
    if (!firstWrite.ok) {
      throw new Error('Expected first recovery write to succeed.');
    }
    const paths = recoveryPaths(root, first.snapshot.document.id);
    await writeFile(paths.pointer, '{"truncated":');
    const snapshotsBefore = await readdir(paths.snapshots);

    await expect(writeRecoverySnapshot(root, secondSnapshot)).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-recovery-metadata' },
    });
    expect((await readFile(paths.pointer, 'utf8')).toString()).toBe('{"truncated":');
    expect(await readdir(paths.snapshots)).toEqual(snapshotsBefore);
  });

  it('detects snapshot tampering through pointer length and digest before decode', async () => {
    const root = await createRecoveryRoot();
    const { snapshot } = createFirstSnapshot();
    const written = await writeRecoverySnapshot(root, snapshot);
    if (!written.ok) {
      throw new Error('Expected recovery write to succeed.');
    }
    const paths = recoveryPaths(root, snapshot.document.id);
    const snapshotPath = path.join(paths.snapshots, `${written.value.pointer.archiveSha256}.zip`);
    const tampered = Uint8Array.from(await readFile(snapshotPath));
    tampered[0] = tampered[0] === 0 ? 1 : 0;
    await writeFile(snapshotPath, tampered);

    await expect(loadRecoverySnapshot(root, snapshot.document.id)).resolves.toMatchObject({
      ok: false,
      error: { code: 'recovery-integrity-failed' },
    });
  });

  it('rejects missing, mismatched, malformed, and unsupported recovery metadata', async () => {
    const root = await createRecoveryRoot();
    const { snapshot } = createFirstSnapshot();
    await expect(loadRecoverySnapshot(root, snapshot.document.id)).resolves.toMatchObject({
      ok: false,
      error: { code: 'recovery-not-found' },
    });
    await expect(loadRecoverySnapshot('relative', snapshot.document.id)).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-recovery-root' },
    });
    await expect(loadRecoverySnapshot(root, 'invalid')).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-recovery-metadata' },
    });

    const paths = recoveryPaths(root, snapshot.document.id);
    await mkdir(path.dirname(paths.pointer), { recursive: true });
    await writeFile(
      paths.pointer,
      JSON.stringify({
        format: 'wireframe-recovery',
        formatVersion: 2,
        projectId: snapshot.document.id,
      }),
    );
    await expect(loadRecoverySnapshot(root, snapshot.document.id)).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-recovery-metadata' },
    });

    await writeFile(paths.pointer, new Uint8Array(MAX_RECOVERY_POINTER_BYTES + 1));
    await expect(loadRecoverySnapshot(root, snapshot.document.id)).resolves.toMatchObject({
      ok: false,
      error: { code: 'file-too-large' },
    });
  });

  it('keeps the recovery pointer schema strict and bounded', () => {
    const valid = RecoveryPointerV1Schema.safeParse({
      format: 'wireframe-recovery',
      formatVersion: 1,
      projectId: DOCUMENT_FIXTURE_IDS.project,
      stateId: 0,
      capturedAtEpochMs: 0,
      archiveSha256: 'a'.repeat(64),
      archiveByteLength: 10,
      sourceFilePath: null,
    });
    expect(valid.success).toBe(true);
    expect(
      RecoveryPointerV1Schema.safeParse({
        ...(valid.success ? valid.data : {}),
        rendererSelection: [],
      }).success,
    ).toBe(false);
  });
});
