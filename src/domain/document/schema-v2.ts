import { z } from 'zod';

import { AssetIdSchema, BoardIdSchema, ElementIdSchema, ProjectIdSchema } from './ids';
import {
  AssetReferenceSchema,
  BoardSchema,
  DocumentTitleSchema,
  ElementNodeSchema,
} from './schema';

/** Released v2 shape, retained solely as the exact input contract for v2 -> v3 migration. */
export const ProjectDocumentV2ShapeSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    id: ProjectIdSchema,
    name: DocumentTitleSchema,
    boardIds: z.array(BoardIdSchema).readonly(),
    boardsById: z.record(BoardIdSchema, BoardSchema).readonly(),
    elementsById: z.record(ElementIdSchema, ElementNodeSchema).readonly(),
    assetsById: z.record(AssetIdSchema, AssetReferenceSchema).readonly(),
  })
  .readonly();

export type ProjectDocumentV2Shape = z.infer<typeof ProjectDocumentV2ShapeSchema>;
