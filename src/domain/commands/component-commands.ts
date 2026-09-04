import { ComponentInstancePropertiesSchema } from '../controls/component-instance';
import { CONTROL_TYPES } from '../controls/control-spec';
import type { ComponentId, ElementId } from '../document/ids';
import { createElementLocationIndex, selectElementLocation } from '../document/selectors';
import type { ElementOwner } from '../document/owner';
import type { ElementNode } from '../document/schema';
import type { ProjectDocument } from '../document/validation';
import type { CommandApplication } from './application';
import {
  DOCUMENT_COMMAND_TYPES,
  type ComponentCommand,
  type ConvertGroupToComponentCommand,
  type CreateComponentCommand,
  type DeleteComponentCommand,
  type DetachComponentInstanceCommand,
  type RenameComponentCommand,
  type ReorderComponentCommand,
  type RestoreGroupFromComponentCommand,
  type RestoreComponentInstanceCommand,
} from './schema';

const collectSubtree = (
  document: ProjectDocument,
  rootElementId: ElementId,
): readonly ElementNode[] => {
  const elements: ElementNode[] = [];
  const visit = (elementId: ElementId): void => {
    const element = document.elementsById[elementId];
    if (element === undefined) {
      return;
    }
    elements.push(element);
    element.childIds.forEach(visit);
  };
  visit(rootElementId);
  return Object.freeze(elements);
};

const applyCreateComponent = (
  document: ProjectDocument,
  command: CreateComponentCommand,
): CommandApplication => {
  if (document.componentsById[command.component.id] !== undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Component '${command.component.id}' already exists.`,
    };
  }
  if (command.index > document.componentIds.length) {
    return {
      ok: false,
      code: 'out-of-range',
      message: `Component insertion index ${String(command.index)} exceeds ${String(document.componentIds.length)}.`,
    };
  }
  const conflictingElement = command.elements.find(
    (element) => document.elementsById[element.id] !== undefined,
  );
  if (conflictingElement !== undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Element '${conflictingElement.id}' already exists.`,
    };
  }

  const componentIds = [...document.componentIds];
  componentIds.splice(command.index, 0, command.component.id);
  const elementsById = { ...document.elementsById } as Record<string, ElementNode>;
  for (const element of command.elements) {
    elementsById[element.id] = element;
  }
  return {
    ok: true,
    changed: true,
    candidate: Object.freeze({
      ...document,
      componentIds: Object.freeze(componentIds),
      componentsById: Object.freeze({
        ...document.componentsById,
        [command.component.id]: command.component,
      }),
      elementsById: Object.freeze(elementsById),
    }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.deleteComponent,
      componentId: command.component.id,
    },
    label: `Create component “${command.component.name}”`,
  };
};

const referencesComponent = (element: ElementNode, componentId: ComponentId): boolean => {
  if (element.controlType !== CONTROL_TYPES.componentInstance) {
    return false;
  }
  const properties = ComponentInstancePropertiesSchema.safeParse(element.properties);
  return properties.success && properties.data.componentId === componentId;
};

const ownersEqual = (first: ElementOwner, second: ElementOwner): boolean =>
  first.kind === second.kind &&
  (first.kind === 'board'
    ? first.boardId === (second.kind === 'board' ? second.boardId : undefined)
    : first.elementId === (second.kind === 'element' ? second.elementId : undefined));

