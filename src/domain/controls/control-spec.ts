import { z } from 'zod';

import {
  ControlTypeIdSchema,
  ElementPropertiesSchema,
  type ControlTypeId,
  type ElementProperties,
} from '../document/schema';
import {
  assertControlDefinitionsConform,
  type ControlCapabilities,
  type ControlDefinition,
  type ControlInspectorSection,
  type ControlPaletteMetadata,
  type ControlSceneDefinition,
  type ControlSize,
  type ControlTextCapability,
} from './control-definition';

export const CONTROL_TYPES = Object.freeze({
  group: ControlTypeIdSchema.parse('foundation.group'),
  rectangle: ControlTypeIdSchema.parse('foundation.rectangle'),
  textLabel: ControlTypeIdSchema.parse('wireframe.text-label'),
  button: ControlTypeIdSchema.parse('wireframe.button'),
  textInput: ControlTypeIdSchema.parse('wireframe.text-input'),
  checkbox: ControlTypeIdSchema.parse('wireframe.checkbox'),
});

export const FOUNDATION_CONTROL_TYPES = Object.freeze({
  group: CONTROL_TYPES.group,
  rectangle: CONTROL_TYPES.rectangle,
});

const textPropertiesSchema = z.strictObject({ text: z.string().max(100_000) }).readonly();
const checkboxPropertiesSchema = z
  .strictObject({ checked: z.boolean(), text: z.string().max(100_000) })
  .readonly();

const createSize = (width: number, height: number): ControlSize => Object.freeze({ height, width });

const createPalette = (
  label: string,
  category: ControlPaletteMetadata['category'],
  order: number,
): ControlPaletteMetadata => Object.freeze({ category, label, order });

const createText = (
  alignment: ControlTextCapability['alignment'],
  fontSize: number,
  inset: number,
): ControlTextCapability =>
  Object.freeze({ alignment, fontSize, inset, mode: 'single-line', property: 'text' });

const createCapabilities = (
  canOwnChildren: boolean,
  text: ControlTextCapability | null,
): ControlCapabilities => Object.freeze({ canOwnChildren, text });

const createScene = (
  kind: ControlSceneDefinition['kind'],
  propertyKeys: readonly string[],
  checkbox?: ControlSceneDefinition['checkbox'],
): ControlSceneDefinition =>
  Object.freeze({
    ...(checkbox === undefined ? {} : { checkbox: Object.freeze(checkbox) }),
    kind,
    propertyKeys: Object.freeze(propertyKeys),
  });

const createInspector = (
  label: string,
  fields: ControlInspectorSection['fields'],
): readonly ControlInspectorSection[] =>
  Object.freeze([Object.freeze({ fields: Object.freeze(fields), label })]);

const createDefinition = (input: {
  aliases?: readonly string[];
  capabilities: ControlCapabilities;
  defaultProperties: ElementProperties;
  defaultSize: ControlSize;
  inspector?: readonly ControlInspectorSection[];
  minimumSize: ControlSize;
  palette: ControlPaletteMetadata | null;
  propertiesSchema: ControlDefinition['propertiesSchema'];
  scene: ControlSceneDefinition;
  tags?: readonly string[];
  type: ControlTypeId;
}): ControlDefinition =>
  Object.freeze({
    capabilities: input.capabilities,
    defaultProperties: Object.freeze(input.defaultProperties),
    defaultSize: input.defaultSize,
    fileVersion: 1,
    inspector: Object.freeze(input.inspector ?? []),
    minimumSize: input.minimumSize,
    migrations: Object.freeze([]),
    palette: input.palette,
    propertiesSchema: input.propertiesSchema,
    scene: input.scene,
    search: Object.freeze({
      aliases: Object.freeze(input.aliases ?? []),
      tags: Object.freeze(input.tags ?? []),
    }),
    type: input.type,
  });

