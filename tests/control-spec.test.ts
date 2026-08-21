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
      CONTROL_TYPES.imagePlaceholder,
      CONTROL_TYPES.browser,
      CONTROL_TYPES.arrow,
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
      'Image',
      'Browser Window',
      'Arrow',
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
    expect(getControlSpec(CONTROL_TYPES.imagePlaceholder)).toMatchObject({
      capabilities: { grouping: 'leaf', resizeAxes: 'both' },
      defaultProperties: { showBorder: false },
      scene: { hitShape: { kind: 'bounds' }, kind: 'image' },
    });
    expect(getControlSpec(CONTROL_TYPES.rectangle)?.palette).toMatchObject({
      drawShortcut: 'KeyR',
    });
    expect(getControlSpec(CONTROL_TYPES.imagePlaceholder)?.palette).toMatchObject({
      drawShortcut: 'KeyI',
    });
    const browser = getControlSpec(CONTROL_TYPES.browser);
    expect(browser).toMatchObject({
      capabilities: { grouping: 'container', resizeAxes: 'both' },
      defaultProperties: { borderMode: 'visual-1', color: 'default', scrollbar: false },
      scene: { hitShape: { kind: 'bounds' }, kind: 'browser' },
    });
    expect(browser?.inspector[0]?.fields.find((field) => field.property === 'color')).toEqual({
      kind: 'color',
      label: 'Color',
      property: 'color',
    });
    expect(getControlSpec(CONTROL_TYPES.arrow)).toMatchObject({
      capabilities: { grouping: 'leaf', resizeAxes: 'both', text: { property: 'text' } },
      defaultProperties: {
        endArrow: true,
        routing: 'visual-1',
        startArrow: false,
        strokeStyle: 'solid',
      },
      scene: { hitShape: { kind: 'line', tolerance: 6 }, kind: 'arrow' },
      palette: { drawShortcut: null },
    });
  });

  it('rejects duplicate registrations and definitions with invalid defaults', () => {
    const checkbox = getControlSpec(CONTROL_TYPES.checkbox);
    const arrow = getControlSpec(CONTROL_TYPES.arrow);
    const rectangle = getControlSpec(CONTROL_TYPES.rectangle);
    if (checkbox === undefined || arrow === undefined || rectangle === undefined) {
      throw new Error('Representative control definition is missing.');
    }
    expect(() => assertControlDefinitionsConform([checkbox, checkbox])).toThrow(/duplicate type/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...arrow,
          inspector: arrow.inspector.map((section) => ({
            ...section,
            fields: section.fields.map((field) =>
              field.kind === 'choice' && field.property === 'routing'
                ? { ...field, kind: 'select' as const }
                : field,
            ),
          })),
        },
      ]),
    ).not.toThrow();
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
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...checkbox,
          inspector: [
            {
              fields: [
                {
                  kind: 'choice',
                  label: 'State',
                  options: [
                    { label: 'One', value: 'same' },
                    { label: 'Two', value: 'same' },
                  ],
                  property: 'text',
                },
              ],
              label: 'Invalid choice',
            },
          ],
        },
      ]),
    ).toThrow(/inspector field/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...arrow,
          palette: {
            ...(arrow.palette as NonNullable<typeof arrow.palette>),
            drawShortcut: 'A',
          },
        },
      ]),
    ).toThrow(/palette metadata/u);
    expect(() =>
      assertControlDefinitionsConform([
        rectangle,
        {
          ...arrow,
          palette: {
            ...(arrow.palette as NonNullable<typeof arrow.palette>),
            drawShortcut: 'KeyR',
          },
        },
      ]),
    ).toThrow(/palette metadata/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...arrow,
          inspector: arrow.inspector.map((section) => ({
            ...section,
            fields: section.fields.map((field) =>
              field.kind === 'number' ? { ...field, step: 0 } : field,
            ),
          })),
        },
      ]),
    ).toThrow(/inspector field/u);
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
