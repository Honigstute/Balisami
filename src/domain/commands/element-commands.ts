import { getControlSpec } from '../controls/control-spec';
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
  type ReorderElementCommand,
  type SetElementFrameCommand,
  type SetElementPropertiesCommand,
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
    if (spec?.canOwnChildren !== true) {
      return {
        ok: false,
        code: 'conflict',
        message: `Element '${command.owner.elementId}' cannot own child elements.`,
      };
    }
  }
  if (getControlSpec(command.element.controlType) === undefined) {
    return {
      ok: false,
      code: 'conflict',
      message: `Control type '${command.element.controlType}' is not registered.`,
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
    case DOCUMENT_COMMAND_TYPES.reorderElement:
      return applyReorderElement(document, command);
    case DOCUMENT_COMMAND_TYPES.setElementFrame:
      return applySetElementFrame(document, command);
    case DOCUMENT_COMMAND_TYPES.setElementProperties:
      return applySetElementProperties(document, command);
    default:
      return assertNever(command);
  }
};
