import type { z } from 'zod';

import { ComponentInstancePropertiesSchema } from '../controls/component-instance';
import { CONTROL_TYPES, getControlSpec } from '../controls/control-spec';
import { parseCustomIconReference } from '../controls/custom-icon-reference';
import type { BoardId, ComponentId, ElementId } from './ids';
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
  reportDuplicates(document.trashedBoardIds, ['trashedBoardIds'], 'trashed board ID', addIssue);
  const activeIds = new Set<string>(document.boardIds);
  const canonicalIds = new Set<BoardId>([...document.boardIds, ...document.trashedBoardIds]);
  const alternateOwnerById = new Map<BoardId, BoardId>();

  document.boardIds.forEach((boardId, index) => {
    if (!hasOwn(document.boardsById, boardId)) {
      addIssue(['boardIds', index], `Board '${boardId}' does not exist in boardsById.`);
    }
  });
  document.trashedBoardIds.forEach((boardId, index) => {
    if (!hasOwn(document.boardsById, boardId)) {
      addIssue(
        ['trashedBoardIds', index],
        `Trashed board '${boardId}' does not exist in boardsById.`,
      );
    }
    if (activeIds.has(boardId)) {
      addIssue(['trashedBoardIds', index], `Board '${boardId}' cannot be both active and trashed.`);
    }
  });

  for (const canonicalId of canonicalIds) {
    const board = document.boardsById[canonicalId];
    if (board === undefined) {
      continue;
    }
    reportDuplicates(
      board.alternateIds,
      ['boardsById', canonicalId, 'alternateIds'],
      'alternate ID',
      addIssue,
    );
    board.alternateIds.forEach((alternateId, index) => {
      if (canonicalIds.has(alternateId)) {
        addIssue(
          ['boardsById', canonicalId, 'alternateIds', index],
          `Alternate '${alternateId}' cannot also be a canonical board.`,
        );
      }
      const existingOwner = alternateOwnerById.get(alternateId);
      if (existingOwner !== undefined && existingOwner !== canonicalId) {
        addIssue(
          ['boardsById', canonicalId, 'alternateIds', index],
          `Alternate '${alternateId}' is already owned by canonical board '${existingOwner}'.`,
        );
      } else {
        alternateOwnerById.set(alternateId, canonicalId);
      }
      if (!hasOwn(document.boardsById, alternateId)) {
        addIssue(
          ['boardsById', canonicalId, 'alternateIds', index],
          `Alternate board '${alternateId}' does not exist in boardsById.`,
        );
      }
    });
    if (
      board.selectedAlternateId !== null &&
      !board.alternateIds.includes(board.selectedAlternateId)
    ) {
      addIssue(
        ['boardsById', canonicalId, 'selectedAlternateId'],
        `Selected alternate '${board.selectedAlternateId}' is not owned by canonical board '${canonicalId}'.`,
      );
    }
  }

  for (const [key, board] of Object.entries(document.boardsById)) {
    if (board.id !== key) {
      addIssue(
        ['boardsById', key, 'id'],
        `Board map key '${key}' does not match record ID '${board.id}'.`,
      );
    }
    const boardMapId = key as BoardId;
    const alternateOwner = alternateOwnerById.get(boardMapId);
    if (!canonicalIds.has(boardMapId) && alternateOwner === undefined) {
      addIssue(
        ['boardsById', key],
        `Board map key '${key}' is not canonical or owned as an alternate.`,
      );
    }
    if (alternateOwner !== undefined) {
      if (board.alternateIds.length > 0) {
        addIssue(
          ['boardsById', key, 'alternateIds'],
          `Alternate board '${key}' cannot own nested alternates.`,
        );
      }
      if (board.selectedAlternateId !== null) {
        addIssue(
          ['boardsById', key, 'selectedAlternateId'],
          `Alternate board '${key}' cannot select another alternate.`,
        );
      }
    }
  }
};

