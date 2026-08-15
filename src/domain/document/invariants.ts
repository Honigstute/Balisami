import type { z } from 'zod';

import { getControlSpec } from '../controls/control-spec';
import type { ElementId } from './ids';
import type { ProjectDocumentShape } from './schema';

type IssuePath = readonly (number | string)[];
type AddIssue = (path: IssuePath, message: string) => void;

const hasOwn = (record: object, key: PropertyKey): boolean => Object.hasOwn(record, key);

const reportDuplicates = (
  ids: readonly string[],
  path: IssuePath,
  noun: string,
  addIssue: AddIssue,
): void => {
  const firstIndexById = new Map<string, number>();

  ids.forEach((id, index) => {
    const firstIndex = firstIndexById.get(id);
    if (firstIndex === undefined) {
      firstIndexById.set(id, index);
      return;
    }

    addIssue(
      [...path, index],
      `Duplicate ${noun} '${id}'; first listed at index ${String(firstIndex)}.`,
    );
  });
};

const validateOrderedBoards = (document: ProjectDocumentShape, addIssue: AddIssue): void => {
  reportDuplicates(document.boardIds, ['boardIds'], 'board ID', addIssue);
  const orderedIds = new Set<string>(document.boardIds);

  document.boardIds.forEach((boardId, index) => {
    if (!hasOwn(document.boardsById, boardId)) {
      addIssue(['boardIds', index], `Board '${boardId}' does not exist in boardsById.`);
    }
  });

  for (const [key, board] of Object.entries(document.boardsById)) {
    if (board.id !== key) {
      addIssue(
        ['boardsById', key, 'id'],
        `Board map key '${key}' does not match record ID '${board.id}'.`,
      );
    }
    if (!orderedIds.has(key)) {
      addIssue(['boardsById', key], `Board map key '${key}' is not present in boardIds.`);
    }
  }
};

const validateMapIdentity = (document: ProjectDocumentShape, addIssue: AddIssue): void => {
  for (const [key, element] of Object.entries(document.elementsById)) {
    if (element.id !== key) {
      addIssue(
        ['elementsById', key, 'id'],
        `Element map key '${key}' does not match record ID '${element.id}'.`,
      );
    }
  }

  for (const [key, asset] of Object.entries(document.assetsById)) {
    if (asset.id !== key) {
      addIssue(
        ['assetsById', key, 'id'],
        `Asset map key '${key}' does not match record ID '${asset.id}'.`,
      );
    }
  }
};

const validateElementReferences = (document: ProjectDocumentShape, addIssue: AddIssue): void => {
  for (const [elementKey, element] of Object.entries(document.elementsById)) {
    reportDuplicates(
      element.childIds,
      ['elementsById', elementKey, 'childIds'],
      'child ID',
      addIssue,
    );
    reportDuplicates(
      element.assetIds,
      ['elementsById', elementKey, 'assetIds'],
      'asset ID',
      addIssue,
    );

    element.childIds.forEach((childId, index) => {
      if (!hasOwn(document.elementsById, childId)) {
        addIssue(
          ['elementsById', elementKey, 'childIds', index],
          `Child element '${childId}' does not exist.`,
        );
      }
    });

    element.assetIds.forEach((assetId, index) => {
      if (!hasOwn(document.assetsById, assetId)) {
        addIssue(
          ['elementsById', elementKey, 'assetIds', index],
          `Asset '${assetId}' does not exist.`,
        );
      }
    });

    if (element.link?.kind === 'board' && !hasOwn(document.boardsById, element.link.boardId)) {
      addIssue(
        ['elementsById', elementKey, 'link', 'boardId'],
        `Linked board '${element.link.boardId}' does not exist.`,
      );
    }
  }
};

