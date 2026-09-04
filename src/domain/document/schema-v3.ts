import { z } from 'zod';

import { AssetIdSchema, BoardIdSchema, ElementIdSchema, ProjectIdSchema } from './ids';
import { V1AssetReferenceSchema } from './schema-v1';
import { ProjectDocumentV2BoardSchema, ProjectDocumentV2ElementSchema } from './schema-v2';

export const ProjectDocumentV3ShapeSchema = z
  .strictObject({
    schemaVersion: z.literal(3),
    id: ProjectIdSchema,
    name: z.string().trim().min(1).max(120),
    boardIds: z.array(BoardIdSchema).readonly(),
    trashedBoardIds: z.array(BoardIdSchema).readonly(),
    boardsById: z.record(BoardIdSchema, ProjectDocumentV2BoardSchema).readonly(),
    elementsById: z.record(ElementIdSchema, ProjectDocumentV2ElementSchema).readonly(),
    assetsById: z.record(AssetIdSchema, V1AssetReferenceSchema).readonly(),
  })
  .readonly();

export type ProjectDocumentV3Shape = z.infer<typeof ProjectDocumentV3ShapeSchema>;