const replaceOwnerChild = (
  document: ProjectDocument,
  owner: ElementOwner,
  index: number,
  expectedElementId: ElementId,
  replacementElementId: ElementId,
  elementsById: ProjectDocument['elementsById'],
):
  | Readonly<{
      boardsById: ProjectDocument['boardsById'];
      elementsById: ProjectDocument['elementsById'];
    }>
  | undefined => {
  if (owner.kind === 'board') {
    const board = document.boardsById[owner.boardId];
    if (board?.childIds[index] !== expectedElementId) {
      return undefined;
    }
    const childIds = [...board.childIds];
    childIds[index] = replacementElementId;
    return Object.freeze({
      boardsById: Object.freeze({
        ...document.boardsById,
        [board.id]: Object.freeze({ ...board, childIds: Object.freeze(childIds) }),
      }),
      elementsById,
    });
  }
  const parent = elementsById[owner.elementId];
  if (parent?.childIds[index] !== expectedElementId) {
    return undefined;
  }
  const childIds = [...parent.childIds];
  childIds[index] = replacementElementId;
  return Object.freeze({
    boardsById: document.boardsById,
    elementsById: Object.freeze({
      ...elementsById,
      [parent.id]: Object.freeze({ ...parent, childIds: Object.freeze(childIds) }),
    }),
  });
};

const sourceOrderMatches = (
  document: ProjectDocument,
  sourceGroupId: ElementId,
  sourceElementIds: readonly ElementId[],
): boolean => {
  const elements = collectSubtree(document, sourceGroupId);
  return (
    elements.length === sourceElementIds.length &&
    elements.every((element, index) => element.id === sourceElementIds[index])
  );
};

const applyConvertGroupToComponent = (
  document: ProjectDocument,
  command: ConvertGroupToComponentCommand,
): CommandApplication => {
  if (document.componentsById[command.component.id] !== undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Component '${command.component.id}' already exists.`,
    };
  }
  const sourceGroup = document.elementsById[command.sourceGroupId];
  const location = selectElementLocation(
    document,
    command.sourceGroupId,
    createElementLocationIndex(document),
  );
  if (
    sourceGroup?.controlType !== CONTROL_TYPES.group ||
    location === undefined ||
    !sourceOrderMatches(document, command.sourceGroupId, command.sourceElementIds)
  ) {
    return {
      ok: false,
      code: 'conflict',
      message: `Group '${command.sourceGroupId}' is not an intact canonical source tree.`,
    };
  }
  const instanceProperties = ComponentInstancePropertiesSchema.safeParse(
    command.instance.properties,
  );
  if (
    command.instance.controlType !== CONTROL_TYPES.componentInstance ||
    instanceProperties.success === false ||
    instanceProperties.data.componentId !== command.component.id
  ) {
    return {
      ok: false,
      code: 'conflict',
      message: 'The replacement instance must reference the created component.',
    };
  }

  const sourceElements = collectSubtree(document, command.sourceGroupId);
  const sourceIds = new Set(sourceElements.map((element) => element.id));
  const introducedIds = new Set<ElementId>([command.instance.id]);
  for (const element of command.definitionElements) {
    if (
      introducedIds.has(element.id) ||
      sourceIds.has(element.id) ||
      (document.elementsById[element.id] !== undefined && !sourceIds.has(element.id))
    ) {
      return {
        ok: false,
        code: 'conflict',
        message: `Element '${element.id}' conflicts with existing or introduced component content.`,
      };
    }
    introducedIds.add(element.id);
  }
  if (
    document.elementsById[command.instance.id] !== undefined ||
    sourceIds.has(command.instance.id)
  ) {
    return {
      ok: false,
      code: 'conflict',
      message: `Element '${command.instance.id}' already exists.`,
    };
  }

  const mutableElementsById: Record<string, ElementNode> = { ...document.elementsById };
  for (const sourceId of sourceIds) {
    delete mutableElementsById[sourceId];
  }
  for (const element of command.definitionElements) {
    mutableElementsById[element.id] = element;
  }
  mutableElementsById[command.instance.id] = command.instance;
  const ownerPatch = replaceOwnerChild(
    document,
    location.owner,
    location.index,
    command.sourceGroupId,
    command.instance.id,
    Object.freeze(mutableElementsById),
  );
  if (ownerPatch === undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Group '${command.sourceGroupId}' changed ownership before conversion.`,
    };
  }
  return {
    ok: true,
    changed: true,
    candidate: Object.freeze({
      ...document,
      ...ownerPatch,
      componentIds: Object.freeze([...document.componentIds, command.component.id]),
      componentsById: Object.freeze({
        ...document.componentsById,
        [command.component.id]: command.component,
      }),
    }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.restoreGroupFromComponent,
      componentId: command.component.id,
      index: location.index,
      instanceId: command.instance.id,
      owner: location.owner,
      sourceElements,
      sourceGroupId: command.sourceGroupId,
    },
    label: `Create component “${command.component.name}”`,
  };
};

