import type { AssetId, BoardId, ProjectDocument } from '../../domain';
import {
  MAX_IMPORTED_IMAGE_DIMENSION,
  MAX_IMPORTED_IMAGE_PIXELS,
} from '../../shared/image-import-limits';
import { MAX_PROJECT_ASSET_BYTES } from '../../shared/project-file-limits';
import type { ControlTextMeasurementService } from '../controls/control-text-measurement';
import {
  collectBoardExportAssetDataUrls,
  loadEmbeddedWireframeFontCss,
} from './board-export-resources';
import {
  createBoardPresentationProjection,
  type BoardPresentationProjection,
} from './board-presentation-projection';
import { serializeBoardProjectionToSvg } from './board-svg-export';

export const BOARD_PNG_EXPORT_SCALES = Object.freeze([1, 2, 3, 4] as const);
export type BoardPngExportScale = (typeof BOARD_PNG_EXPORT_SCALES)[number];

export interface SvgPngRasterizer {
  readonly rasterize: (svg: string, width: number, height: number) => Promise<Uint8Array>;
}

export type BoardPngExportResult =
  | {
      readonly ok: true;
      readonly value: Readonly<{
        bytes: Uint8Array;
        height: number;
        suggestedName: string;
        width: number;
      }>;
    }
  | {
      readonly ok: false;
      readonly code:
        'asset-unavailable' | 'encode-failed' | 'font-unavailable' | 'invalid-board' | 'too-large';
      readonly message: string;
    };

export const createBrowserSvgPngRasterizer = (): SvgPngRasterizer =>
  Object.freeze({
    async rasterize(svg: string, width: number, height: number) {
      const bitmap = await createImageBitmap(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const canvas = globalThis.document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (context === null) throw new Error('PNG canvas is unavailable.');
        context.drawImage(bitmap, 0, 0, width, height);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png'),
        );
        if (blob === null) throw new Error('PNG encoding returned no data.');
        return new Uint8Array(await blob.arrayBuffer());
      } finally {
        bitmap.close();
      }
    },
  });

const hasPngSignature = (bytes: Uint8Array): boolean =>
  [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);

/** Creates one self-contained, explicit-scale PNG from an already planned page. */
export const exportBoardProjectionToPng = async (
  input: Readonly<{
    document: ProjectDocument;
    fontCss?: string;
    loadFontCss?: () => Promise<string>;
    projection: BoardPresentationProjection;
    rasterizer?: SvgPngRasterizer;
    readAssetBytes: (assetId: AssetId) => Uint8Array | undefined;
    scale: BoardPngExportScale;
  }>,
): Promise<BoardPngExportResult> => {
  const projection = input.projection;
  if (!BOARD_PNG_EXPORT_SCALES.includes(input.scale)) {
    return {
      code: 'invalid-board',
      message: 'Choose an active wireframe and a supported export scale.',
      ok: false,
    };
  }
  const width = Math.ceil(projection.viewBox.width * input.scale);
  const height = Math.ceil(projection.viewBox.height * input.scale);
  if (
    width <= 0 ||
    height <= 0 ||
    width > MAX_IMPORTED_IMAGE_DIMENSION ||
    height > MAX_IMPORTED_IMAGE_DIMENSION ||
    width * height > MAX_IMPORTED_IMAGE_PIXELS
  ) {
    return {
      code: 'too-large',
      message: 'The selected scale would create an image that is too large to export safely.',
      ok: false,
    };
  }
  const assetDataUrls = collectBoardExportAssetDataUrls(
    input.document,
    [projection],
    input.readAssetBytes,
  );
  if (assetDataUrls === undefined) {
    return {
      code: 'asset-unavailable',
      message: 'One or more wireframe images are unavailable. Reopen the project and retry.',
      ok: false,
    };
  }
  let fontCss: string;
  try {
    fontCss = input.fontCss ?? (await (input.loadFontCss ?? loadEmbeddedWireframeFontCss)());
  } catch {
    return {
      code: 'font-unavailable',
      message: 'The bundled wireframe font could not be prepared for export.',
      ok: false,
    };
  }
  try {
    const svg = serializeBoardProjectionToSvg(projection, {
      assetDataUrls,
      embeddedFontCss: fontCss,
      height,
      title:
        projection.versionName === 'Official'
          ? projection.canonicalBoardName
          : `${projection.canonicalBoardName} · ${projection.versionName}`,
      width,
    });
    const bytes = await (input.rasterizer ?? createBrowserSvgPngRasterizer()).rasterize(
      svg,
      width,
      height,
    );
    if (
      bytes.byteLength === 0 ||
      bytes.byteLength > MAX_PROJECT_ASSET_BYTES ||
      !hasPngSignature(bytes)
    ) {
      throw new Error('PNG output is invalid.');
    }
    return {
      ok: true,
      value: Object.freeze({
        bytes: Uint8Array.from(bytes),
        height,
        suggestedName: projection.canonicalBoardName,
        width,
      }),
    };
  } catch {
    return {
      code: 'encode-failed',
      message: 'The wireframe could not be encoded as a PNG image.',
      ok: false,
    };
  }
};

/** Convenience wrapper for the common current-board export path. */
export const exportBoardToPng = async (
  input: Readonly<{
    boardId: BoardId;
    document: ProjectDocument;
    fontCss?: string;
    loadFontCss?: () => Promise<string>;
    rasterizer?: SvgPngRasterizer;
    readAssetBytes: (assetId: AssetId) => Uint8Array | undefined;
    scale: BoardPngExportScale;
    textMeasurementService?: ControlTextMeasurementService;
  }>,
): Promise<BoardPngExportResult> => {
  const projection = createBoardPresentationProjection(
    input.document,
    input.boardId,
    input.textMeasurementService,
  );
  if (projection === undefined) {
    return {
      code: 'invalid-board',
      message: 'Choose an active wireframe and a supported export scale.',
      ok: false,
    };
  }
  return exportBoardProjectionToPng({
    document: input.document,
    ...(input.fontCss === undefined ? {} : { fontCss: input.fontCss }),
    ...(input.loadFontCss === undefined ? {} : { loadFontCss: input.loadFontCss }),
    projection,
    ...(input.rasterizer === undefined ? {} : { rasterizer: input.rasterizer }),
    readAssetBytes: input.readAssetBytes,
    scale: input.scale,
  });
};