const CONTROL_DEFINITIONS: readonly ControlDefinition[] = Object.freeze([
  createDefinition({
    capabilities: createCapabilities(true, null),
    defaultProperties: {},
    defaultSize: createSize(240, 160),
    minimumSize: createSize(24, 24),
    palette: null,
    propertiesSchema: ElementPropertiesSchema,
    scene: createScene('transparent', []),
    type: CONTROL_TYPES.group,
  }),
  createDefinition({
    aliases: ['box', 'shape'],
    capabilities: createCapabilities(false, null),
    defaultProperties: {},
    defaultSize: createSize(180, 120),
    minimumSize: createSize(24, 24),
    palette: createPalette('Rectangle', 'Common', 10),
    propertiesSchema: ElementPropertiesSchema,
    scene: createScene('rectangle', []),
    tags: ['container', 'panel'],
    type: CONTROL_TYPES.rectangle,
  }),
  createDefinition({
    aliases: ['label', 'copy'],
    capabilities: createCapabilities(false, createText('start', 18, 0)),
    defaultProperties: { text: 'Text label' },
    defaultSize: createSize(160, 36),
    inspector: createInspector('Text', [{ kind: 'text', label: 'Content', property: 'text' }]),
    minimumSize: createSize(32, 24),
    palette: createPalette('Text Label', 'Text', 20),
    propertiesSchema: textPropertiesSchema,
    scene: createScene('text', ['text']),
    tags: ['typography'],
    type: CONTROL_TYPES.textLabel,
  }),
  createDefinition({
    aliases: ['action', 'cta'],
    capabilities: createCapabilities(false, createText('center', 16, 8)),
    defaultProperties: { text: 'Button' },
    defaultSize: createSize(120, 40),
    inspector: createInspector('Text', [{ kind: 'text', label: 'Content', property: 'text' }]),
    minimumSize: createSize(48, 28),
    palette: createPalette('Button', 'Buttons', 30),
    propertiesSchema: textPropertiesSchema,
    scene: createScene('button', ['text']),
    tags: ['action'],
    type: CONTROL_TYPES.button,
  }),
  createDefinition({
    aliases: ['field', 'input'],
    capabilities: createCapabilities(false, createText('start', 16, 10)),
    defaultProperties: { text: 'Text input' },
    defaultSize: createSize(180, 40),
    inspector: createInspector('Text', [{ kind: 'text', label: 'Content', property: 'text' }]),
    minimumSize: createSize(72, 28),
    palette: createPalette('Text Input', 'Forms', 40),
    propertiesSchema: textPropertiesSchema,
    scene: createScene('input', ['text']),
    tags: ['form', 'field'],
    type: CONTROL_TYPES.textInput,
  }),
  createDefinition({
    aliases: ['check', 'tick'],
    capabilities: createCapabilities(false, createText('start', 16, 0)),
    defaultProperties: { checked: false, text: 'Checkbox' },
    defaultSize: createSize(160, 32),
    inspector: createInspector('Properties', [
      { kind: 'text', label: 'Label', property: 'text' },
      { kind: 'boolean', label: 'State', property: 'checked' },
    ]),
    minimumSize: createSize(48, 24),
    palette: createPalette('Checkbox', 'Forms', 50),
    propertiesSchema: checkboxPropertiesSchema,
    scene: createScene('checkbox', ['checked', 'text'], { boxSize: 18, gap: 8 }),
    tags: ['form', 'selection', 'toggle'],
    type: CONTROL_TYPES.checkbox,
  }),
]);

assertControlDefinitionsConform(CONTROL_DEFINITIONS);

const CONTROL_DEFINITION_BY_TYPE = new Map<string, ControlDefinition>(
  CONTROL_DEFINITIONS.map((definition) => [definition.type, definition]),
);

export const getControlSpec = (type: string): ControlDefinition | undefined =>
  CONTROL_DEFINITION_BY_TYPE.get(type);

export const listControlSpecs = (): readonly ControlDefinition[] => CONTROL_DEFINITIONS;

export const listPaletteControlSpecs = (): readonly ControlDefinition[] =>
  Object.freeze(
    CONTROL_DEFINITIONS.filter((definition) => definition.palette !== null).sort(
      (first, second) => (first.palette?.order ?? 0) - (second.palette?.order ?? 0),
    ),
  );
