import { z } from 'zod';

import { AssetIdSchema, type AssetId } from '../document/ids';

export const CUSTOM_ICON_REFERENCE_PREFIX = 'project-image:';

export const CustomIconReferenceSchema = z
  .string()
  .max(96)
  .refine(
    (value) =>
      value.startsWith(CUSTOM_ICON_REFERENCE_PREFIX) &&
      AssetIdSchema.safeParse(value.slice(CUSTOM_ICON_REFERENCE_PREFIX.length)).success,
    'Expected a project image icon reference.',
  );

/** Keeps the persisted icon property compact while element.assetIds owns reachability. */
export const createCustomIconReference = (assetId: AssetId): string =>
  `${CUSTOM_ICON_REFERENCE_PREFIX}${assetId}`;

export const parseCustomIconReference = (value: unknown): AssetId | undefined => {
  if (typeof value !== 'string' || !value.startsWith(CUSTOM_ICON_REFERENCE_PREFIX)) {
    return undefined;
  }
  const result = AssetIdSchema.safeParse(value.slice(CUSTOM_ICON_REFERENCE_PREFIX.length));
  return result.success ? result.data : undefined;
};
