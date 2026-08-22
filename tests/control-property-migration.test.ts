import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import {
  AssetIdSchema,
  CONTROL_TYPES,
  FOUNDATION_CONTROL_TYPES,
  ProjectDocumentShapeSchema,
  createCustomIconReference,
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
  it('normalizes each original promoted control into its strict current schema', () => {
    const cases = [
      {
        source: { extraLegacyJson: { allowed: true }, opacity: 0.25 },
        type: CONTROL_TYPES.rectangle,
        version: 1,
      },
      { source: { text: 'Legacy input' }, type: CONTROL_TYPES.textInput, version: 1 },
      {
        source: { checked: true, text: 'Legacy checkbox' },
        type: CONTROL_TYPES.checkbox,
        version: 1,
      },
      { source: { showBorder: true }, type: CONTROL_TYPES.imagePlaceholder, version: 1 },
    ] as const;
    for (const fixture of cases) {
      const definition = getControlSpec(fixture.type);
      if (definition === undefined) throw new Error(`Missing '${fixture.type}' definition.`);
      const migrated = migrateControlProperties(definition, fixture.version, fixture.source);
      expect(migrated).toMatchObject({ ok: true });
      if (!migrated.ok) throw new Error(migrated.error.message);
      expect(definition.propertiesSchema.safeParse(migrated.properties).success).toBe(true);
      expect(Object.isFrozen(migrated.properties)).toBe(true);
    }

    const rectangle = getControlSpec(CONTROL_TYPES.rectangle);
    if (rectangle === undefined) throw new Error('Rectangle definition is missing.');
    expect(migrateControlProperties(rectangle, 1, { extraLegacyJson: { allowed: true } })).toEqual({
      ok: true,
      properties: {
        borderColor: 'default',
        borderMode: 'visual-2',
        color: 'default',
        opacity: 1,
        scrollbar: false,
      },
    });
  });

  it('migrates legacy buttons to the canonical nullable icon contract', () => {
    const button = getControlSpec(CONTROL_TYPES.button);
    if (button === undefined) {
      throw new Error('Button definition is missing.');
    }
    expect(migrateControlProperties(button, 1, { text: 'Legacy button' })).toEqual({
      ok: true,
      properties: {
        bold: false,
        color: 'default',
        fontSize: 16,
        iconId: null,
        italic: false,
        state: 'normal',
        text: 'Legacy button',
        textAlignment: 'center',
        underline: false,
      },
    });
    expect(
      button.propertiesSchema.safeParse({
        ...button.defaultProperties,
        iconId: 'trash',
        text: 'Delete',
      }).success,
    ).toBe(true);
    expect(
      button.propertiesSchema.safeParse({
        ...button.defaultProperties,
        iconId: 'trash-2',
        text: 'Alias',
      }).success,
    ).toBe(false);
    const assetId = AssetIdSchema.parse('asset_customicon');
    expect(
      button.propertiesSchema.safeParse({
        ...button.defaultProperties,
        iconId: createCustomIconReference(assetId),
        text: 'Brand',
      }).success,
    ).toBe(true);
    expect(
      button.propertiesSchema.safeParse({
        ...button.defaultProperties,
        iconId: 'project-image:not-an-asset',
        text: 'Bad',
      }).success,
    ).toBe(false);
  });

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
