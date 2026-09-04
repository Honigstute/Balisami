import { describe, expect, it, vi } from 'vitest';

import { parseProjectDocument } from '../src/domain';
import { exportBoardToPng } from '../src/renderer/projects/board-png-export';
import { DOCUMENT_FIXTURE_IDS, createValidProjectDocumentInput } from './fixtures/project-document';

const PNG_BYTES = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const FIXTURE_ASSET_BYTES = new Uint8Array(1_024);

const readFixtureAssetBytes = (assetId: string): Uint8Array | undefined =>
  assetId === DOCUMENT_FIXTURE_IDS.asset ? FIXTURE_ASSET_BYTES : undefined;

const createDocument = () => {
  const input = createValidProjectDocumentInput();
  input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.name = 'Checkout Flow';
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) throw new Error('PNG export fixture is invalid.');
  return parsed.value;
};

describe('board PNG export', () => {
  it('renders the canonical presentation projection at an explicit scale', async () => {
    const rasterize = vi
      .fn<(svg: string, width: number, height: number) => Promise<Uint8Array>>()
      .mockResolvedValue(PNG_BYTES);
    const result = await exportBoardToPng({
      boardId: DOCUMENT_FIXTURE_IDS.board,
      document: createDocument(),
      fontCss: '@font-face{font-family:"Comic Neue"}',
      rasterizer: { rasterize },
      readAssetBytes: readFixtureAssetBytes,
      scale: 2,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        bytes: PNG_BYTES,
        height: 135,
        suggestedName: 'Checkout Flow',
        width: 279,
      },
    });
    expect(rasterize).toHaveBeenCalledOnce();
    const [svg, width, height] = rasterize.mock.calls[0]!;
    expect({ height, width }).toEqual({ height: 135, width: 279 });
    expect(svg).toContain('@font-face');
    expect(svg).toContain('aria-label="Checkout Flow"');
  });

  it('rejects unsupported runtime scales and missing boards', async () => {
    const base = {
      document: createDocument(),
      fontCss: '',
      rasterizer: { rasterize: () => Promise.resolve(PNG_BYTES) },
      readAssetBytes: readFixtureAssetBytes,
    };

    await expect(
      exportBoardToPng({
        ...base,
        boardId: DOCUMENT_FIXTURE_IDS.board,
        scale: 5 as never,
      }),
    ).resolves.toMatchObject({ code: 'invalid-board', ok: false });
    await expect(
      exportBoardToPng({ ...base, boardId: 'board_missing' as never, scale: 1 }),
    ).resolves.toMatchObject({ code: 'invalid-board', ok: false });
  });

  it('reports font and rasterization failures without producing a file', async () => {
    const base = {
      boardId: DOCUMENT_FIXTURE_IDS.board,
      document: createDocument(),
      readAssetBytes: readFixtureAssetBytes,
      scale: 1 as const,
    };

    await expect(
      exportBoardToPng({
        ...base,
        loadFontCss: async () => Promise.reject(new Error('missing')),
      }),
    ).resolves.toMatchObject({ code: 'font-unavailable', ok: false });
    await expect(
      exportBoardToPng({
        ...base,
        fontCss: '',
        rasterizer: { rasterize: () => Promise.resolve(Uint8Array.from([1, 2, 3])) },
      }),
    ).resolves.toMatchObject({ code: 'encode-failed', ok: false });
  });
});