const applyRestoreGroupFromComponent = (
  document: ProjectDocument,
  command: RestoreGroupFromComponentCommand,
): CommandApplication => {
  const component = document.componentsById[command.componentId];
  const instance = document.elementsById[command.instanceId];
  const location = selectElementLocation(
    document,
    command.instanceId,
    createElementLocationIndex(document),
  );
  if (
    component === undefined ||
    instance === undefined ||
    location === undefined ||
    location.index !== command.index ||
    !ownersEqual(location.owner, command.owner) ||
    !referencesComponent(instance, component.id)
  ) {
    return {
      ok: false,
      code: 'conflict',
      message: `Component instance '${command.instanceId}' cannot restore its source group.`,
    };
  }
  const definitionElements = collectSubtree(document, component.rootElementId);
  const definitionIds = new Set(definitionElements.map((element) => element.id));
  const otherReference = Object.values(document.elementsById).find(
    (element) =>
      element.id !== instance.id &&
      !definitionIds.has(element.id) &&
      referencesComponent(element, component.id),
  );
  if (otherReference !== undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Component '${component.id}' has another instance '${otherReference.id}'.`,
    };
  }

  const removedIds = new Set<ElementId>([instance.id, ...definitionIds]);
  const sourceIds = new Set<ElementId>();
  for (const source of command.sourceElements) {
    if (
      sourceIds.has(source.id) ||
      (document.elementsById[source.id] !== undefined && !removedIds.has(source.id))
    ) {
      return {
        ok: false,
        code: 'conflict',
        message: `Source element '${source.id}' cannot be restored.`,
      };
    }
    sourceIds.add(source.id);
  }

  const mutableElementsById: Record<string, ElementNode> = { ...document.elementsById };
  for (const removedId of removedIds) {
    delete mutableElementsById[removedId];
  }
  for (const source of command.sourceElements) {
    mutableElementsById[source.id] = source;
  }
  const ownerPatch = replaceOwnerChild(
    document,
    command.owner,
    command.index,
    instance.id,
    command.sourceGroupId,
    Object.freeze(mutableElementsById),
  );
  if (ownerPatch === undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Component instance '${instance.id}' changed ownership before restoration.`,
    };
  }
  const componentsById = { ...document.componentsById };
  delete componentsById[component.id];
  return {
    ok: true,
    changed: true,
    candidate: Object.freeze({
      ...document,
      ...ownerPatch,
      componentIds: Object.freeze(document.componentIds.filter((id) => id !== component.id)),
      componentsById: Object.freeze(componentsById),
    }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.convertGroupToComponent,
      component,
      definitionElements,
      instance,
      sourceElementIds: Object.freeze(command.sourceElements.map((element) => element.id)),
      sourceGroupId: command.sourceGroupId,
    },
    label: `Restore group from “${component.name}”`,
  };
};

