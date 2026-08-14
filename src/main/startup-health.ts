const createFailure = (message: string, cause?: unknown): Error =>
  cause === undefined ? new Error(message) : new Error(message, { cause });

/**
 * Tracks the first startup failure and the renderer-ready handshake. The first
 * failure wins so a cascade cannot hide the event that made startup unhealthy.
 */
export class StartupHealthMonitor {
  readonly #statusChanged: Promise<void>;
  readonly #resolveStatusChanged: () => void;
  #failure: Error | undefined;
  #rendererReady = false;

  constructor() {
    let resolveStatusChanged = (): void => undefined;
    this.#statusChanged = new Promise<void>((resolve) => {
      resolveStatusChanged = resolve;
    });
    this.#resolveStatusChanged = resolveStatusChanged;
  }

  reportFailure(message: string, cause?: unknown): void {
    if (this.#failure !== undefined) {
      return;
    }

    this.#failure = createFailure(message, cause);
    this.#resolveStatusChanged();
  }

  reportRendererReady(): void {
    if (this.#rendererReady || this.#failure !== undefined) {
      return;
    }

    this.#rendererReady = true;
    this.#resolveStatusChanged();
  }

  assertHealthy(): void {
    if (this.#failure !== undefined) {
      throw this.#failure;
    }
  }

  async waitForRendererReady(timeoutMs: number): Promise<void> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError('Renderer readiness timeout must be a positive finite number.');
    }

    this.assertHealthy();
    if (this.#rendererReady) {
      return;
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Renderer did not report readiness within ${String(timeoutMs)} ms.`));
      }, timeoutMs);
    });

    try {
      await Promise.race([this.#statusChanged, timeout]);
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }

    this.assertHealthy();
    if (!this.#rendererReady) {
      throw new Error('Renderer readiness ended without a ready state.');
    }
  }
}
