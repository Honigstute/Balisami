import { z } from 'zod';

import { CONTROL_TEXT_POLICY } from '../../shared/control-text';
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
  group: ControlTypeIdSchema.parse('foundation.group'),
  rectangle: ControlTypeIdSchema.parse('foundation.rectangle'),
  textLabel: ControlTypeIdSchema.parse('wireframe.text-label'),
  button: ControlTypeIdSchema.parse('wireframe.button'),
  textInput: ControlTypeIdSchema.parse('wireframe.text-input'),
  checkbox: ControlTypeIdSchema.parse('wireframe.checkbox'),
  imagePlaceholder: ControlTypeIdSchema.parse('wireframe.image-placeholder'),
  browser: ControlTypeIdSchema.parse('wireframe.browser'),
  arrow: ControlTypeIdSchema.parse('wireframe.arrow'),
});

export const FOUNDATION_CONTROL_TYPES = Object.freeze({
  group: CONTROL_TYPES.group,
  rectangle: CONTROL_TYPES.rectangle,
});

const textPropertiesSchema = z
  .strictObject({ text: z.string().max(CONTROL_TEXT_POLICY.maximumLength) })
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
    insets: Object.freeze({ bottom, left, right, top }),
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
  maximumSize: ControlSize | null;
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
    fileVersion: 1,
    inspector: Object.freeze(input.inspector ?? []),
    maximumSize: input.maximumSize,
    minimumSize: input.minimumSize,
    migrations: Object.freeze([]),
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
    defaultProperties: { text: 'Button' },
    defaultSize: createSize(120, 40),
    export: createExport('scene'),
    inspector: createInspector('Text', [{ kind: 'text', label: 'Content', property: 'text' }]),
    minimumSize: createSize(48, 28),
    maximumSize: null,
    palette: createPalette('Button', 'Buttons', 30),
    propertiesSchema: textPropertiesSchema,
    scene: createScene('button', ['text']),
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
      { kind: 'text', label: 'Color', property: 'color' },
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
      { kind: 'text', label: 'Color', property: 'color' },
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
