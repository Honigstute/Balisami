// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  ProjectIdSchema,
  undoDocumentHistory,
  type ProjectDocument,
} from '../src/domain';
import { KeyboardNudgeInteraction } from '../src/renderer/editor/keyboard-nudge-interaction';
import { captureMoveTargets } from '../src/renderer/editor/move-geometry';
import {
  SelectionClipboardStore,
  copySelectedElements,
  pasteClipboardElements,
} from '../src/renderer/editor/selection-clipboard';
import { deleteSelectedElements } from '../src/renderer/editor/selection-delete';
import { duplicateSelectedElements } from '../src/renderer/editor/selection-duplicate';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { TextEditInteraction } from '../src/renderer/editor/text-edit-interaction';
import { createWorldRect } from '../src/renderer/editor/viewport-transform';
import type { AnimationFrameScheduler } from '../src/renderer/editor/viewport-camera-store';
import { ProjectSession } from '../src/renderer/projects/project-session';
import type {
  DesktopApi,
  ProjectCloseOutcome,
  ProjectCloseRequest,
  ProjectCloseResponse,
  ProjectCommand,
  ProjectHistorySnapshotRequest,
  ProjectOpenedResult,
  ProjectRecoveryDiscardedResult,
  ProjectSavedResult,
  ProjectStartupOptionsResult,
} from '../src/shared/desktop-api';
import { DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';
import { createAssetFreeProjectDocument } from './fixtures/project-file';

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
}

const createDeferred = <Value>(): Deferred<Value> => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};

class TestAnimationFrameScheduler implements AnimationFrameScheduler {
  readonly callbacks = new Map<number, (timestamp: number) => void>();
  #nextId = 1;

  cancel = (requestId: number): void => {
    this.callbacks.delete(requestId);
  };

  request = (callback: (timestamp: number) => void): number => {
    const requestId = this.#nextId++;
    this.callbacks.set(requestId, callback);
    return requestId;
  };
}

class FakeDesktopApi implements DesktopApi {
  readonly closeOutcomes = new Set<(outcome: ProjectCloseOutcome) => void>();
  readonly closeRequests = new Set<(request: ProjectCloseRequest) => void>();
  readonly closeResponses: ProjectCloseResponse[] = [];
  readonly commands = new Set<(command: ProjectCommand) => void>();
  readonly recoveryRequests: unknown[] = [];
  readonly saveRequests: ProjectHistorySnapshotRequest[] = [];
  readonly openRequests: unknown[] = [];

  nextDiscard: ProjectRecoveryDiscardedResult | undefined;
  nextOpen: ProjectOpenedResult | undefined;
  nextSave: Promise<ProjectSavedResult> | undefined;
  nextStartup: ProjectStartupOptionsResult | undefined;
  nextRestore: ProjectOpenedResult | undefined;

  constructor(readonly document: ProjectDocument) {}

  getRuntimeInfo = (): Promise<never> => Promise.reject(new Error('Not used by project session.'));

  discardProjectRecovery: DesktopApi['discardProjectRecovery'] = (request) =>
    Promise.resolve(
      this.nextDiscard ?? {
        status: 'completed',
        value: { discarded: true, recoveryId: request.recoveryId },
        warnings: [],
      },
    );

  getProjectStartupOptions: DesktopApi['getProjectStartupOptions'] = () =>
    Promise.resolve(
      this.nextStartup ?? {
        status: 'completed',
        value: { ignoredRecoveryEvidenceCount: 0, recentProjects: [], recoveries: [] },
        warnings: [],
      },
    );

  listRecentProjects: DesktopApi['listRecentProjects'] = () =>
    Promise.resolve({ status: 'completed', value: [], warnings: [] });

  onProjectCloseOutcome = (listener: (outcome: ProjectCloseOutcome) => void): (() => void) => {
    this.closeOutcomes.add(listener);
    return () => this.closeOutcomes.delete(listener);
  };

  onProjectCloseRequest = (listener: (request: ProjectCloseRequest) => void): (() => void) => {
    this.closeRequests.add(listener);
    return () => this.closeRequests.delete(listener);
  };

  onProjectCommand = (listener: (command: ProjectCommand) => void): (() => void) => {
    this.commands.add(listener);
    return () => this.commands.delete(listener);
  };

