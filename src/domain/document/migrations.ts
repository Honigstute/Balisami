import { ProjectDocumentV1ShapeSchema } from './schema-v1';
import type { ProjectDocumentShape } from './schema';
import { ProjectDocumentV2ShapeSchema, type ProjectDocumentV2Shape } from './schema-v2';
import { ProjectDocumentV3ShapeSchema, type ProjectDocumentV3Shape } from './schema-v3';
import { ProjectDocumentV4ShapeSchema, type ProjectDocumentV4Shape } from './schema-v4';
import { ProjectDocumentV5ShapeSchema, type ProjectDocumentV5Shape } from './schema-v5';

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
export const migrateProjectDocumentV2ToV3 = (
  input: unknown,
): ProjectDocumentMigrationResult<ProjectDocumentV3Shape> => {
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

/** Adds explicit empty alternate-family state to every released v3 board record. */
export const migrateProjectDocumentV3ToV4 = (
  input: unknown,
): ProjectDocumentMigrationResult<ProjectDocumentV4Shape> => {
  const parsed = ProjectDocumentV3ShapeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'Version 3 project document has an invalid structure.' };
  }

  const boardsById = Object.freeze(
    Object.fromEntries(
      Object.entries(parsed.data.boardsById).map(([boardId, board]) => [
        boardId,
        Object.freeze({
          ...board,
          alternateIds: Object.freeze([]),
          selectedAlternateId: null,
        }),
      ]),
    ),
  );

  return {
    ok: true,
    value: Object.freeze({
      ...parsed.data,
      boardsById,
      schemaVersion: 4,
    }),
  };
};

/** Adds an empty ordered component library while preserving every released v4 record. */
export const migrateProjectDocumentV4ToV5 = (
  input: unknown,
): ProjectDocumentMigrationResult<ProjectDocumentV5Shape> => {
  const parsed = ProjectDocumentV4ShapeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'Version 4 project document has an invalid structure.' };
  }
  return {
    ok: true,
    value: Object.freeze({
      ...parsed.data,
      componentIds: Object.freeze([]),
      componentsById: Object.freeze({}),
      schemaVersion: 5,
    }),
  };
};

/** Adds the canonical empty parsed-row owner to every released v5 element. */
export const migrateProjectDocumentV5ToV6 = (input: unknown): ProjectDocumentMigrationResult => {
  const parsed = ProjectDocumentV5ShapeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'Version 5 project document has an invalid structure.' };
  }
  const elementsById = Object.freeze(
    Object.fromEntries(
      Object.entries(parsed.data.elementsById).map(([elementId, element]) => [
        elementId,
        Object.freeze({
          ...element,
          rowData: Object.freeze({ bindings: Object.freeze([]), nextId: 0, version: 1 as const }),
        }),
      ]),
    ),
  );
  return {
    ok: true,
    value: Object.freeze({ ...parsed.data, elementsById, schemaVersion: 6 }),
  };
};
