import type { BrowserWindow } from 'electron';
import path from 'node:path';

import type { NativeProjectDialogs } from '../dialogs/project-dialogs';
import { openProjectFile } from '../files/project-file-service';
import { ProjectLifecycleController } from './project-lifecycle-controller';
import type { ProjectWorkflowProbeContract } from './project-workflow-probe-contract';

const POLL_INTERVAL_MS = 25;

export const createProjectWorkflowProbeDialogs = (
  root: string,
  userFileName: string,
): NativeProjectDialogs => {
  const filePath = path.join(root, userFileName);
  return Object.freeze({
    chooseOpenProject: () => Promise.resolve({ status: 'selected' as const, filePath }),
    chooseSaveProject: () => Promise.resolve({ status: 'selected' as const, filePath }),
    chooseUnsavedClose: () =>
      Promise.resolve({ status: 'selected' as const, choice: 'save' as const }),
  });
};

const getFirstBoardNote = (document: {
  readonly boardIds: readonly string[];
  readonly boardsById: Readonly<Record<string, { readonly note: { readonly text: string } }>>;
}): string | undefined => {
  const firstBoardId = document.boardIds[0];
  return firstBoardId === undefined ? undefined : document.boardsById[firstBoardId]?.note.text;
};

const waitForSavedProject = async (
  filePath: string,
  expectedNote: string,
  timeoutMs: number,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const opened = await openProjectFile(filePath);
    if (opened.ok && getFirstBoardNote(opened.value.document) === expectedNote) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('The packaged renderer edit did not reach the saved project in time.');
};

const closeWindowThroughHandshake = (window: BrowserWindow, timeoutMs: number): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('The packaged window close handshake timed out.'));
    }, timeoutMs);
    window.once('closed', () => {
      clearTimeout(timeout);
      resolve();
    });
    window.close();
  });

export const runPackagedProjectWorkflowProbe = async (
  window: BrowserWindow,
  root: string,
  contract: ProjectWorkflowProbeContract,
): Promise<void> => {
  const filePath = path.join(root, contract.userFileName);
  await waitForSavedProject(filePath, contract.note, contract.processTimeoutMs);
  await closeWindowThroughHandshake(window, contract.processTimeoutMs);

  const reopenedLifecycle = new ProjectLifecycleController({ recoveryRoot: root });
  const reopened = await reopenedLifecycle.openProject(filePath);
  if (
    !reopened.ok ||
    reopened.value.source !== 'project-file' ||
    getFirstBoardNote(reopened.value.document) !== contract.note
  ) {
    throw new Error('The packaged saved project could not be reopened with the accepted edit.');
  }
  const closed = await reopenedLifecycle.closeActiveProject('discard-recovery');
  if (!closed.ok) {
    throw new Error('The packaged reopened project did not close cleanly.');
  }
};
