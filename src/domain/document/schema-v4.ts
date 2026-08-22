import { z } from 'zod';

import { AssetIdSchema, BoardIdSchema, ElementIdSchema, ProjectIdSchema } from './ids';
import {
  AssetReferenceSchema,
  BoardSchema,
  DocumentTitleSchema,
  ElementNodeSchema,
} from './schema';

/** Released v4 shape, retained solely as the exact input contract for v4 -> v5 migration. */
export const ProjectDocumentV4ShapeSchema = z
  .strictObject({
    schemaVersion: z.literal(4),
    id: ProjectIdSchema,
    name: DocumentTitleSchema,
    boardIds: z.array(BoardIdSchema).readonly(),
    trashedBoardIds: z.array(BoardIdSchema).readonly(),
    boardsById: z.record(BoardIdSchema, BoardSchema).readonly(),
    elementsById: z.record(ElementIdSchema, ElementNodeSchema).readonly(),
    assetsById: z.record(AssetIdSchema, AssetReferenceSchema).readonly(),
  })
  .readonly();

export type ProjectDocumentV4Shape = z.infer<typeof ProjectDocumentV4ShapeSchema>;
