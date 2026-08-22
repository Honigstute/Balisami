import {
  ComponentInstancePropertiesSchema,
  CONTROL_TYPES,
  getControlAccessibleName,
  getControlSpec,
  type ComponentDefinition,
  type ControlInspectorPropertyField,
  type ElementId,
  type ElementNode,
  type ProjectDocument,
} from '../../domain';
import type { InspectorPrimitive, InspectorValue } from './control-inspector-model';

export interface ComponentOverrideFieldModel extends InspectorValue<InspectorPrimitive> {
  readonly field: ControlInspectorPropertyField;
  readonly overridden: boolean;
}

export interface ComponentOverrideSectionModel {
  readonly fields: readonly ComponentOverrideFieldModel[];
  readonly label: string;
  readonly targetElementId: ElementId;
}

export interface ComponentOverrideModel {
  readonly component: ComponentDefinition;
  readonly instance: ElementNode;
  readonly sections: readonly ComponentOverrideSectionModel[];
}

const readPrimitive = (
  properties: ElementNode['properties'],
  field: ControlInspectorPropertyField,
): InspectorPrimitive => {
  const value = properties[field.property];
  if (
    (field.kind === 'boolean' && typeof value === 'boolean') ||
    (field.kind === 'number' && typeof value === 'number') ||
    ((field.kind === 'choice' ||
      field.kind === 'color' ||
      field.kind === 'icon' ||
      field.kind === 'select' ||
      field.kind === 'text') &&
      (typeof value === 'string' || (field.kind === 'icon' && value === null)))
  ) {
    return value;
  }
  throw new Error(`Component override field '${field.property}' has an invalid value.`);
};

export const createComponentOverrideModel = (
  document: ProjectDocument,
  instanceId: ElementId,
): ComponentOverrideModel | undefined => {
  const instance = document.elementsById[instanceId];
  if (instance?.controlType !== CONTROL_TYPES.componentInstance) {
    return undefined;
  }
  const properties = ComponentInstancePropertiesSchema.safeParse(instance.properties);
  if (!properties.success) {
    return undefined;
  }
  const component = document.componentsById[properties.data.componentId];
  if (component === undefined) {
    return undefined;
  }

  const sections: ComponentOverrideSectionModel[] = [];
  const visited = new Set<ElementId>();
  const visit = (elementId: ElementId): void => {
    if (visited.has(elementId)) {
      return;
    }
    visited.add(elementId);
    const element = document.elementsById[elementId];
    const definition = element === undefined ? undefined : getControlSpec(element.controlType);
    if (element === undefined || definition === undefined) {
      return;
    }
    const override = properties.data.overrides[elementId] ?? {};
    const effectiveProperties = Object.freeze({ ...element.properties, ...override });
    const controlName = getControlAccessibleName(definition, effectiveProperties);
    for (const section of definition.inspector) {
      sections.push(
        Object.freeze({
          fields: Object.freeze(
            section.fields.map((field) =>
              Object.freeze({
                field,
                mixed: false,
                overridden: Object.hasOwn(override, field.property),
                value: readPrimitive(effectiveProperties, field),
              }),
            ),
          ),
          label: `${controlName} · ${section.label}`,
          targetElementId: element.id,
        }),
      );
    }
    element.childIds.forEach(visit);
  };
  visit(component.rootElementId);
  return Object.freeze({ component, instance, sections: Object.freeze(sections) });
};