  reportRendererReady = (): Promise<void> => Promise.resolve();

  openProject: DesktopApi['openProject'] = (request) => {
    this.openRequests.push(request);
    return Promise.resolve(this.nextOpen ?? { status: 'cancelled' });
  };

  openRecentProject: DesktopApi['openRecentProject'] = () =>
    Promise.resolve({ status: 'cancelled' });

  respondToProjectClose = (response: ProjectCloseResponse): void => {
    this.closeResponses.push(response);
  };

  saveProject = (request: ProjectHistorySnapshotRequest): Promise<ProjectSavedResult> => {
    this.saveRequests.push(request);
    return this.nextSave ?? Promise.resolve({ status: 'cancelled' });
  };

  saveProjectAs = (request: ProjectHistorySnapshotRequest): Promise<ProjectSavedResult> =>
    this.saveProject(request);

  scheduleProjectRecovery: DesktopApi['scheduleProjectRecovery'] = (request) => {
    this.recoveryRequests.push(request);
    return Promise.resolve({
      status: 'completed',
      value: { scheduled: true, stateId: request.stateId },
      warnings: [],
    });
  };

  restoreProjectRecovery: DesktopApi['restoreProjectRecovery'] = () =>
    Promise.resolve(this.nextRestore ?? { status: 'cancelled' });

  startProject: DesktopApi['startProject'] = () =>
    Promise.resolve({
      status: 'completed',
      value: {
        assetsById: {},
        displayName: this.document.name,
        document: this.document,
        source: 'new',
      },
      warnings: [],
    });

  emitCloseRequest(request: ProjectCloseRequest): void {
    this.closeRequests.forEach((listener) => listener(request));
  }

  emitCloseOutcome(outcome: ProjectCloseOutcome): void {
    this.closeOutcomes.forEach((listener) => listener(outcome));
  }
}

const setBoardNote = (text: string) => ({
  type: DOCUMENT_COMMAND_TYPES.setBoardNote,
  boardId: DOCUMENT_FIXTURE_IDS.board,
  note: { text },
});