const applyDeleteComponent = (
  document: ProjectDocument,
  command: DeleteComponentCommand,
): CommandApplication => {
  const component = document.componentsById[command.componentId];
  if (component === undefined) {
    return {
      ok: false,
      code: 'not-found',
      message: `Component '${command.componentId}' does not exist.`,
    };
  }
  const elements = collectSubtree(document, component.rootElementId);
  const subtreeIds = new Set(elements.map((element) => element.id));
  const referencingInstance = Object.values(document.elementsById).find(
    (element) => !subtreeIds.has(element.id) && referencesComponent(element, component.id),
  );
  if (referencingInstance !== undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Component '${component.id}' is used by instance '${referencingInstance.id}'.`,
    };
  }
  const index = document.componentIds.indexOf(component.id);
  if (index < 0) {
    return {
      ok: false,
      code: 'conflict',
      message: `Component '${component.id}' is missing from component order.`,
    };
  }

  const elementsById = { ...document.elementsById } as Record<string, ElementNode>;
  for (const element of elements) {
    delete elementsById[element.id];
  }
  const componentsById = { ...document.componentsById };
  delete componentsById[component.id];
  return {
    ok: true,
    changed: true,
    candidate: Object.freeze({
      ...document,
      componentIds: Object.freeze(document.componentIds.filter((id) => id !== component.id)),
      componentsById: Object.freeze(componentsById),
      elementsById: Object.freeze(elementsById),
    }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.createComponent,
      component,
      elements,
      index,
    },
    label: `Delete component “${component.name}”`,
  };
};

const applyDetachComponentInstance = (
  document: ProjectDocument,
  command: DetachComponentInstanceCommand,
): CommandApplication => {
  const instance = document.elementsById[command.instanceId];
  const location = selectElementLocation(
    document,
    command.instanceId,
    createElementLocationIndex(document),
  );
  const properties =
    instance?.controlType === CONTROL_TYPES.componentInstance
      ? ComponentInstancePropertiesSchema.safeParse(instance.properties)
      : undefined;
  const component =
    properties?.success === true ? document.componentsById[properties.data.componentId] : undefined;
  if (instance === undefined || location === undefined || component === undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Component instance '${command.instanceId}' cannot be detached.`,
    };
  }
  const introducedIds = new Set<ElementId>();
  for (const element of command.detachedElements) {
    if (
      introducedIds.has(element.id) ||
      element.id === instance.id ||
      document.elementsById[element.id] !== undefined
    ) {
      return {
        ok: false,
        code: 'conflict',
        message: `Detached element '${element.id}' already exists.`,
      };
    }
    introducedIds.add(element.id);
  }

  const mutableElementsById: Record<string, ElementNode> = { ...document.elementsById };
  delete mutableElementsById[instance.id];
  for (const element of command.detachedElements) mutableElementsById[element.id] = element;
  const ownerPatch = replaceOwnerChild(
    document,
    location.owner,
    location.index,
    instance.id,
    command.detachedRootId,
    Object.freeze(mutableElementsById),
  );
  if (ownerPatch === undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Component instance '${instance.id}' changed ownership before detachment.`,
    };
  }
  return {
    ok: true,
    changed: true,
    candidate: Object.freeze({ ...document, ...ownerPatch }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.restoreComponentInstance,
      detachedElementIds: Object.freeze(command.detachedElements.map((element) => element.id)),
      detachedRootId: command.detachedRootId,
      index: location.index,
      instance,
      owner: location.owner,
    },
    label: `Break apart “${component.name}”`,
  };
};

const applyRestoreComponentInstance = (
  document: ProjectDocument,
  command: RestoreComponentInstanceCommand,
): CommandApplication => {
  const location = selectElementLocation(
    document,
    command.detachedRootId,
    createElementLocationIndex(document),
  );
  if (
    location === undefined ||
    location.index !== command.index ||
    !ownersEqual(location.owner, command.owner) ||
    !sourceOrderMatches(document, command.detachedRootId, command.detachedElementIds) ||
    (document.elementsById[command.instance.id] !== undefined &&
      !command.detachedElementIds.includes(command.instance.id))
  ) {
    return {
      ok: false,
      code: 'conflict',
      message: `Detached tree '${command.detachedRootId}' cannot restore its component instance.`,
    };
  }
  const detachedElements = collectSubtree(document, command.detachedRootId);
  const mutableElementsById: Record<string, ElementNode> = { ...document.elementsById };
  for (const elementId of command.detachedElementIds) delete mutableElementsById[elementId];
  mutableElementsById[command.instance.id] = command.instance;
  const ownerPatch = replaceOwnerChild(
    document,
    command.owner,
    command.index,
    command.detachedRootId,
    command.instance.id,
    Object.freeze(mutableElementsById),
  );
  if (ownerPatch === undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Detached tree '${command.detachedRootId}' changed ownership before restoration.`,
    };
  }
  return {
    ok: true,
    changed: true,
    candidate: Object.freeze({ ...document, ...ownerPatch }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.detachComponentInstance,
      detachedElements,
      detachedRootId: command.detachedRootId,
      instanceId: command.instance.id,
    },
    label: 'Restore component instance',
  };
};

