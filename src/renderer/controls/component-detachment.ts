import {
  ComponentInstancePropertiesSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  DetachComponentInstanceCommandSchema,
  createElementLocationIndex,
  getControlSpec,
  parseCustomIconReference,
  selectElementLockState,
  type DocumentCommand,
  type ElementId,
  type ElementNode,
  type ProjectDocument,
} from '../../domain';
import { planCommandsWithUnusedAssetCleanup } from '../projects/unused-asset-cleanup';
import type { ComponentElementIdAllocator } from './component-creation';

export interface ComponentDetachmentPlan {
  readonly commands: readonly DocumentCommand[];
  readonly detachedRootId: ElementId;
  readonly instanceId: ElementId;
}

const collectSubtreePreOrder = (
  document: ProjectDocument,
  rootElementId: ElementId,
): readonly ElementId[] => {
  const ids: ElementId[] = [];
  const visit = (elementId: ElementId): void => {
    const element = document.elementsById[elementId];
    if (element === undefined) return;
    ids.push(element.id);
    element.childIds.forEach(visit);
  };
  visit(rootElementId);
  return Object.freeze(ids);
};

/** Replaces one instance with an independent, visually identical canonical tree. */
export const planComponentDetachment = (
  document: ProjectDocument,
  instanceId: ElementId,
  allocateElementId: ComponentElementIdAllocator,
): ComponentDetachmentPlan | undefined => {
  const instance = document.elementsById[instanceId];
  const properties =
    instance?.controlType === CONTROL_TYPES.componentInstance
      ? ComponentInstancePropertiesSchema.safeParse(instance.properties)
      : undefined;
  const component =
    properties?.success === true ? document.componentsById[properties.data.componentId] : undefined;
  const root = component === undefined ? undefined : document.elementsById[component.rootElementId];
  if (
    instance === undefined ||
    properties?.success !== true ||
    component === undefined ||
    root === undefined ||
    selectElementLockState(document, instance.id, createElementLocationIndex(document))
      ?.effectivelyLocked !== false
  ) {
    return undefined;
  }

  const sourceIds = collectSubtreePreOrder(document, root.id);
  const detachedIdBySource = new Map<ElementId, ElementId>();
  const allocatedIds = new Set<ElementId>();
  for (const [index, sourceId] of sourceIds.entries()) {
    const detachedId = allocateElementId(sourceId, index);
    if (
      detachedId === undefined ||
      allocatedIds.has(detachedId) ||
      document.elementsById[detachedId] !== undefined
    ) {
      return undefined;
    }
    allocatedIds.add(detachedId);
    detachedIdBySource.set(sourceId, detachedId);
  }

  const scaleX = instance.frame.width / root.frame.width;
  const scaleY = instance.frame.height / root.frame.height;
  const detachedElements: ElementNode[] = [];
  for (const sourceId of sourceIds) {
    const source = document.elementsById[sourceId];
    const detachedId = detachedIdBySource.get(sourceId);
    if (source === undefined || detachedId === undefined) return undefined;
    const childIds = source.childIds.map((childId) => detachedIdBySource.get(childId));
    if (childIds.some((childId) => childId === undefined)) return undefined;
    const mergedProperties = Object.freeze({
      ...source.properties,
      ...properties.data.overrides[source.id],
    });
    const assetIds = new Set(source.assetIds);
    const definition = getControlSpec(source.controlType);
    for (const field of definition?.inspector.flatMap((section) => section.fields) ?? []) {
      if (field.kind !== 'icon') continue;
      const customAssetId = parseCustomIconReference(mergedProperties[field.property]);
      if (customAssetId !== undefined) assetIds.add(customAssetId);
    }
    detachedElements.push(
      Object.freeze({
        ...source,
        assetIds: Object.freeze([...assetIds]),
        childIds: Object.freeze(childIds as ElementId[]),
        frame:
          source.id === root.id
            ? instance.frame
            : Object.freeze({
                height: source.frame.height * scaleY,
                width: source.frame.width * scaleX,
                x: source.frame.x * scaleX,
                y: source.frame.y * scaleY,
              }),
        id: detachedId,
        properties: mergedProperties,
      }),
    );
  }
  const detachedRootId = detachedIdBySource.get(root.id);
  if (detachedRootId === undefined) return undefined;
  const command = DetachComponentInstanceCommandSchema.safeParse({
    type: DOCUMENT_COMMAND_TYPES.detachComponentInstance,
    detachedElements,
    detachedRootId,
    instanceId: instance.id,
  });
  if (!command.success) return undefined;
  const commands = planCommandsWithUnusedAssetCleanup(document, [command.data]);
  return commands === undefined
    ? undefined
    : Object.freeze({ commands, detachedRootId, instanceId: instance.id });
};
