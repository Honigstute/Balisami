import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DOCUMENT_COMMAND_TYPES,
  createDocumentHistory,
  dispatchHistoryCommand,
} from '../src/domain';
import { saveProjectFile } from '../src/main/files/project-file-service';
import { ProjectLifecycleController } from '../src/main/projects/project-lifecycle-controller';
import {
  captureProjectRecoverySnapshot,
  loadRecoverySnapshot,
  writeRecoverySnapshot,
} from '../src/main/recovery/recovery-journal';
import { createAssetFreeProjectDocument } from './fixtures/project-file';
import { DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const temporaryDirectories: string[] = [];

const createLifecycleRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'balsamic-lifecycle-'));
  temporaryDirectories.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const createRecoveryHistories = () => {
  const initial = createDocumentHistory(createAssetFreeProjectDocument(), {
    initiallySaved: false,
  });
  const edited = dispatchHistoryCommand(initial, {
    type: DOCUMENT_COMMAND_TYPES.setBoardNote,
    boardId: DOCUMENT_FIXTURE_IDS.board,
    note: { text: 'Lifecycle recovery edit' },
  });
  if (!edited.ok || !edited.changed) {
    throw new Error('Expected lifecycle fixture edit to succeed.');
  }
  return { edited: edited.history, initial };
};

describe('project lifecycle controller', () => {
  it('validates and activates only one new project at a time', async () => {
    const root = await createLifecycleRoot();
    const document = createAssetFreeProjectDocument();
    const controller = new ProjectLifecycleController({ recoveryRoot: root });

    expect(controller.startNewProject({ ...document, name: '' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-project' },
    });
    expect(controller.startNewProject(document)).toMatchObject({
      ok: true,
      value: { document, filePath: null, source: 'new' },
    });
    expect(controller.startNewProject(document)).toMatchObject({
      ok: false,
      error: { code: 'active-project-exists' },
    });
    expect(controller.getActiveStatus()).toMatchObject({
      projectId: document.id,
      filePath: null,
    });

    await expect(controller.closeActiveProject('discard-recovery')).resolves.toMatchObject({
      ok: true,
    });
    expect(controller.getActiveStatus()).toBeUndefined();
  });

  it('discovers, restores, and then advances one exact recovery session', async () => {
    const root = await createLifecycleRoot();
    const { edited, initial } = createRecoveryHistories();
    const priorSourcePath = path.join(root, 'prior-user-file.test');
    const written = await writeRecoverySnapshot(
      root,
      captureProjectRecoverySnapshot(initial),
      {},
      { sourceFilePath: priorSourcePath },
    );
    if (!written.ok) {
      throw new Error('Expected lifecycle recovery fixture to write.');
    }
    const controller = new ProjectLifecycleController({ recoveryRoot: root });

    await expect(controller.discoverRecoveries()).resolves.toMatchObject({
      ok: true,
      value: { snapshots: [{ pointer: written.value.pointer }], issues: [] },
    });
    await expect(controller.restoreRecovery(written.value.pointer)).resolves.toMatchObject({
      ok: true,
      value: {
        document: initial.document,
        filePath: null,
        recoveryPointer: written.value.pointer,
        recoverySourceFilePath: priorSourcePath,
        source: 'recovery',
      },
    });
    expect(controller.scheduleRecovery(captureProjectRecoverySnapshot(edited))).toEqual({
      ok: true,
      scheduled: true,
    });
    await expect(controller.closeActiveProject('retain-recovery')).resolves.toMatchObject({
      ok: true,
    });

    const loaded = await loadRecoverySnapshot(root, DOCUMENT_FIXTURE_IDS.project);
    if (!loaded.ok) {
      throw new Error('Expected advanced lifecycle recovery to load.');
    }
    expect(loaded.value.document).toEqual(edited.document);
  });

  it('rejects a stale restore pointer without activating either recovery', async () => {
    const root = await createLifecycleRoot();
    const { edited, initial } = createRecoveryHistories();
    const first = await writeRecoverySnapshot(root, captureProjectRecoverySnapshot(initial));
    const second = await writeRecoverySnapshot(root, captureProjectRecoverySnapshot(edited));
    if (!first.ok || !second.ok) {
      throw new Error('Expected stale lifecycle recovery fixtures to write.');
    }
    const controller = new ProjectLifecycleController({ recoveryRoot: root });

    await expect(controller.restoreRecovery(first.value.pointer)).resolves.toMatchObject({
      ok: false,
      error: { code: 'recovery-changed' },
    });
    expect(controller.getActiveStatus()).toBeUndefined();
    await expect(controller.restoreRecovery(second.value.pointer)).resolves.toMatchObject({
      ok: true,
      value: { document: edited.document },
    });
  });

  it('discards an inactive exact recovery but protects an active project', async () => {
    const root = await createLifecycleRoot();
    const { initial } = createRecoveryHistories();
    const written = await writeRecoverySnapshot(root, captureProjectRecoverySnapshot(initial));
    if (!written.ok) {
      throw new Error('Expected discard lifecycle recovery fixture to write.');
    }
    const controller = new ProjectLifecycleController({ recoveryRoot: root });

    await expect(controller.restoreRecovery(written.value.pointer)).resolves.toMatchObject({
      ok: true,
    });
    await expect(controller.discardRecovery(written.value.pointer)).resolves.toMatchObject({
      ok: false,
      error: { code: 'active-project-exists' },
    });
    await expect(controller.closeActiveProject('retain-recovery')).resolves.toMatchObject({
      ok: true,
    });
    await expect(controller.discardRecovery(written.value.pointer)).resolves.toMatchObject({
      ok: true,
      value: { cleared: true },
    });
  });

  it('opens a validated project file and retains its path as session state', async () => {
    const root = await createLifecycleRoot();
    const filePath = path.join(root, 'opened-project.test');
    const document = createAssetFreeProjectDocument();
    const saved = await saveProjectFile(filePath, document);
    if (!saved.ok) {
      throw new Error('Expected lifecycle project file fixture to save.');
    }
    const controller = new ProjectLifecycleController({ recoveryRoot: root });

    await expect(controller.openProject(filePath)).resolves.toMatchObject({
      ok: true,
      value: { document, filePath, source: 'project-file' },
    });
    expect(controller.getActiveStatus()?.filePath).toBe(filePath);
  });
});
