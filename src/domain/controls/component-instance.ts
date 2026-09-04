import { z } from 'zod';

import { ComponentIdSchema, ElementIdSchema } from '../document/ids';
import { ElementPropertiesSchema } from '../document/schema';

/**
 * Instances retain only a definition reference and property patches. Geometry,
 * ownership, links, and assets remain canonical on the definition tree.
 */
export const ComponentInstancePropertiesSchema = z
  .strictObject({
    componentId: ComponentIdSchema,
    overrides: z.record(ElementIdSchema, ElementPropertiesSchema).readonly(),
  })
  .readonly();

export type ComponentInstanceProperties = z.infer<typeof ComponentInstancePropertiesSchema>;

export const COMPONENT_INSTANCE_STRUCTURAL_PROPERTIES = Object.freeze([
  'componentId',
  'overrides',
] as const);
