import { FOUNDATION_CONTROL_TYPES, getControlSpec } from '../controls/control-spec';
import type { ElementId } from '../document/ids';
import type { ElementOwner } from '../document/owner';
import {
  createElementLocationIndex,
  selectElementLocation,
  selectOwnerChildIds,
} from '../document/selectors';
import type { ElementNode, JsonValue } from '../document/schema';
import type { ProjectDocument } from '../document/validation';
import type { CommandApplication, CommandApplicationFailure } from './application';
import {
  DOCUMENT_COMMAND_TYPES,
  type CreateElementCommand,
  type DeleteElementCommand,
  type ElementCommand,
  type GroupElementsCommand,
  type ReorderElementCommand,
  type ReorderElementSiblingsCommand,
  type SetElementFrameCommand,
  type SetElementLockedCommand,
  type SetElementPropertiesCommand,
  type UngroupElementCommand,
} from './schema';

type ElementDocumentPatch = Partial<Pick<ProjectDocument, 'boardsById' | 'elementsById'>>;

const createElementRevision = (
  document: ProjectDocument,
  patch: ElementDocumentPatch,
): ProjectDocument => Object.freeze({ ...document, ...patch });

const notFound = (noun: 'Element' | 'Owner', id: string): CommandApplicationFailure => ({
  ok: false,
  code: 'not-found',
  message: `${noun} '${id}' does not exist.`,
});

const getOwnerId = (owner: ElementOwner): string =>
  owner.kind === 'board' ? owner.boardId : owner.elementId;

const areOwnersEqual = (left: ElementOwner, right: ElementOwner): boolean =>
  left.kind === right.kind && getOwnerId(left) === getOwnerId(right);

const areElementIdListsEqual = (left: readonly ElementId[], right: readonly ElementId[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index]);

const areNumbersNearlyEqual = (left: number, right: number): boolean =>
  Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 8;

const isTranslatedFrame = (
  source: ElementNode['frame'],
  target: ElementNode['frame'],
  deltaX: number,
  deltaY: number,
): boolean =>
  target.width === source.width &&
  target.height === source.height &&
  areNumbersNearlyEqual(target.x, source.x + deltaX) &&
  areNumbersNearlyEqual(target.y, source.y + deltaY);

/** Updates only the record that canonically owns childIds. */
const replaceOwnerChildren = (
  document: ProjectDocument,
  owner: ElementOwner,
  childIds: readonly ElementId[],
  elementsById: ProjectDocument['elementsById'] = document.elementsById,
): ElementDocumentPatch | CommandApplicationFailure => {
  const frozenChildIds = Object.freeze([...childIds]);

  if (owner.kind === 'board') {
    const board = document.boardsById[owner.boardId];
    if (board === undefined) {
      return notFound('Owner', owner.boardId);
    }
    const updatedBoard = Object.freeze({ ...board, childIds: frozenChildIds });
    return {
      boardsById: Object.freeze({ ...document.boardsById, [board.id]: updatedBoard }),
      elementsById,
    };
  }

  const ownerElement = elementsById[owner.elementId];
  if (ownerElement === undefined) {
    return notFound('Owner', owner.elementId);
  }
  const updatedOwner = Object.freeze({ ...ownerElement, childIds: frozenChildIds });
  return {
    elementsById: Object.freeze({ ...elementsById, [ownerElement.id]: updatedOwner }),
  };
};

const isJsonArray = (value: JsonValue): value is readonly JsonValue[] => Array.isArray(value);

const areJsonValuesEqual = (left: JsonValue, right: JsonValue): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (isJsonArray(left) || isJsonArray(right)) {
    return (
      isJsonArray(left) &&
      isJsonArray(right) &&
      left.length === right.length &&
      left.every((value, index) => areJsonValuesEqual(value, right[index] as JsonValue))
    );
  }

  const leftRecord = left as Readonly<Record<string, JsonValue>>;
  const rightRecord = right as Readonly<Record<string, JsonValue>>;
  const leftKeys = Object.keys(leftRecord);
  if (leftKeys.length !== Object.keys(rightRecord).length) {
    return false;
  }
  return leftKeys.every(
    (key) =>
      Object.hasOwn(rightRecord, key) &&
      areJsonValuesEqual(leftRecord[key] as JsonValue, rightRecord[key] as JsonValue),
  );
};

