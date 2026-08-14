// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { beginDocumentHistorySave, createDocumentHistory } from '../src/domain';
import type {
  NativeProjectDialogs,
  NativeProjectPathDialogResult,
  UnsavedCloseDialogResult,
} from '../src/main/dialogs/project-dialogs';
import { ProjectLifecycleController } from '../src/main/projects/project-lifecycle-controller';
import { ProjectNativeWorkflow } from '../src/main/projects/project-native-workflow';
import {
  ProjectWindowController,
  type ProjectWindowEventSink,
} from '../src/main/projects/project-window-controller';
import { RecentProjectStore } from '../src/main/recent/recent-project-store';
import type { ProjectCloseOutcome, ProjectCloseRequest } from '../src/shared/desktop-api';
import { createAssetFreeProjectDocument } from './fixtures/project-file';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

class QueuedDialogs implements NativeProjectDialogs {
  readonly closeResults: UnsavedCloseDialogResult[] = [];
  readonly saveResults: NativeProjectPathDialogResult[] = [];

  chooseOpenProject = (): Promise<NativeProjectPathDialogResult> =>
    Promise.resolve({ status: 'cancelled' });

  chooseSaveProject = (): Promise<NativeProjectPathDialogResult> =>
    Promise.resolve(this.saveResults.shift() ?? { status: 'cancelled' });

  chooseUnsavedClose = (): Promise<UnsavedCloseDialogResult> =>
    Promise.resolve(this.closeResults.shift() ?? { status: 'invalid-response' });
}

const createController = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'balsamic-window-controller-'));
  temporaryDirectories.push(root);
  const dialogs = new QueuedDialogs();
  const lifecycle = new ProjectLifecycleController({ recoveryRoot: root });
  const workflow = new ProjectNativeWorkflow({
    dialogs,
    lifecycle,
    recentProjects: new RecentProjectStore(root),
  });
  const requests: ProjectCloseRequest[] = [];
  const outcomes: ProjectCloseOutcome[] = [];
  let closeCalls = 0;
  const events: ProjectWindowEventSink = {
    closeWindow: () => {
      closeCalls += 1;
    },
    sendCloseOutcome: (outcome) => outcomes.push(outcome),
    sendCloseRequest: (request) => {
      requests.push(request);
      return true;
    },
  };
  const controller = new ProjectWindowController({ events, lifecycle, workflow });
  return {
    controller,
    dialogs,
    getCloseCalls: () => closeCalls,
    lifecycle,
    outcomes,
    requests,
    root,
  };
};

describe('project window controller', () => {
  it('rejects malformed renderer snapshots before the native workflow changes state', async () => {
    const { controller, lifecycle } = await createController();
    const document = createAssetFreeProjectDocument();

    await expect(
      controller.startProject({ assetsById: {}, document, path: '/private' }),
    ).resolves.toMatchObject({
      status: 'failed',
      problem: { code: 'unexpected-native-failure' },
    });
    expect(lifecycle.getActiveStatus()).toBeUndefined();

    await expect(controller.startProject({ assetsById: {}, document })).resolves.toMatchObject({
      status: 'completed',
      value: { document, source: 'new' },
    });
    await expect(
      controller.saveProject({ assetsById: {}, document, stateId: 0, tokenId: 0 }),
    ).resolves.toMatchObject({ status: 'failed' });
    expect(lifecycle.getActiveStatus()).toBeDefined();
  });

  it('keeps close pending through cancellation, then authorizes only after explicit discard', async () => {
    const { controller, dialogs, getCloseCalls, lifecycle, outcomes, requests } =
      await createController();
    const document = createAssetFreeProjectDocument();
    await controller.startProject({ assetsById: {}, document });
    const started = beginDocumentHistorySave(
      createDocumentHistory(document, { initiallySaved: false }),
    );
    if (!started.ok) {
      throw new Error('Expected close snapshot fixture to start.');
    }

    dialogs.closeResults.push(
      { status: 'selected', choice: 'cancel' },
      { status: 'selected', choice: 'discard' },
    );
    expect(controller.handleWindowCloseAttempt()).toBe(false);
    expect(controller.handleWindowCloseAttempt()).toBe(false);
    expect(requests).toHaveLength(1);
    await controller.handleCloseResponse({
      dirty: true,
      projectDisplayName: document.name,
      requestId: requests[0]?.requestId,
      saveSnapshot: {
        assetsById: {},
        document,
        stateId: started.snapshot.stateId,
        tokenId: started.snapshot.tokenId,
      },
      status: 'prepared',
    });
    expect(outcomes).toEqual([
      { requestId: requests[0]?.requestId, result: { status: 'cancelled' } },
    ]);
    expect(getCloseCalls()).toBe(0);
    expect(lifecycle.getActiveStatus()).toBeDefined();

    expect(controller.handleWindowCloseAttempt()).toBe(false);
    expect(requests).toHaveLength(2);
    await controller.handleCloseResponse({
      dirty: true,
      projectDisplayName: document.name,
      requestId: requests[1]?.requestId,
      saveSnapshot: {
        assetsById: {},
        document,
        stateId: started.snapshot.stateId,
        tokenId: started.snapshot.tokenId,
      },
      status: 'prepared',
    });
    expect(getCloseCalls()).toBe(1);
    expect(lifecycle.getActiveStatus()).toBeUndefined();
    expect(controller.handleWindowCloseAttempt()).toBe(true);
  });

  it('returns one path-free failure for a malformed close response and permits retry', async () => {
    const { controller, outcomes, requests } = await createController();
    const document = createAssetFreeProjectDocument();
    await controller.startProject({ assetsById: {}, document });
    expect(controller.handleWindowCloseAttempt()).toBe(false);

    await controller.handleCloseResponse({
      dirty: true,
      projectDisplayName: document.name,
      requestId: requests[0]?.requestId,
      status: 'prepared',
    });
    expect(outcomes).toMatchObject([
      { result: { status: 'failed', problem: { code: 'close-failed' } } },
    ]);
    expect(JSON.stringify(outcomes)).not.toContain(path.parse(process.cwd()).root);
    expect(controller.handleWindowCloseAttempt()).toBe(false);
    expect(requests).toHaveLength(2);
  });

  it('retains known recovery and closes once when the renderer is unavailable', async () => {
    const { controller, getCloseCalls, lifecycle } = await createController();
    const document = createAssetFreeProjectDocument();
    await controller.startProject({ assetsById: {}, document });

    await Promise.all([
      controller.handleRendererUnavailable(),
      controller.handleRendererUnavailable(),
    ]);

    expect(getCloseCalls()).toBe(1);
    expect(lifecycle.getActiveStatus()).toBeUndefined();
    expect(controller.handleWindowCloseAttempt()).toBe(true);
  });
});
