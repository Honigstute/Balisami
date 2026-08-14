export const MAX_VISIBLE_NOTICES = 3;
export const NOTICE_REPEAT_WINDOW_MS = 5_000;

export type AppNoticeTone = 'danger' | 'info' | 'success' | 'warning';

export interface AppNotice {
  readonly key: string;
  readonly message: string;
  readonly title: string;
  readonly tone: AppNoticeTone;
}

const EMPTY_NOTICES: readonly AppNotice[] = Object.freeze([]);

const isValidNotice = (notice: AppNotice): boolean =>
  notice.key.length > 0 &&
  notice.key.length <= 80 &&
  /^[a-z0-9:._-]+$/u.test(notice.key) &&
  notice.title.trim().length > 0 &&
  notice.title.length <= 120 &&
  notice.message.trim().length > 0 &&
  notice.message.length <= 240 &&
  (notice.tone === 'danger' ||
    notice.tone === 'info' ||
    notice.tone === 'success' ||
    notice.tone === 'warning');

/** Bounded transient feedback with stable-key deduplication and repeat throttling. */
export class NoticeCenterStore {
  readonly #lastReportedAt = new Map<string, number>();
  readonly #listeners = new Set<() => void>();
  #snapshot: readonly AppNotice[] = EMPTY_NOTICES;

  getSnapshot = (): readonly AppNotice[] => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  report(notice: AppNotice, reportedAtEpochMs = Date.now()): boolean {
    if (!isValidNotice(notice) || !Number.isFinite(reportedAtEpochMs)) {
      return false;
    }
    if (this.#snapshot.some((candidate) => candidate.key === notice.key)) {
      return false;
    }
    const lastReportedAt = this.#lastReportedAt.get(notice.key);
    if (
      lastReportedAt !== undefined &&
      reportedAtEpochMs - lastReportedAt < NOTICE_REPEAT_WINDOW_MS
    ) {
      return false;
    }

    this.#lastReportedAt.set(notice.key, reportedAtEpochMs);
    this.#snapshot = Object.freeze(
      [...this.#snapshot, Object.freeze({ ...notice })].slice(-MAX_VISIBLE_NOTICES),
    );
    this.#publish();
    return true;
  }

  dismiss(key: string): boolean {
    const next = this.#snapshot.filter((notice) => notice.key !== key);
    if (next.length === this.#snapshot.length) {
      return false;
    }
    this.#snapshot = next.length === 0 ? EMPTY_NOTICES : Object.freeze(next);
    this.#publish();
    return true;
  }

  #publish(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
