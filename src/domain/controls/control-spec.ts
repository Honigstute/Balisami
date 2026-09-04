import { z } from 'zod';

import { CONTROL_TEXT_POLICY } from '../../shared/control-text';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import { getIconDefinition } from '../../shared/icons/icon-catalog';
import { CustomIconReferenceSchema } from './custom-icon-reference';
import { ComponentInstancePropertiesSchema } from './component-instance';
import { ComponentIdSchema, ElementRowIdSchema } from '../document/ids';
import {
  ControlTypeIdSchema,
  ElementPropertiesSchema,
  type ControlTypeId,
  type ElementProperties,
} from '../document/schema';
import {
  assertControlDefinitionsConform,
  type ControlAccessibilityDefinition,
  type ControlAutoSizePolicy,
  type ControlCapabilities,
  type ControlDefinition,
  type ControlExportDefinition,
  type ControlImageCapability,
  type ControlInspectorSection,
  type ControlPaletteMetadata,
  type ControlPalettePreset,
  type ControlRowsDefinition,
  type ControlSceneDefinition,
  type ControlSize,
  type ControlTextCapability,
  type ControlThumbnailDefinition,
} from './control-definition';

export const CONTROL_TYPES = Object.freeze({
  componentInstance: ControlTypeIdSchema.parse('foundation.component-instance'),
  group: ControlTypeIdSchema.parse('foundation.group'),
  rectangle: ControlTypeIdSchema.parse('foundation.rectangle'),
  textLabel: ControlTypeIdSchema.parse('wireframe.text-label'),
  textSubtitle: ControlTypeIdSchema.parse('wireframe.text-subtitle'),
  textTitle: ControlTypeIdSchema.parse('wireframe.text-title'),
  button: ControlTypeIdSchema.parse('wireframe.button'),
  textInput: ControlTypeIdSchema.parse('wireframe.text-input'),
  checkbox: ControlTypeIdSchema.parse('wireframe.checkbox'),
  checkboxGroup: ControlTypeIdSchema.parse('wireframe.checkbox-group'),
  radioButtonGroup: ControlTypeIdSchema.parse('wireframe.radio-button-group'),
  imagePlaceholder: ControlTypeIdSchema.parse('wireframe.image-placeholder'),
  browser: ControlTypeIdSchema.parse('wireframe.browser'),
  arrow: ControlTypeIdSchema.parse('wireframe.arrow'),
  calendar: ControlTypeIdSchema.parse('wireframe.calendar'),
  chartBar: ControlTypeIdSchema.parse('wireframe.chart-bar'),
  chartLine: ControlTypeIdSchema.parse('wireframe.chart-line'),
  chartPie: ControlTypeIdSchema.parse('wireframe.chart-pie'),
  playback: ControlTypeIdSchema.parse('wireframe.playback'),
  videoPlayer: ControlTypeIdSchema.parse('wireframe.video-player'),
  volumeSlider: ControlTypeIdSchema.parse('wireframe.volume-slider'),
  webcam: ControlTypeIdSchema.parse('wireframe.webcam'),
  iosPicker: ControlTypeIdSchema.parse('wireframe.ios-picker'),
  hSplitter: ControlTypeIdSchema.parse('wireframe.h-splitter'),
  vSplitter: ControlTypeIdSchema.parse('wireframe.v-splitter'),
  redX: ControlTypeIdSchema.parse('wireframe.red-x'),
  squigglyBlock: ControlTypeIdSchema.parse('wireframe.squiggly-block-of-text'),
  streetMap: ControlTypeIdSchema.parse('wireframe.street-map'),
  toolbar: ControlTypeIdSchema.parse('wireframe.toolbar'),
  hRule: ControlTypeIdSchema.parse('wireframe.h-rule'),
  vRule: ControlTypeIdSchema.parse('wireframe.v-rule'),
  scratchOut: ControlTypeIdSchema.parse('wireframe.scratch-out'),
  helpButton: ControlTypeIdSchema.parse('wireframe.help-button'),
  modalScreen: ControlTypeIdSchema.parse('wireframe.modal-screen'),
  colorPicker: ControlTypeIdSchema.parse('wireframe.color-picker'),
  onOffSwitch: ControlTypeIdSchema.parse('wireframe.on-off-switch'),
  breadcrumbs: ControlTypeIdSchema.parse('wireframe.breadcrumbs'),
  buttonBar: ControlTypeIdSchema.parse('wireframe.button-bar'),
  linkBar: ControlTypeIdSchema.parse('wireframe.link-bar'),
  treePane: ControlTypeIdSchema.parse('wireframe.tree-pane'),
  searchBox: ControlTypeIdSchema.parse('wireframe.search-box'),
  textArea: ControlTypeIdSchema.parse('wireframe.text-area'),
  fieldSet: ControlTypeIdSchema.parse('wireframe.field-set'),
  link: ControlTypeIdSchema.parse('wireframe.link'),
});

export const FOUNDATION_CONTROL_TYPES = Object.freeze({
  componentInstance: CONTROL_TYPES.componentInstance,
  group: CONTROL_TYPES.group,
  rectangle: CONTROL_TYPES.rectangle,
});

const textPropertiesSchema = z
  .strictObject({ text: z.string().max(CONTROL_TEXT_POLICY.maximumLength) })
  .readonly();
const canonicalBundledIconIdSchema = z
  .string()
  .max(128)
  .refine(
    (iconId) => getIconDefinition(iconId)?.id === iconId,
    'Unknown or non-canonical icon ID.',
  );
