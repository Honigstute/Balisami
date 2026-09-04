import comicBoldItalicDataUrl from '@fontsource/comic-neue/files/comic-neue-latin-700-italic.woff2?inline';
import comicBoldDataUrl from '@fontsource/comic-neue/files/comic-neue-latin-700-normal.woff2?inline';
import comicItalicDataUrl from '@fontsource/comic-neue/files/comic-neue-latin-400-italic.woff2?inline';
import comicRegularDataUrl from '@fontsource/comic-neue/files/comic-neue-latin-400-normal.woff2?inline';

import type { AssetId, BoardId, ProjectDocument } from '../../domain';
import {
  MAX_IMPORTED_IMAGE_DIMENSION,
  MAX_IMPORTED_IMAGE_PIXELS,
} from '../../shared/image-import-limits';
import { MAX_PROJECT_ASSET_BYTES } from '../../shared/project-file-limits';
import type { ControlTextMeasurementService } from '../controls/control-text-measurement';
import { createBoardPresentationProjection } from './board-presentation-projection';
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

const encodeBytes = (bytes: Uint8Array): string => {
  const chunkSize = 24 * 1_024;
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    encoded += globalThis.btoa(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return encoded;
};

const toDataUrl = (bytes: Uint8Array, mediaType: string): string =>
  `data:${mediaType};base64,${encodeBytes(bytes)}`;

const fontSources = Object.freeze([
  Object.freeze({ style: 'normal', url: comicRegularDataUrl, weight: 400 }),
  Object.freeze({ style: 'italic', url: comicItalicDataUrl, weight: 400 }),
  Object.freeze({ style: 'normal', url: comicBoldDataUrl, weight: 700 }),
  Object.freeze({ style: 'italic', url: comicBoldItalicDataUrl, weight: 700 }),
]);

const EMBEDDED_WIREFRAME_FONT_CSS = fontSources
  .map(
    ({ style, url, weight }) =>
      `@font-face{font-family:"Comic Neue";font-style:${style};font-weight:${String(weight)};src:url(${url}) format("woff2")}`,
  )
  .join('\n');

export const loadEmbeddedWireframeFontCss = (): Promise<string> =>
  Promise.resolve(EMBEDDED_WIREFRAME_FONT_CSS);

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

const collectAssetDataUrls = (
  document: ProjectDocument,
  assetIds: ReadonlySet<AssetId>,
  readAssetBytes: (assetId: AssetId) => Uint8Array | undefined,
): Readonly<Record<string, string>> | undefined => {
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const assetId of assetIds) {
    const reference = document.assetsById[assetId];
    const bytes = readAssetBytes(assetId);
    if (
      reference === undefined ||
      bytes === undefined ||
      bytes.byteLength !== reference.byteLength
    ) {
      return undefined;
    }
    result[assetId] = toDataUrl(bytes, reference.mediaType);
  }
  return Object.freeze(result);
};

const hasPngSignature = (bytes: Uint8Array): boolean =>
  [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);

/** Creates one self-contained, explicit-scale PNG from the canonical selected alternate. */
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
  if (projection === undefined || !BOARD_PNG_EXPORT_SCALES.includes(input.scale)) {
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
  const assetIds = new Set(
    projection.items.flatMap((item) => [
      ...(item.visualKind === 'image' ? item.assetIds : []),
      ...(item.icon?.kind === 'asset' ? [item.icon.assetId] : []),
    ]),
  );
  const assetDataUrls = collectAssetDataUrls(input.document, assetIds, input.readAssetBytes);
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
