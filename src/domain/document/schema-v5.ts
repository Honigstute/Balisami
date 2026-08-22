import { z } from 'zod';

import {
  AssetIdSchema,
  BoardIdSchema,
  ComponentIdSchema,
  ElementIdSchema,
  ProjectIdSchema,
} from './ids';
import { V1AssetReferenceSchema } from './schema-v1';
import { ProjectDocumentV2ElementSchema } from './schema-v2';
import { ProjectDocumentV4BoardSchema } from './schema-v4';

/** Released v5 component record, frozen independently from the current schema. */
export const ProjectDocumentV5ComponentSchema = z
  .strictObject({
    id: ComponentIdSchema,
    name: z.string().trim().min(1).max(120),
    rootElementId: ElementIdSchema,
  })
  .readonly();

export const ProjectDocumentV5ShapeSchema = z
  .strictObject({
    schemaVersion: z.literal(5),
    id: ProjectIdSchema,
    name: z.string().trim().min(1).max(120),
    boardIds: z.array(BoardIdSchema).readonly(),
    componentIds: z.array(ComponentIdSchema).readonly(),
    trashedBoardIds: z.array(BoardIdSchema).readonly(),
    boardsById: z.record(BoardIdSchema, ProjectDocumentV4BoardSchema).readonly(),
    componentsById: z.record(ComponentIdSchema, ProjectDocumentV5ComponentSchema).readonly(),
    elementsById: z.record(ElementIdSchema, ProjectDocumentV2ElementSchema).readonly(),
    assetsById: z.record(AssetIdSchema, V1AssetReferenceSchema).readonly(),
  })
  .readonly();

export type ProjectDocumentV5Shape = z.infer<typeof ProjectDocumentV5ShapeSchema>;
