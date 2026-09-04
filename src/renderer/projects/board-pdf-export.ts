import type { AssetId, ElementLink, ProjectDocument, WorldRect } from '../../domain';
import {
  MAX_IMPORTED_IMAGE_DIMENSION,
  MAX_IMPORTED_IMAGE_PIXELS,
} from '../../shared/image-import-limits';
import { MAX_PROJECT_ASSET_BYTES } from '../../shared/project-file-limits';
import type { BoardExportPlan } from './board-export-plan';
import {
  collectBoardExportAssetDataUrls,
  loadEmbeddedWireframeFontCss,
} from './board-export-resources';
import type { BoardPresentationProjection } from './board-presentation-projection';
import { serializeBoardProjectionToSvg } from './board-svg-export';

export interface SvgJpegRasterizer {
  readonly rasterize: (svg: string, width: number, height: number) => Promise<Uint8Array>;
}

export type BoardPdfExportResult =
  | Readonly<{ ok: true; value: Readonly<{ bytes: Uint8Array; suggestedName: string }> }>
  | Readonly<{
      code: 'asset-unavailable' | 'encode-failed' | 'font-unavailable' | 'too-large';
      message: string;
      ok: false;
    }>;

const PDF_RASTER_SCALE = 2;
const textEncoder = new TextEncoder();

export const createBrowserSvgJpegRasterizer = (): SvgJpegRasterizer =>
  Object.freeze({
    async rasterize(svg: string, width: number, height: number) {
      const bitmap = await createImageBitmap(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const canvas = globalThis.document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (context === null) throw new Error('PDF canvas is unavailable.');
        context.drawImage(bitmap, 0, 0, width, height);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', 0.95),
        );
        if (blob === null) throw new Error('PDF image encoding returned no data.');
        return new Uint8Array(await blob.arrayBuffer());
      } finally {
        bitmap.close();
      }
    },
  });

const concatenateBytes = (parts: readonly Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
};

const encodePdfText = (value: string): Uint8Array => textEncoder.encode(value);

const createStreamObject = (dictionary: string, bytes: Uint8Array): Uint8Array =>
  concatenateBytes([
    encodePdfText(`<< ${dictionary} /Length ${String(bytes.byteLength)} >>\nstream\n`),
    bytes,
    encodePdfText('\nendstream'),
  ]);

const pdfNumber = (value: number): string =>
  (Math.round(value * 1_000) / 1_000).toFixed(3).replace(/\.?0+$/u, '');

const escapePdfString = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');

interface PdfLinkRegion {
  readonly bounds: WorldRect;
  readonly link: ElementLink;
}

const listPageLinks = (projection: BoardPresentationProjection): readonly PdfLinkRegion[] =>
  projection.items.flatMap((item) => [
    ...(item.link === null || item.disabled ? [] : [{ bounds: item.bounds, link: item.link }]),
    ...item.rowLinks.map((row) => ({ bounds: row.bounds, link: row.link })),
  ]);

const toPdfRectangle = (bounds: WorldRect, projection: BoardPresentationProjection): string => {
  const viewBox = projection.viewBox;
  const left = bounds.x - viewBox.x;
  const right = left + bounds.width;
  const top = viewBox.height - (bounds.y - viewBox.y);
  const bottom = top - bounds.height;
  return `[${pdfNumber(left)} ${pdfNumber(bottom)} ${pdfNumber(right)} ${pdfNumber(top)}]`;
};

