import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import {
  FOUNDATION_CONTROL_TYPES,
  ProjectDocumentShapeSchema,
  getControlSpec,
  migrateControlProperties,
  migrateProjectControlProperties,
  type ControlDefinition,
} from '../src/domain';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const createVersionTwoRectangle = (): ControlDefinition => {
  const rectangle = getControlSpec(FOUNDATION_CONTROL_TYPES.rectangle);
  if (rectangle === undefined) {
    throw new Error('Rectangle definition is missing.');
  }
  return {
    ...rectangle,
    defaultProperties: { migrated: true },
    fileVersion: 2,
    migrations: [
      {
        fromVersion: 1,
        migrate: (properties) => ({ migrated: properties.legacy === 'ready' }),
        toVersion: 2,
      },
    ],
    propertiesSchema: z.strictObject({ migrated: z.boolean() }).readonly(),
  };
};

describe('control property migrations', () => {
  it('runs a complete pure chain and validates the current property schema', () => {
    const definition = createVersionTwoRectangle();
    const source = Object.freeze({ legacy: 'ready' });

    expect(migrateControlProperties(definition, 1, source)).toEqual({
      ok: true,
      properties: { migrated: true },
    });
    expect(source).toEqual({ legacy: 'ready' });
    expect(migrateControlProperties(definition, 3, source)).toMatchObject({
      ok: false,
      error: { code: 'newer-control-version', foundVersion: 3 },
    });
  });

  it('migrates every stale element before current document validation', () => {
    const input = createValidProjectDocumentInput();
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (child === undefined) {
      throw new Error('Fixture child is missing.');
    }
    child.controlVersion = 1;
    child.properties = { legacy: 'ready' };
    const document = ProjectDocumentShapeSchema.parse(input);
    const definition = createVersionTwoRectangle();
    const migrated = migrateProjectControlProperties(document, (type) =>
      type === definition.type ? definition : getControlSpec(type),
    );

    expect(migrated).toMatchObject({ ok: true });
    if (!migrated.ok) {
      throw new Error(migrated.error.message);
    }
    expect(migrated.document.elementsById[DOCUMENT_FIXTURE_IDS.child]).toMatchObject({
      controlVersion: 2,
      properties: { migrated: true },
    });
    expect(document.elementsById[DOCUMENT_FIXTURE_IDS.child]).toMatchObject({
      controlVersion: 1,
      properties: { legacy: 'ready' },
    });
  });
});
