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
      FOUNDATION_CONTROL_TYPES.componentInstance,
      FOUNDATION_CONTROL_TYPES.group,
      FOUNDATION_CONTROL_TYPES.rectangle,
      CONTROL_TYPES.textLabel,
      CONTROL_TYPES.textSubtitle,
      CONTROL_TYPES.textTitle,
      CONTROL_TYPES.button,
      CONTROL_TYPES.textInput,
      CONTROL_TYPES.checkbox,
      CONTROL_TYPES.checkboxGroup,
      CONTROL_TYPES.radioButtonGroup,
      CONTROL_TYPES.imagePlaceholder,
      CONTROL_TYPES.browser,
      CONTROL_TYPES.arrow,
      CONTROL_TYPES.calendar,
      CONTROL_TYPES.chartBar,
      CONTROL_TYPES.chartLine,
      CONTROL_TYPES.chartPie,
      CONTROL_TYPES.playback,
      CONTROL_TYPES.videoPlayer,
      CONTROL_TYPES.volumeSlider,
      CONTROL_TYPES.webcam,
      CONTROL_TYPES.iosPicker,
      CONTROL_TYPES.hSplitter,
      CONTROL_TYPES.vSplitter,
      CONTROL_TYPES.redX,
      CONTROL_TYPES.squigglyBlock,
      CONTROL_TYPES.streetMap,
      CONTROL_TYPES.toolbar,
      CONTROL_TYPES.hRule,
      CONTROL_TYPES.vRule,
      CONTROL_TYPES.scratchOut,
      CONTROL_TYPES.helpButton,
      CONTROL_TYPES.modalScreen,
      CONTROL_TYPES.colorPicker,
      CONTROL_TYPES.onOffSwitch,
      CONTROL_TYPES.breadcrumbs,
      CONTROL_TYPES.buttonBar,
      CONTROL_TYPES.linkBar,
      CONTROL_TYPES.treePane,
      CONTROL_TYPES.searchBox,
      CONTROL_TYPES.textArea,
      CONTROL_TYPES.fieldSet,
      CONTROL_TYPES.link,
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
      'Text Subtitle',
      'Text Title',
      'Button',
      'Text Input',
      'Checkbox',
      'Checkbox Group',
      'Radio Button Group',
      'Image',
      'Browser Window',
      'Arrow',
      'Calendar',
      'Chart: Bar',
      'Chart: Line',
      'Chart: Pie',
      'Playback',
      'Video Player',
      'Volume Slider',
      'Webcam',
      'iOS Picker',
      'H.Splitter',
      'V.Splitter',
      'Red X',
      'Squiggly Block of Text',
      'Street Map',
      'Toolbar',
      'H.Rule',
      'V.Rule',
      'Scratch-Out',
      'Help Button',
      'Modal Screen',
      'Color Picker',
      'ON/OFF Switch',
      'Breadcrumbs',
      'Button Bar',
      'Link Bar',
      'Tree Pane',
      'Search Box',
      'Text Area',
      'Field Set',
      'Link',
    ]);
    for (const definition of listControlSpecs()) {
      expect(definition.migrations).toHaveLength(definition.fileVersion - 1);
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
    const button = getControlSpec(CONTROL_TYPES.button);
    expect(button).toMatchObject({
      defaultProperties: { iconId: null, text: 'Button' },
      fileVersion: 4,
    });
    expect(button?.inspector.flatMap((section) => section.fields)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'text', property: 'text' }),
        expect.objectContaining({ kind: 'icon', property: 'iconId' }),
        expect.objectContaining({ kind: 'color', property: 'color' }),
        expect.objectContaining({ kind: 'select', property: 'state' }),
      ]),
    );
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
      scene: { hitShape: { kind: 'bounds' }, kind: 'checkbox' },
      search: { aliases: ['check', 'tick'] },
      thumbnail: { kind: 'scene' },
      export: { kind: 'scene' },
    });
    expect(getControlSpec(CONTROL_TYPES.checkbox)?.scene.propertyKeys).toEqual(
      expect.arrayContaining(['checked', 'text', 'textColor', 'state', 'iconId']),
    );
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
    for (const [type, kind] of [
      [CONTROL_TYPES.chartBar, 'chart-bar'],
      [CONTROL_TYPES.chartLine, 'chart-line'],
      [CONTROL_TYPES.chartPie, 'chart-pie'],
    ] as const) {
      expect(getControlSpec(type)).toMatchObject({
        accessibility: { role: 'img' },
        autoSize: null,
        defaultProperties: {},
        inspector: [],
        palette: { category: 'Common' },
        scene: { hitShape: { kind: 'bounds' }, kind, propertyKeys: [] },
      });
    }
    expect(getControlSpec(CONTROL_TYPES.scratchOut)).toMatchObject({
      defaultProperties: { color: 'default', opacity: 1 },
      inspector: [
        {
          fields: [
            { kind: 'color', property: 'color' },
            { kind: 'range', property: 'opacity' },
          ],
        },
      ],
      palette: { category: 'Markup' },
      scene: { kind: 'scratch-out', propertyKeys: ['color', 'opacity'] },
    });
    expect(getControlSpec(CONTROL_TYPES.helpButton)).toMatchObject({
      capabilities: { link: true },
      defaultProperties: {},
      inspector: [],
      palette: { category: 'Buttons' },
      scene: { kind: 'help-button', propertyKeys: [] },
    });
    expect(getControlSpec(CONTROL_TYPES.modalScreen)).toMatchObject({
      capabilities: { link: true },
      defaultProperties: {},
      inspector: [],
      palette: { category: 'Containers' },
      scene: { kind: 'modal-screen', propertyKeys: [] },
    });
    expect(getControlSpec(CONTROL_TYPES.colorPicker)).toMatchObject({
      defaultProperties: { color: 'default' },
      inspector: [{ fields: [{ kind: 'color', property: 'color' }] }],
      palette: { category: 'Forms' },
      scene: { colorTarget: 'fill', kind: 'color-picker', propertyKeys: ['color'] },
    });
    expect(getControlSpec(CONTROL_TYPES.onOffSwitch)).toMatchObject({
      capabilities: { link: true, state: true },
      defaultProperties: { color: 'default', state: 'on' },
      inspector: [
        {
          fields: [
            { kind: 'color', property: 'color' },
            { kind: 'choice', property: 'state' },
          ],
        },
      ],
      palette: { category: 'Forms' },
      scene: { colorTarget: 'fill', kind: 'on-off-switch', propertyKeys: ['color', 'state'] },
    });
    expect(getControlSpec(CONTROL_TYPES.redX)).toMatchObject({
      defaultProperties: {},
      inspector: [],
      palette: { category: 'Markup', drawShortcut: null },
      scene: { kind: 'red-x', propertyKeys: [] },
    });
    expect(getControlSpec(CONTROL_TYPES.squigglyBlock)).toMatchObject({
      defaultProperties: {},
      inspector: [],
      palette: { category: 'Markup', drawShortcut: 'KeyT' },
      scene: { kind: 'squiggly-block', propertyKeys: [] },
    });
    expect(getControlSpec(CONTROL_TYPES.streetMap)).toMatchObject({
      defaultProperties: {},
      inspector: [],
      palette: { category: 'Assets' },
      scene: { kind: 'street-map', propertyKeys: [] },
    });
    expect(getControlSpec(CONTROL_TYPES.toolbar)).toMatchObject({
      defaultProperties: {},
      inspector: [],
      palette: { category: 'Common' },
      scene: { kind: 'toolbar', propertyKeys: [] },
    });
    for (const [type, kind] of [
      [CONTROL_TYPES.hRule, 'h-rule'],
      [CONTROL_TYPES.vRule, 'v-rule'],
    ] as const) {
      expect(getControlSpec(type)).toMatchObject({
        autoSize: { basis: 'intrinsic' },
        defaultProperties: { borderColor: 'default', opacity: 1, strokeStyle: 'solid' },
        inspector: [
          {
            fields: [
              { kind: 'color', property: 'borderColor' },
              { kind: 'range', property: 'opacity' },
              { kind: 'choice', property: 'strokeStyle' },
            ],
          },
        ],
        palette: { category: 'Markup' },
        scene: { kind },
      });
    }
    expect(getControlSpec(CONTROL_TYPES.calendar)).toMatchObject({
      accessibility: { role: 'img' },
      autoSize: null,
      defaultProperties: {},
      inspector: [],
      palette: { category: 'Common' },
      scene: { hitShape: { kind: 'bounds' }, kind: 'calendar', propertyKeys: [] },
    });
    expect(getControlSpec(CONTROL_TYPES.iosPicker)).toMatchObject({
      accessibility: { role: 'img' },
      autoSize: null,
      defaultProperties: {},
      inspector: [],
      palette: { category: 'iOS' },
      scene: { hitShape: { kind: 'bounds' }, kind: 'ios-picker', propertyKeys: [] },
    });
    for (const [type, kind] of [
      [CONTROL_TYPES.hSplitter, 'h-splitter'],
      [CONTROL_TYPES.vSplitter, 'v-splitter'],
    ] as const) {
      expect(getControlSpec(type)).toMatchObject({
        accessibility: { role: 'img' },
        autoSize: null,
        defaultProperties: {},
        inspector: [],
        palette: { category: 'Layout' },
        scene: { hitShape: { kind: 'bounds' }, kind, propertyKeys: [] },
      });
    }
    for (const [type, kind, size] of [
      [CONTROL_TYPES.playback, 'playback', { height: 36, width: 110 }],
      [CONTROL_TYPES.videoPlayer, 'video-player', { height: 200, width: 300 }],
      [CONTROL_TYPES.volumeSlider, 'volume-slider', { height: 16, width: 72 }],
      [CONTROL_TYPES.webcam, 'webcam', { height: 146, width: 177 }],
    ] as const) {
      expect(getControlSpec(type)).toMatchObject({
        accessibility: { role: 'img' },
        autoSize: null,
        defaultProperties: {},
        defaultSize: size,
        inspector: [],
        palette: { category: 'Media' },
        scene: { hitShape: { kind: 'bounds' }, kind, propertyKeys: [] },
      });
      expect(getControlSpec(type)?.propertiesSchema.safeParse({ unexpected: true }).success).toBe(
        false,
      );
    }
  });

  it('rejects duplicate registrations and definitions with invalid defaults', () => {
    const checkbox = getControlSpec(CONTROL_TYPES.checkbox);
    const arrow = getControlSpec(CONTROL_TYPES.arrow);
    const rectangle = getControlSpec(CONTROL_TYPES.rectangle);
    const breadcrumbs = getControlSpec(CONTROL_TYPES.breadcrumbs);
    if (
      checkbox === undefined ||
      arrow === undefined ||
      rectangle === undefined ||
      breadcrumbs === undefined
    ) {
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
          autoSize: {
            axis: 'horizontal',
            basis: 'text',
            insets: { bottom: 0, left: -1, right: 0, top: 0 },
          },
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
          scene: { ...checkbox.scene, colorTarget: 'invalid' as never },
        },
      ]),
    ).toThrow(/scene geometry metadata/u);
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
          capabilities: {
            ...checkbox.capabilities,
            text: {
              ...(checkbox.capabilities.text as NonNullable<typeof checkbox.capabilities.text>),
              style: {
                ...(checkbox.capabilities.text?.style as NonNullable<
                  typeof checkbox.capabilities.text
                >['style']),
                boldProperty: 'text',
              },
            },
          },
        },
      ]),
    ).toThrow(/text-style metadata/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...rectangle,
          scene: {
            ...rectangle.scene,
            style: {
              ...(rectangle.scene.style as NonNullable<typeof rectangle.scene.style>),
              scrollbarVisibilityProperty: 'opacity',
            },
          },
        },
      ]),
    ).toThrow(/scrollbar metadata/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...checkbox,
          scene: {
            ...checkbox.scene,
            style: {
              ...(checkbox.scene.style as NonNullable<typeof checkbox.scene.style>),
              state: {
                ...(checkbox.scene.style?.state as NonNullable<
                  NonNullable<typeof checkbox.scene.style>['state']
                >),
                disabledOpacity: 2,
              },
            },
          },
        },
      ]),
    ).toThrow(/scene-state metadata/u);
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
          ...checkbox,
          palette: {
            ...(checkbox.palette as NonNullable<typeof checkbox.palette>),
            presets: [
              { id: 'invalid', label: 'Invalid', order: 10_000, properties: { checked: 'yes' } },
            ],
          },
        },
      ]),
    ).toThrow(/palette preset metadata/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...checkbox,
          palette: {
            ...(checkbox.palette as NonNullable<typeof checkbox.palette>),
            presets: [{ id: 'Invalid preset!', label: 'Invalid', order: 10_000, properties: {} }],
          },
        },
      ]),
    ).toThrow(/palette preset metadata/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...checkbox,
          palette: {
            ...(checkbox.palette as NonNullable<typeof checkbox.palette>),
            presets: [
              { id: 'same', label: 'One', order: 10_000, properties: {} },
              { id: 'same', label: 'Two', order: 10_001, properties: {} },
            ],
          },
        },
      ]),
    ).toThrow(/palette preset metadata/u);
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
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...breadcrumbs,
          rows: {
            ...(breadcrumbs.rows as NonNullable<typeof breadcrumbs.rows>),
            maximum: 10_000,
          },
        },
      ]),
    ).toThrow(/parsed-row metadata/u);
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...breadcrumbs,
          defaultProperties: { ...breadcrumbs.defaultProperties, items: ' › ' },
        },
      ]),
    ).toThrow(/default parsed rows/u);
    const treePane = getControlSpec(CONTROL_TYPES.treePane);
    if (treePane?.rows === null || treePane?.rows === undefined) {
      throw new Error('Tree Pane definition is missing.');
    }
    expect(() =>
      assertControlDefinitionsConform([
        {
          ...treePane,
          rows: {
            ...treePane.rows,
            adornment: { kind: 'tree', defaultKind: 'folder-open' },
          } as unknown as typeof treePane.rows,
        },
      ]),
    ).toThrow(/parsed-row metadata/u);
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

  it('owns the complete Search Box schema and its alternate palette identity', () => {
    const searchBox = getControlSpec(CONTROL_TYPES.searchBox);

    expect(searchBox).toMatchObject({
      accessibility: { nameProperty: 'text', role: 'textbox' },
      autoSize: { axis: 'both', basis: 'text' },
      capabilities: { link: true, state: true },
      defaultProperties: {
        microphoneIcon: false,
        searchIcon: true,
        shape: 'rounded',
        state: 'normal',
        text: 'search',
      },
      export: { kind: 'scene' },
      palette: {
        category: 'Forms',
        presets: [
          {
            id: 'rectangular-microphone',
            properties: { microphoneIcon: true, shape: 'rectangular' },
          },
        ],
      },
      scene: { kind: 'search-box' },
      thumbnail: { kind: 'scene' },
    });
    expect(searchBox?.inspector.flatMap((section) => section.fields)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'choice', property: 'shape' }),
        expect.objectContaining({ kind: 'boolean', property: 'searchIcon' }),
        expect.objectContaining({ kind: 'boolean', property: 'microphoneIcon' }),
        expect.objectContaining({ kind: 'select', property: 'state' }),
      ]),
    );
    expect(searchBox?.propertiesSchema.safeParse(searchBox.defaultProperties).success).toBe(true);
    expect(
      searchBox?.propertiesSchema.safeParse({
        ...searchBox.defaultProperties,
        shape: 'pill',
      }).success,
    ).toBe(false);
  });

  it('owns the exact screenshot-backed Text Area contract without inferred Auto-Size or border mode', () => {
    const textArea = getControlSpec(CONTROL_TYPES.textArea);

    expect(textArea).toMatchObject({
      accessibility: { nameProperty: 'text', role: 'textbox' },
      autoSize: null,
      capabilities: {
        border: true,
        fill: true,
        link: true,
        resizeAxes: 'both',
        state: true,
        text: { mode: 'multiline' },
      },
      defaultProperties: {
        borderColor: 'default',
        color: 'default',
        opacity: 1,
        scrollbar: false,
        state: 'normal',
        text: '',
        textAlignment: 'start',
        textColor: 'default',
      },
      defaultSize: { height: 140, width: 200 },
      export: { kind: 'scene' },
      scene: { kind: 'input' },
      thumbnail: { kind: 'scene' },
    });
    expect(textArea?.inspector.flatMap((section) => section.fields)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'color', property: 'color' }),
        expect.objectContaining({ kind: 'color', property: 'borderColor' }),
        expect.objectContaining({ kind: 'color', property: 'textColor' }),
        expect.objectContaining({ kind: 'range', property: 'opacity' }),
        expect.objectContaining({ kind: 'boolean', property: 'scrollbar' }),
        expect.objectContaining({ kind: 'select', property: 'state' }),
        expect.objectContaining({ kind: 'choice', property: 'textAlignment' }),
      ]),
    );
    expect(textArea?.inspector.flatMap((section) => section.fields)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'borderMode' })]),
    );
    expect(textArea?.propertiesSchema.safeParse(textArea.defaultProperties).success).toBe(true);
    expect(
      textArea?.propertiesSchema.safeParse({
        ...textArea.defaultProperties,
        borderMode: 'full',
      }).success,
    ).toBe(false);
  });

  it('keeps Subtitle and Title as separate screenshot-backed schemas instead of incompatible Text Label presets', () => {
    const textLabel = getControlSpec(CONTROL_TYPES.textLabel);
    const subtitle = getControlSpec(CONTROL_TYPES.textSubtitle);
    const title = getControlSpec(CONTROL_TYPES.textTitle);

    expect(textLabel?.palette?.presets).toEqual([]);
    expect(subtitle).toMatchObject({
      accessibility: { nameProperty: 'text', role: 'img' },
      autoSize: { axis: 'both', basis: 'text' },
      capabilities: { link: true, state: false },
      defaultProperties: {
        bold: false,
        fontSize: 24,
        italic: false,
        text: 'A Subtitle',
        textAlignment: 'start',
        textColor: 'default',
        underline: false,
      },
      defaultSize: { height: 28, width: 102 },
      scene: { kind: 'text' },
    });
    expect(title).toMatchObject({
      accessibility: { nameProperty: 'text', role: 'img' },
      autoSize: { axis: 'both', basis: 'text' },
      capabilities: { link: true, state: false },
      defaultProperties: {
        bold: false,
        fontSize: 40,
        italic: false,
        text: 'A Big Title',
        textAlignment: 'start',
        textColor: 'default',
        underline: false,
      },
      defaultSize: { height: 44, width: 182 },
      scene: { kind: 'text' },
    });
    for (const definition of [subtitle, title]) {
      const fields = definition?.inspector.flatMap((section) => section.fields) ?? [];
      expect(fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'color', property: 'textColor' }),
          expect.objectContaining({ kind: 'boolean', property: 'bold' }),
          expect.objectContaining({ kind: 'boolean', property: 'italic' }),
          expect.objectContaining({ kind: 'boolean', property: 'underline' }),
          expect.objectContaining({ kind: 'choice', property: 'textAlignment' }),
          expect.objectContaining({ kind: 'number', property: 'fontSize' }),
        ]),
      );
      expect(fields).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'orientation' }),
          expect.objectContaining({ property: 'state' }),
        ]),
      );
      expect(definition?.propertiesSchema.safeParse(definition.defaultProperties).success).toBe(
        true,
      );
      expect(
        definition?.propertiesSchema.safeParse({
          ...definition.defaultProperties,
          orientation: 'horizontal',
        }).success,
      ).toBe(false);
    }
  });

  it('owns the screenshot-backed Field Set contract without inferred actions', () => {
    const fieldSet = getControlSpec(CONTROL_TYPES.fieldSet);

    expect(fieldSet).toMatchObject({
      accessibility: { nameProperty: 'text', role: 'group' },
      autoSize: null,
      capabilities: {
        border: true,
        fill: true,
        grouping: 'container',
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      defaultProperties: {
        bold: false,
        color: 'default',
        fontSize: 13,
        italic: false,
        opacity: 1,
        text: 'Group Name',
        underline: false,
      },
      defaultSize: { height: 170, width: 200 },
      scene: { kind: 'field-set' },
    });
    const fields = fieldSet?.inspector.flatMap((section) => section.fields) ?? [];
    expect(fields).toEqual([
      expect.objectContaining({ kind: 'color', property: 'color' }),
      expect.objectContaining({ kind: 'range', property: 'opacity' }),
      expect.objectContaining({ kind: 'boolean', property: 'bold' }),
      expect.objectContaining({ kind: 'boolean', property: 'italic' }),
      expect.objectContaining({ kind: 'boolean', property: 'underline' }),
      expect.objectContaining({ kind: 'number', property: 'fontSize' }),
    ]);
    expect(fields).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'link' }),
        expect.objectContaining({ property: 'state' }),
        expect.objectContaining({ property: 'text' }),
      ]),
    );
    expect(fieldSet?.propertiesSchema.safeParse(fieldSet.defaultProperties).success).toBe(true);
  });

  it('owns the evidence-backed Link contract without exposing unsupported appearance fields', () => {
    const link = getControlSpec(CONTROL_TYPES.link);

    expect(link).toMatchObject({
      accessibility: { nameProperty: 'text', role: 'link' },
      autoSize: null,
      capabilities: {
        border: false,
        fill: false,
        link: true,
        state: true,
      },
      defaultProperties: {
        bold: false,
        fontSize: 13,
        italic: false,
        state: 'normal',
        text: 'a link',
        underline: true,
      },
      defaultSize: { height: 21, width: 31 },
      scene: { kind: 'text' },
    });
    const fields = link?.inspector.flatMap((section) => section.fields) ?? [];
    expect(fields).toEqual([
      expect.objectContaining({ kind: 'select', property: 'state' }),
      expect.objectContaining({ kind: 'boolean', property: 'bold' }),
      expect.objectContaining({ kind: 'boolean', property: 'italic' }),
      expect.objectContaining({ kind: 'boolean', property: 'underline' }),
      expect.objectContaining({ kind: 'number', property: 'fontSize' }),
    ]);
    expect(fields).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'textColor' }),
        expect.objectContaining({ property: 'textAlignment' }),
        expect.objectContaining({ property: 'text' }),
      ]),
    );
    expect(link?.propertiesSchema.safeParse(link.defaultProperties).success).toBe(true);
  });
});
