import { z } from 'zod';

import { BoardIdSchema, ElementIdSchema } from './ids';

/**
 * Identifies the record whose childIds array canonically owns an element.
 * This value is derived or carried by commands; it is never persisted on a node.
 */
export const ElementOwnerSchema = z.discriminatedUnion('kind', [
  z
    .strictObject({
      kind: z.literal('board'),
      boardId: BoardIdSchema,
    })
    .readonly(),
  z
    .strictObject({
      kind: z.literal('element'),
      elementId: ElementIdSchema,
    })
    .readonly(),
]);

export type ElementOwner = z.infer<typeof ElementOwnerSchema>;
