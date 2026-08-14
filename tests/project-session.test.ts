// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { DOCUMENT_COMMAND_TYPES, type ProjectDocument } from '../src/domain';
import { ProjectSession } from '../src/renderer/projects/project-session';
import type {
  DesktopApi,
  ProjectCloseOutcome,
  ProjectCloseRequest,
  ProjectCloseResponse,
  ProjectCommand,
  ProjectHistorySnapshotRequest,
  ProjectSavedResult,
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

class FakeDesktopApi implements DesktopApi {
  readonly closeOutcomes = new Set<(outcome: ProjectCloseOutcome) => void>();
  readonly closeRequests = new Set<(request: ProjectCloseRequest) => void>();
  readonly closeResponses: ProjectCloseResponse[] = [];
  readonly commands = new Set<(command: ProjectCommand) => void>();
  readonly recoveryRequests: unknown[] = [];
  readonly saveRequests: ProjectHistorySnapshotRequest[] = [];

  nextSave: Promise<ProjectSavedResult> | undefined;

  constructor(readonly document: ProjectDocument) {}

  getRuntimeInfo = (): Promise<never> => Promise.reject(new Error('Not used by project session.'));

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
