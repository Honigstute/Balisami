import { ProjectDocumentV1ShapeSchema } from './schema-v1';
import type { ProjectDocumentShape } from './schema';

export type ProjectDocumentMigrationResult =
  | { readonly ok: true; readonly value: ProjectDocumentShape }
  | { readonly ok: false; readonly message: string };

/**
 * Pure released-format migration. Version 1 predates per-control property
 * versions, so every legacy element is explicitly assigned source version 1.
 */
export const migrateProjectDocumentV1ToV2 = (input: unknown): ProjectDocumentMigrationResult => {
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
