import type { ControlDefinition } from './control-definition';
import { getControlSpec } from './control-spec';
import type {
  ControlTypeId,
  ElementNode,
  ElementProperties,
  ProjectDocumentShape,
} from '../document/schema';
import type { ElementId } from '../document/ids';

export type ControlDefinitionResolver = (type: string) => ControlDefinition | undefined;

export type ControlPropertyMigrationErrorCode =
  | 'invalid-properties'
  | 'invalid-source-version'
  | 'migration-failed'
  | 'newer-control-version'
  | 'unknown-control';

export interface ControlPropertyMigrationError {
  readonly code: ControlPropertyMigrationErrorCode;
  readonly message: string;
  readonly controlType: ControlTypeId;
  readonly elementId?: ElementId;
  readonly foundVersion?: number;
}

export type ControlPropertiesMigrationResult =
  | { readonly ok: true; readonly properties: ElementProperties }
  | { readonly ok: false; readonly error: ControlPropertyMigrationError };

export type ProjectControlMigrationResult =
  | { readonly ok: true; readonly document: ProjectDocumentShape }
  | { readonly ok: false; readonly error: ControlPropertyMigrationError };

/** Runs one definition's complete sequential chain and validates its current schema. */
export const migrateControlProperties = (
  definition: ControlDefinition,
  sourceVersion: number,
  properties: ElementProperties,
): ControlPropertiesMigrationResult => {
  if (!Number.isSafeInteger(sourceVersion) || sourceVersion < 1) {
    return {
      ok: false,
      error: {
        code: 'invalid-source-version',
        message: `Control '${definition.type}' has an invalid source property version.`,
        controlType: definition.type,
      },
    };
  }
  if (sourceVersion > definition.fileVersion) {
    return {
      ok: false,
      error: {
        code: 'newer-control-version',
        message: `Control '${definition.type}' uses newer property version ${String(sourceVersion)}.`,
        controlType: definition.type,
        foundVersion: sourceVersion,
      },
    };
  }

  let currentVersion = sourceVersion;
  let currentProperties = properties;
  try {
    while (currentVersion < definition.fileVersion) {
      const migration = definition.migrations.find(
        (candidate) => candidate.fromVersion === currentVersion,
      );
      if (migration === undefined || migration.toVersion !== currentVersion + 1) {
        return {
          ok: false,
          error: {
            code: 'migration-failed',
            message: `Control '${definition.type}' has no complete property migration path from version ${String(sourceVersion)}.`,
            controlType: definition.type,
            foundVersion: sourceVersion,
          },
        };
      }
      currentProperties = migration.migrate(currentProperties);
      currentVersion = migration.toVersion;
    }
  } catch {
    return {
      ok: false,
      error: {
        code: 'migration-failed',
        message: `Control '${definition.type}' property migration failed.`,
        controlType: definition.type,
        foundVersion: sourceVersion,
      },
    };
  }

  const parsed = definition.propertiesSchema.safeParse(currentProperties);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'invalid-properties',
        message: `Control '${definition.type}' properties are invalid after migration.`,
        controlType: definition.type,
        foundVersion: sourceVersion,
      },
    };
  }
  return { ok: true, properties: parsed.data as ElementProperties };
};

/** Migrates every element before the current document invariants are evaluated. */
export const migrateProjectControlProperties = (
  document: ProjectDocumentShape,
  resolveDefinition: ControlDefinitionResolver = getControlSpec,
): ProjectControlMigrationResult => {
  let changed = false;
  const elementsById: Record<string, ElementNode> = {};

  for (const [elementId, element] of Object.entries(document.elementsById)) {
    const definition = resolveDefinition(element.controlType);
    if (definition === undefined) {
      return {
        ok: false,
        error: {
          code: 'unknown-control',
          message: `Project contains unknown control type '${element.controlType}'.`,
          controlType: element.controlType,
          elementId: element.id,
        },
      };
    }
    const migrated = migrateControlProperties(
      definition,
      element.controlVersion,
      element.properties,
    );
    if (!migrated.ok) {
      return { ok: false, error: { ...migrated.error, elementId: element.id } };
    }
    const elementChanged = element.controlVersion !== definition.fileVersion;
    changed ||= elementChanged;
    elementsById[elementId] = elementChanged
      ? Object.freeze({
          ...element,
          controlVersion: definition.fileVersion,
          properties: migrated.properties,
        })
      : element;
  }

  return {
    ok: true,
    document: changed
      ? Object.freeze({ ...document, elementsById: Object.freeze(elementsById) })
      : document,
  };
};
