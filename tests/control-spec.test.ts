import { describe, expect, it } from 'vitest';

import { FOUNDATION_CONTROL_TYPES, getControlSpec, listControlSpecs } from '../src/domain';

describe('foundation control specs', () => {
  it('registers one immutable spec per supported control type', () => {
    const specs = listControlSpecs();

    expect(specs.map((spec) => spec.type)).toEqual([
      FOUNDATION_CONTROL_TYPES.group,
      FOUNDATION_CONTROL_TYPES.rectangle,
    ]);
    expect(new Set(specs.map((spec) => spec.type)).size).toBe(specs.length);
    expect(Object.isFrozen(specs)).toBe(true);
    expect(specs.every((spec) => Object.isFrozen(spec))).toBe(true);
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