const controlIconIdSchema = z.union([canonicalBundledIconIdSchema, CustomIconReferenceSchema]);
const sceneColorSchema = z.union([z.literal('default'), z.string().regex(/^#[0-9a-f]{6}$/iu)]);
const controlStateSchema = z.enum(['normal', 'disabled']);
const textAlignmentSchema = z.enum(['start', 'center', 'end']);
const textStyleSchemaShape = {
  bold: z.boolean(),
  fontSize: z.number().min(8).max(96),
  italic: z.boolean(),
  underline: z.boolean(),
} as const;
const centeredTextStyleSchemaShape = {
  ...textStyleSchemaShape,
  textAlignment: textAlignmentSchema,
} as const;
const headingTextPropertiesSchema = z
  .strictObject({
    ...centeredTextStyleSchemaShape,
    text: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
    textColor: sceneColorSchema,
  })
  .readonly();
const rectanglePropertiesSchema = z
  .strictObject({
    borderColor: sceneColorSchema,
    borderMode: z.enum(['visual-1', 'visual-2', 'visual-3', 'visual-4', 'visual-5', 'visual-6']),
    color: sceneColorSchema,
    opacity: z.number().min(0).max(1),
    scrollbar: z.boolean(),
  })
  .readonly();
const buttonPropertiesSchema = z
  .strictObject({
    ...centeredTextStyleSchemaShape,
    color: sceneColorSchema,
    iconId: controlIconIdSchema.nullable(),
    state: controlStateSchema,
    text: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
  })
  .readonly();
const textInputPropertiesSchema = z
  .strictObject({
    ...centeredTextStyleSchemaShape,
    borderColor: sceneColorSchema,
    borderMode: z.enum(['full', 'underline']),
    color: sceneColorSchema,
    opacity: z.number().min(0).max(1),
    state: controlStateSchema,
    text: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
    textColor: sceneColorSchema,
  })
  .readonly();
const checkboxPropertiesSchema = z
  .strictObject({
    ...textStyleSchemaShape,
    checked: z.boolean(),
    iconId: controlIconIdSchema.nullable(),
    state: controlStateSchema,
    text: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
    textColor: sceneColorSchema,
  })
  .readonly();
const markerGroupPropertiesSchema = z
  .strictObject({
    ...textStyleSchemaShape,
    items: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
    textColor: sceneColorSchema,
  })
  .readonly();
const imagePlaceholderPropertiesSchema = z
  .strictObject({
    ...textStyleSchemaShape,
    showBorder: z.boolean(),
    text: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
  })
  .readonly();
const browserPropertiesSchema = z
  .strictObject({
    borderMode: z.enum(['visual-1', 'visual-2']),
    color: sceneColorSchema,
    scrollbar: z.boolean(),
  })
  .readonly();
const arrowPropertiesSchema = z
  .strictObject({
    color: sceneColorSchema,
    endArrow: z.boolean(),
    labelPosition: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
    routing: z.enum(['visual-1', 'visual-2']),
    startArrow: z.boolean(),
    strokeStyle: z.enum(['solid', 'dashed', 'dotted']),
    text: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
  })
  .readonly();
const staticVisualPropertiesSchema = z.strictObject({}).readonly();
const rulePropertiesSchema = z
  .strictObject({
    borderColor: sceneColorSchema,
    opacity: z.number().min(0).max(1),
    strokeStyle: z.enum(['solid', 'dashed', 'dotted']),
  })
  .readonly();
const colorOpacityPropertiesSchema = z
  .strictObject({
    color: sceneColorSchema,
    opacity: z.number().min(0).max(1),
  })
  .readonly();
const colorPropertiesSchema = z.strictObject({ color: sceneColorSchema }).readonly();
const onOffSwitchPropertiesSchema = z
  .strictObject({ color: sceneColorSchema, state: z.enum(['off', 'on']) })
  .readonly();
const breadcrumbsPropertiesSchema = z
  .strictObject({
    ...textStyleSchemaShape,
    items: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
  })
  .readonly();
const buttonBarPropertiesSchema = z
  .strictObject({
    ...textStyleSchemaShape,
    items: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
    selectedRowId: ElementRowIdSchema.nullable(),
  })
  .readonly();
const linkBarPropertiesSchema = z
  .strictObject({
    ...textStyleSchemaShape,
    items: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
    selectedColor: sceneColorSchema,
    selectedRowId: ElementRowIdSchema.nullable(),
    textColor: sceneColorSchema,
  })
  .readonly();
const treePanePropertiesSchema = z
  .strictObject({
    ...textStyleSchemaShape,
    color: sceneColorSchema,
    items: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
    opacity: z.number().min(0).max(1),
    scrollbar: z.boolean(),
    selectedRowId: ElementRowIdSchema.nullable(),
    showBorder: z.boolean(),
    state: controlStateSchema,
  })
  .readonly();
const searchBoxPropertiesSchema = z
  .strictObject({
    ...textStyleSchemaShape,
    microphoneIcon: z.boolean(),
    searchIcon: z.boolean(),
    shape: z.enum(['rounded', 'rectangular']),
    state: controlStateSchema,
    text: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
    textColor: sceneColorSchema,
  })
  .readonly();
const textAreaPropertiesSchema = z
  .strictObject({
    ...centeredTextStyleSchemaShape,
    borderColor: sceneColorSchema,
    color: sceneColorSchema,
    opacity: z.number().min(0).max(1),
    scrollbar: z.boolean(),
    state: controlStateSchema,
    text: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
    textColor: sceneColorSchema,
  })
  .readonly();
const fieldSetPropertiesSchema = z
  .strictObject({
    ...textStyleSchemaShape,
    color: sceneColorSchema,
    opacity: z.number().min(0).max(1),
    text: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
  })
  .readonly();
const linkPropertiesSchema = z
  .strictObject({
    ...textStyleSchemaShape,
    state: controlStateSchema,
    text: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
    textColor: sceneColorSchema,
  })
  .readonly();

const createSize = (width: number, height: number): ControlSize => Object.freeze({ height, width });

const createAutoSize = (
  axis: ControlAutoSizePolicy['axis'],
  left: number,
  right: number,
  top: number,
  bottom: number,
): ControlAutoSizePolicy =>
  Object.freeze({
    axis,
    basis: 'text',
    insets: Object.freeze({ bottom, left, right, top }),
  });

const createIntrinsicAutoSize = (axis: ControlAutoSizePolicy['axis']): ControlAutoSizePolicy =>
  Object.freeze({
    axis,
    basis: 'intrinsic',
    insets: Object.freeze({ bottom: 0, left: 0, right: 0, top: 0 }),
  });

const createPalette = (
  label: string,
  category: ControlPaletteMetadata['category'],
  order: number,
  drawShortcut: string | null = null,
  presets: readonly ControlPalettePreset[] = [],
): ControlPaletteMetadata =>
  Object.freeze({
    category,
    drawShortcut,
    label,
    order,
    presets: Object.freeze(
      presets.map((preset) =>
        Object.freeze({ ...preset, properties: Object.freeze(preset.properties) }),
      ),
    ),
  });

const createTextStyleDefaults = (fontSize: number, alignment?: 'center' | 'start') =>
  Object.freeze({
    bold: false,
    fontSize,
    italic: false,
    ...(alignment === undefined ? {} : { textAlignment: alignment }),
    underline: false,
  });

const createTextStyleFields = (alignment: boolean): ControlInspectorSection['fields'] =>
  Object.freeze([
    { kind: 'boolean', label: 'Bold', property: 'bold' },
    { kind: 'boolean', label: 'Italic', property: 'italic' },
    { kind: 'boolean', label: 'Underline', property: 'underline' },
    ...(alignment
      ? [
          {
            kind: 'choice' as const,
            label: 'Alignment',
            options: Object.freeze([
              Object.freeze({ label: 'Left', value: 'start' }),
              Object.freeze({ label: 'Center', value: 'center' }),
              Object.freeze({ label: 'Right', value: 'end' }),
            ]),
            property: 'textAlignment',
          },
        ]
      : []),
    { kind: 'number', label: 'Size', maximum: 96, minimum: 8, property: 'fontSize', step: 1 },
  ]);

const createText = (
  alignment: ControlTextCapability['alignment'],
  fontSize: number,
  inset: number,
  style: Partial<ControlTextCapability['style']> = {},
  property = 'text',
  mode: ControlTextCapability['mode'] = 'single-line',
): ControlTextCapability =>
  Object.freeze({
    alignment,
    fontSize,
    inset,
    mode,
    property,
    style: Object.freeze({
      alignmentProperty: null,
      boldProperty: null,
      colorProperty: null,
      fontSizeProperty: null,
      italicProperty: null,
      underlineProperty: null,
      ...style,
    }),
  });

const createImageCapability = (): ControlImageCapability =>
  Object.freeze({
    assetSource: 'element-assets',
    fit: 'contain',
    maximumAssets: 1,
    placeholder: 'cross',
  });

const createDisabledState = (property = 'state') =>
  Object.freeze({
    disabledOpacity: 0.45,
    disabledValues: Object.freeze(['disabled']),
    property,
  });

const createCapabilities = (
  input: Omit<ControlCapabilities, 'image' | 'text'> &
    Readonly<{ image?: ControlImageCapability | null }>,
  text: ControlTextCapability | null,
): ControlCapabilities => Object.freeze({ ...input, image: input.image ?? null, text });

const createAccessibility = (
  fallbackLabel: string,
  role: ControlAccessibilityDefinition['role'],
  nameProperty: string | null = null,
  checkedProperty: string | null = null,
): ControlAccessibilityDefinition =>
  Object.freeze({ checkedProperty, fallbackLabel, nameProperty, role });

const createThumbnail = (kind: ControlThumbnailDefinition['kind']): ControlThumbnailDefinition =>
  Object.freeze({ kind });

const createExport = (kind: ControlExportDefinition['kind']): ControlExportDefinition =>
  Object.freeze({ kind });

const createScene = (
  kind: ControlSceneDefinition['kind'],
  propertyKeys: readonly string[],
  checkbox?: ControlSceneDefinition['checkbox'],
  hitShape: ControlSceneDefinition['hitShape'] = Object.freeze({ kind: 'bounds' }),
  colorTarget: ControlSceneDefinition['colorTarget'] = 'stroke',
  style?: ControlSceneDefinition['style'],
): ControlSceneDefinition =>
  Object.freeze({
    ...(checkbox === undefined ? {} : { checkbox: Object.freeze(checkbox) }),
    colorTarget,
    hitShape: Object.freeze(hitShape),
    kind,
    propertyKeys: Object.freeze([...new Set(propertyKeys)]),
    ...(style === undefined ? {} : { style: Object.freeze(style) }),
  });

/**
 * Derives the complete cache dependency contract from declarative scene and
 * text bindings. Adding a new presentation binding must flow through this one
 * list so live SVG nodes, thumbnails, and presentation cannot become stale.
 */
const createPresentationPropertyKeys = (
  scene: ControlSceneDefinition,
  capabilities: ControlCapabilities,
): readonly string[] => {
  const text = capabilities.text;
  const style = scene.style;
  return Object.freeze([
    ...new Set([
      ...scene.propertyKeys,
      ...(text === null
        ? []
        : [
            text.property,
            ...Object.values(text.style).filter(
              (property): property is string => property !== null,
            ),
          ]),
      ...(style === undefined
        ? []
        : Object.values(style).filter(
            (property): property is string => typeof property === 'string',
          )),
      ...(style?.state === undefined ? [] : [style.state.property]),
    ]),
  ]);
};

const createInspector = (
  label: string,
  fields: ControlInspectorSection['fields'],
): readonly ControlInspectorSection[] =>
  Object.freeze([Object.freeze({ fields: Object.freeze(fields), label })]);

const createInspectorFields = (
  fields: ControlInspectorSection['fields'],
): ControlInspectorSection['fields'] => Object.freeze(fields);

const createInspectorSections = (
  sections: readonly ControlInspectorSection[],
): readonly ControlInspectorSection[] =>
  Object.freeze(
    sections.map((section) =>
      Object.freeze({ fields: Object.freeze(section.fields), label: section.label }),
    ),
  );

const createDefinition = (input: {
  accessibility: ControlAccessibilityDefinition;
  aliases?: readonly string[];
  autoSize: ControlAutoSizePolicy | null;
  capabilities: ControlCapabilities;
  defaultProperties: ElementProperties;
  defaultSize: ControlSize;
  export: ControlExportDefinition;
  inspector?: readonly ControlInspectorSection[];
  fileVersion?: number;
  maximumSize: ControlSize | null;
  migrations?: ControlDefinition['migrations'];
  minimumSize: ControlSize;
  palette: ControlPaletteMetadata | null;
  propertiesSchema: ControlDefinition['propertiesSchema'];
  rows?: ControlRowsDefinition | null;
  scene: ControlSceneDefinition;
  tags?: readonly string[];
  thumbnail: ControlThumbnailDefinition;
  type: ControlTypeId;
}): ControlDefinition => {
  const scene = Object.freeze({
    ...input.scene,
    propertyKeys: Object.freeze([
      ...new Set([
        ...createPresentationPropertyKeys(input.scene, input.capabilities),
        ...(input.rows?.selection === null || input.rows?.selection === undefined
          ? []
          : [
              input.rows.selection.property,
              ...(input.rows.selection.appearance.colorProperty === null
                ? []
                : [input.rows.selection.appearance.colorProperty]),
            ]),
      ]),
    ]),
  });
  return Object.freeze({
    accessibility: input.accessibility,
    autoSize: input.autoSize,
    capabilities: input.capabilities,
    defaultProperties: Object.freeze(input.defaultProperties),
    defaultSize: input.defaultSize,
    export: input.export,
    fileVersion: input.fileVersion ?? 1,
    inspector: Object.freeze(input.inspector ?? []),
    maximumSize: input.maximumSize,
    minimumSize: input.minimumSize,
    migrations: Object.freeze(input.migrations ?? []),
    palette: input.palette,
    propertiesSchema: input.propertiesSchema,
    rows: input.rows ?? null,
    scene,
    search: Object.freeze({
      aliases: Object.freeze(input.aliases ?? []),
      tags: Object.freeze(input.tags ?? []),
    }),
    thumbnail: input.thumbnail,
    type: input.type,
  });
};

const CONTROL_DEFINITIONS: readonly ControlDefinition[] = Object.freeze([
  createDefinition({
    accessibility: createAccessibility('Component instance', 'group'),
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        // Instances are conceptual containers for export/scene semantics. A
        // document invariant still rejects persisted instance children because
        // expansion is derived exclusively from the referenced definition.
        grouping: 'container',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {
      componentId: ComponentIdSchema.parse('component_unassigned'),
      overrides: {},
    },
    defaultSize: createSize(240, 160),
    export: createExport('transparent-container'),
    minimumSize: createSize(24, 24),
    maximumSize: null,
    palette: null,
    propertiesSchema: ComponentInstancePropertiesSchema,
    scene: createScene('transparent', ['componentId', 'overrides']),
    thumbnail: createThumbnail('none'),
    type: CONTROL_TYPES.componentInstance,
  }),
  createDefinition({
    accessibility: createAccessibility('Group', 'group'),
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'container',
        icon: false,
        link: false,
        resizeAxes: 'none',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(240, 160),
    export: createExport('transparent-container'),
    minimumSize: createSize(24, 24),
    maximumSize: null,
    palette: null,
    propertiesSchema: ElementPropertiesSchema,
    scene: createScene('transparent', []),
    thumbnail: createThumbnail('none'),
    type: CONTROL_TYPES.group,
  }),
  createDefinition({
    accessibility: createAccessibility('Rectangle', 'img'),
    aliases: ['box', 'shape'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: true,
        fill: true,
        grouping: 'leaf',
        icon: false,
        link: true,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {
      borderColor: 'default',
      borderMode: 'visual-2',
      color: 'default',
      opacity: 1,
      scrollbar: false,
    },
    defaultSize: createSize(180, 120),
    export: createExport('scene'),
    fileVersion: 2,
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([
          {
            kind: 'choice',
            label: 'Border',
            options: Object.freeze([
              Object.freeze({ label: 'Visual 1', value: 'visual-1' }),
              Object.freeze({ label: 'Visual 2', value: 'visual-2' }),
              Object.freeze({ label: 'Visual 3', value: 'visual-3' }),
              Object.freeze({ label: 'Visual 4', value: 'visual-4' }),
              Object.freeze({ label: 'Visual 5', value: 'visual-5' }),
              Object.freeze({ label: 'Visual 6', value: 'visual-6' }),
            ]),
            property: 'borderMode',
          },
        ]),
        label: 'Border',
      }),
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'color', label: 'Color', property: 'color' },
          { kind: 'color', label: 'Border Color', property: 'borderColor' },
          {
            kind: 'range',
            label: 'Opacity',
            maximum: 1,
            minimum: 0,
            property: 'opacity',
            step: 0.05,
          },
        ]),
        label: 'Color',
      }),
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'boolean', label: 'Scrollbar', property: 'scrollbar' },
        ]),
        label: 'Layout',
      }),
    ]),
    minimumSize: createSize(24, 24),
    maximumSize: null,
    palette: createPalette('Rectangle', 'Common', 10, 'KeyR'),
    migrations: [
      {
        fromVersion: 1,
        migrate: (properties) => {
          const normalizeColor = (value: unknown): string =>
            typeof value === 'string' && (value === 'default' || /^#[0-9a-f]{6}$/iu.test(value))
              ? value
              : 'default';
          const borderMode = properties.borderMode;
          const opacity = properties.opacity;
          return Object.freeze({
            borderColor: normalizeColor(properties.borderColor),
            borderMode:
              typeof borderMode === 'string' &&
              ['visual-1', 'visual-2', 'visual-3', 'visual-4', 'visual-5', 'visual-6'].includes(
                borderMode,
              )
                ? borderMode
                : 'visual-2',
            color: normalizeColor(properties.color),
            opacity:
              typeof opacity === 'number' &&
              Number.isFinite(opacity) &&
              opacity >= 0 &&
              opacity <= 1
                ? opacity
                : 1,
            scrollbar: typeof properties.scrollbar === 'boolean' ? properties.scrollbar : false,
          });
        },
        toVersion: 2,
      },
    ],
    propertiesSchema: rectanglePropertiesSchema,
    scene: createScene('rectangle', [], undefined, undefined, 'stroke', {
      borderHiddenValues: Object.freeze(['visual-1']),
      borderModeProperty: 'borderMode',
      borderVisibilityProperty: null,
      fillColorProperty: 'color',
      opacityProperty: 'opacity',
      scrollbarVisibilityProperty: 'scrollbar',
      strokeColorProperty: 'borderColor',
    }),
    tags: ['container', 'panel'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.rectangle,
  }),
  createDefinition({
    accessibility: createAccessibility('Text Label', 'img', 'text'),
    aliases: ['label', 'copy'],
    autoSize: createAutoSize('both', 0, 0, 0, 0),
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: true,
        resizeAxes: 'both',
        state: true,
      },
      createText('start', 18, 0),
    ),
    defaultProperties: { text: 'Text label' },
    defaultSize: createSize(160, 36),
    export: createExport('scene'),
    inspector: createInspector('Text', [{ kind: 'text', label: 'Content', property: 'text' }]),
    minimumSize: createSize(32, 24),
    maximumSize: null,
    palette: createPalette('Text Label', 'Text', 20),
    propertiesSchema: textPropertiesSchema,
    scene: createScene('text', ['text']),
    tags: ['typography'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.textLabel,
  }),
  createDefinition({
    accessibility: createAccessibility('Text Subtitle', 'img', 'text'),
    aliases: ['subtitle', 'subheading'],
    autoSize: createAutoSize('both', 0, 0, 0, 0),
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: true,
        resizeAxes: 'both',
        state: false,
      },
      createText('start', 24, 0, {
        alignmentProperty: 'textAlignment',
        boldProperty: 'bold',
        colorProperty: 'textColor',
        fontSizeProperty: 'fontSize',
        italicProperty: 'italic',
        underlineProperty: 'underline',
      }),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(24, 'start'),
      text: 'A Subtitle',
      textColor: 'default',
    },
    defaultSize: createSize(102, 28),
    export: createExport('scene'),
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'color', label: 'Text Color', property: 'textColor' },
        ]),
        label: 'Color',
      }),
      Object.freeze({ fields: createTextStyleFields(true), label: 'Text' }),
    ]),
    maximumSize: null,
    minimumSize: createSize(32, 24),
    palette: createPalette('Text Subtitle', 'Text', 21),
    propertiesSchema: headingTextPropertiesSchema,
    scene: createScene('text', ['text']),
    tags: ['copy', 'subtitle', 'text', 'typography'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.textSubtitle,
  }),
  createDefinition({
    accessibility: createAccessibility('Text Title', 'img', 'text'),
    aliases: ['big title', 'heading', 'title'],
    autoSize: createAutoSize('both', 0, 0, 0, 0),
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: true,
        resizeAxes: 'both',
        state: false,
      },
      createText('start', 40, 0, {
        alignmentProperty: 'textAlignment',
        boldProperty: 'bold',
        colorProperty: 'textColor',
        fontSizeProperty: 'fontSize',
        italicProperty: 'italic',
        underlineProperty: 'underline',
      }),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(40, 'start'),
      text: 'A Big Title',
      textColor: 'default',
    },
    defaultSize: createSize(182, 44),
    export: createExport('scene'),
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'color', label: 'Text Color', property: 'textColor' },
        ]),
        label: 'Color',
      }),
      Object.freeze({ fields: createTextStyleFields(true), label: 'Text' }),
    ]),
    maximumSize: null,
    minimumSize: createSize(32, 24),
    palette: createPalette('Text Title', 'Text', 22),
    propertiesSchema: headingTextPropertiesSchema,
    scene: createScene('text', ['text']),
    tags: ['big', 'heading', 'text', 'title', 'typography'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.textTitle,
  }),
  createDefinition({
    accessibility: createAccessibility('Button', 'button', 'text'),
    aliases: ['action', 'cta'],
    autoSize: createAutoSize('both', 8, 8, 8, 8),
    capabilities: createCapabilities(
      {
        border: false,
        fill: true,
        grouping: 'leaf',
        icon: true,
        link: true,
        resizeAxes: 'both',
        state: true,
      },
      createText('center', 16, 8, {
        alignmentProperty: 'textAlignment',
        boldProperty: 'bold',
        fontSizeProperty: 'fontSize',
        italicProperty: 'italic',
        underlineProperty: 'underline',
      }),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(16, 'center'),
      color: 'default',
      iconId: null,
      state: 'normal',
      text: 'Button',
    },
    defaultSize: createSize(120, 40),
    export: createExport('scene'),
    fileVersion: 4,
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([{ kind: 'color', label: 'Color', property: 'color' }]),
        label: 'Color',
      }),
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'text', label: 'Text', property: 'text' },
          { kind: 'icon', label: 'Icon', property: 'iconId' },
        ]),
        label: 'Content',
      }),
      Object.freeze({
        fields: createInspectorFields([
          {
            kind: 'select',
            label: 'State',
            options: Object.freeze([
              Object.freeze({ label: 'Normal', value: 'normal' }),
              Object.freeze({ label: 'Disabled', value: 'disabled' }),
            ]),
            property: 'state',
          },
        ]),
        label: 'State',
      }),
      Object.freeze({ fields: createTextStyleFields(true), label: 'Text' }),
    ]),
    minimumSize: createSize(48, 28),
    maximumSize: null,
    palette: createPalette('Button', 'Buttons', 30),
    migrations: [
      {
        fromVersion: 1,
        migrate: (properties) => Object.freeze({ ...properties, iconId: null }),
        toVersion: 2,
      },
      {
        fromVersion: 2,
        migrate: (properties) => Object.freeze({ ...properties }),
        toVersion: 3,
      },
      {
        fromVersion: 3,
        migrate: (properties) =>
          Object.freeze({
            ...properties,
            ...createTextStyleDefaults(16, 'center'),
            color: 'default',
            state: 'normal',
          }),
        toVersion: 4,
      },
    ],
    propertiesSchema: buttonPropertiesSchema,
    scene: createScene('button', ['iconId', 'state', 'text'], undefined, undefined, 'fill', {
      borderHiddenValues: Object.freeze([]),
      borderModeProperty: null,
      borderVisibilityProperty: null,
      fillColorProperty: 'color',
      opacityProperty: null,
      strokeColorProperty: null,
      state: createDisabledState(),
    }),
    tags: ['action'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.button,
  }),
  createDefinition({
    accessibility: createAccessibility('Text Input', 'textbox', 'text'),
    aliases: ['field', 'input'],
    autoSize: createAutoSize('horizontal', 10, 10, 0, 0),
    capabilities: createCapabilities(
      {
        border: true,
        fill: true,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: true,
      },
      createText('start', 16, 10, {
        alignmentProperty: 'textAlignment',
        boldProperty: 'bold',
        colorProperty: 'textColor',
        fontSizeProperty: 'fontSize',
        italicProperty: 'italic',
        underlineProperty: 'underline',
      }),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(16, 'start'),
      borderColor: 'default',
      borderMode: 'full',
      color: 'default',
      opacity: 1,
      state: 'normal',
      text: 'Text input',
      textColor: 'default',
    },
    defaultSize: createSize(180, 40),
    export: createExport('scene'),
    fileVersion: 2,
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([
          {
            kind: 'choice',
            label: 'Border',
            options: Object.freeze([
              Object.freeze({ label: 'Full', value: 'full' }),
              Object.freeze({ label: 'Underline', value: 'underline' }),
            ]),
            property: 'borderMode',
          },
        ]),
        label: 'Border',
      }),
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'color', label: 'Color', property: 'color' },
          { kind: 'color', label: 'Border Color', property: 'borderColor' },
          { kind: 'color', label: 'Text Color', property: 'textColor' },
          {
            kind: 'range',
            label: 'Opacity',
            maximum: 1,
            minimum: 0,
            property: 'opacity',
            step: 0.05,
          },
        ]),
        label: 'Color',
      }),
      Object.freeze({
        fields: createInspectorFields([
          {
            kind: 'select',
            label: 'State',
            options: Object.freeze([
              Object.freeze({ label: 'Normal', value: 'normal' }),
              Object.freeze({ label: 'Disabled', value: 'disabled' }),
            ]),
            property: 'state',
          },
        ]),
        label: 'State',
      }),
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'text', label: 'Content', property: 'text' },
          ...createTextStyleFields(true),
        ]),
        label: 'Text',
      }),
    ]),
    minimumSize: createSize(72, 28),
    maximumSize: null,
    palette: createPalette('Text Input', 'Forms', 40, null, [
      {
        id: 'underline',
        label: 'Text Input (Underline)',
        order: 41,
        properties: { borderMode: 'underline' },
      },
    ]),
    migrations: [
      {
        fromVersion: 1,
        migrate: (properties) =>
          Object.freeze({
            ...properties,
            ...createTextStyleDefaults(16, 'start'),
            borderColor: 'default',
            borderMode: 'full',
            color: 'default',
            opacity: 1,
            state: 'normal',
            textColor: 'default',
          }),
        toVersion: 2,
      },
    ],
    propertiesSchema: textInputPropertiesSchema,
    scene: createScene('input', ['state', 'text'], undefined, undefined, 'stroke', {
      borderHiddenValues: Object.freeze([]),
      borderModeProperty: 'borderMode',
      borderVisibilityProperty: null,
      fillColorProperty: 'color',
      opacityProperty: 'opacity',
      strokeColorProperty: 'borderColor',
      state: createDisabledState(),
    }),
    tags: ['form', 'field'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.textInput,
  }),
  createDefinition({
    accessibility: createAccessibility('Checkbox', 'checkbox', 'text', 'checked'),
    aliases: ['check', 'tick'],
    autoSize: createAutoSize('horizontal', 26, 0, 0, 0),
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: true,
        link: true,
        resizeAxes: 'both',
        state: true,
      },
      createText('start', 16, 0, {
        boldProperty: 'bold',
        colorProperty: 'textColor',
        fontSizeProperty: 'fontSize',
        italicProperty: 'italic',
        underlineProperty: 'underline',
      }),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(16),
      checked: false,
      iconId: null,
      state: 'normal',
      text: 'Checkbox',
      textColor: 'default',
    },
    defaultSize: createSize(160, 32),
    export: createExport('scene'),
    fileVersion: 2,
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'color', label: 'Text Color', property: 'textColor' },
          { kind: 'icon', label: 'Icon', property: 'iconId' },
        ]),
        label: 'Appearance',
      }),
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'boolean', label: 'Checked', property: 'checked' },
          {
            kind: 'select',
            label: 'State',
            options: Object.freeze([
              Object.freeze({ label: 'Normal', value: 'normal' }),
              Object.freeze({ label: 'Disabled', value: 'disabled' }),
            ]),
            property: 'state',
          },
        ]),
        label: 'State',
      }),
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'text', label: 'Label', property: 'text' },
          ...createTextStyleFields(false),
        ]),
        label: 'Text',
      }),
    ]),
    minimumSize: createSize(48, 24),
    maximumSize: null,
    palette: createPalette('Checkbox', 'Forms', 50),
    migrations: [
      {
        fromVersion: 1,
        migrate: (properties) =>
          Object.freeze({
            ...properties,
            ...createTextStyleDefaults(16),
            iconId: null,
            state: 'normal',
            textColor: 'default',
          }),
        toVersion: 2,
      },
    ],
    propertiesSchema: checkboxPropertiesSchema,
    scene: createScene(
      'checkbox',
      ['checked', 'iconId', 'state', 'text'],
      { boxSize: 18, gap: 8 },
      undefined,
      'stroke',
      {
        borderHiddenValues: Object.freeze([]),
        borderModeProperty: null,
        borderVisibilityProperty: null,
        fillColorProperty: null,
        opacityProperty: null,
        strokeColorProperty: null,
        state: createDisabledState(),
      },
    ),
    tags: ['form', 'selection', 'toggle'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.checkbox,
  }),
  createDefinition({
    accessibility: createAccessibility('Checkbox Group', 'group'),
    aliases: ['checkbox list', 'check group'],
    autoSize: createAutoSize('both', 4, 4, 4, 4),
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      createText(
        'start',
        13,
        4,
        {
          boldProperty: 'bold',
          colorProperty: 'textColor',
          fontSizeProperty: 'fontSize',
          italicProperty: 'italic',
          underlineProperty: 'underline',
        },
        'items',
        'multiline',
      ),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(13),
      items: [
        '[ ] not selected',
        '[x] selected',
        '[-] indeterminate',
        '[ ] -disabled-',
        '[x] -disabled selected-',
        '[-] -disabled indeterminate-',
        'A row without a checkbox',
      ].join('\n'),
      textColor: 'default',
    },
    defaultSize: createSize(155, 149),
    export: createExport('scene'),
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'color', label: 'Text Color', property: 'textColor' },
        ]),
        label: 'Color',
      }),
      Object.freeze({ fields: createTextStyleFields(false), label: 'Text' }),
    ]),
    minimumSize: createSize(72, 28),
    maximumSize: null,
    palette: createPalette('Checkbox Group', 'Forms', 51),
    propertiesSchema: markerGroupPropertiesSchema,
    rows: Object.freeze({
      adornment: null,
      display: 'labels',
      layout: 'stack',
      links: true,
      marker: Object.freeze({ defaultState: 'unchecked', kind: 'checkbox' }),
      maximum: 64,
      minimum: 1,
      property: 'items',
      selection: null,
      separator: '\n',
    }),
    scene: createScene('text', ['items']),
    tags: ['checkbox', 'form', 'group', 'indeterminate', 'list'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.checkboxGroup,
  }),
  createDefinition({
    accessibility: createAccessibility('Radio Button Group', 'group'),
    aliases: ['radio group', 'radio list'],
    autoSize: createAutoSize('both', 4, 4, 4, 4),
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      createText(
        'start',
        13,
        4,
        {
          boldProperty: 'bold',
          colorProperty: 'textColor',
          fontSizeProperty: 'fontSize',
          italicProperty: 'italic',
          underlineProperty: 'underline',
        },
        'items',
        'multiline',
      ),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(13),
      items: [
        '(o) option 1 (selected)',
        '( ) option 2',
        '(-) option 3 (indeterminate)',
        '( ) -option 4 (disabled)-',
        '(o) -option 5 (disabled and selected)-',
        '(-) -option 6 (disabled indeterminate)-',
        'A row without a radio button',
      ].join('\n'),
      textColor: 'default',
    },
    defaultSize: createSize(165, 181),
    export: createExport('scene'),
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'color', label: 'Text Color', property: 'textColor' },
        ]),
        label: 'Color',
      }),
      Object.freeze({ fields: createTextStyleFields(false), label: 'Text' }),
    ]),
    minimumSize: createSize(72, 28),
    maximumSize: null,
    palette: createPalette('Radio Button Group', 'Forms', 52),
    propertiesSchema: markerGroupPropertiesSchema,
    rows: Object.freeze({
      adornment: null,
      display: 'labels',
      layout: 'stack',
      links: true,
      marker: Object.freeze({ defaultState: 'unchecked', kind: 'radio' }),
      maximum: 64,
      minimum: 1,
      property: 'items',
      selection: null,
      separator: '\n',
    }),
    scene: createScene('text', ['items']),
    tags: ['form', 'group', 'indeterminate', 'list', 'radio'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.radioButtonGroup,
  }),
  createDefinition({
    accessibility: createAccessibility('Image placeholder', 'img', 'text'),
    aliases: ['image', 'photo', 'picture'],
    autoSize: createIntrinsicAutoSize('both'),
    capabilities: createCapabilities(
      {
        border: true,
        fill: false,
        grouping: 'leaf',
        icon: false,
        image: createImageCapability(),
        link: true,
        resizeAxes: 'both',
        state: false,
      },
      createText('center', 16, 0, {
        boldProperty: 'bold',
        fontSizeProperty: 'fontSize',
        italicProperty: 'italic',
        underlineProperty: 'underline',
      }),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(16),
      showBorder: false,
      text: '',
    },
    defaultSize: createSize(120, 100),
    export: createExport('scene'),
    fileVersion: 2,
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'boolean', label: 'Show Border', property: 'showBorder' },
        ]),
        label: 'Border',
      }),
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'text', label: 'Content', property: 'text' },
          ...createTextStyleFields(false),
        ]),
        label: 'Text',
      }),
    ]),
    minimumSize: createSize(24, 24),
    maximumSize: null,
    palette: createPalette('Image', 'Assets', 60, 'KeyI'),
    migrations: [
      {
        fromVersion: 1,
        migrate: (properties) =>
          Object.freeze({ ...properties, ...createTextStyleDefaults(16), text: '' }),
        toVersion: 2,
      },
    ],
    propertiesSchema: imagePlaceholderPropertiesSchema,
    scene: createScene('image', ['showBorder', 'text'], undefined, undefined, 'stroke', {
      borderHiddenValues: Object.freeze([]),
      borderModeProperty: null,
      borderVisibilityProperty: 'showBorder',
      fillColorProperty: null,
      opacityProperty: null,
      strokeColorProperty: null,
    }),
    tags: ['asset', 'placeholder'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.imagePlaceholder,
  }),
  createDefinition({
    accessibility: createAccessibility('Browser window', 'group'),
    aliases: ['browser window', 'web page'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: true,
        fill: true,
        grouping: 'container',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: { borderMode: 'visual-1', color: 'default', scrollbar: false },
    defaultSize: createSize(450, 400),
    export: createExport('scene'),
    inspector: createInspector('Browser', [
      {
        kind: 'choice',
        label: 'Border',
        options: [
          { label: 'Visual 1', value: 'visual-1' },
          { label: 'Visual 2', value: 'visual-2' },
        ],
        property: 'borderMode',
      },
      { kind: 'color', label: 'Color', property: 'color' },
      { kind: 'boolean', label: 'Scrollbar', property: 'scrollbar' },
    ]),
    minimumSize: createSize(160, 120),
    maximumSize: null,
    palette: createPalette('Browser Window', 'Containers', 70),
    propertiesSchema: browserPropertiesSchema,
    scene: createScene(
      'browser',
      ['borderMode', 'color', 'scrollbar'],
      undefined,
      undefined,
      'fill',
    ),
    tags: ['container', 'website', 'web'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.browser,
  }),
  createDefinition({
    accessibility: createAccessibility('Arrow', 'img', 'text'),
    aliases: ['connector', 'line'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      createText('center', 13, 0),
    ),
    defaultProperties: {
      color: 'default',
      endArrow: true,
      labelPosition: 0.5,
      opacity: 1,
      routing: 'visual-1',
      startArrow: false,
      strokeStyle: 'solid',
      text: '',
    },
    defaultSize: createSize(150, 100),
    export: createExport('scene'),
    inspector: createInspector('Arrow', [
      {
        kind: 'choice',
        label: 'Routing',
        options: [
          { label: 'Visual 1', value: 'visual-1' },
          { label: 'Visual 2', value: 'visual-2' },
        ],
        property: 'routing',
      },
      { kind: 'boolean', label: 'Start Arrowhead', property: 'startArrow' },
      { kind: 'boolean', label: 'End Arrowhead', property: 'endArrow' },
      {
        kind: 'number',
        label: 'Label Position',
        maximum: 1,
        minimum: 0,
        property: 'labelPosition',
        step: 0.05,
      },
      { kind: 'color', label: 'Color', property: 'color' },
      {
        kind: 'number',
        label: 'Opacity',
        maximum: 1,
        minimum: 0,
        property: 'opacity',
        step: 0.05,
      },
      {
        kind: 'choice',
        label: 'Stroke',
        options: [
          { label: 'Solid', value: 'solid' },
          { label: 'Dashed', value: 'dashed' },
          { label: 'Dotted', value: 'dotted' },
        ],
        property: 'strokeStyle',
      },
      { kind: 'text', label: 'Text', property: 'text' },
    ]),
    minimumSize: createSize(24, 16),
    maximumSize: null,
    palette: createPalette('Arrow', 'Common', 80),
    propertiesSchema: arrowPropertiesSchema,
    scene: createScene(
      'arrow',
      [
        'routing',
        'startArrow',
        'endArrow',
        'labelPosition',
        'color',
        'opacity',
        'strokeStyle',
        'text',
      ],
      undefined,
      {
        end: { x: 1, y: 1 },
        kind: 'line',
        start: { x: 0, y: 0 },
        tolerance: 6,
      },
    ),
    tags: ['connector', 'direction'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.arrow,
  }),
  createDefinition({
    accessibility: createAccessibility('Calendar', 'img'),
    aliases: ['date calendar', 'month calendar'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(244, 202),
    export: createExport('scene'),
    minimumSize: createSize(112, 96),
    maximumSize: null,
    palette: createPalette('Calendar', 'Common', 90),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('calendar', []),
    tags: ['date', 'month', 'schedule'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.calendar,
  }),
  createDefinition({
    accessibility: createAccessibility('Bar chart', 'img'),
    aliases: ['bar chart', 'horizontal chart'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(360, 270),
    export: createExport('scene'),
    minimumSize: createSize(96, 72),
    maximumSize: null,
    palette: createPalette('Chart: Bar', 'Common', 100),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('chart-bar', []),
    tags: ['chart', 'data', 'diagram', 'visualization'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.chartBar,
  }),
  createDefinition({
    accessibility: createAccessibility('Line chart', 'img'),
    aliases: ['line chart', 'trend chart'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(180, 180),
    export: createExport('scene'),
    minimumSize: createSize(72, 72),
    maximumSize: null,
    palette: createPalette('Chart: Line', 'Common', 110),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('chart-line', []),
    tags: ['chart', 'data', 'diagram', 'trend', 'visualization'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.chartLine,
  }),
  createDefinition({
    accessibility: createAccessibility('Pie chart', 'img'),
    aliases: ['pie chart', 'radial chart'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(180, 180),
    export: createExport('scene'),
    minimumSize: createSize(72, 72),
    maximumSize: null,
    palette: createPalette('Chart: Pie', 'Common', 120),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('chart-pie', []),
    tags: ['chart', 'data', 'diagram', 'radial', 'visualization'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.chartPie,
  }),
  createDefinition({
    accessibility: createAccessibility('Playback', 'img'),
    aliases: ['media controls', 'transport controls'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(110, 36),
    export: createExport('scene'),
    minimumSize: createSize(72, 28),
    maximumSize: null,
    palette: createPalette('Playback', 'Media', 130),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('playback', []),
    tags: ['audio', 'media', 'player', 'transport'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.playback,
  }),
  createDefinition({
    accessibility: createAccessibility('Video player', 'img'),
    aliases: ['movie player', 'video'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(300, 200),
    export: createExport('scene'),
    minimumSize: createSize(120, 80),
    maximumSize: null,
    palette: createPalette('Video Player', 'Media', 140),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('video-player', []),
    tags: ['media', 'movie', 'player'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.videoPlayer,
  }),
  createDefinition({
    accessibility: createAccessibility('Volume slider', 'img'),
    aliases: ['audio slider', 'sound slider', 'volume control'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(72, 16),
    export: createExport('scene'),
    minimumSize: createSize(48, 16),
    maximumSize: null,
    palette: createPalette('Volume Slider', 'Media', 150),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('volume-slider', []),
    tags: ['audio', 'media', 'sound'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.volumeSlider,
  }),
  createDefinition({
    accessibility: createAccessibility('Webcam', 'img'),
    aliases: ['camera preview', 'video camera'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(177, 146),
    export: createExport('scene'),
    minimumSize: createSize(72, 64),
    maximumSize: null,
    palette: createPalette('Webcam', 'Media', 160),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('webcam', []),
    tags: ['camera', 'media', 'person', 'video'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.webcam,
  }),
  createDefinition({
    accessibility: createAccessibility('iOS picker', 'img'),
    aliases: ['ios wheel picker', 'wheel picker'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(214, 160),
    export: createExport('scene'),
    minimumSize: createSize(96, 72),
    maximumSize: null,
    palette: createPalette('iOS Picker', 'iOS', 170),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('ios-picker', []),
    tags: ['ios', 'mobile', 'picker', 'wheel'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.iosPicker,
  }),
  createDefinition({
    accessibility: createAccessibility('Horizontal splitter', 'img'),
    aliases: ['horizontal divider', 'horizontal splitter'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(200, 12),
    export: createExport('scene'),
    minimumSize: createSize(48, 8),
    maximumSize: null,
    palette: createPalette('H.Splitter', 'Layout', 180),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('h-splitter', []),
    tags: ['divider', 'layout', 'resize', 'splitter'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.hSplitter,
  }),
  createDefinition({
    accessibility: createAccessibility('Vertical splitter', 'img'),
    aliases: ['vertical divider', 'vertical splitter'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(12, 198),
    export: createExport('scene'),
    minimumSize: createSize(8, 48),
    maximumSize: null,
    palette: createPalette('V.Splitter', 'Layout', 190),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('v-splitter', []),
    tags: ['divider', 'layout', 'resize', 'splitter'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.vSplitter,
  }),
  createDefinition({
    accessibility: createAccessibility('Red X', 'img'),
    aliases: ['cross out', 'red cross'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(240, 104),
    export: createExport('scene'),
    minimumSize: createSize(48, 24),
    maximumSize: null,
    palette: createPalette('Red X', 'Markup', 200),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('red-x', []),
    tags: ['cross', 'delete', 'markup', 'reject'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.redX,
  }),
  createDefinition({
    accessibility: createAccessibility('Squiggly block of text', 'img'),
    aliases: ['block of text', 'placeholder text', 'squiggly text'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(275, 80),
    export: createExport('scene'),
    minimumSize: createSize(64, 32),
    maximumSize: null,
    palette: createPalette('Squiggly Block of Text', 'Markup', 210, 'KeyT'),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('squiggly-block', []),
    tags: ['content', 'markup', 'placeholder', 'text'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.squigglyBlock,
  }),
  createDefinition({
    accessibility: createAccessibility('Street map', 'img'),
    aliases: ['city map', 'map'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(252, 222),
    export: createExport('scene'),
    minimumSize: createSize(96, 72),
    maximumSize: null,
    palette: createPalette('Street Map', 'Assets', 220),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('street-map', []),
    tags: ['asset', 'location', 'map', 'street'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.streetMap,
  }),
  createDefinition({
    accessibility: createAccessibility('Toolbar', 'img'),
    aliases: ['editor toolbar', 'format toolbar'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(261, 29),
    export: createExport('scene'),
    minimumSize: createSize(120, 24),
    maximumSize: null,
    palette: createPalette('Toolbar', 'Common', 230),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('toolbar', []),
    tags: ['actions', 'editor', 'formatting', 'toolbar'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.toolbar,
  }),
  createDefinition({
    accessibility: createAccessibility('Horizontal rule', 'img'),
    aliases: ['horizontal divider', 'horizontal line'],
    autoSize: createIntrinsicAutoSize('both'),
    capabilities: createCapabilities(
      {
        border: true,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: { borderColor: 'default', opacity: 1, strokeStyle: 'solid' },
    defaultSize: createSize(100, 10),
    export: createExport('scene'),
    inspector: createInspector('Rule', [
      { kind: 'color', label: 'Border Color', property: 'borderColor' },
      { kind: 'range', label: 'Opacity', maximum: 1, minimum: 0, property: 'opacity', step: 0.05 },
      {
        kind: 'choice',
        label: 'Stroke',
        options: [
          { label: 'Solid', value: 'solid' },
          { label: 'Dashed', value: 'dashed' },
          { label: 'Dotted', value: 'dotted' },
        ],
        property: 'strokeStyle',
      },
    ]),
    minimumSize: createSize(24, 6),
    maximumSize: null,
    palette: createPalette('H.Rule', 'Markup', 240),
    propertiesSchema: rulePropertiesSchema,
    scene: createScene('h-rule', ['borderColor', 'opacity', 'strokeStyle']),
    tags: ['divider', 'line', 'markup', 'rule'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.hRule,
  }),
  createDefinition({
    accessibility: createAccessibility('Vertical rule', 'img'),
    aliases: ['vertical divider', 'vertical line'],
    autoSize: createIntrinsicAutoSize('both'),
    capabilities: createCapabilities(
      {
        border: true,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: { borderColor: 'default', opacity: 1, strokeStyle: 'solid' },
    defaultSize: createSize(10, 100),
    export: createExport('scene'),
    inspector: createInspector('Rule', [
      { kind: 'color', label: 'Border Color', property: 'borderColor' },
      { kind: 'range', label: 'Opacity', maximum: 1, minimum: 0, property: 'opacity', step: 0.05 },
      {
        kind: 'choice',
        label: 'Stroke',
        options: [
          { label: 'Solid', value: 'solid' },
          { label: 'Dashed', value: 'dashed' },
          { label: 'Dotted', value: 'dotted' },
        ],
        property: 'strokeStyle',
      },
    ]),
    minimumSize: createSize(6, 24),
    maximumSize: null,
    palette: createPalette('V.Rule', 'Markup', 250),
    propertiesSchema: rulePropertiesSchema,
    scene: createScene('v-rule', ['borderColor', 'opacity', 'strokeStyle']),
    tags: ['divider', 'line', 'markup', 'rule'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.vRule,
  }),
  createDefinition({
    accessibility: createAccessibility('Scratch-out', 'img'),
    aliases: ['redaction', 'scribble', 'strike out'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: { color: 'default', opacity: 1 },
    defaultSize: createSize(205, 107),
    export: createExport('scene'),
    inspector: createInspector('Scratch-Out', [
      { kind: 'color', label: 'Color', property: 'color' },
      { kind: 'range', label: 'Opacity', maximum: 1, minimum: 0, property: 'opacity', step: 0.05 },
    ]),
    minimumSize: createSize(32, 24),
    maximumSize: null,
    palette: createPalette('Scratch-Out', 'Markup', 260),
    propertiesSchema: colorOpacityPropertiesSchema,
    scene: createScene('scratch-out', ['color', 'opacity']),
    tags: ['markup', 'redact', 'scratch', 'scribble'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.scratchOut,
  }),
  createDefinition({
    accessibility: createAccessibility('Help', 'button'),
    aliases: ['question', 'support'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: true,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(18, 18),
    export: createExport('scene'),
    minimumSize: createSize(12, 12),
    maximumSize: null,
    palette: createPalette('Help Button', 'Buttons', 270),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('help-button', []),
    tags: ['button', 'help', 'question', 'support'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.helpButton,
  }),
  createDefinition({
    accessibility: createAccessibility('Modal screen', 'img'),
    aliases: ['backdrop', 'dialog overlay', 'overlay'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: true,
        grouping: 'leaf',
        icon: false,
        link: true,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: {},
    defaultSize: createSize(318, 240),
    export: createExport('scene'),
    minimumSize: createSize(48, 48),
    maximumSize: null,
    palette: createPalette('Modal Screen', 'Containers', 280),
    propertiesSchema: staticVisualPropertiesSchema,
    scene: createScene('modal-screen', []),
    tags: ['backdrop', 'container', 'modal', 'overlay'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.modalScreen,
  }),
  createDefinition({
    accessibility: createAccessibility('Color picker', 'img'),
    aliases: ['color swatch', 'colour picker'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: true,
        fill: true,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: { color: 'default' },
    defaultSize: createSize(26, 28),
    export: createExport('scene'),
    inspector: createInspector('Color Picker', [
      { kind: 'color', label: 'Color', property: 'color' },
    ]),
    minimumSize: createSize(16, 16),
    maximumSize: null,
    palette: createPalette('Color Picker', 'Forms', 290),
    propertiesSchema: colorPropertiesSchema,
    scene: createScene('color-picker', ['color'], undefined, undefined, 'fill'),
    tags: ['color', 'colour', 'form', 'picker', 'swatch'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.colorPicker,
  }),
  createDefinition({
    accessibility: createAccessibility('On/off switch', 'button'),
    aliases: ['switch', 'toggle'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: true,
        fill: true,
        grouping: 'leaf',
        icon: false,
        link: true,
        resizeAxes: 'both',
        state: true,
      },
      null,
    ),
    defaultProperties: { color: 'default', state: 'on' },
    defaultSize: createSize(42, 24),
    export: createExport('scene'),
    inspector: createInspector('ON/OFF Switch', [
      { kind: 'color', label: 'Color', property: 'color' },
      {
        kind: 'choice',
        label: 'State',
        options: [
          { label: 'Off', value: 'off' },
          { label: 'On', value: 'on' },
        ],
        property: 'state',
      },
    ]),
    minimumSize: createSize(28, 16),
    maximumSize: null,
    palette: createPalette('ON/OFF Switch', 'Forms', 300),
    propertiesSchema: onOffSwitchPropertiesSchema,
    scene: createScene('on-off-switch', ['color', 'state'], undefined, undefined, 'fill'),
    tags: ['form', 'off', 'on', 'switch', 'toggle'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.onOffSwitch,
  }),
  createDefinition({
    accessibility: createAccessibility('Breadcrumbs', 'group'),
    aliases: ['breadcrumb', 'navigation path'],
    autoSize: createAutoSize('horizontal', 0, 0, 0, 0),
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'horizontal',
        state: false,
      },
      createText(
        'start',
        13,
        0,
        {
          boldProperty: 'bold',
          fontSizeProperty: 'fontSize',
          italicProperty: 'italic',
          underlineProperty: 'underline',
        },
        'items',
      ),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(13),
      items: 'Home › Products › Xyz › Features',
    },
    defaultSize: createSize(210, 21),
    export: createExport('scene'),
    inspector: createInspector('Text', createTextStyleFields(false)),
    minimumSize: createSize(24, 16),
    maximumSize: null,
    palette: createPalette('Breadcrumbs', 'Common', 310),
    propertiesSchema: breadcrumbsPropertiesSchema,
    rows: Object.freeze({
      adornment: null,
      display: 'source',
      layout: 'inline',
      links: true,
      marker: null,
      maximum: 64,
      minimum: 1,
      property: 'items',
      selection: null,
      separator: '›',
    }),
    scene: createScene('text', ['items']),
    tags: ['breadcrumb', 'links', 'navigation', 'path'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.breadcrumbs,
  }),
  createDefinition({
    accessibility: createAccessibility('Button Bar', 'group'),
    aliases: ['segmented button', 'segmented control'],
    autoSize: createAutoSize('horizontal', 8, 8, 0, 0),
    capabilities: createCapabilities(
      {
        border: true,
        fill: true,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'horizontal',
        state: false,
      },
      createText(
        'center',
        13,
        4,
        {
          boldProperty: 'bold',
          fontSizeProperty: 'fontSize',
          italicProperty: 'italic',
          underlineProperty: 'underline',
        },
        'items',
      ),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(13),
      items: 'One | Two | Three',
      selectedRowId: null,
    },
    defaultSize: createSize(159, 27),
    export: createExport('scene'),
    inspector: createInspector('Text', createTextStyleFields(false)),
    minimumSize: createSize(48, 20),
    maximumSize: null,
    palette: createPalette('Button Bar', 'Buttons', 320),
    propertiesSchema: buttonBarPropertiesSchema,
    rows: Object.freeze({
      adornment: null,
      display: 'labels',
      layout: 'segments',
      links: true,
      marker: null,
      maximum: 32,
      minimum: 1,
      property: 'items',
      selection: Object.freeze({
        allowNone: false,
        appearance: Object.freeze({ colorProperty: null, kind: 'fill' }),
        default: 'first',
        property: 'selectedRowId',
      }),
      separator: '|',
    }),
    scene: createScene('rectangle', ['items']),
    tags: ['bar', 'button', 'links', 'segmented', 'selection'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.buttonBar,
  }),
  createDefinition({
    accessibility: createAccessibility('Link Bar', 'group'),
    aliases: ['navigation links', 'link navigation'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'horizontal',
        state: false,
      },
      createText(
        'start',
        13,
        0,
        {
          boldProperty: 'bold',
          colorProperty: 'textColor',
          fontSizeProperty: 'fontSize',
          italicProperty: 'italic',
          underlineProperty: 'underline',
        },
        'items',
      ),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(13),
      items: 'Home | Products | Company | Blog',
      selectedColor: 'default',
      selectedRowId: null,
      textColor: DESIGN_TOKENS.color.accentStrong,
    },
    defaultSize: createSize(226, 21),
    export: createExport('scene'),
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'color', label: 'Separator and Selected Text Color', property: 'selectedColor' },
          { kind: 'color', label: 'Text Color', property: 'textColor' },
        ]),
        label: 'Color',
      }),
      Object.freeze({ fields: createTextStyleFields(false), label: 'Text' }),
    ]),
    minimumSize: createSize(64, 16),
    maximumSize: null,
    palette: createPalette('Link Bar', 'Common', 330),
    propertiesSchema: linkBarPropertiesSchema,
    rows: Object.freeze({
      adornment: null,
      display: 'source',
      layout: 'inline',
      links: true,
      marker: null,
      maximum: 32,
      minimum: 1,
      property: 'items',
      selection: Object.freeze({
        allowNone: true,
        appearance: Object.freeze({ colorProperty: 'selectedColor', kind: 'text' }),
        default: 'none',
        property: 'selectedRowId',
      }),
      separator: '|',
    }),
    scene: createScene('text', ['items']),
    tags: ['bar', 'links', 'navigation', 'selection'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.linkBar,
  }),
  createDefinition({
    accessibility: createAccessibility('Tree Pane', 'group'),
    aliases: ['file tree', 'folder tree', 'hierarchy', 'tree view'],
    autoSize: createAutoSize('both', 4, 4, 4, 4),
    capabilities: createCapabilities(
      {
        border: true,
        fill: true,
        grouping: 'leaf',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: true,
      },
      createText(
        'start',
        13,
        4,
        {
          boldProperty: 'bold',
          fontSizeProperty: 'fontSize',
          italicProperty: 'italic',
          underlineProperty: 'underline',
        },
        'items',
        'multiline',
      ),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(13),
      color: 'default',
      items: [
        'f Use f for closed folders',
        'F Use F for open folders',
        '[+] You may also use this',
        '[-] and this',
        '[x] or this',
        '[ ] and this',
        '> or even this',
        'v and this',
        '- Use - for a file icon',
        '_ or _ to leave a space for your own icon',
        'f use spaces or dots for hierarchy',
        '.v just like',
        '..- this',
      ].join('\n'),
      opacity: 1,
      scrollbar: false,
      selectedRowId: null,
      showBorder: true,
      state: 'normal',
    },
    defaultSize: createSize(300, 285),
    export: createExport('scene'),
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'boolean', label: 'Show Border', property: 'showBorder' },
        ]),
        label: 'Border',
      }),
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'color', label: 'Color', property: 'color' },
          {
            kind: 'range',
            label: 'Opacity',
            maximum: 1,
            minimum: 0,
            property: 'opacity',
            step: 0.05,
          },
        ]),
        label: 'Color',
      }),
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'boolean', label: 'Scrollbar', property: 'scrollbar' },
        ]),
        label: 'Layout',
      }),
      Object.freeze({
        fields: createInspectorFields([
          {
            kind: 'select',
            label: 'State',
            options: Object.freeze([
              Object.freeze({ label: 'Normal', value: 'normal' }),
              Object.freeze({ label: 'Disabled', value: 'disabled' }),
            ]),
            property: 'state',
          },
        ]),
        label: 'State',
      }),
      Object.freeze({ fields: createTextStyleFields(false), label: 'Text' }),
    ]),
    minimumSize: createSize(120, 80),
    maximumSize: null,
    palette: createPalette('Tree Pane', 'Containers', 340),
    propertiesSchema: treePanePropertiesSchema,
    rows: Object.freeze({
      adornment: Object.freeze({ defaultKind: 'folder-closed', kind: 'tree' }),
      display: 'labels',
      layout: 'stack',
      links: true,
      marker: null,
      maximum: 64,
      minimum: 1,
      property: 'items',
      selection: Object.freeze({
        allowNone: true,
        appearance: Object.freeze({ colorProperty: null, kind: 'fill' }),
        default: 'none',
        property: 'selectedRowId',
      }),
      separator: '\n',
    }),
    scene: createScene('rectangle', ['items'], undefined, undefined, 'fill', {
      borderHiddenValues: Object.freeze([]),
      borderModeProperty: null,
      borderVisibilityProperty: 'showBorder',
      fillColorProperty: 'color',
      opacityProperty: 'opacity',
      scrollbarVisibilityProperty: 'scrollbar',
      strokeColorProperty: null,
      state: createDisabledState(),
    }),
    tags: ['disclosure', 'file', 'folder', 'hierarchy', 'navigation', 'tree'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.treePane,
  }),
  createDefinition({
    accessibility: createAccessibility('Search Box', 'textbox', 'text'),
    aliases: ['find', 'search field'],
    autoSize: createAutoSize('both', 32, 32, 4, 4),
    capabilities: createCapabilities(
      {
        border: true,
        fill: true,
        grouping: 'leaf',
        icon: false,
        link: true,
        resizeAxes: 'both',
        state: true,
      },
      createText('start', 13, 32, {
        boldProperty: 'bold',
        colorProperty: 'textColor',
        fontSizeProperty: 'fontSize',
        italicProperty: 'italic',
        underlineProperty: 'underline',
      }),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(13),
      microphoneIcon: false,
      searchIcon: true,
      shape: 'rounded',
      state: 'normal',
      text: 'search',
      textColor: DESIGN_TOKENS.color.mutedInk,
    },
    defaultSize: createSize(120, 25),
    export: createExport('scene'),
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'color', label: 'Text Color', property: 'textColor' },
        ]),
        label: 'Color',
      }),
      Object.freeze({
        fields: createInspectorFields([
          {
            kind: 'choice',
            label: 'Shape',
            options: Object.freeze([
              Object.freeze({ label: 'Rounded', value: 'rounded' }),
              Object.freeze({ label: 'Rectangular', value: 'rectangular' }),
            ]),
            property: 'shape',
          },
          { kind: 'boolean', label: 'Search Icon', property: 'searchIcon' },
          { kind: 'boolean', label: 'Microphone Icon', property: 'microphoneIcon' },
        ]),
        label: 'Search',
      }),
      Object.freeze({
        fields: createInspectorFields([
          {
            kind: 'select',
            label: 'State',
            options: Object.freeze([
              Object.freeze({ label: 'Normal', value: 'normal' }),
              Object.freeze({ label: 'Disabled', value: 'disabled' }),
            ]),
            property: 'state',
          },
        ]),
        label: 'State',
      }),
      Object.freeze({ fields: createTextStyleFields(false), label: 'Text' }),
    ]),
    minimumSize: createSize(80, 24),
    maximumSize: null,
    palette: createPalette('Search Box', 'Forms', 350, null, [
      {
        id: 'rectangular-microphone',
        label: 'Search Box (Rectangular + Microphone)',
        order: 351,
        properties: { microphoneIcon: true, shape: 'rectangular' },
      },
    ]),
    propertiesSchema: searchBoxPropertiesSchema,
    scene: createScene(
      'search-box',
      ['microphoneIcon', 'searchIcon', 'shape', 'state', 'text'],
      undefined,
      undefined,
      'stroke',
      {
        borderHiddenValues: Object.freeze([]),
        borderModeProperty: null,
        borderVisibilityProperty: null,
        fillColorProperty: null,
        opacityProperty: null,
        strokeColorProperty: null,
        state: createDisabledState(),
      },
    ),
    tags: ['find', 'form', 'input', 'search'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.searchBox,
  }),
  createDefinition({
    accessibility: createAccessibility('Text Area', 'textbox', 'text'),
    aliases: ['multiline input', 'textarea'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: true,
        fill: true,
        grouping: 'leaf',
        icon: false,
        link: true,
        resizeAxes: 'both',
        state: true,
      },
      createText(
        'start',
        13,
        8,
        {
          alignmentProperty: 'textAlignment',
          boldProperty: 'bold',
          colorProperty: 'textColor',
          fontSizeProperty: 'fontSize',
          italicProperty: 'italic',
          underlineProperty: 'underline',
        },
        'text',
        'multiline',
      ),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(13, 'start'),
      borderColor: 'default',
      color: 'default',
      opacity: 1,
      scrollbar: false,
      state: 'normal',
      text: '',
      textColor: 'default',
    },
    defaultSize: createSize(200, 140),
    export: createExport('scene'),
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'color', label: 'Color', property: 'color' },
          { kind: 'color', label: 'Border Color', property: 'borderColor' },
          { kind: 'color', label: 'Text Color', property: 'textColor' },
          {
            kind: 'range',
            label: 'Opacity',
            maximum: 1,
            minimum: 0,
            property: 'opacity',
            step: 0.05,
          },
        ]),
        label: 'Color',
      }),
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'boolean', label: 'Scrollbar', property: 'scrollbar' },
        ]),
        label: 'Layout',
      }),
      Object.freeze({
        fields: createInspectorFields([
          {
            kind: 'select',
            label: 'State',
            options: Object.freeze([
              Object.freeze({ label: 'Normal', value: 'normal' }),
              Object.freeze({ label: 'Disabled', value: 'disabled' }),
            ]),
            property: 'state',
          },
        ]),
        label: 'State',
      }),
      Object.freeze({ fields: createTextStyleFields(true), label: 'Text' }),
    ]),
    minimumSize: createSize(72, 40),
    maximumSize: null,
    palette: createPalette('Text Area', 'Forms', 360),
    propertiesSchema: textAreaPropertiesSchema,
    scene: createScene('input', ['state', 'text'], undefined, undefined, 'stroke', {
      borderHiddenValues: Object.freeze([]),
      borderModeProperty: null,
      borderVisibilityProperty: null,
      fillColorProperty: 'color',
      opacityProperty: 'opacity',
      scrollbarVisibilityProperty: 'scrollbar',
      strokeColorProperty: 'borderColor',
      state: createDisabledState(),
    }),
    tags: ['field', 'form', 'input', 'multiline', 'text'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.textArea,
  }),
  createDefinition({
    accessibility: createAccessibility('Field Set', 'group', 'text'),
    aliases: ['fieldset', 'form group', 'group box'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: true,
        fill: true,
        grouping: 'container',
        icon: false,
        link: false,
        resizeAxes: 'both',
        state: false,
      },
      createText('start', 13, 16, {
        boldProperty: 'bold',
        fontSizeProperty: 'fontSize',
        italicProperty: 'italic',
        underlineProperty: 'underline',
      }),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(13),
      color: 'default',
      opacity: 1,
      text: 'Group Name',
    },
    defaultSize: createSize(200, 170),
    export: createExport('scene'),
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([
          { kind: 'color', label: 'Color', property: 'color' },
          {
            kind: 'range',
            label: 'Opacity',
            maximum: 1,
            minimum: 0,
            property: 'opacity',
            step: 0.05,
          },
        ]),
        label: 'Color',
      }),
      Object.freeze({ fields: createTextStyleFields(false), label: 'Text' }),
    ]),
    maximumSize: null,
    minimumSize: createSize(80, 40),
    palette: createPalette('Field Set', 'Containers', 370),
    propertiesSchema: fieldSetPropertiesSchema,
    scene: createScene('field-set', ['text'], undefined, undefined, 'fill', {
      borderHiddenValues: Object.freeze([]),
      borderModeProperty: null,
      borderVisibilityProperty: null,
      fillColorProperty: 'color',
      opacityProperty: 'opacity',
      strokeColorProperty: null,
    }),
    tags: ['container', 'field', 'form', 'group'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.fieldSet,
  }),
  createDefinition({
    accessibility: createAccessibility('Link', 'link', 'text'),
    aliases: ['anchor', 'hyperlink', 'text link'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: false,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: true,
        resizeAxes: 'both',
        state: true,
      },
      createText('start', 13, 0, {
        boldProperty: 'bold',
        colorProperty: 'textColor',
        fontSizeProperty: 'fontSize',
        italicProperty: 'italic',
        underlineProperty: 'underline',
      }),
    ),
    defaultProperties: {
      ...createTextStyleDefaults(13),
      state: 'normal',
      text: 'a link',
      textColor: DESIGN_TOKENS.color.accentStrong,
      underline: true,
    },
    defaultSize: createSize(31, 21),
    export: createExport('scene'),
    inspector: createInspectorSections([
      Object.freeze({
        fields: createInspectorFields([
          {
            kind: 'select',
            label: 'State',
            options: Object.freeze([
              Object.freeze({ label: 'Normal', value: 'normal' }),
              Object.freeze({ label: 'Disabled', value: 'disabled' }),
            ]),
            property: 'state',
          },
        ]),
        label: 'State',
      }),
      Object.freeze({ fields: createTextStyleFields(false), label: 'Text' }),
    ]),
    maximumSize: null,
    minimumSize: createSize(16, 16),
    palette: createPalette('Link', 'Common', 380),
    propertiesSchema: linkPropertiesSchema,
    scene: createScene('text', ['state', 'text'], undefined, undefined, 'stroke', {
      borderHiddenValues: Object.freeze([]),
      borderModeProperty: null,
      borderVisibilityProperty: null,
      fillColorProperty: null,
      opacityProperty: null,
      strokeColorProperty: null,
      state: createDisabledState(),
    }),
    tags: ['anchor', 'hyperlink', 'navigation', 'text'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.link,
  }),
]);

