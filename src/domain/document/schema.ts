import { z } from 'zod';

import { AssetIdSchema, BoardIdSchema, ElementIdSchema, ProjectIdSchema } from './ids';

export const PROJECT_DOCUMENT_SCHEMA_VERSION = 1 as const;

const NameSchema = z.string().trim().min(1).max(120);
const PropertyKeySchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9._-]{0,63}$/u, 'Expected a safe property key.')
  .refine((value) => value !== 'constructor' && value !== 'prototype', {
    message: 'Reserved object keys cannot be used as control properties.',
  });

export type JsonValue =
  boolean | null | number | string | { readonly [key: string]: JsonValue } | readonly JsonValue[];

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema).readonly(),
    z.record(PropertyKeySchema, JsonValueSchema).readonly(),
  ]),
);

export const WorldRectSchema = z
  .strictObject({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  })
  .readonly();

export const BoardNoteSchema = z
  .strictObject({
    text: z.string().max(100_000),
  })
  .readonly();

const ExternalUrlSchema = z
  .string()
  .max(2_048)
  .url()
  .refine(
    (value) => {
      try {
        const protocol = new URL(value).protocol.toLowerCase();
        return protocol === 'http:' || protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'External links must use HTTP or HTTPS.' },
  );

export const ElementLinkSchema = z.discriminatedUnion('kind', [
  z
    .strictObject({
      kind: z.literal('board'),
      boardId: BoardIdSchema,
    })
    .readonly(),
  z
    .strictObject({
      kind: z.literal('external'),
      url: ExternalUrlSchema,
    })
    .readonly(),
]);

export const AssetReferenceSchema = z
  .strictObject({
    id: AssetIdSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/u, 'Expected a lowercase SHA-256 digest.'),
    mediaType: z.enum(['image/gif', 'image/jpeg', 'image/png', 'image/svg+xml']),
    byteLength: z.number().int().nonnegative(),
    originalName: z.string().trim().min(1).max(255).optional(),
  })
  .readonly();

export const ControlTypeIdSchema = z
  .string()
  .max(80)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/u, 'Expected a namespaced lowercase control type.');

export const ElementNodeSchema = z
  .strictObject({
    id: ElementIdSchema,
    controlType: ControlTypeIdSchema,
    frame: WorldRectSchema,
    locked: z.boolean(),
    properties: z.record(PropertyKeySchema, JsonValueSchema).readonly(),
    childIds: z.array(ElementIdSchema).readonly(),
    assetIds: z.array(AssetIdSchema).readonly(),
    link: ElementLinkSchema.nullable(),
  })
  .readonly();

export const BoardSchema = z
  .strictObject({
    id: BoardIdSchema,
    name: NameSchema,
    note: BoardNoteSchema,
    childIds: z.array(ElementIdSchema).readonly(),
  })
  .readonly();

export const ProjectDocumentShapeSchema = z
  .strictObject({
    schemaVersion: z.literal(PROJECT_DOCUMENT_SCHEMA_VERSION),
    id: ProjectIdSchema,
    name: NameSchema,
    boardIds: z.array(BoardIdSchema).readonly(),
    boardsById: z.record(BoardIdSchema, BoardSchema).readonly(),
    elementsById: z.record(ElementIdSchema, ElementNodeSchema).readonly(),
    assetsById: z.record(AssetIdSchema, AssetReferenceSchema).readonly(),
  })
  .readonly();

export type WorldRect = z.infer<typeof WorldRectSchema>;
export type BoardNote = z.infer<typeof BoardNoteSchema>;
export type ElementLink = z.infer<typeof ElementLinkSchema>;
export type AssetReference = z.infer<typeof AssetReferenceSchema>;
export type ControlTypeId = z.infer<typeof ControlTypeIdSchema>;
export type ElementNode = z.infer<typeof ElementNodeSchema>;
export type Board = z.infer<typeof BoardSchema>;
export type ProjectDocumentShape = z.infer<typeof ProjectDocumentShapeSchema>;
