import { z } from 'zod';

import { AssetIdSchema, BoardIdSchema, ElementIdSchema, ProjectIdSchema } from './ids';

/**
 * Immutable snapshot of the released v1 document shape. Never derive this from
 * the current schema or revise it in place; add the next sequential migration.
 */
export const V1PropertyKeySchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9._-]{0,63}$/u, 'Expected a safe property key.')
  .refine((value) => value !== 'constructor' && value !== 'prototype', {
    message: 'Reserved object keys cannot be used as control properties.',
  });

export type V1JsonValue =
  | boolean
  | null
  | number
  | string
  | { readonly [key: string]: V1JsonValue }
  | readonly V1JsonValue[];

export const V1JsonValueSchema: z.ZodType<V1JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(V1JsonValueSchema).readonly(),
    z.record(V1PropertyKeySchema, V1JsonValueSchema).readonly(),
  ]),
);

export const V1WorldRectSchema = z
  .strictObject({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  })
  .readonly();

const V1ExternalUrlSchema = z
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

export const V1ElementLinkSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('board'), boardId: BoardIdSchema }).readonly(),
  z.strictObject({ kind: z.literal('external'), url: V1ExternalUrlSchema }).readonly(),
]);

export const V1AssetReferenceSchema = z
  .strictObject({
    id: AssetIdSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/u, 'Expected a lowercase SHA-256 digest.'),
    mediaType: z.enum(['image/gif', 'image/jpeg', 'image/png', 'image/svg+xml']),
    byteLength: z.number().int().nonnegative(),
    originalName: z.string().trim().min(1).max(255).optional(),
  })
  .readonly();

export const V1ControlTypeIdSchema = z
  .string()
  .max(80)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/u, 'Expected a namespaced lowercase control type.')
  .brand<'ControlTypeId'>();

export const V1ElementNodeSchema = z
  .strictObject({
    id: ElementIdSchema,
    controlType: V1ControlTypeIdSchema,
    frame: V1WorldRectSchema,
    locked: z.boolean(),
    properties: z.record(V1PropertyKeySchema, V1JsonValueSchema).readonly(),
    childIds: z.array(ElementIdSchema).readonly(),
    assetIds: z.array(AssetIdSchema).readonly(),
    link: V1ElementLinkSchema.nullable(),
  })
  .readonly();

export const V1BoardSchema = z
  .strictObject({
    id: BoardIdSchema,
    name: z.string().trim().min(1).max(120),
    note: z.strictObject({ text: z.string().max(100_000) }).readonly(),
    childIds: z.array(ElementIdSchema).readonly(),
  })
  .readonly();

export const ProjectDocumentV1ShapeSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: ProjectIdSchema,
    name: z.string().trim().min(1).max(120),
    boardIds: z.array(BoardIdSchema).readonly(),
    boardsById: z.record(BoardIdSchema, V1BoardSchema).readonly(),
    elementsById: z.record(ElementIdSchema, V1ElementNodeSchema).readonly(),
    assetsById: z.record(AssetIdSchema, V1AssetReferenceSchema).readonly(),
  })
  .readonly();
