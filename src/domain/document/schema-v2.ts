import { z } from 'zod';

import { AssetIdSchema, BoardIdSchema, ElementIdSchema, ProjectIdSchema } from './ids';
import {
  AssetReferenceSchema,
  BoardNoteSchema,
  DocumentTitleSchema,
  ElementNodeSchema,
} from './schema';

/** Released board record shared by v2 and v3; never widen this with current fields. */
export const ProjectDocumentV2BoardSchema = z
  .strictObject({
    id: BoardIdSchema,
    name: DocumentTitleSchema,
    note: BoardNoteSchema,
    childIds: z.array(ElementIdSchema).readonly(),
  })
  .readonly();

/** Released v2 shape, retained solely as the exact input contract for v2 -> v3 migration. */
export const ProjectDocumentV2ShapeSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    id: ProjectIdSchema,
    name: DocumentTitleSchema,
    boardIds: z.array(BoardIdSchema).readonly(),
    boardsById: z.record(BoardIdSchema, ProjectDocumentV2BoardSchema).readonly(),
    elementsById: z.record(ElementIdSchema, ElementNodeSchema).readonly(),
    assetsById: z.record(AssetIdSchema, AssetReferenceSchema).readonly(),
  })
  .readonly();

export type ProjectDocumentV2Shape = z.infer<typeof ProjectDocumentV2ShapeSchema>;