const applyRenameComponent = (
  document: ProjectDocument,
  command: RenameComponentCommand,
): CommandApplication => {
  const component = document.componentsById[command.componentId];
  if (component === undefined) {
    return {
      ok: false,
      code: 'not-found',
      message: `Component '${command.componentId}' does not exist.`,
    };
  }
  if (component.name === command.name) {
    return { ok: true, changed: false, label: 'Rename component' };
  }
  return {
    ok: true,
    changed: true,
    candidate: Object.freeze({
      ...document,
      componentsById: Object.freeze({
        ...document.componentsById,
        [component.id]: Object.freeze({ ...component, name: command.name }),
      }),
    }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.renameComponent,
      componentId: component.id,
      name: component.name,
    },
    label: `Rename component to “${command.name}”`,
  };
};

const applyReorderComponent = (
  document: ProjectDocument,
  command: ReorderComponentCommand,
): CommandApplication => {
  const fromIndex = document.componentIds.indexOf(command.componentId);
  if (fromIndex < 0) {
    return {
      ok: false,
      code: 'not-found',
      message: `Component '${command.componentId}' does not exist.`,
    };
  }
  if (command.toIndex >= document.componentIds.length) {
    return {
      ok: false,
      code: 'out-of-range',
      message: `Component destination index ${String(command.toIndex)} exceeds ${String(document.componentIds.length - 1)}.`,
    };
  }
  if (fromIndex === command.toIndex) {
    return { ok: true, changed: false, label: 'Reorder component' };
  }
  const componentIds = [...document.componentIds];
  componentIds.splice(fromIndex, 1);
  componentIds.splice(command.toIndex, 0, command.componentId);
  return {
    ok: true,
    changed: true,
    candidate: Object.freeze({ ...document, componentIds: Object.freeze(componentIds) }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.reorderComponent,
      componentId: command.componentId,
      toIndex: fromIndex,
    },
    label: 'Reorder component',
  };
};

export const applyComponentCommand = (
  document: ProjectDocument,
  command: ComponentCommand,
): CommandApplication => {
  switch (command.type) {
    case DOCUMENT_COMMAND_TYPES.createComponent:
      return applyCreateComponent(document, command);
    case DOCUMENT_COMMAND_TYPES.convertGroupToComponent:
      return applyConvertGroupToComponent(document, command);
    case DOCUMENT_COMMAND_TYPES.detachComponentInstance:
      return applyDetachComponentInstance(document, command);
    case DOCUMENT_COMMAND_TYPES.deleteComponent:
      return applyDeleteComponent(document, command);
    case DOCUMENT_COMMAND_TYPES.renameComponent:
      return applyRenameComponent(document, command);
    case DOCUMENT_COMMAND_TYPES.reorderComponent:
      return applyReorderComponent(document, command);
    case DOCUMENT_COMMAND_TYPES.restoreComponentInstance:
      return applyRestoreComponentInstance(document, command);
    case DOCUMENT_COMMAND_TYPES.restoreGroupFromComponent:
      return applyRestoreGroupFromComponent(document, command);
  }
};
