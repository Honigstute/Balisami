import { describe, expect, it, vi } from 'vitest';

import { BoardIdSchema, parseProjectDocument } from '../src/domain';
import { createBoardExportPlan } from '../src/renderer/projects/board-export-plan';
import { exportBoardPlanToPdf } from '../src/renderer/projects/board-pdf-export';
import { DOCUMENT_FIXTURE_IDS, createValidProjectDocumentInput } from './fixtures/project-document';

const SECOND_BOARD_ID = BoardIdSchema.parse('board_secondary1');
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);

const createDocument = (externalLink = false) => {
  const input = createValidProjectDocumentInput();
  input.name = 'Checkout Project';
  input.boardIds.push(SECOND_BOARD_ID);
  input.boardsById[SECOND_BOARD_ID] = {
    alternateIds: [],
    childIds: [],
    id: SECOND_BOARD_ID,
    name: 'Confirmation',
    note: { text: '' },
    selectedAlternateId: null,
  };
  if (externalLink) {
    input.elementsById[DOCUMENT_FIXTURE_IDS.child]!.link = {
      kind: 'external',
      url: 'https://example.com/checkout?step=1',
    };
  }
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) throw new Error('PDF fixture is invalid.');
  return parsed.value;
};

describe('board PDF export', () => {
  it('writes one ordered page per planned board with internal link annotations', async () => {
    const document = createDocument();
    const planned = createBoardExportPlan(document, { kind: 'all' });
    if (!planned.ok) throw new Error(planned.message);
    const rasterize = vi
      .fn<(svg: string, width: number, height: number) => Promise<Uint8Array>>()
      .mockResolvedValue(JPEG_BYTES);

    const result = await exportBoardPlanToPdf({
      document,
      fontCss: '@font-face{font-family:"Comic Neue"}',
      plan: planned.value,
      rasterizer: { rasterize },
      readAssetBytes: (assetId) =>
        assetId === DOCUMENT_FIXTURE_IDS.asset ? new Uint8Array(1_024) : undefined,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    const pdf = new TextDecoder('latin1').decode(result.value.bytes);
    expect(pdf).toContain('%PDF-1.7');
    expect(pdf).toContain('/Type /Pages /Count 2');
    expect(pdf).toContain('/Subtype /Link');
    expect(pdf).toContain('/Dest [');
    expect(pdf).toContain('/Filter /DCTDecode');
    expect(pdf.endsWith('%%EOF\n')).toBe(true);
    expect(result.value.suggestedName).toBe('Checkout Project');
    expect(rasterize).toHaveBeenCalledTimes(2);
  });

  it('preserves external HTTP links as URI annotations', async () => {
    const document = createDocument(true);
    const planned = createBoardExportPlan(document, {
      boardId: DOCUMENT_FIXTURE_IDS.board,
      kind: 'current',
    });
    if (!planned.ok) throw new Error(planned.message);
    const result = await exportBoardPlanToPdf({
      document,
      fontCss: '',
      plan: planned.value,
      rasterizer: { rasterize: () => Promise.resolve(JPEG_BYTES) },
      readAssetBytes: () => undefined,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(new TextDecoder('latin1').decode(result.value.bytes)).toContain(
      '/URI (https://example.com/checkout?step=1)',
    );
  });

  it('rejects invalid page images without returning partial PDF bytes', async () => {
    const document = createDocument();
    const planned = createBoardExportPlan(document, { kind: 'all' });
    if (!planned.ok) throw new Error(planned.message);
    await expect(
      exportBoardPlanToPdf({
        document,
        fontCss: '',
        plan: planned.value,
        rasterizer: { rasterize: () => Promise.resolve(Uint8Array.from([1, 2, 3])) },
        readAssetBytes: () => undefined,
      }),
    ).resolves.toMatchObject({ code: 'encode-failed', ok: false });
  });
});
