// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { CONTROL_TYPES, getControlSpec, listPaletteControlSpecs } from '../src/domain';
import {
  createControlSceneMarkPath,
  createControlSceneOutlinePath,
  getControlScenePrimitiveBounds,
} from '../src/renderer/controls/control-scene-geometry';
import type { ControlTextMeasurementService } from '../src/renderer/controls/control-text-measurement';
import { createControlThumbnailProjection } from '../src/renderer/controls/control-thumbnail-projection';
import { createWorldRect } from '../src/renderer/editor/viewport-transform';

const measurementService: ControlTextMeasurementService = {
  measure: ({ fontSize, text }) => ({
    baselineOffsets: [fontSize],
    height: fontSize * 1.2,
    lineCount: 1,
    lineHeight: fontSize * 1.2,
    lines: [text.replace(/\r\n?|\n/gu, ' ')],
    width: text.length * fontSize * 0.5,
  }),
};

describe('control thumbnail projection', () => {
  it('derives every palette thumbnail from registered defaults and canonical scene geometry', () => {
    for (const definition of listPaletteControlSpecs()) {
      const first = createControlThumbnailProjection(definition, measurementService);
      const second = createControlThumbnailProjection(definition, measurementService);
      expect(first).toEqual(second);
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      if (first === undefined) {
        throw new Error(`Palette control '${definition.type}' has no thumbnail projection.`);
      }
      const bounds = createWorldRect(
        0,
        0,
        definition.defaultSize.width,
        definition.defaultSize.height,
      );
      expect(first.bounds).toEqual(bounds);
      expect(first.primitiveBounds).toEqual(
        getControlScenePrimitiveBounds(definition.type, bounds),
      );
      expect(first.outlinePath).toBe(
        createControlSceneOutlinePath(
          definition.type,
          bounds,
          `control-thumbnail:${definition.type}`,
        ),
      );
      expect(first.viewBox.width).toBeGreaterThan(bounds.width);
      expect(first.viewBox.height).toBeGreaterThan(bounds.height);
    }
  });

  it('leaves transparent non-palette containers without a fake thumbnail', () => {
    const group = getControlSpec(CONTROL_TYPES.group);
    if (group === undefined) {
      throw new Error('Group definition is missing.');
    }
    expect(group.export).toEqual({ kind: 'transparent-container' });
    expect(createControlThumbnailProjection(group, measurementService)).toBeUndefined();
  });

  it('projects deterministic Image, Browser, and property-driven Arrow geometry', () => {
    const image = getControlSpec(CONTROL_TYPES.imagePlaceholder);
    const browser = getControlSpec(CONTROL_TYPES.browser);
    const arrow = getControlSpec(CONTROL_TYPES.arrow);
    if (image === undefined || browser === undefined || arrow === undefined) {
      throw new Error('Representative control definition is missing.');
    }
    const bounds = createWorldRect(10, 20, 150, 100);
    expect(
      createControlSceneMarkPath(image.type, bounds, 'image-seed', image.defaultProperties),
    ).not.toBe('');
    expect(
      createControlSceneMarkPath(browser.type, bounds, 'browser-seed', {
        ...browser.defaultProperties,
        scrollbar: true,
      }),
    ).not.toBe(
      createControlSceneMarkPath(browser.type, bounds, 'browser-seed', browser.defaultProperties),
    );
    const straight = createControlSceneOutlinePath(
      arrow.type,
      bounds,
      'arrow-seed',
      arrow.defaultProperties,
    );
    const elbow = createControlSceneOutlinePath(arrow.type, bounds, 'arrow-seed', {
      ...arrow.defaultProperties,
      routing: 'visual-2',
    });
    expect(straight).not.toBe('');
    expect(elbow).not.toBe(straight);
    expect(elbow).toBe(
      createControlSceneOutlinePath(arrow.type, bounds, 'arrow-seed', {
        ...arrow.defaultProperties,
        routing: 'visual-2',
      }),
    );
  });
});