const validateOrderedComponents = (document: ProjectDocumentShape, addIssue: AddIssue): void => {
  reportDuplicates(document.componentIds, ['componentIds'], 'component ID', addIssue);
  const orderedIds = new Set<ComponentId>(document.componentIds);

  document.componentIds.forEach((componentId, index) => {
    if (!hasOwn(document.componentsById, componentId)) {
      addIssue(
        ['componentIds', index],
        `Component '${componentId}' does not exist in componentsById.`,
      );
    }
  });

  for (const [key, component] of Object.entries(document.componentsById)) {
    if (component.id !== key) {
      addIssue(
        ['componentsById', key, 'id'],
        `Component map key '${key}' does not match record ID '${component.id}'.`,
      );
    }
    if (!orderedIds.has(key as ComponentId)) {
      addIssue(
        ['componentsById', key],
        `Component map key '${key}' is not listed in componentIds.`,
      );
    }

    const root = document.elementsById[component.rootElementId];
    if (root === undefined) {
      addIssue(
        ['componentsById', key, 'rootElementId'],
        `Component root '${component.rootElementId}' does not exist.`,
      );
      continue;
    }
    if (getControlSpec(root.controlType)?.capabilities.grouping !== 'container') {
      addIssue(
        ['componentsById', key, 'rootElementId'],
        `Component root '${component.rootElementId}' must be a container.`,
      );
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
  const canonicalBoardIds = new Set<BoardId>([...document.boardIds, ...document.trashedBoardIds]);
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

    if (element.link?.kind === 'board' && !canonicalBoardIds.has(element.link.boardId)) {
      addIssue(
        ['elementsById', elementKey, 'link', 'boardId'],
        `Linked canonical board '${element.link.boardId}' does not exist.`,
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

    for (const section of spec.inspector) {
      for (const field of section.fields) {
        if (field.kind !== 'icon') {
          continue;
        }
        const customAssetId = parseCustomIconReference(element.properties[field.property]);
        if (customAssetId === undefined) {
          continue;
        }
        const asset = document.assetsById[customAssetId];
        if (asset === undefined) {
          addIssue(
            ['elementsById', elementKey, 'properties', field.property],
            `Custom icon asset '${customAssetId}' does not exist.`,
          );
        } else if (!asset.mediaType.startsWith('image/')) {
          addIssue(
            ['elementsById', elementKey, 'properties', field.property],
            `Custom icon asset '${customAssetId}' is not an image.`,
          );
        }
        if (!element.assetIds.includes(customAssetId)) {
          addIssue(
            ['elementsById', elementKey, 'assetIds'],
            `Custom icon asset '${customAssetId}' must be owned by the element.`,
          );
        }
      }
    }
  }
};

const collectElementSubtreeIds = (
  document: ProjectDocumentShape,
  rootElementId: ElementId,
): ReadonlySet<ElementId> => {
  const ids = new Set<ElementId>();
  const visit = (elementId: ElementId): void => {
    if (ids.has(elementId)) {
      return;
    }
    ids.add(elementId);
    document.elementsById[elementId]?.childIds.forEach(visit);
  };
  visit(rootElementId);
  return ids;
};

const validateComponentInstances = (document: ProjectDocumentShape, addIssue: AddIssue): void => {
  for (const [elementKey, element] of Object.entries(document.elementsById)) {
    if (element.controlType !== CONTROL_TYPES.componentInstance) {
      continue;
    }
    if (element.childIds.length > 0) {
      addIssue(
        ['elementsById', elementKey, 'childIds'],
        'Component instances cannot own persisted child elements.',
      );
    }

    const parsed = ComponentInstancePropertiesSchema.safeParse(element.properties);
    if (!parsed.success) {
      continue;
    }
    const definition = document.componentsById[parsed.data.componentId];
    if (definition === undefined) {
      addIssue(
        ['elementsById', elementKey, 'properties', 'componentId'],
        `Component '${parsed.data.componentId}' does not exist.`,
      );
      continue;
    }
    const definitionElementIds = collectElementSubtreeIds(document, definition.rootElementId);
    for (const [targetId, override] of Object.entries(parsed.data.overrides)) {
      const targetElementId = targetId as ElementId;
      const target = document.elementsById[targetElementId];
      if (!definitionElementIds.has(targetElementId) || target === undefined) {
        addIssue(
          ['elementsById', elementKey, 'properties', 'overrides', targetId],
          `Override target '${targetId}' is not owned by component '${definition.id}'.`,
        );
        continue;
      }
      if (
        target.controlType === CONTROL_TYPES.componentInstance &&
        (hasOwn(override, 'componentId') || hasOwn(override, 'overrides'))
      ) {
        addIssue(
          ['elementsById', elementKey, 'properties', 'overrides', targetId],
          'Nested component references and override maps cannot be overridden.',
        );
        continue;
      }

      const targetSpec = getControlSpec(target.controlType);
      if (targetSpec === undefined) {
        continue;
      }
      const mergedProperties = Object.freeze({ ...target.properties, ...override });
      const merged = targetSpec.propertiesSchema.safeParse(mergedProperties);
      if (!merged.success) {
        for (const issue of merged.error.issues) {
          addIssue(
            [
              'elementsById',
              elementKey,
              'properties',
              'overrides',
              targetId,
              ...issue.path.map(String),
            ],
            issue.message,
          );
        }
        continue;
      }

      for (const field of targetSpec.inspector.flatMap((section) => section.fields)) {
        if (field.kind !== 'icon') {
          continue;
        }
        const customAssetId = parseCustomIconReference(mergedProperties[field.property]);
        if (customAssetId === undefined) {
          continue;
        }
        const asset = document.assetsById[customAssetId];
        if (asset === undefined || !asset.mediaType.startsWith('image/')) {
          addIssue(
            ['elementsById', elementKey, 'properties', 'overrides', targetId, field.property],
            `Custom icon asset '${customAssetId}' must be an existing image.`,
          );
        }
        if (!target.assetIds.includes(customAssetId) && !element.assetIds.includes(customAssetId)) {
          addIssue(
            ['elementsById', elementKey, 'assetIds'],
            `Override custom icon asset '${customAssetId}' must be owned by the instance or definition element.`,
          );
        }
      }
    }
  }
};

const validateAcyclicComponentGraph = (
  document: ProjectDocumentShape,
  addIssue: AddIssue,
): void => {
  const edgesByComponent = new Map<
    ComponentId,
    readonly Readonly<{ elementId: ElementId; targetId: ComponentId }>[]
  >();
  for (const componentId of document.componentIds) {
    const definition = document.componentsById[componentId];
    if (definition === undefined) {
      continue;
    }
    const edges = [...collectElementSubtreeIds(document, definition.rootElementId)].flatMap(
      (elementId) => {
        const element = document.elementsById[elementId];
        if (element?.controlType !== CONTROL_TYPES.componentInstance) {
          return [];
        }
        const properties = ComponentInstancePropertiesSchema.safeParse(element.properties);
        return properties.success &&
          document.componentsById[properties.data.componentId] !== undefined
          ? [Object.freeze({ elementId, targetId: properties.data.componentId })]
          : [];
      },
    );
    edgesByComponent.set(componentId, Object.freeze(edges));
  }

  const visited = new Set<ComponentId>();
  const active = new Set<ComponentId>();
  const visit = (componentId: ComponentId): void => {
    if (visited.has(componentId)) {
      return;
    }
    active.add(componentId);
    for (const edge of edgesByComponent.get(componentId) ?? []) {
      if (active.has(edge.targetId)) {
        addIssue(
          ['elementsById', edge.elementId, 'properties', 'componentId'],
          `Component hierarchy contains a cycle through '${edge.targetId}'.`,
        );
        continue;
      }
      visit(edge.targetId);
    }
    active.delete(componentId);
    visited.add(componentId);
  };
  document.componentIds.forEach(visit);
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

  for (const component of Object.values(document.componentsById)) {
    if (hasOwn(document.elementsById, component.rootElementId)) {
      addOwner(component.rootElementId, `component '${component.id}'`);
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
      addIssue(['elementsById', elementKey], `Element '${element.id}' has no canonical owner.`);
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
  validateOrderedComponents(document, addIssue);
  validateMapIdentity(document, addIssue);
  validateControlCapabilities(document, addIssue);
  validateElementReferences(document, addIssue);
  validateComponentInstances(document, addIssue);
  validateOwnership(document, addIssue);
  validateAcyclicElementTree(document, addIssue);
  validateAcyclicComponentGraph(document, addIssue);
};