describe('renderer project session', () => {
  it('commits one selection delete and reconciles only after ProjectSession accepts it', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    const selection = new SelectionStore();
    selection.selectOnly(DOCUMENT_FIXTURE_IDS.child);
    await session.start();
    expect(desktop.recoveryRequests).toHaveLength(1);

    expect(
      deleteSelectedElements(
        document,
        selection,
        [DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child],
        {
          commit: (commands) => {
            const result = session.dispatchTransaction(commands, { label: 'Delete element' });
            return result?.ok === true && result.changed ? result.history.document : undefined;
          },
        },
      ),
    ).toBe(true);

    const history = session.getSnapshot().history;
    if (history === undefined) {
      throw new Error('Selection delete integration history was not created.');
    }
    expect(history.undoEntries).toHaveLength(1);
    expect(history.undoEntries[0]).toMatchObject({
      forwardCommands: [{ elementId: DOCUMENT_FIXTURE_IDS.child, type: 'element.delete' }],
      label: 'Delete element',
    });
    expect(history.document.elementsById[DOCUMENT_FIXTURE_IDS.child]).toBeUndefined();
    expect(selection.getSnapshot()).toMatchObject({ primaryId: undefined, selectedIds: [] });
    expect(desktop.recoveryRequests).toHaveLength(2);

    const undone = undoDocumentHistory(history);
    expect(undone).toMatchObject({ changed: true, ok: true });
    expect(undone.history.document).toEqual(document);
  });

  it('commits one selection duplicate and schedules one recovery point before selecting clones', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    const selection = new SelectionStore();
    const cloneId = ElementIdSchema.parse('element_sessionclone1');
    selection.selectOnly(DOCUMENT_FIXTURE_IDS.child);
    await session.start();
    expect(desktop.recoveryRequests).toHaveLength(1);

    expect(
      duplicateSelectedElements(
        document,
        selection,
        [DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child],
        () => cloneId,
        {
          commit: (commands) => {
            const result = session.dispatchTransaction(commands, { label: 'Duplicate element' });
            return result?.ok === true && result.changed ? result.history.document : undefined;
          },
        },
      ),
    ).toBe(true);

    const history = session.getSnapshot().history;
    if (history === undefined) {
      throw new Error('Selection duplicate integration history was not created.');
    }
    expect(history.undoEntries).toHaveLength(1);
    expect(history.undoEntries[0]).toMatchObject({
      forwardCommands: [{ element: { id: cloneId }, type: 'element.create' }],
      label: 'Duplicate element',
    });
    expect(history.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.childIds).toEqual([
      DOCUMENT_FIXTURE_IDS.child,
      cloneId,
    ]);
    expect(history.document.elementsById[cloneId]?.frame).toEqual({
      x: 26,
      y: 34,
      width: 120,
      height: 48,
    });
    expect(selection.getSnapshot()).toMatchObject({ primaryId: cloneId, selectedIds: [cloneId] });
    expect(desktop.recoveryRequests).toHaveLength(2);

    const undone = undoDocumentHistory(history);
    expect(undone).toMatchObject({ changed: true, ok: true });
    expect(undone.history.document).toEqual(document);
  });

  it('keeps copy outside history and commits one recoverable paste before selecting the clone', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    const selection = new SelectionStore();
    const clipboard = new SelectionClipboardStore();
    const cloneId = ElementIdSchema.parse('element_sessionpaste01');
    selection.selectOnly(DOCUMENT_FIXTURE_IDS.child);
    await session.start();
    expect(desktop.recoveryRequests).toHaveLength(1);

    expect(
      copySelectedElements(
        document,
        selection,
        [DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child],
        clipboard,
      ),
    ).toBe(true);
    expect(session.getSnapshot().history?.undoEntries).toHaveLength(0);
    expect(desktop.recoveryRequests).toHaveLength(1);
    expect(selection.getSnapshot()).toMatchObject({
      primaryId: DOCUMENT_FIXTURE_IDS.child,
      selectedIds: [DOCUMENT_FIXTURE_IDS.child],
    });

    expect(
      pasteClipboardElements(document, selection, clipboard, () => cloneId, {
        commit: (commands) => {
          const result = session.dispatchTransaction(commands, { label: 'Paste element' });
          return result?.ok === true && result.changed ? result.history.document : undefined;
        },
      }),
    ).toBe(true);

    const history = session.getSnapshot().history;
    if (history === undefined) {
      throw new Error('Selection paste integration history was not created.');
    }
    expect(history.undoEntries).toHaveLength(1);
    expect(history.undoEntries[0]).toMatchObject({
      forwardCommands: [{ element: { id: cloneId }, type: 'element.create' }],
      label: 'Paste element',
    });
    expect(history.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.childIds).toEqual([
      DOCUMENT_FIXTURE_IDS.child,
      cloneId,
    ]);
    expect(history.document.elementsById[cloneId]?.frame).toEqual({
      x: 26,
      y: 34,
      width: 120,
      height: 48,
    });
    expect(selection.getSnapshot()).toMatchObject({ primaryId: cloneId, selectedIds: [cloneId] });
    expect(clipboard.getSnapshot().pasteCount).toBe(1);
    expect(desktop.recoveryRequests).toHaveLength(2);

    const undone = undoDocumentHistory(history);
    expect(undone).toMatchObject({ changed: true, ok: true });
    expect(undone.history.document).toEqual(document);
  });

  it('commits one held-arrow nudge through ProjectSession and schedules one recovery point', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    const scheduler = new TestAnimationFrameScheduler();
    await session.start();
    expect(desktop.recoveryRequests).toHaveLength(1);

    const nudge = new KeyboardNudgeInteraction(
      {
        capture: (ids) => {
          const current = session.getSnapshot().history?.document;
          return current === undefined ? undefined : captureMoveTargets(current, ids);
        },
        commit: (commands) => {
          const result = session.dispatchTransaction(commands, { label: 'Nudge element' });
          return result?.ok === true && result.changed;
        },
      },
      scheduler,
    );

    expect(
      nudge.begin([DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child], 'ArrowRight', false),
    ).toBe(true);
    for (let index = 1; index < 500; index += 1) {
      nudge.step('ArrowRight', false);
    }
    expect(desktop.recoveryRequests).toHaveLength(1);
    expect(session.getSnapshot().history?.undoEntries).toHaveLength(0);

    expect(nudge.complete()).toBe('committed');
    expect(desktop.recoveryRequests).toHaveLength(2);
    expect(desktop.recoveryRequests[1]).toMatchObject({ stateId: 1 });
    const history = session.getSnapshot().history;
    if (history === undefined) {
      throw new Error('Nudge integration history was not created.');
    }
    expect(history.undoEntries).toHaveLength(1);
    expect(history.undoEntries[0]).toMatchObject({
      forwardCommands: [{ elementId: DOCUMENT_FIXTURE_IDS.group, type: 'element.set-frame' }],
      label: 'Nudge element',
    });
    expect(history.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.frame.x).toBe(480);
    expect(history.document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.frame).toEqual(
      document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.frame,
    );
    expect(scheduler.callbacks.size).toBe(0);

    const committedDocument = history.document;
    expect(nudge.begin([DOCUMENT_FIXTURE_IDS.group], 'ArrowUp', true)).toBe(true);
    nudge.step('ArrowUp', true);
    expect(nudge.cancel()).toBe(true);
    expect(session.getSnapshot().history?.document).toBe(committedDocument);
    expect(session.getSnapshot().history?.undoEntries).toHaveLength(1);
    expect(desktop.recoveryRequests).toHaveLength(2);

    const undone = undoDocumentHistory(history);
    expect(undone).toMatchObject({ changed: true, ok: true });
    expect(undone.history.document).toEqual(document);
  });

  it('publishes one history entry for an explicit multi-command transaction', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await session.start();

    const result = session.dispatchTransaction(
      [
        setBoardNote('Moved together'),
        {
          type: DOCUMENT_COMMAND_TYPES.renameBoard,
          boardId: DOCUMENT_FIXTURE_IDS.board,
          name: 'Renamed together',
        },
      ],
      { label: 'Compound edit' },
    );

    expect(result).toMatchObject({ changed: true, ok: true });
    expect(session.getSnapshot().history?.undoEntries).toHaveLength(1);
    expect(session.getSnapshot().history?.undoEntries[0]).toMatchObject({
      forwardCommands: [{ type: 'board.set-note' }, { type: 'board.rename' }],
      label: 'Compound edit',
    });
    expect(desktop.recoveryRequests).toHaveLength(2);
  });

  it('keeps an in-place text draft outside the document and commits one undoable recovery point', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await session.start();
    expect(desktop.recoveryRequests).toHaveLength(1);

    const interaction = new TextEditInteraction({
      capture: (elementId) => {
        const element = session.getSnapshot().history?.document.elementsById[elementId];
        if (element === undefined) {
          return undefined;
        }
        const text = element.properties.text;
        return {
          accessibleLabel: 'Edit element text',
          elementId,
          fontSizeWorldUnits: 16,
          mode: 'single-line',
          text: typeof text === 'string' ? text : '',
          worldBounds: createWorldRect(10, 20, element.frame.width, element.frame.height),
        };
      },
      commit: (target, text) => {
        const element = session.getSnapshot().history?.document.elementsById[target.elementId];
        if (element === undefined) {
          return false;
        }
        const result = session.dispatch(
          {
            type: DOCUMENT_COMMAND_TYPES.setElementProperties,
            elementId: target.elementId,
            properties: { ...element.properties, text },
          },
          { label: 'Edit text' },
        );
        return result?.ok === true && result.changed;
      },
    });

    const documentBeforeDraft = session.getSnapshot().history?.document;
    expect(interaction.begin(DOCUMENT_FIXTURE_IDS.child)).toBe(true);
    expect(interaction.updateDraft('Accepted label')).toBe(true);
    expect(session.getSnapshot().history?.document).toBe(documentBeforeDraft);
    expect(session.getSnapshot().history?.undoEntries).toHaveLength(0);
    expect(desktop.recoveryRequests).toHaveLength(1);

    expect(interaction.complete()).toBe('committed');
    const history = session.getSnapshot().history;
    if (history === undefined) {
      throw new Error('Text-edit integration history was not created.');
    }
    expect(history.document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.properties).toMatchObject({
      opacity: 0.75,
      text: 'Accepted label',
    });
    expect(history.undoEntries).toHaveLength(1);
    expect(history.undoEntries[0]?.label).toBe('Edit text');
    expect(history.undoEntries[0]?.forwardCommands).toEqual([
      {
        elementId: DOCUMENT_FIXTURE_IDS.child,
        properties: {
          opacity: 0.75,
          tags: ['example', true, null],
          text: 'Accepted label',
        },
        type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      },
    ]);
    expect(desktop.recoveryRequests).toHaveLength(2);

    const undone = undoDocumentHistory(history);
    expect(undone).toMatchObject({ changed: true, ok: true });
    expect(undone.history.document).toEqual(document);
  });

  it('waits for an explicit opaque recovery choice before creating a new history', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const recoveryId = '1c5a90d8-2f04-45d2-b2c6-67df91989081';
    desktop.nextStartup = {
      status: 'completed',
      value: {
        ignoredRecoveryEvidenceCount: 1,
        recentProjects: [],
        recoveries: [{ capturedAtEpochMs: 20, displayName: 'Recovered project', id: recoveryId }],
      },
      warnings: [],
    };
    desktop.nextRestore = {
      status: 'completed',
      value: {
        assetsById: {},
        displayName: 'Recovered project',
        document,
        source: 'recovery',
      },
      warnings: [],
    };
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });

    await session.start();
    expect(session.getSnapshot()).toMatchObject({
      dialog: { ignoredEvidenceCount: 1, kind: 'startup-recovery' },
      history: undefined,
      isReady: false,
    });

    await session.restoreRecovery(recoveryId);
    expect(session.getSnapshot()).toMatchObject({
      dialog: undefined,
      displayName: 'Recovered project',
      isDirty: true,
      isReady: true,
    });
    expect(session.getSnapshot().history?.document).toEqual(document);
  });

  it('starts a new project only after the last recovery is explicitly discarded', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const recoveryId = 'e01a0907-b8dc-4991-8435-81b9bb0a9e16';
    desktop.nextStartup = {
      status: 'completed',
      value: {
        ignoredRecoveryEvidenceCount: 0,
        recentProjects: [],
        recoveries: [{ capturedAtEpochMs: 20, displayName: 'Recovered project', id: recoveryId }],
      },
      warnings: [],
    };
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await session.start();

    await session.discardRecovery(recoveryId);

    expect(session.getSnapshot()).toMatchObject({
      dialog: undefined,
      isDirty: true,
      isReady: true,
    });
    expect(session.getSnapshot().history?.document).toEqual(document);
  });

  it('keeps a failed recovery choice visible and reports one stable problem', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const recoveryId = '69c61e88-1d1f-4692-9fa3-9f270c85f3ee';
    desktop.nextStartup = {
      status: 'completed',
      value: {
        ignoredRecoveryEvidenceCount: 0,
        recentProjects: [],
        recoveries: [{ capturedAtEpochMs: 20, displayName: 'Recovered project', id: recoveryId }],
      },
      warnings: [],
    };
    desktop.nextRestore = {
      status: 'failed',
      problem: {
        code: 'recovery-failed',
        title: 'Recovery could not be prepared',
        message: 'The recovery point was kept.',
      },
    };
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await session.start();

    await session.restoreRecovery(recoveryId);

    expect(session.getSnapshot()).toMatchObject({
      dialog: { kind: 'startup-recovery' },
      history: undefined,
      statusTone: 'problem',
    });
    expect(session.getSnapshot().statusLabel).toContain('The recovery point was kept');
  });

  it('keeps later edits dirty when an exact earlier save finishes', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await session.start();

    expect(session.dispatch(setBoardNote('Captured by save'))?.ok).toBe(true);
    const deferred = createDeferred<ProjectSavedResult>();
    desktop.nextSave = deferred.promise;
    const saving = session.save();
    await vi.waitFor(() => expect(desktop.saveRequests).toHaveLength(1));
    const captured = desktop.saveRequests[0];
    if (captured === undefined) {
      throw new Error('Expected the renderer to capture a save request.');
    }

    expect(session.dispatch(setBoardNote('Edited while saving'))?.ok).toBe(true);
    deferred.resolve({
      status: 'completed',
      value: {
        displayName: 'Saved Project',
        stateId: captured.stateId,
        tokenId: captured.tokenId,
      },
      warnings: [],
    });
    await saving;

    const view = session.getSnapshot();
    expect(view.history?.document.boardsById[DOCUMENT_FIXTURE_IDS.board]?.note.text).toBe(
      'Edited while saving',
    );
    expect(view.history?.savedStateId).toBe(captured.stateId);
    expect(view.history?.currentStateId).not.toBe(captured.stateId);
    expect(view.isDirty).toBe(true);
    expect(view.statusLabel).toContain('Unsaved changes');
  });

  it('restores the exact current history when project replacement is cancelled', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await session.start();
    session.dispatch(setBoardNote('Keep this exact edit'));
    const before = session.getSnapshot().history;

    await session.openProject();

    expect(desktop.openRequests).toHaveLength(1);
    expect(desktop.openRequests[0]).toMatchObject({
      dirty: true,
      projectDisplayName: document.name,
    });
    expect(session.getSnapshot().history?.document).toBe(before?.document);
    expect(session.getSnapshot().history?.currentStateId).toBe(before?.currentStateId);
    expect(session.getSnapshot().history?.pendingSaves).toHaveLength(0);
    expect(session.dispatch(setBoardNote('Still editable'))?.ok).toBe(true);
  });

  it('installs an opened file as the sole clean history after replacement succeeds', async () => {
    const document = createAssetFreeProjectDocument();
    const replacement = Object.freeze({
      ...document,
      id: ProjectIdSchema.parse('project_opened_replacement'),
      name: 'Opened replacement',
    });
    const desktop = new FakeDesktopApi(document);
    desktop.nextOpen = {
      status: 'completed',
      value: {
        assetsById: {},
        displayName: 'Opened replacement.test',
        document: replacement,
        source: 'project-file',
      },
      warnings: [],
    };
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await session.start();
    session.dispatch(setBoardNote('Old project edit'));

    await session.openProject();

    expect(session.getSnapshot()).toMatchObject({
      displayName: 'Opened replacement.test',
      isDirty: false,
      isReady: true,
    });
    expect(session.getSnapshot().history?.document).toEqual(replacement);
    expect(session.getSnapshot().history?.undoEntries).toHaveLength(0);
  });

  it('freezes history before answering close and unlocks exact state after cancellation', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    const unbind = session.bindDesktopEvents();
    await session.start();
    session.dispatch(setBoardNote('Approved close snapshot'));

    desktop.emitCloseRequest({ requestId: 'close-1' });
    await vi.waitFor(() => expect(desktop.closeResponses).toHaveLength(1));
    const response = desktop.closeResponses[0];
    expect(response).toMatchObject({ dirty: true, requestId: 'close-1', status: 'prepared' });
    expect(session.dispatch(setBoardNote('Must be blocked'))).toBeUndefined();
    expect(session.getSnapshot().isClosing).toBe(true);

    desktop.emitCloseOutcome({ requestId: 'close-1', result: { status: 'cancelled' } });
    expect(session.getSnapshot().isClosing).toBe(false);
    expect(session.getSnapshot().history?.pendingSaves).toHaveLength(0);
    expect(session.dispatch(setBoardNote('Allowed after cancel'))?.ok).toBe(true);
    expect(
      session.getSnapshot().history?.document.boardsById[DOCUMENT_FIXTURE_IDS.board]?.note.text,
    ).toBe('Allowed after cancel');
    unbind();
  });

  it('surfaces a wrong save receipt without marking history clean', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    desktop.nextSave = Promise.resolve({
      status: 'completed',
      value: { displayName: 'Wrong', stateId: 99, tokenId: 99 },
      warnings: [],
    });
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await session.start();
    session.dispatch(setBoardNote('Unsaved'));

    await session.save();

    expect(session.getSnapshot().isDirty).toBe(true);
    expect(session.getSnapshot().statusTone).toBe('problem');
    expect(session.getSnapshot().statusLabel).toContain('wrong save receipt');
  });

  it('replaces rejected bridge details with one static path-free save problem', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    desktop.nextSave = Promise.reject(new Error('private path: /Users/person/secret.project'));
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await session.start();
    session.dispatch(setBoardNote('Unsaved'));

    await session.save();

    expect(session.getSnapshot().statusLabel).toContain('desktop save did not finish');
    expect(session.getSnapshot().statusLabel).not.toContain('/Users/person');
    expect(session.getSnapshot().isDirty).toBe(true);
  });
});
