import { z } from 'zod';

import { AssetIdSchema, BoardIdSchema, ElementIdSchema, ProjectIdSchema } from './ids';
import { AssetReferenceSchema, DocumentTitleSchema, ElementNodeSchema } from './schema';
import { ProjectDocumentV2BoardSchema } from './schema-v2';

/** Released v3 shape, retained solely as the exact input contract for v3 -> v4 migration. */
export const ProjectDocumentV3ShapeSchema = z
  .strictObject({
    schemaVersion: z.literal(3),
    id: ProjectIdSchema,
    name: DocumentTitleSchema,
    boardIds: z.array(BoardIdSchema).readonly(),
    trashedBoardIds: z.array(BoardIdSchema).readonly(),
    boardsById: z.record(BoardIdSchema, ProjectDocumentV2BoardSchema).readonly(),
    elementsById: z.record(ElementIdSchema, ElementNodeSchema).readonly(),
    assetsById: z.record(AssetIdSchema, AssetReferenceSchema).readonly(),
  })
  .readonly();

export type ProjectDocumentV3Shape = z.infer<typeof ProjectDocumentV3ShapeSchema>;