const applyCreateElement = (
  document: ProjectDocument,
  command: CreateElementCommand,
): CommandApplication => {
  if (Object.hasOwn(document.elementsById, command.element.id)) {
    return {
      ok: false,
      code: 'conflict',
      message: `Element '${command.element.id}' already exists.`,
    };
  }

  const ownerChildIds = selectOwnerChildIds(document, command.owner);
  if (ownerChildIds === undefined) {
    return notFound('Owner', getOwnerId(command.owner));
  }
  if (command.index > ownerChildIds.length) {
    return {
      ok: false,
      code: 'out-of-range',
      message: `Element insertion index ${String(command.index)} exceeds ${String(ownerChildIds.length)}.`,
    };
  }
  if (command.owner.kind === 'element') {
    const owner = document.elementsById[command.owner.elementId];
    const spec = owner === undefined ? undefined : getControlSpec(owner.controlType);
    if (spec?.capabilities.grouping !== 'container') {
      return {
        ok: false,
        code: 'conflict',
        message: `Element '${command.owner.elementId}' cannot own child elements.`,
      };
    }
  }
  const definition = getControlSpec(command.element.controlType);
  if (definition === undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Control type '${command.element.controlType}' is not registered.`,
    };
  }
  if (command.element.controlVersion !== definition.fileVersion) {
    return {
      ok: false,
      code: 'conflict',
      message: `Control type '${command.element.controlType}' must be created at property version ${String(definition.fileVersion)}.`,
    };
  }

  const childIds = [...ownerChildIds];
  childIds.splice(command.index, 0, command.element.id);
  const elementsById = Object.freeze({
    ...document.elementsById,
    [command.element.id]: command.element,
  });
  const ownerPatch = replaceOwnerChildren(document, command.owner, childIds, elementsById);
  if ('ok' in ownerPatch) {
    return ownerPatch;
  }

  return {
    ok: true,
    changed: true,
    candidate: createElementRevision(document, ownerPatch),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.deleteElement,
      elementId: command.element.id,
    },
    label: 'Create element',
  };
};

const applyDeleteElement = (
  document: ProjectDocument,
  command: DeleteElementCommand,
): CommandApplication => {
  const element = document.elementsById[command.elementId];
  if (element === undefined) {
    return notFound('Element', command.elementId);
  }
  if (element.childIds.length > 0) {
    return {
      ok: false,
      code: 'conflict',
      message: `Element '${command.elementId}' must have no children before it can be deleted.`,
    };
  }

  const location = selectElementLocation(
    document,
    command.elementId,
    createElementLocationIndex(document),
  );
  if (location === undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Element '${command.elementId}' has no canonical owner.`,
    };
  }

  const ownerChildIds = selectOwnerChildIds(document, location.owner);
  if (ownerChildIds === undefined) {
    return notFound('Owner', getOwnerId(location.owner));
  }

  const mutableElementsById: Record<string, ElementNode> = { ...document.elementsById };
  delete mutableElementsById[command.elementId];
  const elementsById = Object.freeze(mutableElementsById);
  const ownerPatch = replaceOwnerChildren(
    document,
    location.owner,
    ownerChildIds.filter((elementId) => elementId !== command.elementId),
    elementsById,
  );
  if ('ok' in ownerPatch) {
    return ownerPatch;
  }

  return {
    ok: true,
    changed: true,
    candidate: createElementRevision(document, ownerPatch),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element,
      owner: location.owner,
      index: location.index,
    },
    label: 'Delete element',
  };
};

/**
 * Reparents canonical siblings beneath one new group without changing their
 * world geometry. `toIndex` is measured after the grouped siblings are removed.
 */