const buildPdf = (
  pages: readonly Readonly<{
    height: number;
    jpeg: Uint8Array;
    projection: BoardPresentationProjection;
    width: number;
  }>[],
): Uint8Array => {
  const objects: Array<Uint8Array | undefined> = [undefined];
  let nextObjectId = 3;
  const descriptors = pages.map((page) => ({
    ...page,
    annotationIds: [] as number[],
    contentId: nextObjectId++,
    imageId: nextObjectId++,
    pageId: nextObjectId++,
  }));
  const pageByCanonicalBoardId = new Map(
    descriptors.map((page) => [page.projection.canonicalBoardId, page.pageId]),
  );
  for (const page of descriptors) {
    for (const region of listPageLinks(page.projection)) {
      const targetPageId =
        region.link.kind === 'board' ? pageByCanonicalBoardId.get(region.link.boardId) : undefined;
      if (region.link.kind === 'board' && targetPageId === undefined) continue;
      const annotationId = nextObjectId++;
      page.annotationIds.push(annotationId);
      const destination =
        region.link.kind === 'external'
          ? `/A << /S /URI /URI (${escapePdfString(new URL(region.link.url).href)}) >>`
          : `/Dest [${String(targetPageId)} 0 R /XYZ null null null]`;
      objects[annotationId] = encodePdfText(
        `<< /Type /Annot /Subtype /Link /Rect ${toPdfRectangle(region.bounds, page.projection)} /Border [0 0 0] ${destination} >>`,
      );
    }
  }
  objects[1] = encodePdfText('<< /Type /Catalog /Pages 2 0 R >>');
  objects[2] = encodePdfText(
    `<< /Type /Pages /Count ${String(descriptors.length)} /Kids [${descriptors.map((page) => `${String(page.pageId)} 0 R`).join(' ')}] >>`,
  );
  for (const page of descriptors) {
    const mediaWidth = page.projection.viewBox.width;
    const mediaHeight = page.projection.viewBox.height;
    const content = encodePdfText(
      `q ${pdfNumber(mediaWidth)} 0 0 ${pdfNumber(mediaHeight)} 0 0 cm /Im0 Do Q`,
    );
    objects[page.contentId] = createStreamObject('', content);
    objects[page.imageId] = createStreamObject(
      `/Type /XObject /Subtype /Image /Width ${String(page.width)} /Height ${String(page.height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
      page.jpeg,
    );
    objects[page.pageId] = encodePdfText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(mediaWidth)} ${pdfNumber(mediaHeight)}] /Resources << /XObject << /Im0 ${String(page.imageId)} 0 R >> >> /Contents ${String(page.contentId)} 0 R${page.annotationIds.length === 0 ? '' : ` /Annots [${page.annotationIds.map((id) => `${String(id)} 0 R`).join(' ')}]`} >>`,
    );
  }
  const header = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 55, 10, 37, 226, 227, 207, 211, 10]);
  const parts: Uint8Array[] = [header];
  const offsets = [0];
  let offset = header.byteLength;
  for (let id = 1; id < objects.length; id += 1) {
    const object = objects[id];
    if (object === undefined) throw new Error('PDF object allocation is incomplete.');
    offsets[id] = offset;
    const wrapped = concatenateBytes([
      encodePdfText(`${String(id)} 0 obj\n`),
      object,
      encodePdfText('\nendobj\n'),
    ]);
    parts.push(wrapped);
    offset += wrapped.byteLength;
  }
  const xrefOffset = offset;
  const xref = `xref\n0 ${String(objects.length)}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((objectOffset) => `${String(objectOffset).padStart(10, '0')} 00000 n \n`)
    .join(
      '',
    )}trailer\n<< /Size ${String(objects.length)} /Root 1 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF\n`;
  parts.push(encodePdfText(xref));
  return concatenateBytes(parts);
};

/** Creates one deterministic, image-backed PDF page per planned canonical wireframe. */
export const exportBoardPlanToPdf = async (
  input: Readonly<{
    document: ProjectDocument;
    fontCss?: string;
    loadFontCss?: () => Promise<string>;
    plan: BoardExportPlan;
    rasterizer?: SvgJpegRasterizer;
    readAssetBytes: (assetId: AssetId) => Uint8Array | undefined;
  }>,
): Promise<BoardPdfExportResult> => {
  const assetDataUrls = collectBoardExportAssetDataUrls(
    input.document,
    input.plan.pages,
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
    const rasterizer = input.rasterizer ?? createBrowserSvgJpegRasterizer();
    const pages = await Promise.all(
      input.plan.pages.map(async (projection) => {
        const width = Math.ceil(projection.viewBox.width * PDF_RASTER_SCALE);
        const height = Math.ceil(projection.viewBox.height * PDF_RASTER_SCALE);
        if (
          width <= 0 ||
          height <= 0 ||
          width > MAX_IMPORTED_IMAGE_DIMENSION ||
          height > MAX_IMPORTED_IMAGE_DIMENSION ||
          width * height > MAX_IMPORTED_IMAGE_PIXELS
        ) {
          throw new RangeError('PDF page raster is too large.');
        }
        const svg = serializeBoardProjectionToSvg(projection, {
          assetDataUrls,
          embeddedFontCss: fontCss,
          height,
          width,
        });
        const jpeg = await rasterizer.rasterize(svg, width, height);
        if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg.at(-2) !== 0xff || jpeg.at(-1) !== 0xd9) {
          throw new Error('PDF page image is invalid.');
        }
        return Object.freeze({ height, jpeg, projection, width });
      }),
    );
    const bytes = buildPdf(pages);
    if (bytes.byteLength > MAX_PROJECT_ASSET_BYTES) {
      return {
        code: 'too-large',
        message: 'The PDF exceeds the supported export size.',
        ok: false,
      };
    }
    return {
      ok: true,
      value: Object.freeze({ bytes, suggestedName: input.document.name }),
    };
  } catch (error) {
    if (error instanceof RangeError) {
      return {
        code: 'too-large',
        message: 'One or more PDF pages are too large to export safely.',
        ok: false,
      };
    }
    return {
      code: 'encode-failed',
      message: 'The wireframes could not be encoded as a PDF document.',
      ok: false,
    };
  }
};
