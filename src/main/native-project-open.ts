import path from 'node:path';

import type { ProjectCommand } from '../shared/desktop-api';
import { isValidAbsoluteNonRootPath } from './files/path-validation';
import type { RecentProjectStore } from './recent/recent-project-store';

export interface NativeProjectOpenTarget {
  readonly focus: () => void;
  readonly sendProjectCommand: (command: ProjectCommand) => void;
}

export interface NativeProjectOpenRouterOptions {
  readonly getTarget: () => NativeProjectOpenTarget | undefined;
  readonly recentProjects: Pick<RecentProjectStore, 'record'>;
  readonly reportFailure?: (error: unknown) => void;
}

/** Returns only path-like launch arguments; switches and runtime entry points stay ignored. */
export const extractNativeProjectFileArguments = (
  argv: readonly string[],
  firstCandidateIndex: number,
): readonly string[] =>
  Object.freeze(
    argv
      .slice(firstCandidateIndex)
      .filter((value) => !value.startsWith('--') && isValidAbsoluteNonRootPath(value))
      .map((value) => path.normalize(value)),
  );

/**
 * Keeps native paths in main and routes only the opaque recent ID to the renderer.
 * The renderer then reuses its existing dirty-project replacement handshake.
 */
export class NativeProjectOpenRouter {
  readonly #getTarget: () => NativeProjectOpenTarget | undefined;
  readonly #recentProjects: Pick<RecentProjectStore, 'record'>;
  readonly #reportFailure: ((error: unknown) => void) | undefined;
  #flushing = false;
  #pendingPath: string | undefined;
  #ready = false;

  constructor(options: NativeProjectOpenRouterOptions) {
    this.#getTarget = options.getTarget;
    this.#recentProjects = options.recentProjects;
    this.#reportFailure = options.reportFailure;
  }

  enqueue(filePath: unknown): boolean {
    if (!isValidAbsoluteNonRootPath(filePath)) return false;
    this.#pendingPath = path.normalize(filePath);
    void this.#flush();
    return true;
  }

  setReady(): void {
    this.#ready = true;
    void this.#flush();
  }

  focus(): void {
    this.#getTarget()?.focus();
  }

  async #flush(): Promise<void> {
    if (!this.#ready || this.#flushing) return;
    const target = this.#getTarget();
    const filePath = this.#pendingPath;
    if (target === undefined || filePath === undefined) return;
    this.#flushing = true;
    this.#pendingPath = undefined;
    try {
      const recorded = await this.#recentProjects.record(filePath);
      if (!recorded.ok) {
        this.#reportFailure?.(recorded.error);
        return;
      }
      const recent = recorded.value.entries[0];
      if (recent === undefined) return;
      target.focus();
      target.sendProjectCommand({ recentProjectId: recent.id, type: 'open-recent-id' });
    } catch (error) {
      this.#reportFailure?.(error);
    } finally {
      this.#flushing = false;
      if (this.#pendingPath !== undefined) void this.#flush();
    }
  }
}