const validateControlCapabilities = (document: ProjectDocumentShape, addIssue: AddIssue): void => {
  for (const [elementKey, element] of Object.entries(document.elementsById)) {
    const spec = getControlSpec(element.controlType);
    if (spec === undefined) {
      addIssue(
        ['elementsById', elementKey, 'controlType'],
        `Unknown control type '${element.controlType}'.`,
      );
      continue;
    }

    if (spec.capabilities.grouping !== 'container' && element.childIds.length > 0) {
      addIssue(
        ['elementsById', elementKey, 'childIds'],
        `Control type '${element.controlType}' cannot own child elements.`,
      );
    }

    if (element.controlVersion !== spec.fileVersion) {
      addIssue(
        ['elementsById', elementKey, 'controlVersion'],
        `Control type '${element.controlType}' must use current property version ${String(spec.fileVersion)}.`,
      );
    }

    const properties = spec.propertiesSchema.safeParse(element.properties);
    if (!properties.success) {
      for (const issue of properties.error.issues) {
        addIssue(
          ['elementsById', elementKey, 'properties', ...issue.path.map(String)],
          issue.message,
        );
      }
    }
  }
};

const validateOwnership = (document: ProjectDocumentShape, addIssue: AddIssue): void => {
  const ownersByElement = new Map<ElementId, string[]>();

  const addOwner = (childId: ElementId, owner: string): void => {
    const owners = ownersByElement.get(childId) ?? [];
    owners.push(owner);
    ownersByElement.set(childId, owners);
  };

  for (const [boardKey, board] of Object.entries(document.boardsById)) {
    reportDuplicates(board.childIds, ['boardsById', boardKey, 'childIds'], 'child ID', addIssue);
    board.childIds.forEach((childId, index) => {
      if (!hasOwn(document.elementsById, childId)) {
        addIssue(
          ['boardsById', boardKey, 'childIds', index],
          `Child element '${childId}' does not exist.`,
        );
      }
    });
    for (const childId of new Set(board.childIds)) {
      if (hasOwn(document.elementsById, childId)) {
        addOwner(childId, `board '${board.id}'`);
      }
    }
  }

  for (const element of Object.values(document.elementsById)) {
    for (const childId of new Set(element.childIds)) {
      if (hasOwn(document.elementsById, childId)) {
        addOwner(childId, `element '${element.id}'`);
      }
    }
  }

  for (const [elementKey, element] of Object.entries(document.elementsById)) {
    const owners = ownersByElement.get(element.id) ?? [];
    if (owners.length === 0) {
      addIssue(
        ['elementsById', elementKey],
        `Element '${element.id}' has no board or element owner.`,
      );
    } else if (owners.length > 1) {
      addIssue(
        ['elementsById', elementKey],
        `Element '${element.id}' has multiple owners: ${owners.join(', ')}.`,
      );
    }
  }
};

const validateAcyclicElementTree = (document: ProjectDocumentShape, addIssue: AddIssue): void => {
  const visited = new Set<ElementId>();
  const active = new Set<ElementId>();

  const visit = (elementId: ElementId): void => {
    if (visited.has(elementId) || !hasOwn(document.elementsById, elementId)) {
      return;
    }
    if (active.has(elementId)) {
      return;
    }

    active.add(elementId);
    const element = document.elementsById[elementId];
    if (element !== undefined) {
      element.childIds.forEach((childId, index) => {
        if (active.has(childId)) {
          addIssue(
            ['elementsById', elementId, 'childIds', index],
            `Element hierarchy contains a cycle through '${childId}'.`,
          );
          return;
        }
        visit(childId);
      });
    }
    active.delete(elementId);
    visited.add(elementId);
  };

  for (const element of Object.values(document.elementsById)) {
    visit(element.id);
  }
};

export const addProjectDocumentInvariantIssues = (
  document: ProjectDocumentShape,
  context: z.RefinementCtx,
): void => {
  const addIssue: AddIssue = (path, message) => {
    context.addIssue({ code: 'custom', path: [...path], message });
  };

  validateOrderedBoards(document, addIssue);
  validateMapIdentity(document, addIssue);
  validateControlCapabilities(document, addIssue);
  validateElementReferences(document, addIssue);
  validateOwnership(document, addIssue);
  validateAcyclicElementTree(document, addIssue);
};