assertControlDefinitionsConform(CONTROL_DEFINITIONS);

const CONTROL_DEFINITION_BY_TYPE = new Map<string, ControlDefinition>(
  CONTROL_DEFINITIONS.map((definition) => [definition.type, definition]),
);
const CONTROL_DEFINITION_BY_DRAW_SHORTCUT = new Map<string, ControlDefinition>(
  CONTROL_DEFINITIONS.flatMap((definition) => {
    const shortcut = definition.palette?.drawShortcut;
    return shortcut === null || shortcut === undefined ? [] : [[shortcut, definition] as const];
  }),
);

export const getControlSpec = (type: string): ControlDefinition | undefined =>
  CONTROL_DEFINITION_BY_TYPE.get(type);

export const getControlSpecByDrawShortcut = (code: string): ControlDefinition | undefined =>
  CONTROL_DEFINITION_BY_DRAW_SHORTCUT.get(code);

export const listControlSpecs = (): readonly ControlDefinition[] => CONTROL_DEFINITIONS;

export const listPaletteControlSpecs = (): readonly ControlDefinition[] =>
  Object.freeze(
    CONTROL_DEFINITIONS.filter((definition) => definition.palette !== null).sort(
      (first, second) => (first.palette?.order ?? 0) - (second.palette?.order ?? 0),
    ),
  );

