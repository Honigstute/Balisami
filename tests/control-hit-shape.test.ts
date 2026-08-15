import { describe, expect, it } from 'vitest';

import {
  CONTROL_TYPES,
  containsControlHitPoint,
  getControlHitShapePadding,
  getControlSpec,
  type ControlDefinition,
} from '../src/domain';

const requireDefinition = (): ControlDefinition => {
  const definition = getControlSpec(CONTROL_TYPES.checkbox);
  if (definition === undefined) {
    throw new Error('Checkbox definition is missing.');
  }
  return definition;
};

describe('definition-owned control hit shape', () => {
  it('filters the spatial AABB with exact ellipse and tolerance-expanded line geometry', () => {
    const definition = requireDefinition();
    const bounds = { height: 100, width: 100, x: 20, y: 30 };

    expect(
      containsControlHitPoint(
        { ...definition, scene: { ...definition.scene, hitShape: { kind: 'ellipse' } } },
        bounds,
        definition.defaultProperties,
        { x: 20, y: 30 },
      ),
    ).toBe(false);
    const lineDefinition: ControlDefinition = {
      ...definition,
      scene: {
        ...definition.scene,
        hitShape: {
          end: { x: 1, y: 1 },
          kind: 'line',
          start: { x: 0, y: 0 },
          tolerance: 4,
        },
      },
    };
    expect(getControlHitShapePadding(lineDefinition)).toBe(4);
    expect(
      containsControlHitPoint(lineDefinition, bounds, definition.defaultProperties, {
        x: 70,
        y: 84,
      }),
    ).toBe(true);
    // Regression: the exact tolerance is selectable outside the raw frame.
    expect(
      containsControlHitPoint(lineDefinition, bounds, definition.defaultProperties, {
        x: 122,
        y: 132,
      }),
    ).toBe(true);
    expect(
      containsControlHitPoint(lineDefinition, bounds, definition.defaultProperties, {
        x: 20,
        y: 130,
      }),
    ).toBe(false);
  });
});
