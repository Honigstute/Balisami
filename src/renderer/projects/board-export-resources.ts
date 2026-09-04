import comicBoldItalicDataUrl from '@fontsource/comic-neue/files/comic-neue-latin-700-italic.woff2?inline';
import comicBoldDataUrl from '@fontsource/comic-neue/files/comic-neue-latin-700-normal.woff2?inline';
import comicItalicDataUrl from '@fontsource/comic-neue/files/comic-neue-latin-400-italic.woff2?inline';
import comicRegularDataUrl from '@fontsource/comic-neue/files/comic-neue-latin-400-normal.woff2?inline';

import type { AssetId, ProjectDocument } from '../../domain';
import type { BoardPresentationProjection } from './board-presentation-projection';

const encodeBytes = (bytes: Uint8Array): string => {
  const chunkSize = 24 * 1_024;
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    encoded += globalThis.btoa(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return encoded;
};

export const toExportDataUrl = (bytes: Uint8Array, mediaType: string): string =>
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

export const collectBoardExportAssetDataUrls = (
  document: ProjectDocument,
  projections: readonly BoardPresentationProjection[],
  readAssetBytes: (assetId: AssetId) => Uint8Array | undefined,
): Readonly<Record<string, string>> | undefined => {
  const assetIds = new Set(
    projections.flatMap((projection) =>
      projection.items.flatMap((item) => [
        ...(item.visualKind === 'image' ? item.assetIds : []),
        ...(item.icon?.kind === 'asset' ? [item.icon.assetId] : []),
      ]),
    ),
  );
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
    result[assetId] = toExportDataUrl(bytes, reference.mediaType);
  }
  return Object.freeze(result);
};
