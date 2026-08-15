import { describe, expect, it } from 'vitest';

import {
  CONTROL_TYPES,
  FOUNDATION_CONTROL_TYPES,
  assertControlDefinitionsConform,
  getControlSpec,
  listControlSpecs,
  listPaletteControlSpecs,
} from '../src/domain';

describe('control definition registry', () => {
  it('registers one immutable definition per supported control type', () => {
    const definitions = listControlSpecs();

    expect(definitions.map((definition) => definition.type)).toEqual([
      FOUNDATION_CONTROL_TYPES.group,
      FOUNDATION_CONTROL_TYPES.rectangle,
      CONTROL_TYPES.textLabel,
      CONTROL_TYPES.button,
      CONTROL_TYPES.textInput,
      CONTROL_TYPES.checkbox,
    ]);
    expect(new Set(definitions.map((definition) => definition.type)).size).toBe(definitions.length);
    expect(Object.isFrozen(definitions)).toBe(true);
    expect(definitions.every((definition) => Object.isFrozen(definition))).toBe(true);
    expect(() => assertControlDefinitionsConform(definitions)).not.toThrow();
  });

  it('owns palette, search, scene, inspector, thumbnail, export, file, and capability metadata once', () => {
    expect(listPaletteControlSpecs().map((definition) => definition.palette?.label)).toEqual([
      'Rectangle',
      'Text Label',
      'Button',
      'Text Input',
      'Checkbox',
    ]);
    for (const definition of listControlSpecs()) {
      expect(definition.fileVersion).toBe(1);
      expect(definition.migrations).toEqual([]);
      expect(['none', 'scene']).toContain(definition.thumbnail.kind);
      expect(['scene', 'transparent-container']).toContain(definition.export.kind);
      expect(definition.propertiesSchema.safeParse(definition.defaultProperties).success).toBe(
        true,
      );
      for (const section of definition.inspector) {
        for (const field of section.fields) {
          expect(definition.defaultProperties).toHaveProperty(field.property);
        }
      }
      for (const property of definition.scene.propertyKeys) {
        expect(definition.defaultProperties).toHaveProperty(property);
      }
    }
    expect(getControlSpec(CONTROL_TYPES.checkbox)).toMatchObject({
      accessibility: {
        checkedProperty: 'checked',
        fallbackLabel: 'Checkbox',
        nameProperty: 'text',
        role: 'checkbox',
      },
      autoSize: { axis: 'horizontal', insets: { left: 26 } },
      capabilities: {
        grouping: 'leaf',
        icon: true,
        link: true,
        resizeAxes: 'both',
        state: true,
        text: { property: 'text' },
      },
      defaultProperties: { checked: false, text: 'Checkbox' },
      scene: { hitShape: { kind: 'bounds' }, kind: 'checkbox', propertyKeys: ['checked', 'text'] },
      search: { aliases: ['check', 'tick'] },
      thumbnail: { kind: 'scene' },
      export: { kind: 'scene' },
    });
    expect(getControlSpec(FOUNDATION_CONTROL_TYPES.group)).toMatchObject({
      export: { kind: 'transparent-container' },
      thumbnail: { kind: 'none' },
    });
  });

  it('rejects duplicate registrations and definitions with invalid defaults', () => {
    const checkbox = getControlSpec(CONTROL_TYPES.checkbox);
    if (checkbox === undefined) {
      throw new Error('Checkbox definition is missing.');
    }
    expect(() => assertControlDefinitionsConform([checkbox, checkbox])).toThrow(/duplicate type/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...checkbox,
          defaultProperties: { text: 'Missing checked state' },
        },
      ]),
    ).toThrow(/reject their defaults/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...checkbox,
          maximumSize: { height: checkbox.defaultSize.height, width: 1 },
        },
      ]),
    ).toThrow(/maximum size/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...checkbox,
          autoSize: { axis: 'horizontal', insets: { bottom: 0, left: -1, right: 0, top: 0 } },
        },
      ]),
    ).toThrow(/auto-size policy/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...checkbox,
          accessibility: { ...checkbox.accessibility, checkedProperty: 'text' },
        },
      ]),
    ).toThrow(/accessibility metadata/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...checkbox,
          scene: {
            ...checkbox.scene,
            hitShape: {
              end: { x: 1, y: 1 },
              kind: 'line',
              start: { x: -1, y: 0 },
              tolerance: 4,
            },
          },
        },
      ]),
    ).toThrow(/hit shape/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...checkbox,
          capabilities: { ...checkbox.capabilities, resizeAxes: 'diagonal' as never },
        },
      ]),
    ).toThrow(/capability metadata/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...checkbox,
          thumbnail: { kind: 'none' },
        },
      ]),
    ).toThrow(/thumbnail metadata/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...checkbox,
          export: { kind: 'transparent-container' },
        },
      ]),
    ).toThrow(/export metadata/u);
  });

  it('owns child-container capability and rejects unknown control types', () => {
    expect(getControlSpec(FOUNDATION_CONTROL_TYPES.group)).toMatchObject({
      capabilities: { grouping: 'container', resizeAxes: 'none' },
    });
    expect(getControlSpec(FOUNDATION_CONTROL_TYPES.rectangle)).toMatchObject({
      capabilities: { grouping: 'leaf', resizeAxes: 'both' },
    });
    expect(getControlSpec('foundation.unknown')).toBeUndefined();
  });
});
