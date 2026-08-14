import { randomUUID } from 'node:crypto';

import type {
  ProjectCloseOutcome,
  ProjectCloseRequest,
  ProjectClosedResult,
  ProjectClosedValue,
  ProjectOpenedResult,
  ProjectRecoveryScheduledResult,
  ProjectSavedResult,
} from '../../shared/desktop-api';
import { isProjectCloseResponse } from '../../shared/desktop-api';
import type { UserOperationProblem, UserOperationResult } from '../../shared/user-operation';
import type { ProjectLifecycleController } from './project-lifecycle-controller';
import type { ProjectNativeWorkflow } from './project-native-workflow';
import {
  parseProjectRecoveryTransport,
  parseProjectSaveTransport,
  parseProjectStartTransport,
} from './project-transport';

const INVALID_PROJECT_REQUEST: UserOperationProblem = Object.freeze({
  code: 'unexpected-native-failure',
  title: 'The project request was rejected',
  message: 'No project data changed. Retry the action from the editor.',
});

const INVALID_CLOSE_RESPONSE: UserOperationProblem = Object.freeze({
  code: 'close-failed',
  title: 'The project could not close safely',
  message: 'The project remains open because its latest state could not be confirmed.',
});

const failed = <Value>(problem: UserOperationProblem): UserOperationResult<Value> => ({
  status: 'failed',
  problem,
});

export interface ProjectWindowEventSink {
  readonly closeWindow: () => void;
  readonly sendCloseOutcome: (outcome: ProjectCloseOutcome) => void;
  readonly sendCloseRequest: (request: ProjectCloseRequest) => boolean;
}

export interface ProjectWindowControllerOptions {
  readonly events: ProjectWindowEventSink;
  readonly lifecycle: ProjectLifecycleController;
  readonly reportRejectedTransport?: (scope: string) => void;
  readonly workflow: ProjectNativeWorkflow;
}

/**
 * Adapts one renderer window to one native project workflow. It owns transport
 * validation and the close handshake, but never retains a live document copy.
 */
export class ProjectWindowController {
  readonly #events: ProjectWindowEventSink;
  readonly #lifecycle: ProjectLifecycleController;
  readonly #reportRejectedTransport: ((scope: string) => void) | undefined;
  readonly #workflow: ProjectNativeWorkflow;

  #closeAuthorized = false;
  #pendingCloseRequestId: string | undefined;
  #rendererUnavailableClose: Promise<void> | undefined;

  constructor(options: ProjectWindowControllerOptions) {
    this.#events = options.events;
    this.#lifecycle = options.lifecycle;
    this.#reportRejectedTransport = options.reportRejectedTransport;
    this.#workflow = options.workflow;
  }

  async startProject(input: unknown): Promise<ProjectOpenedResult> {
    const parsed = parseProjectStartTransport(input);
    if (!parsed.ok) {
      return this.#reject('start');
    }
    return this.#workflow.startNewProject(parsed.value.document, parsed.value.assetsById);
  }

  async saveProject(input: unknown, forceSaveAs = false): Promise<ProjectSavedResult> {
    const parsed = parseProjectSaveTransport(input);
    if (!parsed.ok) {
      return this.#reject('save');
    }
    return forceSaveAs
      ? this.#workflow.saveAs(parsed.value.snapshot, parsed.value.assetsById)
      : this.#workflow.save(parsed.value.snapshot, parsed.value.assetsById);
  }

  async scheduleRecovery(input: unknown): Promise<ProjectRecoveryScheduledResult> {
    const parsed = parseProjectRecoveryTransport(input);
    if (!parsed.ok) {
      return this.#reject('recovery');
    }
    return this.#workflow.scheduleRecovery(
      parsed.value.document,
      parsed.value.stateId,
      parsed.value.assetsById,
    );
  }

  /** Returns true only after the close state machine has durably authorized exit. */
  handleWindowCloseAttempt(rendererAvailable = true): boolean {
    if (this.#closeAuthorized) {
      return true;
    }
    if (this.#lifecycle.getActiveStatus() === undefined) {
      this.#closeAuthorized = true;
      return true;
    }
    if (!rendererAvailable) {
      return false;
    }
    if (this.#pendingCloseRequestId !== undefined) {
      return false;
    }

    const request = Object.freeze({ requestId: randomUUID() });
    this.#pendingCloseRequestId = request.requestId;
    if (!this.#events.sendCloseRequest(request)) {
      this.#pendingCloseRequestId = undefined;
      void this.handleRendererUnavailable();
    }
    return false;
  }

  async handleCloseResponse(input: unknown): Promise<void> {
    const expectedRequestId = this.#pendingCloseRequestId;
    if (expectedRequestId === undefined) {
      this.#reportRejectedTransport?.('unexpected-close-response');
      return;
    }
    if (!isProjectCloseResponse(input) || input.requestId !== expectedRequestId) {
      this.#reportRejectedTransport?.('invalid-close-response');
      this.#finishRejectedClose(expectedRequestId);
      return;
    }
    if (input.status === 'rejected') {
      this.#finishRejectedClose(expectedRequestId);
      return;
    }

    let saveSnapshot;
    let assetsById;
    if (input.saveSnapshot !== undefined) {
      const parsed = parseProjectSaveTransport(input.saveSnapshot);
      if (!parsed.ok) {
        this.#reportRejectedTransport?.('invalid-close-snapshot');
        this.#finishRejectedClose(expectedRequestId);
        return;
      }
      saveSnapshot = parsed.value.snapshot;
      assetsById = parsed.value.assetsById;
    }

    const result: ProjectClosedResult = await this.#workflow.requestClose({
      dirty: input.dirty,
      projectDisplayName: input.projectDisplayName,
      ...(saveSnapshot === undefined ? {} : { saveSnapshot }),
      ...(assetsById === undefined ? {} : { assetsById }),
    });
    if (result.status === 'completed') {
      this.#closeAuthorized = true;
      this.#pendingCloseRequestId = undefined;
      this.#events.closeWindow();
      return;
    }

    this.#pendingCloseRequestId = undefined;
    this.#events.sendCloseOutcome(Object.freeze({ requestId: expectedRequestId, result }));
  }

  /** Flushes known recovery state when a crashed renderer cannot answer close. */
  handleRendererUnavailable(): Promise<void> {
    if (this.#rendererUnavailableClose !== undefined) {
      return this.#rendererUnavailableClose;
    }
    this.#pendingCloseRequestId = undefined;
    this.#rendererUnavailableClose = this.#retainRecoveryAndClose().finally(() => {
      if (!this.#closeAuthorized) {
        this.#rendererUnavailableClose = undefined;
      }
    });
    return this.#rendererUnavailableClose;
  }

  async #retainRecoveryAndClose(): Promise<void> {
    if (this.#closeAuthorized) {
      return;
    }
    const result = await this.#workflow.retainRecoveryAndClose();
    if (result.status === 'completed') {
      this.#closeAuthorized = true;
      this.#events.closeWindow();
    }
  }

  #finishRejectedClose(requestId: string): void {
    this.#pendingCloseRequestId = undefined;
    this.#events.sendCloseOutcome(
      Object.freeze({ requestId, result: failed<ProjectClosedValue>(INVALID_CLOSE_RESPONSE) }),
    );
  }

  #reject<Value>(scope: string): UserOperationResult<Value> {
    this.#reportRejectedTransport?.(scope);
    return failed(INVALID_PROJECT_REQUEST);
  }
}
