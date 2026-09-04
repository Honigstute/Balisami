import type { AssetId, AssetReference } from '../../domain';
import {
  MAX_IMPORTED_IMAGE_DIMENSION,
  MAX_IMPORTED_IMAGE_PIXELS,
} from '../../shared/image-import-limits';
import { MAX_PROJECT_ASSET_BYTES } from '../../shared/project-file-limits';
import { createWorldRect, type WorldPoint, type WorldRect } from '../editor/viewport-transform';

export { MAX_IMPORTED_IMAGE_DIMENSION, MAX_IMPORTED_IMAGE_PIXELS };
export const MAX_IMPORTED_IMAGE_WORLD_SIZE = 480;
export const MIN_IMPORTED_IMAGE_WORLD_SIZE = 24;

export type ImportedRasterMediaType = 'image/gif' | 'image/jpeg' | 'image/png';

export interface ImportedImageDimensions {
  readonly height: number;
  readonly width: number;
}

export interface ImageDecodeService {
  /** Browser implementation applies embedded orientation during decode. */
  decode(bytes: Uint8Array, mediaType: ImportedRasterMediaType): Promise<ImportedImageDimensions>;
}

export interface ImageImportFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Adapts validated native clipboard PNG bytes to the existing import pipeline. */
export const createClipboardImageImportFile = (bytes: Uint8Array): ImageImportFile => {
  const ownedBytes = Uint8Array.from(bytes);
  return Object.freeze({
    arrayBuffer: () => Promise.resolve(ownedBytes.slice().buffer),
    name: 'Pasted image.png',
    size: ownedBytes.byteLength,
    type: 'image/png',
  });
};

export interface PreparedImageImport {
  readonly asset: AssetReference;
  readonly bytes: Uint8Array;
  readonly dimensions: ImportedImageDimensions;
}

export type PrepareImageImportResult =
  | { readonly ok: true; readonly value: PreparedImageImport }
  | {
      readonly ok: false;
      readonly code: 'corrupt' | 'decode-failed' | 'too-large' | 'unsupported-type';
      readonly message: string;
    };

const PNG_SIGNATURE = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);

const hasPrefix = (bytes: Uint8Array, prefix: readonly number[]): boolean =>
  bytes.length >= prefix.length && prefix.every((byte, index) => bytes[index] === byte);

export const detectImportedRasterMediaType = (
  bytes: Uint8Array,
): ImportedRasterMediaType | undefined => {
  if (hasPrefix(bytes, PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (hasPrefix(bytes, [71, 73, 70, 56, 55, 97]) || hasPrefix(bytes, [71, 73, 70, 56, 57, 97])) {
    return 'image/gif';
  }
  return undefined;
};

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const createDigest = async (bytes: Uint8Array): Promise<string | undefined> => {
  try {
    return toHex(
      new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(bytes))),
    );
  } catch {
    return undefined;
  }
};

const normalizeOriginalName = (name: string): string =>
  name.trim().slice(0, 255) || 'Imported image';

const dimensionsAreSafe = (dimensions: ImportedImageDimensions): boolean =>
  Number.isSafeInteger(dimensions.width) &&
  Number.isSafeInteger(dimensions.height) &&
  dimensions.width > 0 &&
  dimensions.height > 0 &&
  dimensions.width <= MAX_IMPORTED_IMAGE_DIMENSION &&
  dimensions.height <= MAX_IMPORTED_IMAGE_DIMENSION &&
  dimensions.width * dimensions.height <= MAX_IMPORTED_IMAGE_PIXELS;

export const prepareImageImport = async (
  file: ImageImportFile,
  assetId: AssetId,
  decoder: ImageDecodeService,
): Promise<PrepareImageImportResult> => {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    return { ok: false, code: 'corrupt', message: 'The image file is empty or malformed.' };
  }
  if (file.size > MAX_PROJECT_ASSET_BYTES) {
    return {
      ok: false,
      code: 'too-large',
      message: 'The image exceeds the 64 MB per-file project limit.',
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, code: 'corrupt', message: 'The image file could not be read.' };
  }
  if (bytes.byteLength !== file.size || bytes.byteLength > MAX_PROJECT_ASSET_BYTES) {
    return { ok: false, code: 'corrupt', message: 'The image changed while it was being read.' };
  }
  const mediaType = detectImportedRasterMediaType(bytes);
  if (mediaType === undefined) {
    return {
      ok: false,
      code: 'unsupported-type',
      message: 'Choose a PNG, JPEG, or GIF image.',
    };
  }

  let dimensions: ImportedImageDimensions;
  try {
    dimensions = await decoder.decode(bytes, mediaType);
  } catch {
    return {
      ok: false,
      code: 'decode-failed',
      message: 'The image data is damaged or cannot be decoded.',
    };
  }
  if (!dimensionsAreSafe(dimensions)) {
    return {
      ok: false,
      code: 'too-large',
      message: 'The decoded image dimensions are too large for a project.',
    };
  }
  const digest = await createDigest(bytes);
  if (digest === undefined) {
    return {
      ok: false,
      code: 'decode-failed',
      message: 'The image could not be authenticated before import.',
    };
  }
  return {
    ok: true,
    value: Object.freeze({
      asset: Object.freeze({
        id: assetId,
        sha256: digest,
        mediaType,
        byteLength: bytes.byteLength,
        originalName: normalizeOriginalName(file.name),
      }),
      bytes,
      dimensions: Object.freeze(dimensions),
    }),
  };
};

export const calculateImportedImageFrame = (
  center: WorldPoint,
  dimensions: ImportedImageDimensions,
): WorldRect => {
  const scale = Math.min(
    1,
    MAX_IMPORTED_IMAGE_WORLD_SIZE / dimensions.width,
    MAX_IMPORTED_IMAGE_WORLD_SIZE / dimensions.height,
  );
  const width = Math.max(MIN_IMPORTED_IMAGE_WORLD_SIZE, dimensions.width * scale);
  const height = Math.max(MIN_IMPORTED_IMAGE_WORLD_SIZE, dimensions.height * scale);
  return createWorldRect(center.x - width / 2, center.y - height / 2, width, height);
};

export const createBrowserImageDecodeService = (): ImageDecodeService =>
  Object.freeze({
    async decode(
      bytes: Uint8Array,
      mediaType: ImportedRasterMediaType,
    ): Promise<ImportedImageDimensions> {
      const bitmap = await createImageBitmap(
        new Blob([Uint8Array.from(bytes)], { type: mediaType }),
        {
          imageOrientation: 'from-image',
        },
      );
      try {
        return Object.freeze({ height: bitmap.height, width: bitmap.width });
      } finally {
        bitmap.close();
      }
    },
  });
