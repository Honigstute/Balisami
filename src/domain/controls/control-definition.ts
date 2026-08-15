import type { z } from 'zod';

import type { ControlTypeId, ElementProperties, JsonValue } from '../document/schema';

export type ControlCategory = 'Buttons' | 'Common' | 'Forms' | 'Text';
export type ControlVisualKind =
  'button' | 'checkbox' | 'input' | 'rectangle' | 'text' | 'transparent';

export interface ControlSize {
  readonly height: number;
  readonly width: number;
}

export type ControlAutoSizeAxis = 'both' | 'horizontal' | 'vertical';

export interface ControlAutoSizeInsets {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

export interface ControlAutoSizePolicy {
  readonly axis: ControlAutoSizeAxis;
  readonly insets: ControlAutoSizeInsets;
}

export interface ControlPaletteMetadata {
  readonly category: ControlCategory;
  readonly label: string;
  readonly order: number;
}

export interface ControlTextCapability {
  readonly alignment: 'center' | 'start';
  readonly fontSize: number;
  readonly inset: number;
  readonly mode: 'multiline' | 'single-line';
  readonly property: string;
}

export interface ControlCapabilities {
  readonly canOwnChildren: boolean;
  readonly text: ControlTextCapability | null;
}

export interface ControlInspectorPropertyField {
  readonly kind: 'boolean' | 'text';
  readonly label: string;
  readonly property: string;
}

export interface ControlInspectorSection {
  readonly fields: readonly ControlInspectorPropertyField[];
  readonly label: string;
}

export interface ControlSceneDefinition {
  /** Checkbox dimensions are world units and ignored by other scene primitives. */
  readonly checkbox?: Readonly<{ boxSize: number; gap: number }>;
  readonly kind: ControlVisualKind;
  /** Only these properties invalidate cached scene presentation. */
  readonly propertyKeys: readonly string[];
}

export interface ControlPropertyMigration {
  readonly fromVersion: number;
  readonly migrate: (properties: ElementProperties) => ElementProperties;
  readonly toVersion: number;
}

/**
 * Canonical authoring extension point. Renderer-facing values stay declarative so
 * the domain registry never imports React, DOM, Electron, or platform modules.
 */
export interface ControlDefinition {
  readonly autoSize: ControlAutoSizePolicy | null;
  readonly capabilities: ControlCapabilities;
  readonly defaultProperties: ElementProperties;
  readonly defaultSize: ControlSize;
  readonly fileVersion: number;
  readonly inspector: readonly ControlInspectorSection[];
  readonly maximumSize: ControlSize | null;
  readonly minimumSize: ControlSize;
  readonly migrations: readonly ControlPropertyMigration[];
  readonly palette: ControlPaletteMetadata | null;
  readonly propertiesSchema: z.ZodType;
  readonly scene: ControlSceneDefinition;
  readonly search: Readonly<{ aliases: readonly string[]; tags: readonly string[] }>;
  readonly type: ControlTypeId;
}

const hasOwn = (value: object, key: string): boolean => Object.hasOwn(value, key);

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;

const isNonNegativeFinite = (value: number): boolean => Number.isFinite(value) && value >= 0;

const listPropertyReferences = (definition: ControlDefinition): readonly string[] =>
  Object.freeze([
    ...definition.scene.propertyKeys,
    ...definition.inspector.flatMap((section) => section.fields.map((field) => field.property)),
    ...(definition.capabilities.text === null ? [] : [definition.capabilities.text.property]),
  ]);

/** Throws during registry construction so an invalid control cannot partially register. */
export const assertControlDefinitionsConform = (
  definitions: readonly ControlDefinition[],
): void => {
  const types = new Set<string>();
  const paletteOrders = new Set<number>();

  for (const definition of definitions) {
    if (types.has(definition.type)) {
      throw new Error(`Control registry contains duplicate type '${definition.type}'.`);
    }
    types.add(definition.type);

    if (!Number.isSafeInteger(definition.fileVersion) || definition.fileVersion < 1) {
      throw new Error(`Control '${definition.type}' has an invalid file version.`);
    }
    if (
      !isPositiveFinite(definition.defaultSize.width) ||
      !isPositiveFinite(definition.defaultSize.height) ||
      !isPositiveFinite(definition.minimumSize.width) ||
      !isPositiveFinite(definition.minimumSize.height) ||
      definition.minimumSize.width > definition.defaultSize.width ||
      definition.minimumSize.height > definition.defaultSize.height
    ) {
      throw new Error(`Control '${definition.type}' has an invalid size contract.`);
    }
    if (
      definition.maximumSize !== null &&
      (!isPositiveFinite(definition.maximumSize.width) ||
        !isPositiveFinite(definition.maximumSize.height) ||
        definition.maximumSize.width < definition.defaultSize.width ||
        definition.maximumSize.height < definition.defaultSize.height)
    ) {
      throw new Error(`Control '${definition.type}' has an invalid maximum size contract.`);
    }

    const defaults = definition.propertiesSchema.safeParse(definition.defaultProperties);
    if (!defaults.success) {
      throw new Error(`Control '${definition.type}' has properties that reject their defaults.`);
    }
    for (const property of listPropertyReferences(definition)) {
      if (!hasOwn(definition.defaultProperties, property)) {
        throw new Error(
          `Control '${definition.type}' references missing default property '${property}'.`,
        );
      }
      const value: JsonValue | undefined = definition.defaultProperties[property];
      if (value === undefined) {
        throw new Error(`Control '${definition.type}' has undefined property '${property}'.`);
      }
    }
    for (const section of definition.inspector) {
      if (section.label.trim().length === 0) {
        throw new Error(`Control '${definition.type}' has an unnamed inspector section.`);
      }
      for (const field of section.fields) {
        const value = definition.defaultProperties[field.property];
        if (
          field.label.trim().length === 0 ||
          (field.kind === 'boolean' && typeof value !== 'boolean') ||
          (field.kind === 'text' && typeof value !== 'string')
        ) {
          throw new Error(
            `Control '${definition.type}' has an invalid '${field.property}' inspector field.`,
          );
        }
      }
    }

    const text = definition.capabilities.text;
    if (text !== null && typeof definition.defaultProperties[text.property] !== 'string') {
      throw new Error(`Control '${definition.type}' has an invalid text capability.`);
    }
    if (
      definition.autoSize !== null &&
      (text === null ||
        !['both', 'horizontal', 'vertical'].includes(definition.autoSize.axis) ||
        [
          definition.autoSize.insets.bottom,
          definition.autoSize.insets.left,
          definition.autoSize.insets.right,
          definition.autoSize.insets.top,
        ].some((value) => !isNonNegativeFinite(value)))
    ) {
      throw new Error(`Control '${definition.type}' has an invalid auto-size policy.`);
    }
    if (definition.scene.kind === 'checkbox') {
      const checkbox = definition.scene.checkbox;
      if (
        checkbox === undefined ||
        !isPositiveFinite(checkbox.boxSize) ||
        !isPositiveFinite(checkbox.gap)
      ) {
        throw new Error(`Control '${definition.type}' has invalid checkbox geometry.`);
      }
    } else if (definition.scene.checkbox !== undefined) {
      throw new Error(`Control '${definition.type}' has unexpected checkbox geometry.`);
    }

    if (definition.palette !== null) {
      if (
        definition.palette.label.trim().length === 0 ||
        !Number.isSafeInteger(definition.palette.order) ||
        paletteOrders.has(definition.palette.order)
      ) {
        throw new Error(`Control '${definition.type}' has invalid palette metadata.`);
      }
      paletteOrders.add(definition.palette.order);
    }

    if (definition.migrations.length !== definition.fileVersion - 1) {
      throw new Error(`Control '${definition.type}' has an incomplete migration chain.`);
    }
    definition.migrations.forEach((migration, index) => {
      const fromVersion = index + 1;
      if (migration.fromVersion !== fromVersion || migration.toVersion !== fromVersion + 1) {
        throw new Error(`Control '${definition.type}' has a non-sequential migration chain.`);
      }
    });
  }
};
