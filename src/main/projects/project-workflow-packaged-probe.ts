import type { BrowserWindow } from 'electron';
import path from 'node:path';

import { CONTROL_TYPES, type ProjectDocument } from '../../domain';
import type { NativeProjectDialogs } from '../dialogs/project-dialogs';
import { openProjectFile } from '../files/project-file-service';
import { captureSmokeScreenshot } from '../smoke-test';
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

const hasAcceptedAlphaControls = (document: ProjectDocument): boolean => {
  const boardId = document.boardIds[0];
  const board = boardId === undefined ? undefined : document.boardsById[boardId];
  if (board === undefined || board.childIds.length !== 4) {
    return false;
  }
  const elements = board.childIds.map((elementId) => document.elementsById[elementId]);
  const button = elements[2];
  const expectedFrames = [
    { x: 320, y: 220, width: 420, height: 280 },
    { x: 356, y: 252, width: 300, height: 36 },
    { x: 356, y: 392, width: 136, height: 44 },
    { x: 356, y: 320, width: 320, height: 44 },
  ] as const;
  const framesMatch = elements.every((element, index) => {
    const expected = expectedFrames[index];
    return (
      element !== undefined &&
      expected !== undefined &&
      element.frame.x === expected.x &&
      element.frame.y === expected.y &&
      element.frame.width === expected.width &&
      element.frame.height === expected.height
    );
  });
  return (
    elements.every((element) => element !== undefined) &&
    elements.map((element) => element?.controlType).join('|') ===
      [
        CONTROL_TYPES.rectangle,
        CONTROL_TYPES.textLabel,
        CONTROL_TYPES.button,
        CONTROL_TYPES.textInput,
      ].join('|') &&
    button?.properties.text === 'Alpha button' &&
    framesMatch
  );
};

const waitForRendererAlphaReady = async (
  window: BrowserWindow,
  readyAttribute: string,
  timeoutMs: number,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  const expression = `document.documentElement.getAttribute(${JSON.stringify(
    readyAttribute,
  )}) === 'true'`;
  while (Date.now() < deadline) {
    const ready: unknown = await window.webContents.executeJavaScript(expression, true);
    if (ready === true) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('The packaged renderer did not settle after saving its alpha project.');
};

const waitForSavedProject = async (
  filePath: string,
  expectedNote: string,
  timeoutMs: number,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const opened = await openProjectFile(filePath);
    if (
      opened.ok &&
      getFirstBoardNote(opened.value.document) === expectedNote &&
      hasAcceptedAlphaControls(opened.value.document)
    ) {
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
): Promise<string> => {
  const filePath = path.join(root, contract.userFileName);
  await waitForSavedProject(filePath, contract.note, contract.processTimeoutMs);
  await waitForRendererAlphaReady(window, contract.readyAttribute, contract.processTimeoutMs);
  const screenshotPath = await captureSmokeScreenshot(window, root);
  await closeWindowThroughHandshake(window, contract.processTimeoutMs);

  const reopenedLifecycle = new ProjectLifecycleController({ recoveryRoot: root });
  const reopened = await reopenedLifecycle.openProject(filePath);
  if (
    !reopened.ok ||
    reopened.value.source !== 'project-file' ||
    getFirstBoardNote(reopened.value.document) !== contract.note ||
    !hasAcceptedAlphaControls(reopened.value.document)
  ) {
    throw new Error(
      'The packaged saved project could not be reopened with the accepted alpha controls.',
    );
  }
  const closed = await reopenedLifecycle.closeActiveProject('discard-recovery');
  if (!closed.ok) {
    throw new Error('The packaged reopened project did not close cleanly.');
  }
  return screenshotPath;
};
