import path from 'node:path';
import type { BrowserWindow } from 'electron';

import {
  BoardIdSchema,
  DOCUMENT_COMMAND_TYPES,
  PROJECT_DOCUMENT_SCHEMA_VERSION,
  ProjectIdSchema,
  createDocumentHistory,
  dispatchHistoryCommand,
  parseProjectDocument,
  type HistoryStateId,
  type ProjectDocument,
} from '../../domain';
import { encodeCanonicalJson } from '../../persistence';
import { openProjectFile, saveProjectFile } from '../files/project-file-service';
import { isValidAbsoluteNonRootPath, isValidApplicationDataRoot } from '../files/path-validation';
import { ProjectLifecycleController } from '../projects/project-lifecycle-controller';
import { loadRecoverySnapshot } from './recovery-journal';
import { isValidRecoveryProbeFileName } from './recovery-probe-contract';
import type { RecoveryProbeContract } from './recovery-probe-contract';

interface RecoveryProbeFixture {
  readonly priorDocument: ProjectDocument;
  readonly recoveredDocument: ProjectDocument;
  readonly recoveredStateId: HistoryStateId;
}

const PROBE_PROJECT_ID = ProjectIdSchema.parse('project_recovery_probe');
const PROBE_BOARD_ID = BoardIdSchema.parse('board_recovery_probe');
const PRIOR_NOTE = 'This note was already present in the durable user file.';
const RECOVERED_NOTE = 'This accepted edit existed only in recovery when the process was killed.';
const RECOVERY_WRITE_TIMEOUT_MS = 10_000;
const RENDERER_RECOVERY_POLL_INTERVAL_MS = 25;

const createRecoveryProbeFixture = (): RecoveryProbeFixture => {
  const parsed = parseProjectDocument({
    schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
    id: PROBE_PROJECT_ID,
    name: 'Packaged recovery probe',
    boardIds: [PROBE_BOARD_ID],
    componentIds: [],
    trashedBoardIds: [],
    boardsById: {
      [PROBE_BOARD_ID]: {
        id: PROBE_BOARD_ID,
        name: 'Recovery proof',
        note: { text: PRIOR_NOTE },
        childIds: [],
        alternateIds: [],
        selectedAlternateId: null,
      },
    },
    componentsById: {},
    elementsById: {},
    assetsById: {},
  });
  if (!parsed.ok) {
    throw new Error('The packaged recovery-probe document fixture is invalid.');
  }

  const history = createDocumentHistory(parsed.value, { initiallySaved: true });
  const edited = dispatchHistoryCommand(history, {
    type: DOCUMENT_COMMAND_TYPES.setBoardNote,
    boardId: PROBE_BOARD_ID,
    note: { text: RECOVERED_NOTE },
  });
  if (!edited.ok || !edited.changed) {
    throw new Error('The packaged recovery-probe edit was not accepted by document history.');
  }
  return Object.freeze({
    priorDocument: parsed.value,
    recoveredDocument: edited.history.document,
    recoveredStateId: edited.history.currentStateId,
  });
};

const documentsAreEqual = (left: ProjectDocument, right: ProjectDocument): boolean => {
  const leftBytes = encodeCanonicalJson(left);
  const rightBytes = encodeCanonicalJson(right);
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    leftBytes.every((value, index) => value === rightBytes[index])
  );
};

const resolveProbeStorage = (
  root: unknown,
  userFileName: unknown,
): { readonly root: string; readonly userFilePath: string } => {
  if (!isValidApplicationDataRoot(root) || !isValidRecoveryProbeFileName(userFileName)) {
    throw new RangeError('The packaged recovery-probe storage configuration is invalid.');
  }
  const filePath = path.join(root, userFileName);
  if (!isValidAbsoluteNonRootPath(filePath)) {
    throw new RangeError('The packaged recovery-probe user-file path is invalid.');
  }
  return Object.freeze({ root, userFilePath: filePath });
};

const assertPriorUserFile = async (
  userFilePath: string,
  expected: ProjectDocument,
): Promise<void> => {
  const opened = await openProjectFile(userFilePath);
  if (!opened.ok || !documentsAreEqual(opened.value.document, expected)) {
    throw new Error('The prior user project was missing, invalid, or unexpectedly changed.');
  }
};

const waitForRecoveryWrite = async (
  lifecycle: ProjectLifecycleController,
  expectedStateId: HistoryStateId,
): Promise<void> => {
  const deadline = Date.now() + RECOVERY_WRITE_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    const status = lifecycle.getActiveStatus()?.autosave;
    if (status?.phase === 'failed') {
      throw new Error(`Recovery autosave failed with ${status.error?.code ?? 'unknown-error'}.`);
    }
    if (status?.phase === 'idle' && status.lastWrittenStateId === expectedStateId) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Recovery autosave did not become durable before the probe timeout.');
};

