import {
  getControlSpec,
  type ControlInspectorPropertyField,
  type ElementId,
  type ElementNode,
  type ProjectDocument,
} from '../../domain';

export type InspectorPrimitive = boolean | number | string;

export interface InspectorValue<T extends InspectorPrimitive> {
  readonly mixed: boolean;
  readonly value: T | undefined;
}

export interface InspectorFrameFieldModel extends InspectorValue<number> {
  readonly maximum?: number;
  readonly minimum?: number;
}

export interface InspectorPropertyFieldModel extends InspectorValue<InspectorPrimitive> {
  readonly field: ControlInspectorPropertyField;
}

export interface InspectorPropertySectionModel {
  readonly fields: readonly InspectorPropertyFieldModel[];
  readonly label: string;
}

export interface ControlInspectorModel {
  readonly elements: readonly ElementNode[];
  readonly frame: Readonly<{
    height: InspectorFrameFieldModel;
    width: InspectorFrameFieldModel;
    x: InspectorFrameFieldModel;
    y: InspectorFrameFieldModel;
  }>;
  readonly propertySections: readonly InspectorPropertySectionModel[];
}

const resolveValue = <T extends InspectorPrimitive>(values: readonly T[]): InspectorValue<T> => {
  const first = values[0];
  if (first === undefined) {
    throw new Error('Inspector values require at least one selected control.');
  }
  const mixed = values.some((value) => value !== first);
  return Object.freeze({ mixed, value: mixed ? undefined : first });
};

const areFieldsCompatible = (
  first: ControlInspectorPropertyField,
  second: ControlInspectorPropertyField,
): boolean => {
  if (
    first.kind !== second.kind ||
    first.label !== second.label ||
    first.property !== second.property
  ) {
    return false;
  }
  if (first.kind === 'choice' && second.kind === 'choice') {
    return (
      first.options.length === second.options.length &&
      first.options.every(
        (option, index) =>
          option.label === second.options[index]?.label &&
          option.value === second.options[index]?.value,
      )
    );
  }
  if (first.kind === 'number' && second.kind === 'number') {
    return (
      first.minimum === second.minimum &&
      first.maximum === second.maximum &&
      first.step === second.step
    );
  }
  return true;
};

const readPrimitiveProperty = (
  element: ElementNode,
  field: ControlInspectorPropertyField,
): InspectorPrimitive => {
  const value = element.properties[field.property];
  if (
    (field.kind === 'boolean' && typeof value === 'boolean') ||
    (field.kind === 'number' && typeof value === 'number') ||
    ((field.kind === 'choice' || field.kind === 'text') && typeof value === 'string')
  ) {
    return value;
  }
  throw new Error(
    `Inspector property '${field.property}' is missing from '${element.controlType}'.`,
  );
};

const createFrameField = (
  values: readonly number[],
  constraints: Readonly<{ maximum?: number; minimum?: number }> = {},
): InspectorFrameFieldModel => Object.freeze({ ...resolveValue(values), ...constraints });

/**
 * Pure selection projection. The first selected definition supplies display order;
 * a property survives only when every selected definition declares the same field
 * contract. This keeps multi-edit behavior derived from registry metadata.
 */
export const createControlInspectorModel = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
): ControlInspectorModel | undefined => {
  const elements = selectedIds.map((elementId) => document.elementsById[elementId]);
  if (elements.length === 0) {
    return undefined;
  }
  if (elements.some((element) => element === undefined)) {
    throw new Error('Inspector selection contains an element that is not in the document.');
  }
  const selectedElements = elements as readonly ElementNode[];
  const definitions = selectedElements.map((element) => {
    const definition = getControlSpec(element.controlType);
    if (definition === undefined) {
      throw new Error(`Inspector received unknown control type '${element.controlType}'.`);
    }
    return definition;
  });
  const firstDefinition = definitions[0];
  if (firstDefinition === undefined) {
    return undefined;
  }

  const minimumWidth = Math.max(...definitions.map((definition) => definition.minimumSize.width));
  const minimumHeight = Math.max(...definitions.map((definition) => definition.minimumSize.height));
  const finiteMaximumWidths = definitions.flatMap((definition) =>
    definition.maximumSize === null ? [] : [definition.maximumSize.width],
  );
  const finiteMaximumHeights = definitions.flatMap((definition) =>
    definition.maximumSize === null ? [] : [definition.maximumSize.height],
  );
  const maximumWidth =
    finiteMaximumWidths.length === 0 ? undefined : Math.min(...finiteMaximumWidths);
  const maximumHeight =
    finiteMaximumHeights.length === 0 ? undefined : Math.min(...finiteMaximumHeights);

  const propertySections = firstDefinition.inspector.flatMap((section) => {
    const matchingSections = definitions
      .slice(1)
      .map((definition) =>
        definition.inspector.find((candidate) => candidate.label === section.label),
      );
    const fields = section.fields.flatMap((field) => {
      const compatibleFields = matchingSections.map((candidate) =>
        candidate?.fields.find((otherField) => areFieldsCompatible(field, otherField)),
      );
      if (compatibleFields.some((candidate) => candidate === undefined)) {
        return [];
      }
      const resolved = resolveValue(
        selectedElements.map((element) => readPrimitiveProperty(element, field)),
      );
      return [Object.freeze({ field, ...resolved })];
    });
    return fields.length === 0
      ? []
      : [Object.freeze({ fields: Object.freeze(fields), label: section.label })];
  });

  return Object.freeze({
    elements: Object.freeze(selectedElements),
    frame: Object.freeze({
      height: createFrameField(
        selectedElements.map((element) => element.frame.height),
        {
          ...(maximumHeight === undefined ? {} : { maximum: maximumHeight }),
          minimum: minimumHeight,
        },
      ),
      width: createFrameField(
        selectedElements.map((element) => element.frame.width),
        { ...(maximumWidth === undefined ? {} : { maximum: maximumWidth }), minimum: minimumWidth },
      ),
      x: createFrameField(selectedElements.map((element) => element.frame.x)),
      y: createFrameField(selectedElements.map((element) => element.frame.y)),
    }),
    propertySections: Object.freeze(propertySections),
  });
};