export interface ControlPaletteEntry {
  readonly definition: ControlDefinition;
  /** Stable authoring identity; presets never create a second persisted control type. */
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly presetId: string | null;
  readonly properties: ElementProperties;
}

const CONTROL_PALETTE_ENTRIES: readonly ControlPaletteEntry[] = Object.freeze(
  CONTROL_DEFINITIONS.flatMap((definition) => {
    const palette = definition.palette;
    if (palette === null) return [];
    return [
      Object.freeze({
        definition,
        id: definition.type,
        label: palette.label,
        order: palette.order,
        presetId: null,
        properties: definition.defaultProperties,
      }),
      ...palette.presets.map((preset) =>
        Object.freeze({
          definition,
          id: `${definition.type}:${preset.id}`,
          label: preset.label,
          order: preset.order,
          presetId: preset.id,
          properties: Object.freeze({ ...definition.defaultProperties, ...preset.properties }),
        }),
      ),
    ];
  }).sort(
    (first, second) =>
      first.order - second.order || (first.id < second.id ? -1 : first.id > second.id ? 1 : 0),
  ),
);

export const listControlPaletteEntries = (): readonly ControlPaletteEntry[] =>
  CONTROL_PALETTE_ENTRIES;

export const getControlPaletteEntry = (
  controlType: string,
  presetId: string | null = null,
): ControlPaletteEntry | undefined =>
  CONTROL_PALETTE_ENTRIES.find(
    (entry) => entry.definition.type === controlType && entry.presetId === presetId,
  );

export const getControlPaletteEntryById = (entryId: string): ControlPaletteEntry | undefined =>
  CONTROL_PALETTE_ENTRIES.find((entry) => entry.id === entryId);