const applyGroupElements = (
  document: ProjectDocument,
  command: GroupElementsCommand,
): CommandApplication => {
  if (Object.hasOwn(document.elementsById, command.group.id)) {
    return {
      ok: false,
      code: 'conflict',
      message: `Element '${command.group.id}' already exists.`,
    };
  }

  const ownerChildIds = selectOwnerChildIds(document, command.owner);
  if (ownerChildIds === undefined) {
    return notFound('Owner', getOwnerId(command.owner));
  }
  if (command.owner.kind === 'element') {
    const ownerElement = document.elementsById[command.owner.elementId];
    if (ownerElement === undefined) {
      return notFound('Owner', command.owner.elementId);
    }
    if (getControlSpec(ownerElement.controlType)?.capabilities.grouping !== 'container') {
      return {
        ok: false,
        code: 'conflict',
        message: `Element '${command.owner.elementId}' cannot own child elements.`,
      };
    }
  }

  const childSet = new Set(command.group.childIds);
  const canonicalChildIds = ownerChildIds.filter((elementId) => childSet.has(elementId));
  if (!areElementIdListsEqual(canonicalChildIds, command.group.childIds)) {
    return {
      ok: false,
      code: 'conflict',
      message: 'Grouped elements must be listed once in canonical sibling order.',
    };
  }

  const locationIndex = createElementLocationIndex(document);
  const originalChildFrames: UngroupElementCommand['childFrames'][number][] = [];
  for (const childId of command.group.childIds) {
    const child = document.elementsById[childId];
    const location = locationIndex.get(childId);
    if (child === undefined) {
      return notFound('Element', childId);
    }
    if (location === undefined || !areOwnersEqual(location.owner, command.owner)) {
      return {
        ok: false,
        code: 'conflict',
        message: `Element '${childId}' is not canonically owned by '${getOwnerId(command.owner)}'.`,
      };
    }
    originalChildFrames.push({ elementId: childId, frame: child.frame });
  }

  const remainingChildIds = ownerChildIds.filter((elementId) => !childSet.has(elementId));
  if (command.toIndex > remainingChildIds.length) {
    return {
      ok: false,
      code: 'out-of-range',
      message: `Group insertion index ${String(command.toIndex)} exceeds ${String(remainingChildIds.length)}.`,
    };
  }

  const mutableElementsById: Record<string, ElementNode> = { ...document.elementsById };
  for (const [childIndex, childId] of command.group.childIds.entries()) {
    const child = document.elementsById[childId];
    if (child === undefined) {
      return notFound('Element', childId);
    }
    const targetFrame = command.childFrames[childIndex]?.frame;
    if (
      targetFrame === undefined ||
      !isTranslatedFrame(child.frame, targetFrame, -command.group.frame.x, -command.group.frame.y)
    ) {
      return {
        ok: false,
        code: 'conflict',
        message: `Grouping element '${childId}' must preserve its owner-local world geometry.`,
      };
    }
    mutableElementsById[childId] = Object.freeze({
      ...child,
      frame: targetFrame,
    });
  }
  mutableElementsById[command.group.id] = command.group;
  const elementsById = Object.freeze(mutableElementsById);
  const nextOwnerChildIds = [...remainingChildIds];
  nextOwnerChildIds.splice(command.toIndex, 0, command.group.id);
  const ownerPatch = replaceOwnerChildren(document, command.owner, nextOwnerChildIds, elementsById);
  if ('ok' in ownerPatch) {
    return ownerPatch;
  }

  return {
    ok: true,
    changed: true,
    candidate: createElementRevision(document, ownerPatch),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.ungroupElement,
      childFrames: originalChildFrames,
      groupId: command.group.id,
      ownerChildIds,
    },
    label: 'Group elements',
  };
};

/**
 * Removes a group and converts its direct children back into the owner's local
 * coordinate space. The requested order may restore non-contiguous siblings,
 * but cannot reorder either the group's children or unaffected siblings.
 */
