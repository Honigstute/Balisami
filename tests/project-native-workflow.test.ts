import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  beginDocumentHistorySave,
  createDocumentHistory,
  ProjectIdSchema,
  type HistorySaveSnapshot,
} from '../src/domain';
import type {
  NativeProjectDialogs,
  NativeProjectPathDialogResult,
  UnsavedCloseDialogResult,
} from '../src/main/dialogs/project-dialogs';
import { openProjectFile, saveProjectFile } from '../src/main/files/project-file-service';
import { ProjectLifecycleController } from '../src/main/projects/project-lifecycle-controller';
import {
  ProjectNativeWorkflow,
  type NativeProjectFailureReporter,
} from '../src/main/projects/project-native-workflow';
import { RecentProjectStore } from '../src/main/recent/recent-project-store';
import {
  captureProjectRecoverySnapshot,
  writeRecoverySnapshot,
} from '../src/main/recovery/recovery-journal';
import { createAssetFreeProjectDocument } from './fixtures/project-file';
import { DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const temporaryDirectories: string[] = [];

const createWorkflowRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'balsamic-native-workflow-'));
  temporaryDirectories.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

class QueuedProjectDialogs implements NativeProjectDialogs {
  readonly closeResults: UnsavedCloseDialogResult[] = [];
  readonly openResults: NativeProjectPathDialogResult[] = [];
  readonly saveResults: NativeProjectPathDialogResult[] = [];
  closeCalls = 0;
  openCalls = 0;
  saveCalls = 0;

  chooseOpenProject(): Promise<NativeProjectPathDialogResult> {
    this.openCalls += 1;
    return Promise.resolve(this.openResults.shift() ?? { status: 'invalid-response' });
  }

  chooseSaveProject(): Promise<NativeProjectPathDialogResult> {
    this.saveCalls += 1;
    return Promise.resolve(this.saveResults.shift() ?? { status: 'invalid-response' });
  }

  chooseUnsavedClose(): Promise<UnsavedCloseDialogResult> {
    this.closeCalls += 1;
    return Promise.resolve(this.closeResults.shift() ?? { status: 'invalid-response' });
  }
}

const createWorkflow = (
  root: string,
  dialogs: NativeProjectDialogs,
  reportFailure?: NativeProjectFailureReporter,
) => {
  const lifecycle = new ProjectLifecycleController({ recoveryRoot: root });
  const recentProjects = new RecentProjectStore(root);
  const workflow = new ProjectNativeWorkflow({
    dialogs,
    lifecycle,
    recentProjects,
    ...(reportFailure === undefined ? {} : { reportFailure }),
  });
  return { lifecycle, recentProjects, workflow };
};

const createSaveSnapshot = (): HistorySaveSnapshot => {
  const history = createDocumentHistory(createAssetFreeProjectDocument(), {
    initiallySaved: false,
  });
  const started = beginDocumentHistorySave(history);
  if (!started.ok) {
    throw new Error('Expected native workflow save fixture to start.');
  }
  return started.snapshot;
};

