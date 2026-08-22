import type { BrowserWindow } from 'electron';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createM11AssetHeavyFixture,
  createM11AssetPerformanceBytes,
  createM11ComponentHeavyFixture,
  type M11ProjectPerformanceFixture,
} from '../domain/performance/m11-project-fixtures';
import { decodeProjectFileArchive, encodeProjectFileArchive } from '../persistence';
import {
  getM11PerformanceFailures,
  parseM11RenderPerformanceResult,
  type M11PerformanceBudgets,
  type M11PerformanceResult,
  type M11PerformanceScenarioResult,
} from '../shared/m11-performance';

const POLL_INTERVAL_MS = 25;

interface M11PerformanceProbeContract extends M11PerformanceBudgets {
  readonly processTimeoutMs: number;
  readonly resultAttribute: string;
}

type PersistenceScenarioResult = Omit<
  M11PerformanceScenarioResult,
  'renderMs' | 'renderedElementCount'
>;

const measurePersistence = async (
  fixture: M11ProjectPerformanceFixture,
  assetsById: Readonly<Record<string, Uint8Array>>,
  filePath: string,
): Promise<PersistenceScenarioResult> => {
  const saveStartedAt = performance.now();
  const encoded = await encodeProjectFileArchive(fixture.document, assetsById);
  if (!encoded.ok) {
    throw new Error(`The ${fixture.scenario} performance archive could not be encoded.`);
  }
  await writeFile(filePath, encoded.value);
  const saveMs = performance.now() - saveStartedAt;

  const openStartedAt = performance.now();
  const bytes = await readFile(filePath);
  const decoded = await decodeProjectFileArchive(bytes);
  const openMs = performance.now() - openStartedAt;
  if (!decoded.ok || decoded.value.document.id !== fixture.document.id) {
    throw new Error(`The ${fixture.scenario} performance archive could not be reopened exactly.`);
  }
  return Object.freeze({ archiveBytes: encoded.value.byteLength, openMs, saveMs });
};

export const measureM11ProjectPersistence = async (): Promise<
  Readonly<{
    assetHeavy: PersistenceScenarioResult;
    componentHeavy: PersistenceScenarioResult;
  }>
> => {
  const root = await mkdtemp(path.join(tmpdir(), 'balsamic-m11-performance-'));
  try {
    const assetHeavy = await measurePersistence(
      createM11AssetHeavyFixture(),
      createM11AssetPerformanceBytes(),
      path.join(root, 'asset-heavy.balsamic'),
    );
    const componentHeavy = await measurePersistence(
      createM11ComponentHeavyFixture(),
      {},
      path.join(root, 'component-heavy.balsamic'),
    );
    return Object.freeze({ assetHeavy, componentHeavy });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

/** Combines real native persistence timings with the renderer-owned scene timing. */
export const runPackagedM11PerformanceProbe = async (
  window: BrowserWindow,
  contract: M11PerformanceProbeContract,
  persistence: Awaited<ReturnType<typeof measureM11ProjectPersistence>>,
): Promise<M11PerformanceResult> => {
  const attribute = JSON.stringify(contract.resultAttribute);
  const deadline = Date.now() + contract.processTimeoutMs;
  while (Date.now() <= deadline) {
    const rawResult: unknown = await window.webContents.executeJavaScript(
      `document.querySelector('.app-shell')?.getAttribute(${attribute}) ?? null`,
      true,
    );
    const render = parseM11RenderPerformanceResult(rawResult);
    if (render !== undefined) {
      const result = Object.freeze({
        assetHeavy: Object.freeze({ ...persistence.assetHeavy, ...render.assetHeavy }),
        componentHeavy: Object.freeze({
          ...persistence.componentHeavy,
          ...render.componentHeavy,
        }),
      }) satisfies M11PerformanceResult;
      const failures = getM11PerformanceFailures(result, contract);
      if (failures.length > 0) {
        throw new Error(`Packaged M11 performance failed: ${failures.join(' ')}`);
      }
      return result;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('The packaged M11 performance result did not arrive in time.');
};
