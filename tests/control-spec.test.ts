import { describe, expect, it } from 'vitest';

import {
  CONTROL_TYPES,
  FOUNDATION_CONTROL_TYPES,
  getControlSpec,
  listControlSpecs,
  listPaletteControlSpecs,
} from '../src/domain';

describe('control specs', () => {
  it('registers one immutable spec per supported control type', () => {
    const specs = listControlSpecs();

    expect(specs.map((spec) => spec.type)).toEqual([
      FOUNDATION_CONTROL_TYPES.group,
      FOUNDATION_CONTROL_TYPES.rectangle,
      CONTROL_TYPES.textLabel,
      CONTROL_TYPES.button,
      CONTROL_TYPES.textInput,
    ]);
    expect(new Set(specs.map((spec) => spec.type)).size).toBe(specs.length);
    expect(Object.isFrozen(specs)).toBe(true);
    expect(specs.every((spec) => Object.isFrozen(spec))).toBe(true);
  });

  it('owns alpha palette metadata, defaults, text capability, and validation once', () => {
    expect(listPaletteControlSpecs().map((spec) => spec.palette?.label)).toEqual([
      'Rectangle',
      'Text Label',
      'Button',
      'Text Input',
    ]);
    for (const type of [CONTROL_TYPES.textLabel, CONTROL_TYPES.button, CONTROL_TYPES.textInput]) {
      const spec = getControlSpec(type);
      expect(spec).toBeDefined();
      expect(spec?.text).toMatchObject({ mode: 'single-line', property: 'text' });
      expect(spec?.propertiesSchema.safeParse(spec.defaultProperties).success).toBe(true);
      expect(spec?.propertiesSchema.safeParse({ text: 42 }).success).toBe(false);
      expect(spec?.minimumSize.width).toBeGreaterThan(0);
      expect(spec?.minimumSize.height).toBeGreaterThan(0);
    }
  });

  it('owns the child-container capability in the registry', () => {
    expect(getControlSpec(FOUNDATION_CONTROL_TYPES.group)).toMatchObject({
      canOwnChildren: true,
    });
    expect(getControlSpec(FOUNDATION_CONTROL_TYPES.rectangle)).toMatchObject({
      canOwnChildren: false,
    });
    expect(getControlSpec('foundation.unknown')).toBeUndefined();
  });
});
