import { describe, expect, it } from 'vitest';

import m11PerformanceContract from '../m11-performance-contract.json';
import {
  createM11AssetHeavyFixture,
  createM11AssetPerformanceBytes,
  createM11ComponentHeavyFixture,
} from '../src/domain/performance/m11-project-fixtures';
import { encodeProjectFileArchive, decodeProjectFileArchive } from '../src/persistence';
import {
  getM11PerformanceFailures,
  isM11PerformanceProbeRequested,
  parseM11PerformanceResult,
  parseM11RenderPerformanceResult,
  type M11PerformanceResult,
} from '../src/shared/m11-performance';
import { createBoardSceneItems } from '../src/renderer/editor/document-scene-model';

const createPassingResult = (): M11PerformanceResult =>
  Object.freeze({
    assetHeavy: Object.freeze({
      archiveBytes: 5_100_000,
      openMs: 400,
      renderMs: 300,
      renderedElementCount: 1_000,
      saveMs: 500,
    }),
    componentHeavy: Object.freeze({
      archiveBytes: 500_000,
      openMs: 200,
      renderMs: 500,
      renderedElementCount: 2_500,
      saveMs: 300,
    }),
  });

describe('M11 packaged performance contract', () => {
  it('recognizes only the exact renderer query and bounded result shapes', () => {
    expect(
      isM11PerformanceProbeRequested(
        `?${m11PerformanceContract.queryKey}=${m11PerformanceContract.queryValue}`,
      ),
    ).toBe(true);
    expect(isM11PerformanceProbeRequested('')).toBe(false);
    expect(parseM11PerformanceResult(JSON.stringify(createPassingResult()))).toEqual(
      createPassingResult(),
    );
    expect(
      parseM11RenderPerformanceResult(
        JSON.stringify({
          assetHeavy: { renderMs: 20, renderedElementCount: 1_000 },
          componentHeavy: { renderMs: 30, renderedElementCount: 2_500 },
        }),
      ),
    ).toBeDefined();
    expect(
      parseM11PerformanceResult(JSON.stringify({ ...createPassingResult(), extra: true })),
    ).toBe(undefined);
  });

  it('enforces save, open-to-render, render, archive-size, and completeness budgets', () => {
    expect(getM11PerformanceFailures(createPassingResult(), m11PerformanceContract)).toEqual([]);
    const failing = createPassingResult();
    const failures = getM11PerformanceFailures(
      {
        assetHeavy: {
          ...failing.assetHeavy,
          archiveBytes: 4_999_999,
          openMs: 1_500,
          renderMs: 1_100,
          renderedElementCount: 999,
          saveMs: 2_001,
        },
        componentHeavy: {
          ...failing.componentHeavy,
          renderedElementCount: 2_499,
        },
      },
      m11PerformanceContract,
    );
    expect(failures).toEqual(
      expect.arrayContaining([
        'Asset-heavy save exceeded its budget.',
        'Asset-heavy open-to-render exceeded its budget.',
        'Asset-heavy render exceeded its budget.',
        'The asset-heavy archive is smaller than the representative fixture floor.',
        'The asset-heavy renderer did not present the complete fixture.',
        'The component-heavy renderer did not present the complete fixture.',
      ]),
    );
  });
});

describe('M11 project performance fixtures', () => {
  it('builds a complete 1,000-image, five-binary asset fixture', async () => {
    const fixture = createM11AssetHeavyFixture();
    const rendered = createBoardSceneItems(fixture.document, fixture.boardId).filter(
      (item) => item.kind === 'object',
    );
    expect(rendered).toHaveLength(fixture.expectedRenderableCount);
    expect(Object.keys(fixture.document.assetsById)).toHaveLength(5);

    const encoded = await encodeProjectFileArchive(
      fixture.document,
      createM11AssetPerformanceBytes(),
    );
    expect(encoded).toMatchObject({ ok: true });
    if (!encoded.ok) {
      throw new Error(encoded.error.message);
    }
    expect(encoded.value.byteLength).toBeGreaterThanOrEqual(
      m11PerformanceContract.minimumAssetArchiveBytes,
    );
    const decoded = await decodeProjectFileArchive(encoded.value);
    expect(decoded).toMatchObject({ ok: true });
    if (decoded.ok) {
      expect(decoded.value.document).toEqual(fixture.document);
    }
  });

  it('builds 100 definitions and 500 complete component instances', () => {
    const fixture = createM11ComponentHeavyFixture();
    const rendered = createBoardSceneItems(fixture.document, fixture.boardId).filter(
      (item) => item.kind === 'object',
    );
    expect(fixture.document.componentIds).toHaveLength(100);
    expect(fixture.document.boardsById[fixture.boardId]?.childIds).toHaveLength(500);
    expect(rendered).toHaveLength(fixture.expectedRenderableCount);
  });
});
