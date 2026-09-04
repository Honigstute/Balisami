// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  AssetIdSchema,
  BoardIdSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  ProjectIdSchema,
  getControlSpec,
  parseProjectDocument,
  undoDocumentHistory,
  type ProjectDocument,
} from '../src/domain';
import { KeyboardNudgeInteraction } from '../src/renderer/editor/keyboard-nudge-interaction';
import { captureMoveTargets } from '../src/renderer/editor/move-geometry';
import {
  arrangeSelectedElements,
  SELECTION_ARRANGEMENT_ACTIONS,
} from '../src/renderer/editor/selection-arrangement';
import {
  SelectionClipboardStore,
  copySelectedElements,
  pasteClipboardElements,
} from '../src/renderer/editor/selection-clipboard';
import { deleteSelectedElements } from '../src/renderer/editor/selection-delete';
import { duplicateSelectedElements } from '../src/renderer/editor/selection-duplicate';
import { unlockAllBoardElements } from '../src/renderer/editor/selection-locking';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { TextEditInteraction } from '../src/renderer/editor/text-edit-interaction';
import { createWorldRect } from '../src/renderer/editor/viewport-transform';
import type { AnimationFrameScheduler } from '../src/renderer/editor/viewport-camera-store';
import { ProjectSession } from '../src/renderer/projects/project-session';
import { planBoardDuplicate } from '../src/renderer/projects/board-duplicate';
import type {
  DesktopApi,
  ProjectCloseOutcome,
  ProjectCloseRequest,
  ProjectCloseResponse,
  ProjectCommand,
  ProjectHistorySnapshotRequest,
  ProjectOpenedResult,
  ProjectRecoverySnapshotRequest,
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
  readonly recoveryRequests: ProjectRecoverySnapshotRequest[] = [];
  readonly saveRequests: ProjectHistorySnapshotRequest[] = [];
  readonly openRequests: unknown[] = [];
  readonly recentOpenRequests: unknown[] = [];

  nextDiscard: ProjectRecoveryDiscardedResult | undefined;
  nextOpen: ProjectOpenedResult | undefined;
  nextSave: Promise<ProjectSavedResult> | undefined;
  nextStartup: ProjectStartupOptionsResult | undefined;
  nextRestore: ProjectOpenedResult | undefined;

  constructor(readonly document: ProjectDocument) {}

  readClipboard: DesktopApi['readClipboard'] = () =>
    Promise.resolve({ imagePngBytes: null, payload: null, text: '' });

  writeClipboard: DesktopApi['writeClipboard'] = () => Promise.resolve({ accepted: true });

  getRuntimeInfo = (): Promise<never> => Promise.reject(new Error('Not used by project session.'));

  openExternalUrl: DesktopApi['openExternalUrl'] = () => Promise.resolve({ accepted: true });

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

  openRecentProject: DesktopApi['openRecentProject'] = (request) => {
    this.recentOpenRequests.push(request);
    return Promise.resolve(this.nextOpen ?? { status: 'cancelled' });
  };

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

const startNewSession = async (session: ProjectSession): Promise<void> => {
  await session.start();
  await session.startNewProject();
};

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

describe('renderer project session', () => {
  it('routes a path-free operating-system open command through staged recent-project replacement', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const recentProjectId = 'b'.repeat(64);
    desktop.nextOpen = {
      status: 'completed',
      value: {
        assetsById: {},
        displayName: 'Opened from Finder',
        document,
        source: 'project-file',
      },
      warnings: [],
    };
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await session.start();
    const unbind = session.bindDesktopEvents();

    desktop.commands.forEach((listener) => listener({ recentProjectId, type: 'open-recent-id' }));
    await vi.waitFor(() => expect(desktop.recentOpenRequests).toHaveLength(1));
    expect(desktop.recentOpenRequests[0]).toMatchObject({ recentProjectId });
    await vi.waitFor(() => expect(session.getSnapshot().displayName).toBe('Opened from Finder'));
    unbind();
  });

  it('does not report a project ready until its transition accepts renderer commands', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    let resolveStart:
      ((result: Awaited<ReturnType<DesktopApi['startProject']>>) => void) | undefined;
    desktop.startProject = () =>
      new Promise((resolve) => {
        resolveStart = resolve;
      });
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await session.start();

    const transition = session.startNewProject();
    expect(session.getSnapshot()).toMatchObject({ isReady: false, isTransitioning: true });
    expect(session.dispatch(setBoardNote('Blocked during transition'))).toBeUndefined();
    resolveStart?.({
      status: 'completed',
      value: { assetsById: {}, displayName: document.name, document, source: 'new' },
      warnings: [],
    });
    await transition;

    expect(session.getSnapshot()).toMatchObject({ isReady: true, isTransitioning: false });
    expect(session.dispatch(setBoardNote('Accepted after transition'))?.ok).toBe(true);
  });

  it('waits at the project home and opens a recent project without creating an untitled one', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const recentProjectId = 'a'.repeat(64);
    desktop.nextStartup = {
      status: 'completed',
      value: {
        ignoredRecoveryEvidenceCount: 0,
        recentProjects: [
          { displayName: 'Latest wireframe', id: recentProjectId, lastOpenedAtEpochMs: 100 },
        ],
        recoveries: [],
      },
      warnings: [],
    };
    desktop.nextOpen = {
      status: 'completed',
      value: {
        assetsById: {},
        displayName: 'Latest wireframe',
        document,
        source: 'project-file',
      },
      warnings: [],
    };
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });

    await session.start();

    expect(session.getSnapshot()).toMatchObject({
      history: undefined,
      isReady: false,
      startup: {
        recentProjects: [{ displayName: 'Latest wireframe', id: recentProjectId }],
        status: 'ready',
      },
    });

    await session.openRecentProject(recentProjectId);

    expect(desktop.recentOpenRequests).toEqual([
      {
        currentProject: { dirty: false, projectDisplayName: 'No project open' },
        recentProjectId,
      },
    ]);
    expect(session.getSnapshot()).toMatchObject({
      displayName: 'Latest wireframe',
      isReady: true,
      startup: undefined,
    });
  });

  it('publishes undo and redo through the same history and recovery authority', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await startNewSession(session);
    const initialRecoveryCount = desktop.recoveryRequests.length;

    expect(session.dispatch(setBoardNote('Alpha history'))).toMatchObject({
      changed: true,
      ok: true,
    });
    expect(session.undo()).toBe(true);
    expect(session.getSnapshot().history?.document).toEqual(document);
    expect(session.redo()).toBe(true);
    expect(
      session.getSnapshot().history?.document.boardsById[DOCUMENT_FIXTURE_IDS.board]?.note.text,
    ).toBe('Alpha history');
    expect(desktop.recoveryRequests).toHaveLength(initialRecoveryCount + 3);
  });

  it('commits authenticated asset bytes atomically and projects the exact live set', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await startNewSession(session);
    const assetId = AssetIdSchema.parse('asset_sessionimage01');
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const asset = Object.freeze({
      id: assetId,
      sha256: await sha256(bytes),
      mediaType: 'image/png' as const,
      byteLength: bytes.byteLength,
      originalName: 'session-image.png',
    });

    const imported = await session.dispatchTransactionWithAssets(
      [
        { type: DOCUMENT_COMMAND_TYPES.createAsset, asset },
        {
          type: DOCUMENT_COMMAND_TYPES.setElementAssets,
          elementId: DOCUMENT_FIXTURE_IDS.child,
          assetIds: [assetId],
        },
      ],
      { [assetId]: bytes },
      { label: 'Import image' },
    );

    expect(imported).toMatchObject({ changed: true, ok: true });
    expect(session.getSnapshot().history?.undoEntries).toHaveLength(1);
    expect(desktop.recoveryRequests.at(-1)?.assetsById[assetId]).toEqual(bytes);

    expect(session.undo()).toBe(true);
    expect(desktop.recoveryRequests.at(-1)?.assetsById).toEqual({});
    expect(session.redo()).toBe(true);
    expect(desktop.recoveryRequests.at(-1)?.assetsById[assetId]).toEqual(bytes);

    desktop.saveProject = (request) => {
      desktop.saveRequests.push(request);
      return Promise.resolve({
        status: 'completed',
        value: {
          displayName: 'Asset Project',
          stateId: request.stateId,
          tokenId: request.tokenId,
        },
        warnings: [],
      });
    };
    await session.save();
    expect(desktop.saveRequests.at(-1)?.assetsById[assetId]).toEqual(bytes);
  });

  it('rejects missing or unauthenticated asset bytes before history changes', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await startNewSession(session);
    const recoveryCount = desktop.recoveryRequests.length;
    const before = session.getSnapshot().history?.document;
    const assetId = AssetIdSchema.parse('asset_sessioninvalid1');
    const asset = Object.freeze({
      id: assetId,
      sha256: 'f'.repeat(64),
      mediaType: 'image/png' as const,
      byteLength: 4,
    });

    expect(session.dispatch({ type: DOCUMENT_COMMAND_TYPES.createAsset, asset })).toMatchObject({
      error: { code: 'invalid-transaction' },
      history: { document },
      ok: false,
    });
    expect(
      await session.dispatchTransactionWithAssets(
        [{ type: DOCUMENT_COMMAND_TYPES.createAsset, asset }],
        { [assetId]: Uint8Array.from([1, 2, 3, 4]) },
      ),
    ).toMatchObject({ error: { code: 'invalid-transaction' }, history: { document }, ok: false });
    expect(session.getSnapshot().history?.document).toBe(before);
    expect(session.getSnapshot().history?.undoEntries).toHaveLength(0);
    expect(desktop.recoveryRequests).toHaveLength(recoveryCount);
  });

  it('commits multi-element alignment as one history entry and one recovery schedule', async () => {
    const baseDocument = createAssetFreeProjectDocument();
    const board = baseDocument.boardsById[DOCUMENT_FIXTURE_IDS.board];
    const child = baseDocument.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (board === undefined || child === undefined) {
      throw new Error('Alignment integration fixture is incomplete.');
    }
    const secondId = ElementIdSchema.parse('element_align002');
    const thirdId = ElementIdSchema.parse('element_align003');
    const parsed = parseProjectDocument({
      ...baseDocument,
      boardsById: {
        ...baseDocument.boardsById,
        [board.id]: {
          ...board,
          childIds: [DOCUMENT_FIXTURE_IDS.group, secondId, thirdId],
        },
      },
      elementsById: {
        ...baseDocument.elementsById,
        [secondId]: {
          ...child,
          id: secondId,
          frame: { x: 140, y: 96, width: 80, height: 40 },
          childIds: [],
        },
        [thirdId]: {
          ...child,
          id: thirdId,
          frame: { x: 260, y: 144, width: 110, height: 55 },
          childIds: [],
        },
      },
    });
    if (!parsed.ok) {
      throw new Error(`Alignment integration fixture is invalid: ${JSON.stringify(parsed.issues)}`);
    }
    const document = parsed.value;
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    const selection = new SelectionStore();
    selection.replace([thirdId, DOCUMENT_FIXTURE_IDS.group, secondId], DOCUMENT_FIXTURE_IDS.group);
    await startNewSession(session);
    expect(desktop.recoveryRequests).toHaveLength(1);

    expect(
      arrangeSelectedElements(document, selection, SELECTION_ARRANGEMENT_ACTIONS.alignTop, {
        commit: (commands, label) => {
          const result = session.dispatchTransaction(commands, { label });
          return result?.ok === true && result.changed ? result.history.document : undefined;
        },
      }),
    ).toBe(true);

    const history = session.getSnapshot().history;
    if (history === undefined) {
      throw new Error('Alignment integration history was not created.');
    }
    expect(history.undoEntries).toHaveLength(1);
    expect(history.undoEntries[0]).toMatchObject({
      forwardCommands: [
        { elementId: secondId, type: 'element.set-frame' },
        { elementId: thirdId, type: 'element.set-frame' },
      ],
      label: 'Align elements top',
    });
    expect(history.document.elementsById[secondId]?.frame.y).toBe(12.5);
    expect(history.document.elementsById[thirdId]?.frame.y).toBe(12.5);
    expect(selection.getSnapshot()).toEqual({
      primaryId: DOCUMENT_FIXTURE_IDS.group,
      revision: 2,
      selectedIds: [DOCUMENT_FIXTURE_IDS.group, secondId, thirdId],
    });
    expect(desktop.recoveryRequests).toHaveLength(2);

    const undone = undoDocumentHistory(history);
    expect(undone).toMatchObject({ changed: true, ok: true });
    expect(undone.history.document).toEqual(document);
  });

  it('commits a multi-element unlock as one history entry and one recovery schedule', async () => {
    const baseDocument = createAssetFreeProjectDocument();
    const group = baseDocument.elementsById[DOCUMENT_FIXTURE_IDS.group];
    const child = baseDocument.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (group === undefined || child === undefined) {
      throw new Error('Unlock integration fixture is incomplete.');
    }
    const parsed = parseProjectDocument({
      ...baseDocument,
      elementsById: {
        ...baseDocument.elementsById,
        [group.id]: { ...group, locked: true },
        [child.id]: { ...child, locked: true },
      },
    });
    if (!parsed.ok) {
      throw new Error(`Unlock integration fixture is invalid: ${JSON.stringify(parsed.issues)}`);
    }
    const document = parsed.value;
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await startNewSession(session);
    expect(desktop.recoveryRequests).toHaveLength(1);

    expect(
      unlockAllBoardElements(document, DOCUMENT_FIXTURE_IDS.board, {
        commit: (commands, label) => {
          const result = session.dispatchTransaction(commands, { label });
          return result?.ok === true && result.changed ? result.history.document : undefined;
        },
      }),
    ).toBe(true);

    const history = session.getSnapshot().history;
    if (history === undefined) {
      throw new Error('Unlock integration history was not created.');
    }
    expect(history.undoEntries).toHaveLength(1);
    expect(history.undoEntries[0]?.forwardCommands).toHaveLength(2);
    expect(desktop.recoveryRequests).toHaveLength(2);
    const undone = undoDocumentHistory(history);
    expect(undone.ok && undone.changed ? JSON.stringify(undone.history.document) : '').toBe(
      JSON.stringify(document),
    );
  });

  it('commits one selection delete and reconciles only after ProjectSession accepts it', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    const selection = new SelectionStore();
    selection.selectOnly(DOCUMENT_FIXTURE_IDS.child);
    await startNewSession(session);
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
    await startNewSession(session);
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
    await startNewSession(session);
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
    await startNewSession(session);
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
    await startNewSession(session);

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

  it('duplicates a nested board through one history and recovery transaction', async () => {
    const document = createAssetFreeProjectDocument();
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await startNewSession(session);
    const cloneBoardId = BoardIdSchema.parse('board_sessionduplicate');
    const cloneElementIds = [
      ElementIdSchema.parse('element_sessiondup_group'),
      ElementIdSchema.parse('element_sessiondup_child'),
    ];
    const plan = planBoardDuplicate(
      document,
      DOCUMENT_FIXTURE_IDS.board,
      cloneBoardId,
      (_sourceId, index) => cloneElementIds[index],
    );
    if (plan === undefined) {
      throw new Error('Board duplicate transaction plan was not created.');
    }

    const result = session.dispatchTransaction(plan.commands, { label: 'Duplicate board' });

    expect(result).toMatchObject({ changed: true, ok: true });
    const history = session.getSnapshot().history;
    if (history === undefined) {
      throw new Error('Board duplicate transaction history was not created.');
    }
    expect(history.undoEntries).toHaveLength(1);
    expect(history.undoEntries[0]).toMatchObject({
      forwardCommands: [
        { type: 'board.create' },
        { type: 'element.create' },
        { type: 'element.create' },
      ],
      label: 'Duplicate board',
    });
    expect(desktop.recoveryRequests).toHaveLength(2);
    expect(undoDocumentHistory(history)).toMatchObject({
      changed: true,
      history: { document },
      ok: true,
    });
  });

  it('keeps an in-place text draft outside the document and commits one undoable recovery point', async () => {
    const baseDocument = createAssetFreeProjectDocument();
    const textInput = getControlSpec(CONTROL_TYPES.textInput);
    const baseElement = baseDocument.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (textInput === undefined || baseElement === undefined) {
      throw new Error('Text-edit integration fixture is incomplete.');
    }
    const parsed = parseProjectDocument({
      ...baseDocument,
      elementsById: {
        ...baseDocument.elementsById,
        [baseElement.id]: {
          ...baseElement,
          controlType: textInput.type,
          controlVersion: textInput.fileVersion,
          properties: { ...textInput.defaultProperties, text: 'Draft label' },
        },
      },
    });
    if (!parsed.ok) {
      throw new Error(`Text-edit integration fixture is invalid: ${JSON.stringify(parsed.issues)}`);
    }
    const document = parsed.value;
    const desktop = new FakeDesktopApi(document);
    const session = new ProjectSession({ createInitialDocument: () => document, desktop });
    await startNewSession(session);
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
      text: 'Accepted label',
    });
    expect(history.undoEntries).toHaveLength(1);
    expect(history.undoEntries[0]?.label).toBe('Edit text');
    expect(history.undoEntries[0]?.forwardCommands).toEqual([
      {
        elementId: DOCUMENT_FIXTURE_IDS.child,
        properties: { ...textInput.defaultProperties, text: 'Accepted label' },
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

  it('returns to the project home after the last recovery is explicitly discarded', async () => {
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
      history: undefined,
      isDirty: false,
      isReady: false,
      startup: { recentProjects: [], status: 'ready' },
    });
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
    await startNewSession(session);

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
    await startNewSession(session);
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
    await startNewSession(session);
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
    await startNewSession(session);
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
    await startNewSession(session);
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
    await startNewSession(session);
    session.dispatch(setBoardNote('Unsaved'));

    await session.save();

    expect(session.getSnapshot().statusLabel).toContain('desktop save did not finish');
    expect(session.getSnapshot().statusLabel).not.toContain('/Users/person');
    expect(session.getSnapshot().isDirty).toBe(true);
  });
});
