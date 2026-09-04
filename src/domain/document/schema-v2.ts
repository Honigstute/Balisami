import { z } from 'zod';

import { AssetIdSchema, BoardIdSchema, ElementIdSchema, ProjectIdSchema } from './ids';
import {
  V1AssetReferenceSchema,
  V1ControlTypeIdSchema,
  V1ElementLinkSchema,
  V1JsonValueSchema,
  V1PropertyKeySchema,
  V1WorldRectSchema,
} from './schema-v1';

/** Released v2 element record shared unchanged through v5. */
export const ProjectDocumentV2ElementSchema = z
  .strictObject({
    id: ElementIdSchema,
    controlType: V1ControlTypeIdSchema,
    controlVersion: z.number().int().positive(),
    frame: V1WorldRectSchema,
    locked: z.boolean(),
    properties: z.record(V1PropertyKeySchema, V1JsonValueSchema).readonly(),
    childIds: z.array(ElementIdSchema).readonly(),
    assetIds: z.array(AssetIdSchema).readonly(),
    link: V1ElementLinkSchema.nullable(),
  })
  .readonly();

/** Released board record shared by v2 and v3; never widen this with current fields. */
export const ProjectDocumentV2BoardSchema = z
  .strictObject({
    id: BoardIdSchema,
    name: z.string().trim().min(1).max(120),
    note: z.strictObject({ text: z.string().max(100_000) }).readonly(),
    childIds: z.array(ElementIdSchema).readonly(),
  })
  .readonly();

export const ProjectDocumentV2ShapeSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    id: ProjectIdSchema,
    name: z.string().trim().min(1).max(120),
    boardIds: z.array(BoardIdSchema).readonly(),
    boardsById: z.record(BoardIdSchema, ProjectDocumentV2BoardSchema).readonly(),
    elementsById: z.record(ElementIdSchema, ProjectDocumentV2ElementSchema).readonly(),
    assetsById: z.record(AssetIdSchema, V1AssetReferenceSchema).readonly(),
  })
  .readonly();

export type ProjectDocumentV2Shape = z.infer<typeof ProjectDocumentV2ShapeSchema>;