const applyUngroupElement = (
  document: ProjectDocument,
  command: UngroupElementCommand,
): CommandApplication => {
  const group = document.elementsById[command.groupId];
  if (group === undefined) {
    return notFound('Element', command.groupId);
  }
  if (group.controlType !== FOUNDATION_CONTROL_TYPES.group) {
    return {
      ok: false,
      code: 'conflict',
      message: `Element '${command.groupId}' is not a group container.`,
    };
  }
  if (group.childIds.length === 0) {
    return {
      ok: false,
      code: 'conflict',
      message: `Group '${command.groupId}' has no children to ungroup.`,
    };
  }

  const locationIndex = createElementLocationIndex(document);
  const location = locationIndex.get(command.groupId);
  if (location === undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Element '${command.groupId}' has no canonical owner.`,
    };
  }
  const ownerChildIds = selectOwnerChildIds(document, location.owner);
  if (ownerChildIds === undefined) {
    return notFound('Owner', getOwnerId(location.owner));
  }

  const groupChildSet = new Set(group.childIds);
  if (
    command.childFrames.length !== group.childIds.length ||
    command.childFrames.some((entry, index) => entry.elementId !== group.childIds[index])
  ) {
    return {
      ok: false,
      code: 'conflict',
      message: 'Ungroup child frames must follow the complete canonical group child order.',
    };
  }
  const originalChildFrames: GroupElementsCommand['childFrames'][number][] = [];
  for (const childId of group.childIds) {
    const child = document.elementsById[childId];
    const childLocation = locationIndex.get(childId);
    if (child === undefined) {
      return notFound('Element', childId);
    }
    if (
      childLocation?.owner.kind !== 'element' ||
      childLocation.owner.elementId !== command.groupId
    ) {
      return {
        ok: false,
        code: 'conflict',
        message: `Element '${childId}' is not canonically owned by group '${command.groupId}'.`,
      };
    }
    originalChildFrames.push({ elementId: childId, frame: child.frame });
  }

  const unaffectedIds = ownerChildIds.filter((elementId) => elementId !== command.groupId);
  const requestedGroupChildren = command.ownerChildIds.filter((id) => groupChildSet.has(id));
  const requestedUnaffectedIds = command.ownerChildIds.filter((id) => !groupChildSet.has(id));
  if (
    !areElementIdListsEqual(requestedGroupChildren, group.childIds) ||
    !areElementIdListsEqual(requestedUnaffectedIds, unaffectedIds) ||
    command.ownerChildIds.includes(command.groupId)
  ) {
    return {
      ok: false,
      code: 'conflict',
      message: 'Ungrouped owner order must preserve group-child and unaffected-sibling order.',
    };
  }

  const mutableElementsById: Record<string, ElementNode> = { ...document.elementsById };
  for (const [childIndex, childId] of group.childIds.entries()) {
    const child = document.elementsById[childId];
    if (child === undefined) {
      return notFound('Element', childId);
    }
    const targetFrame = command.childFrames[childIndex]?.frame;
    if (
      targetFrame === undefined ||
      !isTranslatedFrame(child.frame, targetFrame, group.frame.x, group.frame.y)
    ) {
      return {
        ok: false,
        code: 'conflict',
        message: `Ungrouping element '${childId}' must preserve its owner-local world geometry.`,
      };
    }
    mutableElementsById[childId] = Object.freeze({
      ...child,
      frame: targetFrame,
    });
  }
  delete mutableElementsById[command.groupId];
  const elementsById = Object.freeze(mutableElementsById);
  const ownerPatch = replaceOwnerChildren(
    document,
    location.owner,
    command.ownerChildIds,
    elementsById,
  );
  if ('ok' in ownerPatch) {
    return ownerPatch;
  }

  return {
    ok: true,
    changed: true,
    candidate: createElementRevision(document, ownerPatch),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.groupElements,
      childFrames: originalChildFrames,
      group,
      owner: location.owner,
      toIndex: location.index,
    },
    label: 'Ungroup elements',
  };
};

const applyReorderElement = (
  document: ProjectDocument,
  command: ReorderElementCommand,
): CommandApplication => {
  if (document.elementsById[command.elementId] === undefined) {
    return notFound('Element', command.elementId);
  }

  const location = selectElementLocation(
    document,
    command.elementId,
    createElementLocationIndex(document),
  );
  if (location === undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Element '${command.elementId}' has no canonical owner.`,
    };
  }
  const ownerChildIds = selectOwnerChildIds(document, location.owner);
  if (ownerChildIds === undefined) {
    return notFound('Owner', getOwnerId(location.owner));
  }
  if (command.toIndex >= ownerChildIds.length) {
    return {
      ok: false,
      code: 'out-of-range',
      message: `Element destination index ${String(command.toIndex)} exceeds ${String(ownerChildIds.length - 1)}.`,
    };
  }
  if (command.toIndex === location.index) {
    return { ok: true, changed: false, label: 'Reorder element' };
  }

  const childIds = [...ownerChildIds];
  childIds.splice(location.index, 1);
  childIds.splice(command.toIndex, 0, command.elementId);
  const ownerPatch = replaceOwnerChildren(document, location.owner, childIds);
  if ('ok' in ownerPatch) {
    return ownerPatch;
  }

  return {
    ok: true,
    changed: true,
    candidate: createElementRevision(document, ownerPatch),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.reorderElement,
      elementId: command.elementId,
      toIndex: location.index,
    },
    label: 'Reorder element',
  };
};

/** Replaces one owner's complete sibling order after proving it is a permutation. */
const applyReorderElementSiblings = (
  document: ProjectDocument,
  command: ReorderElementSiblingsCommand,
): CommandApplication => {
  const ownerChildIds = selectOwnerChildIds(document, command.owner);
  if (ownerChildIds === undefined) {
    return notFound('Owner', getOwnerId(command.owner));
  }
  if (
    command.childIds.length !== ownerChildIds.length ||
    command.childIds.some((elementId) => !ownerChildIds.includes(elementId))
  ) {
    return {
      ok: false,
      code: 'conflict',
      message: "Sibling reordering must preserve the owner's complete child set.",
    };
  }
  if (areElementIdListsEqual(command.childIds, ownerChildIds)) {
    return { ok: true, changed: false, label: 'Reorder elements' };
  }

  const ownerPatch = replaceOwnerChildren(document, command.owner, command.childIds);
  if ('ok' in ownerPatch) {
    return ownerPatch;
  }
  return {
    ok: true,
    changed: true,
    candidate: createElementRevision(document, ownerPatch),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.reorderElementSiblings,
      owner: command.owner,
      childIds: ownerChildIds,
    },
    label: 'Reorder elements',
  };
};

