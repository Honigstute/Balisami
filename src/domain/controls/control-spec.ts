import { z } from 'zod';

import { CONTROL_TEXT_POLICY } from '../../shared/control-text';
import { getIconDefinition } from '../../shared/icons/icon-catalog';
import { CustomIconReferenceSchema } from './custom-icon-reference';
import { ComponentInstancePropertiesSchema } from './component-instance';
import { ComponentIdSchema } from '../document/ids';
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
  type ControlInspectorSection,
  type ControlPaletteMetadata,
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
  button: ControlTypeIdSchema.parse('wireframe.button'),
  textInput: ControlTypeIdSchema.parse('wireframe.text-input'),
  checkbox: ControlTypeIdSchema.parse('wireframe.checkbox'),
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
const buttonPropertiesSchema = z
  .strictObject({
    iconId: controlIconIdSchema.nullable(),
    text: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
  })
  .readonly();
const checkboxPropertiesSchema = z
  .strictObject({
    checked: z.boolean(),
    text: z.string().max(CONTROL_TEXT_POLICY.maximumLength),
  })
  .readonly();
const imagePlaceholderPropertiesSchema = z.strictObject({ showBorder: z.boolean() }).readonly();
const sceneColorSchema = z.union([z.literal('default'), z.string().regex(/^#[0-9a-f]{6}$/iu)]);
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
): ControlPaletteMetadata => Object.freeze({ category, drawShortcut, label, order });

const createText = (
  alignment: ControlTextCapability['alignment'],
  fontSize: number,
  inset: number,
): ControlTextCapability =>
  Object.freeze({ alignment, fontSize, inset, mode: 'single-line', property: 'text' });

const createCapabilities = (
  input: Omit<ControlCapabilities, 'text'>,
  text: ControlTextCapability | null,
): ControlCapabilities => Object.freeze({ ...input, text });

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
): ControlSceneDefinition =>
  Object.freeze({
    ...(checkbox === undefined ? {} : { checkbox: Object.freeze(checkbox) }),
    hitShape: Object.freeze(hitShape),
    kind,
    propertyKeys: Object.freeze(propertyKeys),
  });

const createInspector = (
  label: string,
  fields: ControlInspectorSection['fields'],
): readonly ControlInspectorSection[] =>
  Object.freeze([Object.freeze({ fields: Object.freeze(fields), label })]);

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
  scene: ControlSceneDefinition;
  tags?: readonly string[];
  thumbnail: ControlThumbnailDefinition;
  type: ControlTypeId;
}): ControlDefinition =>
  Object.freeze({
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
    scene: input.scene,
    search: Object.freeze({
      aliases: Object.freeze(input.aliases ?? []),
      tags: Object.freeze(input.tags ?? []),
    }),
    thumbnail: input.thumbnail,
    type: input.type,
  });

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
    defaultProperties: {},
    defaultSize: createSize(180, 120),
    export: createExport('scene'),
    minimumSize: createSize(24, 24),
    maximumSize: null,
    palette: createPalette('Rectangle', 'Common', 10, 'KeyR'),
    propertiesSchema: ElementPropertiesSchema,
    scene: createScene('rectangle', []),
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
      createText('center', 16, 8),
    ),
    defaultProperties: { iconId: null, text: 'Button' },
    defaultSize: createSize(120, 40),
    export: createExport('scene'),
    fileVersion: 3,
    inspector: createInspector('Content', [
      { kind: 'text', label: 'Text', property: 'text' },
      { kind: 'icon', label: 'Icon', property: 'iconId' },
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
    ],
    propertiesSchema: buttonPropertiesSchema,
    scene: createScene('button', ['iconId', 'text']),
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
      createText('start', 16, 10),
    ),
    defaultProperties: { text: 'Text input' },
    defaultSize: createSize(180, 40),
    export: createExport('scene'),
    inspector: createInspector('Text', [{ kind: 'text', label: 'Content', property: 'text' }]),
    minimumSize: createSize(72, 28),
    maximumSize: null,
    palette: createPalette('Text Input', 'Forms', 40),
    propertiesSchema: textPropertiesSchema,
    scene: createScene('input', ['text']),
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
      createText('start', 16, 0),
    ),
    defaultProperties: { checked: false, text: 'Checkbox' },
    defaultSize: createSize(160, 32),
    export: createExport('scene'),
    inspector: createInspector('Properties', [
      { kind: 'text', label: 'Label', property: 'text' },
      { kind: 'boolean', label: 'State', property: 'checked' },
    ]),
    minimumSize: createSize(48, 24),
    maximumSize: null,
    palette: createPalette('Checkbox', 'Forms', 50),
    propertiesSchema: checkboxPropertiesSchema,
    scene: createScene('checkbox', ['checked', 'text'], { boxSize: 18, gap: 8 }),
    tags: ['form', 'selection', 'toggle'],
    thumbnail: createThumbnail('scene'),
    type: CONTROL_TYPES.checkbox,
  }),
  createDefinition({
    accessibility: createAccessibility('Image placeholder', 'img'),
    aliases: ['image', 'photo', 'picture'],
    autoSize: null,
    capabilities: createCapabilities(
      {
        border: true,
        fill: false,
        grouping: 'leaf',
        icon: false,
        link: true,
        resizeAxes: 'both',
        state: false,
      },
      null,
    ),
    defaultProperties: { showBorder: false },
    defaultSize: createSize(120, 100),
    export: createExport('scene'),
    inspector: createInspector('Border', [
      { kind: 'boolean', label: 'Show Border', property: 'showBorder' },
    ]),
    minimumSize: createSize(24, 24),
    maximumSize: null,
    palette: createPalette('Image', 'Assets', 60, 'KeyI'),
    propertiesSchema: imagePlaceholderPropertiesSchema,
    scene: createScene('image', ['showBorder']),
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
    scene: createScene('browser', ['borderMode', 'color', 'scrollbar']),
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
