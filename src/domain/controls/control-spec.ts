import { z } from 'zod';

import {
  ControlTypeIdSchema,
  ElementPropertiesSchema,
  type ControlTypeId,
  type ElementProperties,
} from '../document/schema';

export const CONTROL_TYPES = Object.freeze({
  group: ControlTypeIdSchema.parse('foundation.group'),
  rectangle: ControlTypeIdSchema.parse('foundation.rectangle'),
  textLabel: ControlTypeIdSchema.parse('wireframe.text-label'),
  button: ControlTypeIdSchema.parse('wireframe.button'),
  textInput: ControlTypeIdSchema.parse('wireframe.text-input'),
});

export const FOUNDATION_CONTROL_TYPES = Object.freeze({
  group: CONTROL_TYPES.group,
  rectangle: CONTROL_TYPES.rectangle,
});

export type ControlCategory = 'Buttons' | 'Common' | 'Forms' | 'Text';
export type ControlVisualKind = 'button' | 'input' | 'rectangle' | 'text' | 'transparent';

export interface ControlSize {
  readonly height: number;
  readonly width: number;
}

export interface ControlPaletteMetadata {
  readonly category: ControlCategory;
  readonly label: string;
  readonly order: number;
}

export interface ControlTextMetadata {
  readonly alignment: 'center' | 'start';
  readonly fontSize: number;
  readonly inset: number;
  readonly mode: 'multiline' | 'single-line';
  readonly property: 'text';
}

export interface ControlSpec {
  readonly aliases: readonly string[];
  readonly canOwnChildren: boolean;
  readonly defaultProperties: ElementProperties;
  readonly defaultSize: ControlSize;
  readonly minimumSize: ControlSize;
  readonly palette: ControlPaletteMetadata | null;
  readonly propertiesSchema: z.ZodType;
  /** Only these properties invalidate cached scene presentation. */
  readonly renderPropertyKeys: readonly string[];
  readonly text: ControlTextMetadata | null;
  readonly type: ControlTypeId;
  readonly visualKind: ControlVisualKind;
}

const textPropertiesSchema = z
  .strictObject({
    text: z.string().max(100_000),
  })
  .readonly();

const createSize = (width: number, height: number): ControlSize => Object.freeze({ height, width });

const createPalette = (
  label: string,
  category: ControlCategory,
  order: number,
): ControlPaletteMetadata => Object.freeze({ category, label, order });

const createText = (
  alignment: ControlTextMetadata['alignment'],
  fontSize: number,
  inset: number,
): ControlTextMetadata =>
  Object.freeze({ alignment, fontSize, inset, mode: 'single-line', property: 'text' });

const CONTROL_SPECS: readonly ControlSpec[] = Object.freeze([
  Object.freeze({
    aliases: Object.freeze([]),
    canOwnChildren: true,
    defaultProperties: Object.freeze({}),
    defaultSize: createSize(240, 160),
    minimumSize: createSize(24, 24),
    palette: null,
    propertiesSchema: ElementPropertiesSchema,
    renderPropertyKeys: Object.freeze([]),
    text: null,
    type: CONTROL_TYPES.group,
    visualKind: 'transparent',
  }),
  Object.freeze({
    aliases: Object.freeze(['box', 'shape']),
    canOwnChildren: false,
    defaultProperties: Object.freeze({}),
    defaultSize: createSize(180, 120),
    minimumSize: createSize(24, 24),
    palette: createPalette('Rectangle', 'Common', 10),
    propertiesSchema: ElementPropertiesSchema,
    renderPropertyKeys: Object.freeze([]),
    text: null,
    type: CONTROL_TYPES.rectangle,
    visualKind: 'rectangle',
  }),
  Object.freeze({
    aliases: Object.freeze(['label', 'copy']),
    canOwnChildren: false,
    defaultProperties: Object.freeze({ text: 'Text label' }),
    defaultSize: createSize(160, 36),
    minimumSize: createSize(32, 24),
    palette: createPalette('Text Label', 'Text', 20),
    propertiesSchema: textPropertiesSchema,
    renderPropertyKeys: Object.freeze(['text']),
    text: createText('start', 18, 0),
    type: CONTROL_TYPES.textLabel,
    visualKind: 'text',
  }),
  Object.freeze({
    aliases: Object.freeze(['action', 'cta']),
    canOwnChildren: false,
    defaultProperties: Object.freeze({ text: 'Button' }),
    defaultSize: createSize(120, 40),
    minimumSize: createSize(48, 28),
    palette: createPalette('Button', 'Buttons', 30),
    propertiesSchema: textPropertiesSchema,
    renderPropertyKeys: Object.freeze(['text']),
    text: createText('center', 16, 8),
    type: CONTROL_TYPES.button,
    visualKind: 'button',
  }),
  Object.freeze({
    aliases: Object.freeze(['field', 'input']),
    canOwnChildren: false,
    defaultProperties: Object.freeze({ text: 'Text input' }),
    defaultSize: createSize(180, 40),
    minimumSize: createSize(72, 28),
    palette: createPalette('Text Input', 'Forms', 40),
    propertiesSchema: textPropertiesSchema,
    renderPropertyKeys: Object.freeze(['text']),
    text: createText('start', 16, 10),
    type: CONTROL_TYPES.textInput,
    visualKind: 'input',
  }),
]);

const CONTROL_SPEC_BY_TYPE = new Map<string, ControlSpec>(
  CONTROL_SPECS.map((spec) => [spec.type, spec]),
);

if (CONTROL_SPEC_BY_TYPE.size !== CONTROL_SPECS.length) {
  throw new Error('Foundation control specs contain a duplicate type.');
}

export const getControlSpec = (type: string): ControlSpec | undefined =>
  CONTROL_SPEC_BY_TYPE.get(type);

export const listControlSpecs = (): readonly ControlSpec[] => CONTROL_SPECS;

export const listPaletteControlSpecs = (): readonly ControlSpec[] =>
  Object.freeze(
    CONTROL_SPECS.filter((spec) => spec.palette !== null).sort(
      (first, second) => (first.palette?.order ?? 0) - (second.palette?.order ?? 0),
    ),
  );