const applySetElementFrame = (
  document: ProjectDocument,
  command: SetElementFrameCommand,
): CommandApplication => {
  const element = document.elementsById[command.elementId];
  if (element === undefined) {
    return notFound('Element', command.elementId);
  }
  const previousFrame = element.frame;
  if (
    previousFrame.x === command.frame.x &&
    previousFrame.y === command.frame.y &&
    previousFrame.width === command.frame.width &&
    previousFrame.height === command.frame.height
  ) {
    return { ok: true, changed: false, label: 'Change element geometry' };
  }

  const updatedElement = Object.freeze({ ...element, frame: command.frame });
  return {
    ok: true,
    changed: true,
    candidate: createElementRevision(document, {
      elementsById: Object.freeze({
        ...document.elementsById,
        [command.elementId]: updatedElement,
      }),
    }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.setElementFrame,
      elementId: command.elementId,
      frame: previousFrame,
    },
    label: 'Change element geometry',
  };
};

const applySetElementLocked = (
  document: ProjectDocument,
  command: SetElementLockedCommand,
): CommandApplication => {
  const element = document.elementsById[command.elementId];
  if (element === undefined) {
    return notFound('Element', command.elementId);
  }
  if (element.locked === command.locked) {
    return { ok: true, changed: false, label: command.locked ? 'Lock element' : 'Unlock element' };
  }

  const updatedElement = Object.freeze({ ...element, locked: command.locked });
  return {
    ok: true,
    changed: true,
    candidate: createElementRevision(document, {
      elementsById: Object.freeze({
        ...document.elementsById,
        [command.elementId]: updatedElement,
      }),
    }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.setElementLocked,
      elementId: command.elementId,
      locked: element.locked,
    },
    label: command.locked ? 'Lock element' : 'Unlock element',
  };
};

const applySetElementProperties = (
  document: ProjectDocument,
  command: SetElementPropertiesCommand,
): CommandApplication => {
  const element = document.elementsById[command.elementId];
  if (element === undefined) {
    return notFound('Element', command.elementId);
  }
  if (areJsonValuesEqual(element.properties, command.properties)) {
    return { ok: true, changed: false, label: 'Edit element properties' };
  }

  const updatedElement = Object.freeze({ ...element, properties: command.properties });
  return {
    ok: true,
    changed: true,
    candidate: createElementRevision(document, {
      elementsById: Object.freeze({
        ...document.elementsById,
        [command.elementId]: updatedElement,
      }),
    }),
    inverse: {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: command.elementId,
      properties: element.properties,
    },
    label: 'Edit element properties',
  };
};

const assertNever = (command: never): never => {
  throw new Error(`Unhandled element command: ${JSON.stringify(command)}`);
};

export const applyElementCommand = (
  document: ProjectDocument,
  command: ElementCommand,
): CommandApplication => {
  switch (command.type) {
    case DOCUMENT_COMMAND_TYPES.createElement:
      return applyCreateElement(document, command);
    case DOCUMENT_COMMAND_TYPES.deleteElement:
      return applyDeleteElement(document, command);
    case DOCUMENT_COMMAND_TYPES.groupElements:
      return applyGroupElements(document, command);
    case DOCUMENT_COMMAND_TYPES.reorderElement:
      return applyReorderElement(document, command);
    case DOCUMENT_COMMAND_TYPES.reorderElementSiblings:
      return applyReorderElementSiblings(document, command);
    case DOCUMENT_COMMAND_TYPES.setElementFrame:
      return applySetElementFrame(document, command);
    case DOCUMENT_COMMAND_TYPES.setElementLocked:
      return applySetElementLocked(document, command);
    case DOCUMENT_COMMAND_TYPES.setElementProperties:
      return applySetElementProperties(document, command);
    case DOCUMENT_COMMAND_TYPES.ungroupElement:
      return applyUngroupElement(document, command);
    default:
      return assertNever(command);
  }
};
