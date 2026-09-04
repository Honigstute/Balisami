// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  CONTROL_TYPES,
  getControlPaletteEntry,
  getControlSpec,
  listPaletteControlSpecs,
} from '../src/domain';
import { DESIGN_TOKENS } from '../src/shared/design-tokens';
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
          definition.defaultProperties,
          first.textLayout === undefined
            ? undefined
            : {
                fontSize: first.textLayout.fontSize,
                textWidth: first.textLayout.width,
                x: first.textLayout.lines[0]?.x ?? bounds.x,
              },
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

  it.each([
    ['Subtitle', CONTROL_TYPES.textSubtitle],
    ['Title', CONTROL_TYPES.textTitle],
  ] as const)('projects Text %s style from the shared text contract', (_, type) => {
    const definition = getControlSpec(type);
    if (definition === undefined) throw new Error('Heading definition is missing.');
    const projection = createControlSceneProjection({
      bounds: createWorldRect(0, 0, definition.defaultSize.width, definition.defaultSize.height),
      definition,
      identity: `heading:${type}`,
      properties: {
        ...definition.defaultProperties,
        bold: true,
        italic: true,
        textAlignment: 'end',
        textColor: '#336699',
        underline: true,
      },
      textMeasurementService: measurementService,
    });

    expect(projection.textLayout).toMatchObject({
      color: '#336699',
      fontSize: definition.defaultProperties.fontSize,
      fontStyle: 'italic',
      fontWeight: 'bold',
      textAnchor: 'end',
      textDecoration: 'underline',
    });
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

  it('projects the Field Set legend into one measured gap on the top frame', () => {
    const definition = getControlSpec(CONTROL_TYPES.fieldSet);
    if (definition === undefined) throw new Error('Field Set definition is missing.');

    const projection = createControlSceneProjection({
      bounds: createWorldRect(0, 0, 200, 170),
      definition,
      identity: 'field-set-projection',
      properties: { ...definition.defaultProperties, color: '#f2f2f2', opacity: 0.6 },
      textMeasurementService: measurementService,
    });

    expect(projection).toMatchObject({
      fillColor: '#f2f2f2',
      opacity: 0.6,
      textLayout: {
        lines: [{ baselineY: 13, text: 'Group Name', x: 16 }],
        textAnchor: 'start',
        width: 65,
      },
    });
    expect(projection.outlinePath).not.toBe(
      createControlSceneOutlinePath(
        definition.type,
        createWorldRect(0, 0, 200, 170),
        'field-set-projection',
        definition.defaultProperties,
      ),
    );
    expect(projection.outlinePath).not.toContain('NaN');
    expect(projection.outlinePath).toBe(
      createControlSceneProjection({
        bounds: createWorldRect(0, 0, 200, 170),
        definition,
        identity: 'field-set-projection',
        properties: { ...definition.defaultProperties, color: '#f2f2f2', opacity: 0.6 },
        textMeasurementService: measurementService,
      }).outlinePath,
    );
  });

  it('projects the Link default and disabled state through one text scene', () => {
    const definition = getControlSpec(CONTROL_TYPES.link);
    if (definition === undefined) throw new Error('Link definition is missing.');
    const bounds = createWorldRect(0, 0, 31, 21);

    const normal = createControlSceneProjection({
      bounds,
      definition,
      identity: 'link-projection',
      properties: definition.defaultProperties,
      textMeasurementService: measurementService,
    });
    const disabled = createControlSceneProjection({
      bounds,
      definition,
      identity: 'link-projection-disabled',
      properties: { ...definition.defaultProperties, state: 'disabled' },
      textMeasurementService: measurementService,
    });

    expect(normal).toMatchObject({
      disabled: false,
      opacity: undefined,
      outlinePath: '',
      textLayout: {
        color: DESIGN_TOKENS.color.accentStrong,
        fontSize: 13,
        lines: [expect.objectContaining({ text: 'a link', x: 0 })],
        textAnchor: 'start',
        textDecoration: 'underline',
      },
    });
    expect(disabled).toMatchObject({ disabled: true, opacity: 0.45 });
  });

  it('projects the Multiline Button hierarchy and rounded frame deterministically', () => {
    const definition = getControlSpec(CONTROL_TYPES.multilineButton);
    if (definition === undefined) throw new Error('Multiline Button definition is missing.');

    const projection = createControlSceneProjection({
      bounds: createWorldRect(0, 0, 136, 66),
      definition,
      identity: 'multiline-button-projection',
      properties: definition.defaultProperties,
      textMeasurementService: measurementService,
    });

    expect(projection).toMatchObject({
      opacity: 1,
      textLayout: {
        lines: [
          { baselineY: 30.2, fontSize: 13, fontWeight: 'bold', text: 'Multiline Button', x: 68 },
          {
            baselineY: 46.8,
            fontSize: 10,
            fontWeight: 'normal',
            text: 'Second line of text',
            x: 68,
          },
        ],
        textAnchor: 'middle',
        width: 104,
      },
    });
    expect(projection.outlinePath).toContain('Q');
    expect(projection.outlinePath).not.toContain('NaN');
  });

  it('projects Circle Button icon scale, label positions, border, and state from registry values', () => {
    const definition = getControlSpec(CONTROL_TYPES.circleButton);
    if (definition === undefined) throw new Error('Circle Button definition is missing.');
    const bounds = createWorldRect(0, 0, 48, 48);
    const project = (labelPosition: 'below' | 'icon-left' | 'icon-right') =>
      createControlSceneProjection({
        bounds,
        definition,
        identity: `circle-button-${labelPosition}`,
        properties: {
          ...definition.defaultProperties,
          iconId: 'shopping-cart',
          labelPosition,
          text: 'cart',
        },
        textMeasurementService: measurementService,
      });

    const below = project('below');
    const iconLeft = project('icon-left');
    const iconRight = project('icon-right');
    expect(below).toMatchObject({
      fillRadiusX: 24,
      fillRadiusY: 24,
      icon: { size: 16, x: 16, y: 8 },
      primitiveBounds: { height: 48, width: 48, x: 0, y: 0 },
      textLayout: { lines: [{ baselineY: 37.4, text: 'cart', x: 24 }] },
    });
    expect(iconLeft).toMatchObject({
      icon: { size: 16, x: 1, y: 16 },
      textLayout: { lines: [{ baselineY: 29.2, text: 'cart', x: 34 }] },
    });
    expect(iconRight).toMatchObject({
      icon: { size: 16, x: 31, y: 16 },
      textLayout: { lines: [{ baselineY: 29.2, text: 'cart', x: 14 }] },
    });
    expect(below.outlinePath).not.toBe('');

    const disabledWithoutBorder = createControlSceneProjection({
      bounds: createWorldRect(0, 0, 80, 80),
      definition,
      identity: 'circle-button-disabled',
      properties: {
        ...definition.defaultProperties,
        iconSize: 'xxl',
        showBorder: false,
        state: 'disabled',
      },
      textMeasurementService: measurementService,
    });
    expect(disabledWithoutBorder).toMatchObject({
      borderVisible: false,
      disabled: true,
      icon: { size: 48, x: 16, y: 16 },
      opacity: 0.45,
    });

    const tallDenseControl = createControlSceneProjection({
      bounds: createWorldRect(0, 0, 32, 80),
      definition,
      identity: 'circle-button-tall-dense',
      properties: {
        ...definition.defaultProperties,
        iconSize: 'xxl',
      },
      textMeasurementService: measurementService,
    });
    expect(tallDenseControl).toMatchObject({
      icon: { size: 16, x: 8, y: 32 },
      primitiveBounds: { height: 32, width: 32, x: 0, y: 24 },
    });
  });
});
