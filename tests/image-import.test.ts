// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { AssetIdSchema } from '../src/domain';
import {
  MAX_IMPORTED_IMAGE_DIMENSION,
  calculateImportedImageFrame,
  createBrowserImageDecodeService,
  detectImportedRasterMediaType,
  prepareImageImport,
} from '../src/renderer/projects/image-import';
import { createWorldPoint } from '../src/renderer/editor/viewport-transform';
import { MAX_PROJECT_ASSET_BYTES } from '../src/shared/project-file-limits';

const ASSET_ID = AssetIdSchema.parse('asset_imageimport01');
const PNG_BYTES = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

const createFile = (
  bytes: Uint8Array,
  input: Partial<{ name: string; size: number; type: string }> = {},
) => ({
  name: input.name ?? 'transparent.png',
  size: input.size ?? bytes.byteLength,
  type: input.type ?? 'image/png',
  arrayBuffer: () => Promise.resolve(Uint8Array.from(bytes).buffer),
});

describe('image import preparation', () => {
  it('uses byte signatures, decodes once, and preserves the exact authenticated bytes', async () => {
    const decode = vi.fn(() => Promise.resolve({ height: 320, width: 640 }));
    const result = await prepareImageImport(
      createFile(PNG_BYTES, { name: '  transparent.png  ', type: 'text/plain' }),
      ASSET_ID,
      { decode },
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        asset: {
          byteLength: PNG_BYTES.byteLength,
          id: ASSET_ID,
          mediaType: 'image/png',
          originalName: 'transparent.png',
        },
        dimensions: { height: 320, width: 640 },
      },
    });
    if (!result.ok) {
      throw new Error('Expected the PNG import to succeed.');
    }
    expect(result.value.asset.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.value.bytes).toEqual(PNG_BYTES);
    expect(decode).toHaveBeenCalledOnce();
    expect(decode).toHaveBeenCalledWith(PNG_BYTES, 'image/png');
  });

  it('recognizes only supported raster signatures', () => {
    expect(detectImportedRasterMediaType(PNG_BYTES)).toBe('image/png');
    expect(detectImportedRasterMediaType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg',
    );
    expect(detectImportedRasterMediaType(Uint8Array.from([71, 73, 70, 56, 57, 97, 0]))).toBe(
      'image/gif',
    );
    expect(detectImportedRasterMediaType(Uint8Array.from([60, 115, 118, 103]))).toBeUndefined();
  });

  it('rejects oversized files before reading and malformed files before decoding', async () => {
    const read = vi.fn(() => Promise.resolve(PNG_BYTES.buffer));
    const decode = vi.fn(() => Promise.resolve({ height: 1, width: 1 }));
    const oversized = await prepareImageImport(
      {
        name: 'huge.png',
        size: MAX_PROJECT_ASSET_BYTES + 1,
        type: 'image/png',
        arrayBuffer: read,
      },
      ASSET_ID,
      { decode },
    );
    expect(oversized).toMatchObject({ code: 'too-large', ok: false });
    expect(read).not.toHaveBeenCalled();

    const unsupported = await prepareImageImport(
      createFile(Uint8Array.from([1, 2, 3, 4])),
      ASSET_ID,
      { decode },
    );
    expect(unsupported).toMatchObject({ code: 'unsupported-type', ok: false });
    expect(decode).not.toHaveBeenCalled();
  });

  it('turns decode failures and decompression-bomb dimensions into bounded errors', async () => {
    const corrupt = await prepareImageImport(createFile(PNG_BYTES), ASSET_ID, {
      decode: () => Promise.reject(new Error('private decoder detail')),
    });
    expect(corrupt).toMatchObject({ code: 'decode-failed', ok: false });
    expect(JSON.stringify(corrupt)).not.toContain('private decoder detail');

    const tooLarge = await prepareImageImport(createFile(PNG_BYTES), ASSET_ID, {
      decode: () =>
        Promise.resolve({
          height: MAX_IMPORTED_IMAGE_DIMENSION,
          width: MAX_IMPORTED_IMAGE_DIMENSION,
        }),
    });
    expect(tooLarge).toMatchObject({ code: 'too-large', ok: false });
  });

  it('fits large images proportionally and keeps tiny controls selectable', () => {
    expect(
      calculateImportedImageFrame(createWorldPoint(100, 80), { width: 1_200, height: 600 }),
    ).toEqual({
      x: -140,
      y: -40,
      width: 480,
      height: 240,
    });
    expect(calculateImportedImageFrame(createWorldPoint(20, 20), { width: 1, height: 10 })).toEqual(
      {
        x: 8,
        y: 8,
        width: 24,
        height: 24,
      },
    );
  });

  it('requests orientation-aware browser decoding and always releases the bitmap', async () => {
    const close = vi.fn();
    const createBitmap = vi.fn(() => Promise.resolve({ close, height: 20, width: 30 }));
    vi.stubGlobal('createImageBitmap', createBitmap);
    try {
      await expect(
        createBrowserImageDecodeService().decode(PNG_BYTES, 'image/png'),
      ).resolves.toEqual({
        height: 20,
        width: 30,
      });
      expect(createBitmap).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({ imageOrientation: 'from-image' }),
      );
      expect(close).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
