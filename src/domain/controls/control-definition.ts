import type { z } from 'zod';

import type { ControlTypeId, ElementProperties, JsonValue } from '../document/schema';

export type ControlCategory =
  | 'Assets'
  | 'Buttons'
  | 'Common'
  | 'Containers'
  | 'Forms'
  | 'Layout'
  | 'Markup'
  | 'Media'
  | 'Text'
  | 'iOS';
export type ControlVisualKind =
  | 'arrow'
  | 'browser'
  | 'button'
  | 'calendar'
  | 'chart-bar'
  | 'chart-line'
  | 'chart-pie'
  | 'checkbox'
  | 'image'
  | 'h-splitter'
  | 'h-rule'
  | 'help-button'
  | 'input'
  | 'ios-picker'
  | 'playback'
  | 'modal-screen'
  | 'rectangle'
  | 'red-x'
  | 'scratch-out'
  | 'squiggly-block'
  | 'street-map'
  | 'text'
  | 'toolbar'
  | 'transparent'
  | 'video-player'
  | 'v-rule'
  | 'v-splitter'
  | 'volume-slider'
  | 'webcam';

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
  /** Text measures bundled-font content; intrinsic restores the registered default extent. */
  readonly basis: 'intrinsic' | 'text';
  readonly insets: ControlAutoSizeInsets;
}

export interface ControlPaletteMetadata {
  readonly category: ControlCategory;
  /** Physical key held while drawing this control, or null when unsupported. */
  readonly drawShortcut: string | null;
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

export type ControlGroupingCapability = 'container' | 'leaf';
export type ControlResizeAxes = 'both' | 'horizontal' | 'none' | 'vertical';

export interface ControlCapabilities {
  readonly border: boolean;
  readonly fill: boolean;
  readonly grouping: ControlGroupingCapability;
  readonly icon: boolean;
  readonly link: boolean;
  readonly resizeAxes: ControlResizeAxes;
  readonly state: boolean;
  readonly text: ControlTextCapability | null;
}

export type ControlAccessibilityRole = 'button' | 'checkbox' | 'group' | 'img' | 'textbox';

export interface ControlAccessibilityDefinition {
  /** Used when the configured name property is absent or blank. */
  readonly fallbackLabel: string;
  /** Optional string property used as the instance's accessible name. */
  readonly nameProperty: string | null;
  readonly role: ControlAccessibilityRole;
  /** Optional boolean property exposed as aria-checked. */
  readonly checkedProperty: string | null;
}

export interface ControlHitShapePoint {
  /** Normalized horizontal coordinate within the control frame. */
  readonly x: number;
  /** Normalized vertical coordinate within the control frame. */
  readonly y: number;
}

export type ControlHitShape =
  | Readonly<{ kind: 'bounds' }>
  | Readonly<{ kind: 'ellipse' }>
  | Readonly<{
      end: ControlHitShapePoint;
      kind: 'line';
      start: ControlHitShapePoint;
      /** World-unit tolerance around the line segment. */
      tolerance: number;
    }>;

interface ControlInspectorPropertyFieldBase {
  readonly label: string;
  readonly property: string;
}

export interface ControlInspectorChoiceOption {
  readonly label: string;
  readonly value: string;
}

export type ControlInspectorPropertyField =
  | (ControlInspectorPropertyFieldBase & Readonly<{ kind: 'boolean' | 'color' | 'icon' | 'text' }>)
  | (ControlInspectorPropertyFieldBase &
      Readonly<{
        kind: 'choice' | 'select';
        options: readonly ControlInspectorChoiceOption[];
      }>)
  | (ControlInspectorPropertyFieldBase &
      Readonly<{
        kind: 'number' | 'range';
        maximum: number;
        minimum: number;
        step: number;
      }>);

export interface ControlInspectorSection {
  readonly fields: readonly ControlInspectorPropertyField[];
  readonly label: string;
}

export interface ControlSceneDefinition {
  /** Checkbox dimensions are world units and ignored by other scene primitives. */
  readonly checkbox?: Readonly<{ boxSize: number; gap: number }>;
  /** Exact selectable geometry applied after the spatial index's AABB broad phase. */
  readonly hitShape: ControlHitShape;
  readonly kind: ControlVisualKind;
  /** Only these properties invalidate cached scene presentation. */
  readonly propertyKeys: readonly string[];
}

/**
 * Thumbnail policy only selects whether the canonical scene is projected. It
 * intentionally owns no duplicate geometry, defaults, or text metadata.
 */
export type ControlThumbnailDefinition = Readonly<{ kind: 'none' }> | Readonly<{ kind: 'scene' }>;

/**
 * Export policy describes how a definition participates in a future export
 * traversal. M12 owns file generation; M8 only guarantees deterministic scene
 * support and explicit transparent-container semantics.
 */
export type ControlExportDefinition =
  Readonly<{ kind: 'scene' }> | Readonly<{ kind: 'transparent-container' }>;

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
  readonly accessibility: ControlAccessibilityDefinition;
  readonly autoSize: ControlAutoSizePolicy | null;
  readonly capabilities: ControlCapabilities;
  readonly defaultProperties: ElementProperties;
  readonly defaultSize: ControlSize;
  readonly export: ControlExportDefinition;
  readonly fileVersion: number;
  readonly inspector: readonly ControlInspectorSection[];
  readonly maximumSize: ControlSize | null;
  readonly minimumSize: ControlSize;
  readonly migrations: readonly ControlPropertyMigration[];
  readonly palette: ControlPaletteMetadata | null;
  readonly propertiesSchema: z.ZodType;
  readonly scene: ControlSceneDefinition;
  readonly search: Readonly<{ aliases: readonly string[]; tags: readonly string[] }>;
  readonly thumbnail: ControlThumbnailDefinition;
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
    ...(definition.accessibility.nameProperty === null
      ? []
      : [definition.accessibility.nameProperty]),
    ...(definition.accessibility.checkedProperty === null
      ? []
      : [definition.accessibility.checkedProperty]),
  ]);

