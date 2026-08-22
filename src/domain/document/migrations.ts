import { ProjectDocumentV1ShapeSchema } from './schema-v1';
import type { ProjectDocumentShape } from './schema';
import { ProjectDocumentV2ShapeSchema, type ProjectDocumentV2Shape } from './schema-v2';

export type ProjectDocumentMigrationResult<Value = ProjectDocumentShape> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly message: string };

/**
 * Pure released-format migration. Version 1 predates per-control property
 * versions, so every legacy element is explicitly assigned source version 1.
 */
export const migrateProjectDocumentV1ToV2 = (
  input: unknown,
): ProjectDocumentMigrationResult<ProjectDocumentV2Shape> => {
  const parsed = ProjectDocumentV1ShapeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'Version 1 project document has an invalid structure.' };
  }

  const elementsById = Object.freeze(
    Object.fromEntries(
      Object.entries(parsed.data.elementsById).map(([elementId, element]) => [
        elementId,
        Object.freeze({ ...element, controlVersion: 1 }),
      ]),
    ),
  );

  return {
    ok: true,
    value: Object.freeze({ ...parsed.data, elementsById, schemaVersion: 2 }),
  };
};

/** Adds the durable board-trash partition without changing any existing board ownership. */
export const migrateProjectDocumentV2ToV3 = (input: unknown): ProjectDocumentMigrationResult => {
  const parsed = ProjectDocumentV2ShapeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'Version 2 project document has an invalid structure.' };
  }

  return {
    ok: true,
    value: Object.freeze({
      ...parsed.data,
      schemaVersion: 3,
      trashedBoardIds: Object.freeze([]),
    }),
  };
};