describe('project native workflow', () => {
  it('lists and restores recovery through one opaque path-free choice', async () => {
    const root = await createWorkflowRoot();
    const document = createAssetFreeProjectDocument();
    const sourceFilePath = path.join(root, 'Prior Project.test');
    const history = createDocumentHistory(document, { initiallySaved: false });
    const written = await writeRecoverySnapshot(
      root,
      captureProjectRecoverySnapshot(history),
      {},
      {
        sourceFilePath,
      },
    );
    if (!written.ok) {
      throw new Error('Expected native recovery-choice fixture to write.');
    }
    const dialogs = new QueuedProjectDialogs();
    const { lifecycle, workflow } = createWorkflow(root, dialogs);

    const options = await workflow.getStartupOptions();
    expect(options).toMatchObject({
      status: 'completed',
      value: {
        ignoredRecoveryEvidenceCount: 0,
        recoveries: [{ displayName: 'Prior Project.test' }],
      },
    });
    expect(JSON.stringify(options)).not.toContain(root);
    expect(JSON.stringify(options)).not.toContain(document.id);
    const recoveryId = options.status === 'completed' ? options.value.recoveries[0]?.id : undefined;
    if (recoveryId === undefined) {
      throw new Error('Expected one opaque recovery choice.');
    }

    await expect(workflow.restoreRecovery(recoveryId)).resolves.toMatchObject({
      status: 'completed',
      value: { document, source: 'recovery' },
    });
    expect(lifecycle.getActiveStatus()).toMatchObject({ filePath: null, projectId: document.id });
    await expect(workflow.restoreRecovery(recoveryId)).resolves.toMatchObject({
      status: 'failed',
      problem: { code: 'recovery-failed' },
    });
  });

  it('treats open cancellation as a normal result and exposes no path', async () => {
    const root = await createWorkflowRoot();
    const filePath = path.join(root, 'Opened Project.test');
    const document = createAssetFreeProjectDocument();
    const saved = await saveProjectFile(filePath, document);
    if (!saved.ok) {
      throw new Error('Expected open workflow fixture to save.');
    }
    const dialogs = new QueuedProjectDialogs();
    dialogs.openResults.push({ status: 'cancelled' }, { status: 'selected', filePath });
    const { workflow } = createWorkflow(root, dialogs);

    await expect(workflow.openFromDialog()).resolves.toEqual({ status: 'cancelled' });
    const opened = await workflow.openFromDialog();
    expect(opened).toMatchObject({
      status: 'completed',
      value: { displayName: 'Opened Project.test', document, source: 'project-file' },
      warnings: [],
    });
    expect(JSON.stringify(opened)).not.toContain(root);

    const recent = await workflow.listRecentProjects();
    expect(recent).toMatchObject({
      status: 'completed',
      value: [{ displayName: 'Opened Project.test' }],
    });
    expect(JSON.stringify(recent)).not.toContain(root);
  });

  it('validates a replacement file before asking to discard the active project', async () => {
    const root = await createWorkflowRoot();
    const invalidFilePath = path.join(root, 'Invalid Project.test');
    await writeFile(invalidFilePath, 'not a project');
    const dialogs = new QueuedProjectDialogs();
    dialogs.openResults.push({ status: 'selected', filePath: invalidFilePath });
    dialogs.closeResults.push({ status: 'selected', choice: 'discard' });
    const { lifecycle, workflow } = createWorkflow(root, dialogs);
    const current = createAssetFreeProjectDocument();
    lifecycle.startNewProject(current);

    await expect(
      workflow.openFromDialog({ dirty: false, projectDisplayName: current.name }),
    ).resolves.toMatchObject({ status: 'failed', problem: { code: 'open-failed' } });
    expect(dialogs.closeCalls).toBe(0);
    expect(lifecycle.getActiveStatus()?.projectId).toBe(current.id);
  });

  it('refuses to reinstall stale staged bytes when the selected file is already open', async () => {
    const root = await createWorkflowRoot();
    const filePath = path.join(root, 'Current Project.test');
    const document = createAssetFreeProjectDocument();
    const saved = await saveProjectFile(filePath, document);
    if (!saved.ok) {
      throw new Error('Expected already-open project fixture to save.');
    }
    const dialogs = new QueuedProjectDialogs();
    dialogs.openResults.push({ status: 'selected', filePath });
    dialogs.closeResults.push({ status: 'selected', choice: 'save' });
    const { lifecycle, workflow } = createWorkflow(root, dialogs);
    await lifecycle.openProject(filePath);

    await expect(
      workflow.openFromDialog({
        dirty: true,
        projectDisplayName: document.name,
        saveSnapshot: createSaveSnapshot(),
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      problem: { code: 'open-failed', title: 'This project is already open' },
    });
    expect(dialogs.closeCalls).toBe(0);
    expect(dialogs.saveCalls).toBe(0);
    expect(lifecycle.getActiveStatus()?.filePath).toBe(filePath);
  });

  it('replaces an active project only after an explicit discard decision', async () => {
    const root = await createWorkflowRoot();
    const targetPath = path.join(root, 'Replacement Project.test');
    const replacement = Object.freeze({
      ...createAssetFreeProjectDocument(),
      id: ProjectIdSchema.parse('project_replacement'),
      name: 'Replacement document',
    });
    const saved = await saveProjectFile(targetPath, replacement);
    if (!saved.ok) {
      throw new Error('Expected replacement project fixture to save.');
    }
    const dialogs = new QueuedProjectDialogs();
    dialogs.openResults.push({ status: 'selected', filePath: targetPath });
    dialogs.closeResults.push({ status: 'selected', choice: 'discard' });
    const { lifecycle, workflow } = createWorkflow(root, dialogs);
    const current = createAssetFreeProjectDocument();
    lifecycle.startNewProject(current);

    await expect(
      workflow.openFromDialog({
        dirty: true,
        projectDisplayName: current.name,
        saveSnapshot: createSaveSnapshot(),
      }),
    ).resolves.toMatchObject({
      status: 'completed',
      value: { document: replacement, source: 'project-file' },
    });
    expect(dialogs.closeCalls).toBe(1);
    expect(lifecycle.getActiveStatus()?.projectId).toBe(replacement.id);
    expect(lifecycle.getActiveStatus()?.filePath).toBe(targetPath);
  });

  it('uses Save As for an unbound project, then saves directly to the accepted path', async () => {
    const root = await createWorkflowRoot();
    const filePath = path.join(root, 'Saved Project.test');
    const dialogs = new QueuedProjectDialogs();
    dialogs.saveResults.push({ status: 'selected', filePath }, { status: 'cancelled' });
    const { lifecycle, workflow } = createWorkflow(root, dialogs);
    const snapshot = createSaveSnapshot();
    expect(lifecycle.startNewProject(snapshot.document)).toMatchObject({ ok: true });

    const firstSave = await workflow.save(snapshot);
    expect(firstSave).toMatchObject({
      status: 'completed',
      value: {
        displayName: 'Saved Project.test',
        stateId: snapshot.stateId,
        tokenId: snapshot.tokenId,
      },
    });
    expect(dialogs.saveCalls).toBe(1);
    await expect(workflow.save(snapshot)).resolves.toMatchObject({ status: 'completed' });
    expect(dialogs.saveCalls).toBe(1);
    await expect(workflow.saveAs(snapshot)).resolves.toEqual({ status: 'cancelled' });
    expect(lifecycle.getActiveStatus()?.filePath).toBe(filePath);

    const reopened = await openProjectFile(filePath);
    expect(reopened).toMatchObject({ ok: true, value: { document: snapshot.document } });
  });

  it('keeps the project open when unsaved close or its Save As is cancelled', async () => {
    const root = await createWorkflowRoot();
    const dialogs = new QueuedProjectDialogs();
    dialogs.closeResults.push(
      { status: 'selected', choice: 'cancel' },
      { status: 'selected', choice: 'save' },
      { status: 'selected', choice: 'discard' },
    );
    dialogs.saveResults.push({ status: 'cancelled' });
    const { lifecycle, workflow } = createWorkflow(root, dialogs);
    const snapshot = createSaveSnapshot();
    lifecycle.startNewProject(snapshot.document);

    const request = {
      dirty: true,
      projectDisplayName: snapshot.document.name,
      saveSnapshot: snapshot,
    } as const;
    await expect(workflow.requestClose(request)).resolves.toEqual({ status: 'cancelled' });
    expect(lifecycle.getActiveStatus()).toBeDefined();
    await expect(workflow.requestClose(request)).resolves.toEqual({ status: 'cancelled' });
    expect(lifecycle.getActiveStatus()).toBeDefined();
    await expect(workflow.requestClose(request)).resolves.toMatchObject({
      status: 'completed',
      value: { closed: true, discarded: true, saved: false },
    });
    expect(lifecycle.getActiveStatus()).toBeUndefined();
  });

  it('saves successfully through the unsaved-close state machine before closing', async () => {
    const root = await createWorkflowRoot();
    const filePath = path.join(root, 'Close Saved.test');
    const dialogs = new QueuedProjectDialogs();
    dialogs.closeResults.push({ status: 'selected', choice: 'save' });
    dialogs.saveResults.push({ status: 'selected', filePath });
    const { lifecycle, workflow } = createWorkflow(root, dialogs);
    const snapshot = createSaveSnapshot();
    lifecycle.startNewProject(snapshot.document);

    await expect(
      workflow.requestClose({
        dirty: true,
        projectDisplayName: snapshot.document.name,
        saveSnapshot: snapshot,
      }),
    ).resolves.toMatchObject({
      status: 'completed',
      value: { closed: true, discarded: false, saved: true },
    });
    expect(lifecycle.getActiveStatus()).toBeUndefined();
    await expect(openProjectFile(filePath)).resolves.toMatchObject({
      ok: true,
      value: { document: snapshot.document },
    });
  });

  it('keeps the project open when save-before-close fails', async () => {
    const root = await createWorkflowRoot();
    const dialogs = new QueuedProjectDialogs();
    dialogs.closeResults.push({ status: 'selected', choice: 'save' });
    dialogs.saveResults.push({ status: 'selected', filePath: path.parse(root).root });
    const failures: unknown[] = [];
    const { lifecycle, workflow } = createWorkflow(root, dialogs, (_scope, error) => {
      failures.push(error);
    });
    const snapshot = createSaveSnapshot();
    lifecycle.startNewProject(snapshot.document);

    await expect(
      workflow.requestClose({
        dirty: true,
        projectDisplayName: snapshot.document.name,
        saveSnapshot: snapshot,
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      problem: { code: 'save-failed' },
    });
    expect(lifecycle.getActiveStatus()).toBeDefined();
    expect(failures).toHaveLength(1);
  });

  it('rejects overlapping native operations without opening duplicate dialogs', async () => {
    const root = await createWorkflowRoot();
    let releaseOpen = (): void => undefined;
    const openResult = new Promise<NativeProjectPathDialogResult>((resolve) => {
      releaseOpen = () => resolve({ status: 'cancelled' });
    });
    let openCalls = 0;
    const dialogs: NativeProjectDialogs = {
      chooseOpenProject: () => {
        openCalls += 1;
        return openResult;
      },
      chooseSaveProject: () => Promise.resolve({ status: 'cancelled' }),
      chooseUnsavedClose: () => Promise.resolve({ status: 'selected', choice: 'cancel' }),
    };
    const { workflow } = createWorkflow(root, dialogs);

    const first = workflow.openFromDialog();
    await expect(workflow.openFromDialog()).resolves.toMatchObject({
      status: 'failed',
      problem: { code: 'operation-in-progress' },
    });
    expect(openCalls).toBe(1);
    releaseOpen();
    await expect(first).resolves.toEqual({ status: 'cancelled' });
  });

  it('forgets a missing recent file and reports only a bounded path-free problem', async () => {
    const root = await createWorkflowRoot();
    const missingPath = path.join(root, 'Missing Project.test');
    const dialogs = new QueuedProjectDialogs();
    const failures: unknown[] = [];
    const { recentProjects, workflow } = createWorkflow(root, dialogs, (_scope, error) => {
      failures.push(error);
    });
    const recorded = await recentProjects.record(missingPath, 100);
    if (!recorded.ok || recorded.value.entries[0] === undefined) {
      throw new Error('Expected missing recent-project fixture to record.');
    }

    const opened = await workflow.openRecent(recorded.value.entries[0].id);
    expect(opened).toMatchObject({
      status: 'failed',
      problem: { code: 'open-failed', title: 'Project file not found' },
    });
    expect(JSON.stringify(opened)).not.toContain(root);
    await expect(recentProjects.list()).resolves.toEqual({ ok: true, value: [] });
    expect(failures).toHaveLength(1);
  });

  it('keeps successful open separate from a corrupt recent-metadata warning', async () => {
    const root = await createWorkflowRoot();
    const filePath = path.join(root, 'Safe Project.test');
    const document = createAssetFreeProjectDocument();
    const saved = await saveProjectFile(filePath, document);
    if (!saved.ok) {
      throw new Error('Expected corrupt-recent workflow fixture to save.');
    }
    await writeFile(path.join(root, 'recent-projects-v1.json'), '{"truncated":');
    const dialogs = new QueuedProjectDialogs();
    dialogs.openResults.push({ status: 'selected', filePath });
    const failures: unknown[] = [];
    const { workflow } = createWorkflow(root, dialogs, (_scope, error) => {
      failures.push(error);
    });

    await expect(workflow.openFromDialog()).resolves.toMatchObject({
      status: 'completed',
      value: { document },
      warnings: [{ code: 'recent-files-update-failed' }],
    });
    expect(failures).toHaveLength(1);
  });

  it('returns one static failure when a dialog throws and keeps technical detail in main', async () => {
    const root = await createWorkflowRoot();
    const technicalError = new Error(`private path: ${root}`);
    const failures: { readonly error: unknown; readonly scope: string }[] = [];
    const dialogs: NativeProjectDialogs = {
      chooseOpenProject: () => Promise.reject(technicalError),
      chooseSaveProject: () => Promise.resolve({ status: 'cancelled' }),
      chooseUnsavedClose: () => Promise.resolve({ status: 'selected', choice: 'cancel' }),
    };
    const { workflow } = createWorkflow(root, dialogs, (scope, error) => {
      failures.push({ error, scope });
    });

    const result = await workflow.openFromDialog();
    expect(result).toMatchObject({
      status: 'failed',
      problem: { code: 'unexpected-native-failure' },
    });
    expect(JSON.stringify(result)).not.toContain(root);
    expect(failures).toEqual([{ error: technicalError, scope: 'open' }]);
  });

  it('maps malformed native dialog output to one stable user problem', async () => {
    const root = await createWorkflowRoot();
    const dialogs = new QueuedProjectDialogs();
    const { workflow } = createWorkflow(root, dialogs);

    await expect(workflow.openFromDialog()).resolves.toEqual({
      status: 'failed',
      problem: {
        code: 'invalid-dialog-response',
        title: 'The system dialog did not finish correctly',
        message: 'No project was changed. Please try the action again.',
      },
    });
  });

  it('does not confuse project identity with a recent opaque id', async () => {
    const root = await createWorkflowRoot();
    const dialogs = new QueuedProjectDialogs();
    const { workflow } = createWorkflow(root, dialogs);
    await expect(workflow.openRecent(DOCUMENT_FIXTURE_IDS.project)).resolves.toMatchObject({
      status: 'failed',
      problem: { code: 'recent-project-not-found' },
    });
  });
});
