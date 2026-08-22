// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  CONTROL_TYPES,
  getControlPaletteEntry,
  getControlSpec,
  listPaletteControlSpecs,
} from '../src/domain';
import {
  createControlSceneMarkPath,
  createControlSceneOutlinePath,
  getControlScenePrimitiveBounds,
} from '../src/renderer/controls/control-scene-geometry';
import type { ControlTextMeasurementService } from '../src/renderer/controls/control-text-measurement';
import { createControlSceneProjection } from '../src/renderer/controls/control-scene-projection';
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

  it('projects stacked marker rows through the same shelf scene contract', () => {
    const checkboxGroup = getControlSpec(CONTROL_TYPES.checkboxGroup);
    const radioGroup = getControlSpec(CONTROL_TYPES.radioButtonGroup);
    if (checkboxGroup === undefined || radioGroup === undefined) {
      throw new Error('Marker group definitions are missing.');
    }
    const checkbox = createControlThumbnailProjection(checkboxGroup, measurementService);
    const radio = createControlThumbnailProjection(radioGroup, measurementService);

    expect(checkbox?.rows).toHaveLength(7);
    expect(checkbox?.rows.map((row) => row.marker === null)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(radio?.rows[0]?.marker?.fillPath).not.toBe('');
    expect(radio?.rows[2]?.marker?.fillPath).toBe('');
    expect(radio?.rows[2]?.marker?.strokePath).toContain('L');
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

  it('projects definition-owned disabled state and rectangle scrollbar geometry', () => {
    const button = getControlSpec(CONTROL_TYPES.button);
    const input = getControlSpec(CONTROL_TYPES.textInput);
    const rectangle = getControlSpec(CONTROL_TYPES.rectangle);
    if (button === undefined || input === undefined || rectangle === undefined) {
      throw new Error('Representative style controls are missing.');
    }
    const bounds = createWorldRect(0, 0, 160, 80);
    const project = (definition: typeof button, properties: typeof definition.defaultProperties) =>
      createControlSceneProjection({
        bounds,
        definition,
        identity: `style:${definition.type}`,
        properties,
        textMeasurementService: measurementService,
      });

    expect(project(button, button.defaultProperties)).toMatchObject({
      disabled: false,
      opacity: undefined,
    });
    expect(project(button, { ...button.defaultProperties, state: 'disabled' })).toMatchObject({
      disabled: true,
      opacity: 0.45,
    });
    expect(
      project(input, { ...input.defaultProperties, opacity: 0.8, state: 'disabled' }).opacity,
    ).toBeCloseTo(0.36);

    const hiddenScrollbar = project(rectangle, rectangle.defaultProperties);
    const visibleScrollbar = project(rectangle, {
      ...rectangle.defaultProperties,
      scrollbar: true,
    });
    expect(hiddenScrollbar.markPath).toBe('');
    expect(visibleScrollbar.markPath).not.toBe('');
    expect(visibleScrollbar.markPath).toBe(
      project(rectangle, { ...rectangle.defaultProperties, scrollbar: true }).markPath,
    );
  });

  it('combines Text Area opacity with disabled state and projects its scrollbar generically', () => {
    const definition = getControlSpec(CONTROL_TYPES.textArea);
    if (definition === undefined) throw new Error('Text Area definition is missing.');
    const projection = createControlSceneProjection({
      bounds: createWorldRect(0, 0, 200, 140),
      definition,
      identity: 'text-area-style',
      properties: {
        ...definition.defaultProperties,
        opacity: 0.4,
        scrollbar: true,
        state: 'disabled',
        text: 'First line\nSecond line',
      },
      textMeasurementService: measurementService,
    });

    expect(projection).toMatchObject({
      borderVisible: true,
      disabled: true,
      fillColor: undefined,
      strokeColor: undefined,
    });
    expect(projection.opacity).toBeCloseTo(0.18);
    expect(projection.markPath).not.toBe('');
  });

  it('projects each static Media control with deterministic definition-owned marks', () => {
    for (const type of [
      CONTROL_TYPES.playback,
      CONTROL_TYPES.videoPlayer,
      CONTROL_TYPES.volumeSlider,
      CONTROL_TYPES.webcam,
    ]) {
      const definition = getControlSpec(type);
      if (definition === undefined) {
        throw new Error(`Media control '${type}' is missing.`);
      }
      const bounds = createWorldRect(
        0,
        0,
        definition.defaultSize.width,
        definition.defaultSize.height,
      );
      const first = createControlSceneMarkPath(
        definition.type,
        bounds,
        `media-seed:${definition.type}`,
        definition.defaultProperties,
      );
      const second = createControlSceneMarkPath(
        definition.type,
        bounds,
        `media-seed:${definition.type}`,
        definition.defaultProperties,
      );
      expect(first).not.toBe('');
      expect(first).toBe(second);
    }
  });

  it('projects each static Chart control with deterministic definition-owned marks', () => {
    for (const type of [CONTROL_TYPES.chartBar, CONTROL_TYPES.chartLine, CONTROL_TYPES.chartPie]) {
      const definition = getControlSpec(type);
      if (definition === undefined) {
        throw new Error(`Chart control '${type}' is missing.`);
      }
      const bounds = createWorldRect(
        0,
        0,
        definition.defaultSize.width,
        definition.defaultSize.height,
      );
      const first = createControlSceneMarkPath(
        definition.type,
        bounds,
        `chart-seed:${definition.type}`,
        definition.defaultProperties,
      );
      expect(first).not.toBe('');
      expect(first).toBe(
        createControlSceneMarkPath(
          definition.type,
          bounds,
          `chart-seed:${definition.type}`,
          definition.defaultProperties,
        ),
      );
    }
  });

  it('projects the static Calendar with deterministic definition-owned marks', () => {
    const definition = getControlSpec(CONTROL_TYPES.calendar);
    if (definition === undefined) {
      throw new Error('Calendar control is missing.');
    }
    const bounds = createWorldRect(
      0,
      0,
      definition.defaultSize.width,
      definition.defaultSize.height,
    );
    const first = createControlSceneMarkPath(
      definition.type,
      bounds,
      'calendar-seed',
      definition.defaultProperties,
    );
    expect(first).not.toBe('');
    expect(first).toBe(
      createControlSceneMarkPath(
        definition.type,
        bounds,
        'calendar-seed',
        definition.defaultProperties,
      ),
    );
  });

  it('projects the static iOS Picker with deterministic definition-owned marks', () => {
    const definition = getControlSpec(CONTROL_TYPES.iosPicker);
    if (definition === undefined) {
      throw new Error('iOS Picker control is missing.');
    }
    const bounds = createWorldRect(
      0,
      0,
      definition.defaultSize.width,
      definition.defaultSize.height,
    );
    const mark = createControlSceneMarkPath(
      definition.type,
      bounds,
      'ios-picker-seed',
      definition.defaultProperties,
    );
    expect(mark).not.toBe('');
    expect(mark).toBe(
      createControlSceneMarkPath(
        definition.type,
        bounds,
        'ios-picker-seed',
        definition.defaultProperties,
      ),
    );
  });

  it('projects both static splitters with deterministic definition-owned marks', () => {
    for (const type of [CONTROL_TYPES.hSplitter, CONTROL_TYPES.vSplitter]) {
      const definition = getControlSpec(type);
      if (definition === undefined) {
        throw new Error(`Splitter control '${type}' is missing.`);
      }
      const bounds = createWorldRect(
        0,
        0,
        definition.defaultSize.width,
        definition.defaultSize.height,
      );
      const mark = createControlSceneMarkPath(
        definition.type,
        bounds,
        `splitter-seed:${definition.type}`,
        definition.defaultProperties,
      );
      expect(mark).not.toBe('');
      expect(mark).toBe(
        createControlSceneMarkPath(
          definition.type,
          bounds,
          `splitter-seed:${definition.type}`,
          definition.defaultProperties,
        ),
      );
    }
  });

  it('projects the fixed Markup controls with deterministic definition-owned marks', () => {
    for (const type of [CONTROL_TYPES.redX, CONTROL_TYPES.squigglyBlock]) {
      const definition = getControlSpec(type);
      if (definition === undefined) {
        throw new Error(`Markup control '${type}' is missing.`);
      }
      const bounds = createWorldRect(
        0,
        0,
        definition.defaultSize.width,
        definition.defaultSize.height,
      );
      const mark = createControlSceneMarkPath(
        definition.type,
        bounds,
        `markup-seed:${definition.type}`,
        definition.defaultProperties,
      );
      expect(mark).not.toBe('');
      expect(mark).toBe(
        createControlSceneMarkPath(
          definition.type,
          bounds,
          `markup-seed:${definition.type}`,
          definition.defaultProperties,
        ),
      );
    }
  });

  it('projects the static Street Map with deterministic definition-owned marks', () => {
    const definition = getControlSpec(CONTROL_TYPES.streetMap);
    if (definition === undefined) {
      throw new Error('Street Map control is missing.');
    }
    const bounds = createWorldRect(
      0,
      0,
      definition.defaultSize.width,
      definition.defaultSize.height,
    );
    const mark = createControlSceneMarkPath(
      definition.type,
      bounds,
      'street-map-seed',
      definition.defaultProperties,
    );
    expect(mark).not.toBe('');
    expect(mark).toBe(
      createControlSceneMarkPath(
        definition.type,
        bounds,
        'street-map-seed',
        definition.defaultProperties,
      ),
    );
  });

  it('projects the static Toolbar with deterministic definition-owned marks', () => {
    const definition = getControlSpec(CONTROL_TYPES.toolbar);
    if (definition === undefined) {
      throw new Error('Toolbar control is missing.');
    }
    const bounds = createWorldRect(
      0,
      0,
      definition.defaultSize.width,
      definition.defaultSize.height,
    );
    const mark = createControlSceneMarkPath(
      definition.type,
      bounds,
      'toolbar-seed',
      definition.defaultProperties,
    );
    expect(mark).not.toBe('');
    expect(mark).toBe(
      createControlSceneMarkPath(
        definition.type,
        bounds,
        'toolbar-seed',
        definition.defaultProperties,
      ),
    );
  });

  it('projects both Rules as deterministic definition-owned lines', () => {
    for (const type of [CONTROL_TYPES.hRule, CONTROL_TYPES.vRule]) {
      const definition = getControlSpec(type);
      if (definition === undefined) {
        throw new Error(`Rule control '${type}' is missing.`);
      }
      const bounds = createWorldRect(
        0,
        0,
        definition.defaultSize.width,
        definition.defaultSize.height,
      );
      const outline = createControlSceneOutlinePath(
        definition.type,
        bounds,
        `rule-seed:${definition.type}`,
      );
      expect(outline).not.toBe('');
      expect(outline).toBe(
        createControlSceneOutlinePath(definition.type, bounds, `rule-seed:${definition.type}`),
      );
    }
  });

  it('projects Scratch-Out as a deterministic seeded scribble', () => {
    const definition = getControlSpec(CONTROL_TYPES.scratchOut);
    if (definition === undefined) {
      throw new Error('Scratch-Out control is missing.');
    }
    const bounds = createWorldRect(
      0,
      0,
      definition.defaultSize.width,
      definition.defaultSize.height,
    );
    const first = createControlSceneMarkPath(
      definition.type,
      bounds,
      'scratch-out-seed',
      definition.defaultProperties,
    );
    const second = createControlSceneMarkPath(
      definition.type,
      bounds,
      'scratch-out-seed',
      definition.defaultProperties,
    );
    expect(first).not.toBe('');
    expect(first).toBe(second);
  });

  it('projects the Help Button from deterministic outline and question-mark paths', () => {
    const definition = getControlSpec(CONTROL_TYPES.helpButton);
    if (definition === undefined) {
      throw new Error('Help Button control is missing.');
    }
    const bounds = createWorldRect(
      0,
      0,
      definition.defaultSize.width,
      definition.defaultSize.height,
    );
    const outline = createControlSceneOutlinePath(definition.type, bounds, 'help-button-seed');
    const mark = createControlSceneMarkPath(
      definition.type,
      bounds,
      'help-button-seed',
      definition.defaultProperties,
    );
    expect(outline).not.toBe('');
    expect(mark).not.toBe('');
    expect(outline).toBe(
      createControlSceneOutlinePath(definition.type, bounds, 'help-button-seed'),
    );
  });

  it('projects deterministic Color Picker and ON/OFF Switch marks', () => {
    for (const type of [CONTROL_TYPES.colorPicker, CONTROL_TYPES.onOffSwitch]) {
      const definition = getControlSpec(type);
      if (definition === undefined) {
        throw new Error(`Form control '${type}' is missing.`);
      }
      const bounds = createWorldRect(
        0,
        0,
        definition.defaultSize.width,
        definition.defaultSize.height,
      );
      const first = createControlSceneMarkPath(
        definition.type,
        bounds,
        `form-seed:${definition.type}`,
        definition.defaultProperties,
      );
      const second = createControlSceneMarkPath(
        definition.type,
        bounds,
        `form-seed:${definition.type}`,
        definition.defaultProperties,
      );
      expect(first).not.toBe('');
      expect(first).toBe(second);
    }
  });

  it('projects both Search Box palette states from one shared schema', () => {
    const definition = getControlSpec(CONTROL_TYPES.searchBox);
    const preset = getControlPaletteEntry(CONTROL_TYPES.searchBox, 'rectangular-microphone');
    if (definition === undefined || preset === undefined) {
      throw new Error('Search Box definition or preset is missing.');
    }
    const rounded = createControlThumbnailProjection(definition, measurementService);
    const rectangular = createControlThumbnailProjection(
      definition,
      measurementService,
      preset.properties,
    );

    expect(rounded).toMatchObject({ disabled: false, textLayout: { color: '#67717A' } });
    expect(rounded?.outlinePath).toContain('Q');
    expect(rounded?.markPath).not.toBe('');
    expect(rectangular?.outlinePath).not.toBe(rounded?.outlinePath);
    expect(rectangular?.outlinePath).not.toContain('Q');
    expect(rectangular?.markPath).not.toBe(rounded?.markPath);
    expect(
      createControlSceneProjection({
        bounds: createWorldRect(0, 0, 120, 25),
        definition,
        identity: 'search-box-disabled',
        properties: { ...preset.properties, state: 'disabled' },
        textMeasurementService: measurementService,
      }),
    ).toMatchObject({ disabled: true, opacity: 0.45 });
  });
});