const isNormalizedPoint = (point: ControlHitShapePoint): boolean =>
  Number.isFinite(point.x) &&
  Number.isFinite(point.y) &&
  point.x >= 0 &&
  point.x <= 1 &&
  point.y >= 0 &&
  point.y <= 1;

/** Throws during registry construction so an invalid control cannot partially register. */
export const assertControlDefinitionsConform = (
  definitions: readonly ControlDefinition[],
): void => {
  const types = new Set<string>();
  const paletteOrders = new Set<number>();
  const drawShortcuts = new Set<string>();

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
        const choiceValues =
          field.kind === 'choice' || field.kind === 'select'
            ? field.options.map((option) => option.value)
            : [];
        if (
          field.label.trim().length === 0 ||
          (field.kind === 'boolean' && typeof value !== 'boolean') ||
          (field.kind === 'text' && typeof value !== 'string') ||
          (field.kind === 'color' && typeof value !== 'string') ||
          (field.kind === 'icon' && value !== null && typeof value !== 'string') ||
          ((field.kind === 'choice' || field.kind === 'select') &&
            (typeof value !== 'string' ||
              field.options.length < 2 ||
              new Set(choiceValues).size !== choiceValues.length ||
              field.options.some(
                (option) => option.label.trim().length === 0 || option.value.trim().length === 0,
              ) ||
              !choiceValues.includes(value))) ||
          ((field.kind === 'number' || field.kind === 'range') &&
            (typeof value !== 'number' ||
              !Number.isFinite(value) ||
              !Number.isFinite(field.minimum) ||
              !Number.isFinite(field.maximum) ||
              !isPositiveFinite(field.step) ||
              field.minimum > field.maximum ||
              value < field.minimum ||
              value > field.maximum))
        ) {
          throw new Error(
            `Control '${definition.type}' has an invalid '${field.property}' inspector field.`,
          );
        }
        if (field.kind === 'icon' && !definition.capabilities.icon) {
          throw new Error(
            `Control '${definition.type}' exposes an icon field without icon capability.`,
          );
        }
      }
    }

    const text = definition.capabilities.text;
    if (
      !['container', 'leaf'].includes(definition.capabilities.grouping) ||
      !['both', 'horizontal', 'none', 'vertical'].includes(definition.capabilities.resizeAxes) ||
      [
        definition.capabilities.border,
        definition.capabilities.fill,
        definition.capabilities.icon,
        definition.capabilities.link,
        definition.capabilities.state,
      ].some((value) => typeof value !== 'boolean')
    ) {
      throw new Error(`Control '${definition.type}' has invalid capability metadata.`);
    }
    if (text !== null && typeof definition.defaultProperties[text.property] !== 'string') {
      throw new Error(`Control '${definition.type}' has an invalid text capability.`);
    }
    if (
      definition.autoSize !== null &&
      ((definition.autoSize.basis === 'text' && text === null) ||
        !['intrinsic', 'text'].includes(definition.autoSize.basis) ||
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
    if (
      definition.accessibility.fallbackLabel.trim().length === 0 ||
      !['button', 'checkbox', 'group', 'img', 'textbox'].includes(definition.accessibility.role) ||
      (definition.accessibility.nameProperty !== null &&
        typeof definition.defaultProperties[definition.accessibility.nameProperty] !== 'string') ||
      (definition.accessibility.checkedProperty !== null &&
        typeof definition.defaultProperties[definition.accessibility.checkedProperty] !==
          'boolean') ||
      (definition.accessibility.role === 'checkbox' &&
        definition.accessibility.checkedProperty === null)
    ) {
      throw new Error(`Control '${definition.type}' has invalid accessibility metadata.`);
    }
    const hitShape = definition.scene.hitShape;
    if (
      !['bounds', 'ellipse', 'line'].includes(hitShape.kind) ||
      (hitShape.kind === 'line' &&
        (!isNormalizedPoint(hitShape.start) ||
          !isNormalizedPoint(hitShape.end) ||
          !isPositiveFinite(hitShape.tolerance)))
    ) {
      throw new Error(`Control '${definition.type}' has an invalid hit shape.`);
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

    if (
      !['none', 'scene'].includes(definition.thumbnail.kind) ||
      (definition.palette !== null && definition.thumbnail.kind !== 'scene')
    ) {
      throw new Error(`Control '${definition.type}' has invalid thumbnail metadata.`);
    }
    if (
      !['scene', 'transparent-container'].includes(definition.export.kind) ||
      (definition.export.kind === 'transparent-container' &&
        (definition.capabilities.grouping !== 'container' ||
          definition.scene.kind !== 'transparent')) ||
      (definition.export.kind === 'scene' && definition.scene.kind === 'transparent')
    ) {
      throw new Error(`Control '${definition.type}' has invalid export metadata.`);
    }

    if (definition.palette !== null) {
      const drawShortcut = definition.palette.drawShortcut;
      if (
        definition.palette.label.trim().length === 0 ||
        !Number.isSafeInteger(definition.palette.order) ||
        paletteOrders.has(definition.palette.order) ||
        (drawShortcut !== null &&
          (!/^Key[A-Z]$/u.test(drawShortcut) ||
            drawShortcuts.has(drawShortcut) ||
            definition.capabilities.resizeAxes !== 'both'))
      ) {
        throw new Error(`Control '${definition.type}' has invalid palette metadata.`);
      }
      paletteOrders.add(definition.palette.order);
      if (drawShortcut !== null) {
        drawShortcuts.add(drawShortcut);
      }
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
