import { z } from 'zod';

const STABLE_ID_BODY_PATTERN = '[a-z0-9][a-z0-9_-]{6,62}[a-z0-9]';

const createStableIdSchema = <Brand extends string>(prefix: string) =>
  z
    .string()
    .regex(
      new RegExp(`^${prefix}_${STABLE_ID_BODY_PATTERN}$`, 'u'),
      `Expected a stable ${prefix} identifier.`,
    )
    .brand<Brand>();

export const ProjectIdSchema = createStableIdSchema<'ProjectId'>('project');
export const BoardIdSchema = createStableIdSchema<'BoardId'>('board');
export const ComponentIdSchema = createStableIdSchema<'ComponentId'>('component');
export const ElementIdSchema = createStableIdSchema<'ElementId'>('element');
export const AssetIdSchema = createStableIdSchema<'AssetId'>('asset');

export type ProjectId = z.infer<typeof ProjectIdSchema>;
export type BoardId = z.infer<typeof BoardIdSchema>;
export type ComponentId = z.infer<typeof ComponentIdSchema>;
export type ElementId = z.infer<typeof ElementIdSchema>;
export type AssetId = z.infer<typeof AssetIdSchema>;