/** Prepares a durable user file plus a newer recovery state, then deliberately leaves the session open. */
export const preparePackagedRecoveryProbe = async (
  root: unknown,
  userFileName: unknown,
): Promise<void> => {
  const storage = resolveProbeStorage(root, userFileName);
  const fixture = createRecoveryProbeFixture();
  const saved = await saveProjectFile(storage.userFilePath, fixture.priorDocument);
  if (!saved.ok) {
    throw new Error(
      `The recovery probe could not create its prior user file: ${saved.error.code}.`,
    );
  }

  const lifecycle = new ProjectLifecycleController({
    recoveryRoot: storage.root,
    autosaveDebounceMs: 0,
  });
  const opened = await lifecycle.openProject(storage.userFilePath);
  if (!opened.ok) {
    throw new Error(`The recovery probe could not open its prior user file: ${opened.error.code}.`);
  }
  const scheduled = lifecycle.scheduleRecovery({
    document: fixture.recoveredDocument,
    stateId: fixture.recoveredStateId,
  });
  if (!scheduled.ok || !scheduled.scheduled) {
    throw new Error('The accepted recovery-probe edit was not scheduled for recovery.');
  }
  await waitForRecoveryWrite(lifecycle, fixture.recoveredStateId);

  const loaded = await loadRecoverySnapshot(storage.root, PROBE_PROJECT_ID);
  if (
    !loaded.ok ||
    loaded.value.pointer.stateId !== fixture.recoveredStateId ||
    loaded.value.pointer.sourceFilePath !== storage.userFilePath ||
    !documentsAreEqual(loaded.value.document, fixture.recoveredDocument)
  ) {
    throw new Error('The accepted recovery-probe edit was not durably readable.');
  }
  await assertPriorUserFile(storage.userFilePath, fixture.priorDocument);
};

/** Discovers and restores the crash state through the public lifecycle without authorizing its old path. */
export const verifyPackagedRecoveryProbe = async (
  root: unknown,
  userFileName: unknown,
): Promise<void> => {
  const storage = resolveProbeStorage(root, userFileName);
  const fixture = createRecoveryProbeFixture();
  await assertPriorUserFile(storage.userFilePath, fixture.priorDocument);

  const lifecycle = new ProjectLifecycleController({ recoveryRoot: storage.root });
  const discovery = await lifecycle.discoverRecoveries();
  const recovery = discovery.ok ? discovery.value.snapshots[0] : undefined;
  if (
    !discovery.ok ||
    discovery.value.snapshots.length !== 1 ||
    discovery.value.issues.length !== 0 ||
    discovery.value.omittedIssueCount !== 0 ||
    recovery === undefined ||
    recovery.pointer.projectId !== PROBE_PROJECT_ID ||
    recovery.pointer.stateId !== fixture.recoveredStateId ||
    recovery.pointer.sourceFilePath !== storage.userFilePath
  ) {
    throw new Error('The killed process did not leave one exact discoverable recovery point.');
  }

  const restored = await lifecycle.restoreRecovery(recovery.pointer);
  if (
    !restored.ok ||
    restored.value.source !== 'recovery' ||
    restored.value.filePath !== null ||
    restored.value.recoverySourceFilePath !== storage.userFilePath ||
    Object.keys(restored.value.assetsById).length !== 0 ||
    !documentsAreEqual(restored.value.document, fixture.recoveredDocument) ||
    lifecycle.getActiveStatus()?.filePath !== null
  ) {
    throw new Error(
      'The discovered recovery point did not restore the exact accepted edit safely.',
    );
  }
  await assertPriorUserFile(storage.userFilePath, fixture.priorDocument);
};

interface RendererRecoveryState {
  readonly isDirty: boolean;
  readonly isReady: boolean;
  readonly note: string;
  readonly source: string;
}

const parseRendererRecoveryState = (input: unknown): RendererRecoveryState | undefined => {
  if (typeof input !== 'string' || input.length > 4_096) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(input);
    if (
      typeof value === 'object' &&
      value !== null &&
      Object.keys(value).length === 4 &&
      'isDirty' in value &&
      typeof value.isDirty === 'boolean' &&
      'isReady' in value &&
      typeof value.isReady === 'boolean' &&
      'note' in value &&
      typeof value.note === 'string' &&
      'source' in value &&
      typeof value.source === 'string'
    ) {
      return value as unknown as RendererRecoveryState;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

/** Proves an ordinary renderer launch selected recovery and retained Save As semantics. */
export const verifyPackagedRecoveryThroughRenderer = async (
  window: BrowserWindow,
  root: unknown,
  userFileName: unknown,
  contract: RecoveryProbeContract,
): Promise<void> => {
  const storage = resolveProbeStorage(root, userFileName);
  const fixture = createRecoveryProbeFixture();
  await assertPriorUserFile(storage.userFilePath, fixture.priorDocument);

  const attribute = JSON.stringify(contract.rendererStateAttribute);
  const deadline = Date.now() + contract.processTimeoutMs;
  while (Date.now() <= deadline) {
    const rawState: unknown = await window.webContents.executeJavaScript(
      `document.querySelector('.app-shell')?.getAttribute(${attribute}) ?? null`,
      true,
    );
    const state = parseRendererRecoveryState(rawState);
    if (
      state?.isReady === true &&
      state.isDirty &&
      state.source === 'recovery' &&
      state.note === RECOVERED_NOTE
    ) {
      await assertPriorUserFile(storage.userFilePath, fixture.priorDocument);
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, RENDERER_RECOVERY_POLL_INTERVAL_MS));
  }
  throw new Error(
    'The ordinary packaged renderer did not restore the exact recovery state with Save As required.',
  );
};
