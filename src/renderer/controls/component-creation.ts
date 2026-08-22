import {
  CONTROL_TYPES,
  ConvertGroupToComponentCommandSchema,
  DOCUMENT_COMMAND_TYPES,
  EMPTY_ELEMENT_ROW_DATA,
  ElementIdSchema,
  createElementLocationIndex,
  getControlSpec,
  selectElementLockState,
  type ComponentId,
  type DocumentCommand,
  type ElementId,
  type ElementNode,
  type ProjectDocument,
} from '../../domain';

export type ComponentElementIdAllocator = (
  sourceElementId: ElementId,
  sourceIndex: number,
) => ElementId | undefined;

export interface ComponentCreationPlan {
  readonly commands: readonly DocumentCommand[];
  readonly componentId: ComponentId;
  readonly instanceId: ElementId;
  readonly sourceGroupId: ElementId;
}

const collectSubtreePreOrder = (
  document: ProjectDocument,
  rootElementId: ElementId,
): readonly ElementId[] | undefined => {
  const ids: ElementId[] = [];
  const visited = new Set<ElementId>();
  const visit = (elementId: ElementId): boolean => {
    if (visited.has(elementId)) {
      return false;
    }
    visited.add(elementId);
    const element = document.elementsById[elementId];
    if (element === undefined) {
      return false;
    }
    ids.push(elementId);
    return element.childIds.every(visit);
  };
  return visit(rootElementId) ? Object.freeze(ids) : undefined;
};

/**
 * Replaces one unlocked group with a lightweight instance while cloning its
 * complete tree into a hidden definition. One atomic validated command keeps
 * subtree size independent from the history transaction command limit.
 */
export const planComponentCreationFromGroup = (
  document: ProjectDocument,
  sourceGroupId: ElementId,
  componentId: ComponentId,
  instanceIdInput: ElementId,
  name: string,
  allocateDefinitionElementId: ComponentElementIdAllocator,
): ComponentCreationPlan | undefined => {
  if (document.componentsById[componentId] !== undefined) {
    return undefined;
  }
  const sourceGroup = document.elementsById[sourceGroupId];
  const locations = createElementLocationIndex(document);
  const sourceLocation = locations.get(sourceGroupId);
  const instanceId = ElementIdSchema.safeParse(instanceIdInput);
  if (
    sourceGroup === undefined ||
    sourceGroup.controlType !== CONTROL_TYPES.group ||
    sourceGroup.childIds.length === 0 ||
    sourceLocation === undefined ||
    selectElementLockState(document, sourceGroupId, locations)?.effectivelyLocked !== false ||
    !instanceId.success ||
    document.elementsById[instanceId.data] !== undefined
  ) {
    return undefined;
  }
  const sourceElementIds = collectSubtreePreOrder(document, sourceGroupId);
  if (sourceElementIds === undefined) {
    return undefined;
  }

  const cloneIdBySource = new Map<ElementId, ElementId>();
  const allocatedIds = new Set<ElementId>([instanceId.data]);
  for (const [sourceIndex, sourceElementId] of sourceElementIds.entries()) {
    const cloneId = ElementIdSchema.safeParse(
      allocateDefinitionElementId(sourceElementId, sourceIndex),
    );
    if (
      !cloneId.success ||
      document.elementsById[cloneId.data] !== undefined ||
      allocatedIds.has(cloneId.data)
    ) {
      return undefined;
    }
    allocatedIds.add(cloneId.data);
    cloneIdBySource.set(sourceElementId, cloneId.data);
  }

  const definitionElements: ElementNode[] = [];
  for (const sourceElementId of sourceElementIds) {
    const source = document.elementsById[sourceElementId];
    const cloneId = cloneIdBySource.get(sourceElementId);
    if (source === undefined || cloneId === undefined) {
      return undefined;
    }
    const childIds = source.childIds.map((childId) => cloneIdBySource.get(childId));
    if (childIds.some((childId) => childId === undefined)) {
      return undefined;
    }
    definitionElements.push(
      Object.freeze({
        ...source,
        childIds: Object.freeze(childIds as ElementId[]),
        frame:
          sourceElementId === sourceGroupId
            ? Object.freeze({ ...source.frame, x: 0, y: 0 })
            : source.frame,
        id: cloneId,
      }),
    );
  }
  const definitionRootId = cloneIdBySource.get(sourceGroupId);
  if (definitionRootId === undefined) {
    return undefined;
  }
  const instanceDefinition = getControlSpec(CONTROL_TYPES.componentInstance);
  const command = ConvertGroupToComponentCommandSchema.safeParse({
    type: DOCUMENT_COMMAND_TYPES.convertGroupToComponent,
    component: { id: componentId, name, rootElementId: definitionRootId },
    definitionElements,
    instance: {
      id: instanceId.data,
      controlType: CONTROL_TYPES.componentInstance,
      controlVersion: instanceDefinition?.fileVersion,
      frame: sourceGroup.frame,
      locked: false,
      properties: { componentId, overrides: {} },
      childIds: [],
      assetIds: [],
      link: null,
      rowData: EMPTY_ELEMENT_ROW_DATA,
    },
    sourceElementIds,
    sourceGroupId,
  });
  if (!command.success) {
    return undefined;
  }
  return Object.freeze({
    commands: Object.freeze([command.data]),
    componentId,
    instanceId: instanceId.data,
    sourceGroupId,
  });
};
