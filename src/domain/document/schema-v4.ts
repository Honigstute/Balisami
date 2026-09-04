import { z } from 'zod';

import { AssetIdSchema, BoardIdSchema, ElementIdSchema, ProjectIdSchema } from './ids';
import { V1AssetReferenceSchema } from './schema-v1';
import { ProjectDocumentV2ElementSchema } from './schema-v2';

/** Released v4 board record shared unchanged by v5. */
export const ProjectDocumentV4BoardSchema = z
  .strictObject({
    id: BoardIdSchema,
    name: z.string().trim().min(1).max(120),
    note: z.strictObject({ text: z.string().max(100_000) }).readonly(),
    childIds: z.array(ElementIdSchema).readonly(),
    alternateIds: z.array(BoardIdSchema).readonly(),
    selectedAlternateId: BoardIdSchema.nullable(),
  })
  .readonly();

export const ProjectDocumentV4ShapeSchema = z
  .strictObject({
    schemaVersion: z.literal(4),
    id: ProjectIdSchema,
    name: z.string().trim().min(1).max(120),
    boardIds: z.array(BoardIdSchema).readonly(),
    trashedBoardIds: z.array(BoardIdSchema).readonly(),
    boardsById: z.record(BoardIdSchema, ProjectDocumentV4BoardSchema).readonly(),
    elementsById: z.record(ElementIdSchema, ProjectDocumentV2ElementSchema).readonly(),
    assetsById: z.record(AssetIdSchema, V1AssetReferenceSchema).readonly(),
  })
  .readonly();

export type ProjectDocumentV4Shape = z.infer<typeof ProjectDocumentV4ShapeSchema>;
