import { z } from 'zod';

import {
  AssetIdSchema,
  AssetReferenceSchema,
  BoardIdSchema,
  ComponentDefinitionSchema,
  ComponentIdSchema,
  ComponentInstancePropertiesSchema,
  CONTROL_TYPES,
  CreateAssetCommandSchema,
  CreateComponentCommandSchema,
  CreateElementCommandSchema,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  ElementNodeSchema,
  MAX_HISTORY_TRANSACTION_COMMANDS,
  ProjectIdSchema,
  createCustomIconReference,
  getControlAccessibleName,
  getControlSpec,
  parseCustomIconReference,
  rekeyControlRowState,
  selectBoardElementIds,
  selectElementLockState,
  selectElementWorldBounds,
  type AssetId,
  type BoardId,
  type ComponentDefinition,
  type ComponentId,
  type CreateAssetCommand,
  type CreateComponentCommand,
  type CreateElementCommand,
  type DocumentCommand,
  type ElementId,
  type ElementLink,
  type ElementLocationIndex,
  type ElementNode,
  type ElementProperties,
  type ProjectDocument,
} from '../../domain';
import { DESKTOP_CLIPBOARD_LIMITS, type ProjectAssetBytes } from '../../shared/desktop-api';
import { SELECTION_CLIPBOARD_POLICY } from './selection-clipboard';
import type { SelectionDuplicateIdAllocator } from './selection-duplicate';
import { resolveSelectionRoots } from './selection-roots';

export const PORTABLE_SELECTION_GRAPH_FORMAT_VERSION = 3 as const;

const PortableGraphAssetSchema = z
  .strictObject({
    bytesBase64: z.string().min(1).max(DESKTOP_CLIPBOARD_LIMITS.payloadCharacters),
    reference: AssetReferenceSchema,
  })
  .readonly();

const PortableComponentSchema = z
  .strictObject({
    component: ComponentDefinitionSchema,
    elements: z.array(ElementNodeSchema).min(1).max(MAX_HISTORY_TRANSACTION_COMMANDS).readonly(),
  })
  .readonly();

export const PortableSelectionGraphPayloadSchema = z
  .strictObject({
    assets: z.array(PortableGraphAssetSchema).readonly(),
    components: z.array(PortableComponentSchema).max(MAX_HISTORY_TRANSACTION_COMMANDS).readonly(),
    elements: z.array(ElementNodeSchema).min(1).max(MAX_HISTORY_TRANSACTION_COMMANDS).readonly(),
    formatVersion: z.literal(PORTABLE_SELECTION_GRAPH_FORMAT_VERSION),
    kind: z.enum(['copy', 'cut']),
    primaryRootId: ElementIdSchema,
    projectId: ProjectIdSchema,
    rootIds: z.array(ElementIdSchema).min(1).max(MAX_HISTORY_TRANSACTION_COMMANDS).readonly(),
    sourceBoardId: BoardIdSchema,
  })
  .superRefine((payload, context) => {
    const selectionIds = payload.elements.map((element) => element.id);
    const componentIds = payload.components.map(({ component }) => component.id);
    const componentElementIds = payload.components.flatMap(({ elements }) =>
      elements.map((element) => element.id),
    );
    const allElementIds = [...selectionIds, ...componentElementIds];
    const referencedAssetIds = new Set(
      [...payload.elements, ...payload.components.flatMap(({ elements }) => elements)].flatMap(
        (element) => element.assetIds,
      ),
    );
    const payloadAssetIds = payload.assets.map(({ reference }) => reference.id);
    if (
      new Set(selectionIds).size !== selectionIds.length ||
      new Set(componentIds).size !== componentIds.length ||
      new Set(allElementIds).size !== allElementIds.length ||
      new Set(payload.rootIds).size !== payload.rootIds.length ||
      payload.rootIds.some((id) => !selectionIds.includes(id)) ||
      !payload.rootIds.includes(payload.primaryRootId)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Portable selection graph identities must be unique and internally complete.',
        path: ['elements'],
      });
    }
    if (
      new Set(payloadAssetIds).size !== payloadAssetIds.length ||
      referencedAssetIds.size !== payloadAssetIds.length ||
      payloadAssetIds.some((id) => !referencedAssetIds.has(id))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Portable graph assets must exactly match its element references.',
        path: ['assets'],
      });
    }
    for (const entry of payload.components) {
      if (!entry.elements.some((element) => element.id === entry.component.rootElementId)) {
        context.addIssue({
          code: 'custom',
          message: 'Portable component elements must contain their declared root.',
          path: ['components'],
        });
      }
    }
  })
  .readonly();

export type PortableSelectionGraphPayload = z.infer<typeof PortableSelectionGraphPayloadSchema>;

export type PortableComponentIdAllocator = (
  sourceComponentId: ComponentId,
  sourceIndex: number,
) => ComponentId | undefined;

export interface PortableSelectionGraphPastePlan {
  readonly additions: ProjectAssetBytes;
  readonly cloneIds: readonly ElementId[];
  readonly commands: readonly DocumentCommand[];
  readonly primaryCloneId: ElementId;
}

const encodeBytes = (bytes: Uint8Array): string => {
  const chunkSize = 24 * 1_024;
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    encoded += globalThis.btoa(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return encoded;
};

const decodeBytes = (value: string): Uint8Array | undefined => {
  try {
    const decoded = globalThis.atob(value);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
};

const collectSubtree = (
  document: ProjectDocument,
  rootId: ElementId,
): readonly ElementNode[] | undefined => {
  const result: ElementNode[] = [];
  const visited = new Set<ElementId>();
  const visit = (id: ElementId): boolean => {
    if (visited.has(id)) return false;
    const element = document.elementsById[id];
    if (element === undefined) return false;
    visited.add(id);
    result.push(element);
    return element.childIds.every(visit);
  };
  return visit(rootId) ? Object.freeze(result) : undefined;
};

const resolveRootBoardId = (
  rootId: ElementId,
  locations: ElementLocationIndex,
): BoardId | undefined => {
  const visited = new Set<ElementId>();
  let currentId = rootId;
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const location = locations.get(currentId);
    if (location === undefined) return undefined;
    if (location.owner.kind === 'board') return location.owner.boardId;
    currentId = location.owner.elementId;
  }
  return undefined;
};

const parseInstanceComponentId = (element: ElementNode): ComponentId | undefined => {
  if (element.controlType !== CONTROL_TYPES.componentInstance) return undefined;
  const parsed = ComponentInstancePropertiesSchema.safeParse(element.properties);
  return parsed.success ? parsed.data.componentId : undefined;
};

/** Captures complete selected trees and every transitively referenced component definition. */
export const capturePortableSelectionGraph = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
  primaryId: ElementId | undefined,
  kind: PortableSelectionGraphPayload['kind'],
  readAssetBytes: (assetId: AssetId) => Uint8Array | undefined,
): PortableSelectionGraphPayload | undefined => {
  if (primaryId === undefined) return undefined;
  const roots = resolveSelectionRoots(document, selectedIds);
  if (roots === undefined || !roots.selectedIds.includes(primaryId)) return undefined;
  const sourceBoardIds = new Set(
    roots.rootIds.map((rootId) => resolveRootBoardId(rootId, roots.locations)),
  );
  const sourceBoardId = [...sourceBoardIds][0];
  const boardOrder =
    sourceBoardId === undefined ? undefined : selectBoardElementIds(document, sourceBoardId);
  if (
    sourceBoardIds.size !== 1 ||
    sourceBoardId === undefined ||
    boardOrder === undefined ||
    roots.rootIds.some(
      (rootId) =>
        selectElementLockState(document, rootId, roots.locations)?.effectivelyLocked !== false,
    )
  ) {
    return undefined;
  }
  const rootSet = new Set(roots.rootIds);
  const rootIds = boardOrder.filter((id) => rootSet.has(id));
  if (rootIds.length !== roots.rootIds.length) return undefined;

  let primaryRootId = primaryId;
  const visitedPrimary = new Set<ElementId>();
  while (!rootSet.has(primaryRootId) && !visitedPrimary.has(primaryRootId)) {
    visitedPrimary.add(primaryRootId);
    const location = roots.locations.get(primaryRootId);
    if (location?.owner.kind !== 'element') return undefined;
    primaryRootId = location.owner.elementId;
  }
  if (!rootSet.has(primaryRootId)) return undefined;

  const selectedElements: ElementNode[] = [];
  for (const rootId of rootIds) {
    const subtree = collectSubtree(document, rootId);
    const worldFrame = selectElementWorldBounds(document, rootId, roots.locations);
    if (subtree === undefined || worldFrame === undefined) return undefined;
    selectedElements.push(
      ...subtree.map((element, index) =>
        index === 0 ? Object.freeze({ ...element, frame: worldFrame }) : element,
      ),
    );
  }

  const componentEntries: Array<{
    readonly component: ComponentDefinition;
    readonly elements: readonly ElementNode[];
  }> = [];
  const visitedComponents = new Set<ComponentId>();
  const visitingComponents = new Set<ComponentId>();
  const visitComponent = (componentId: ComponentId): boolean => {
    if (visitedComponents.has(componentId)) return true;
    if (visitingComponents.has(componentId)) return false;
    const component = document.componentsById[componentId];
    const elements =
      component === undefined ? undefined : collectSubtree(document, component.rootElementId);
    if (component === undefined || elements === undefined) return false;
    visitingComponents.add(componentId);
    for (const element of elements) {
      const nestedId = parseInstanceComponentId(element);
      if (nestedId !== undefined && !visitComponent(nestedId)) return false;
    }
    visitingComponents.delete(componentId);
    visitedComponents.add(componentId);
    componentEntries.push(Object.freeze({ component, elements }));
    return true;
  };
  for (const element of selectedElements) {
    const componentId = parseInstanceComponentId(element);
    if (componentId !== undefined && !visitComponent(componentId)) return undefined;
  }

  const allElements = [
    ...selectedElements,
    ...componentEntries.flatMap(({ elements }) => elements),
  ];
  const assetIds = [...new Set(allElements.flatMap((element) => element.assetIds))];
  const maximumRawAssetBytes = Math.floor((DESKTOP_CLIPBOARD_LIMITS.payloadCharacters * 3) / 4);
  const rawAssetBytes = assetIds.reduce(
    (total, assetId) =>
      total + (document.assetsById[assetId]?.byteLength ?? maximumRawAssetBytes + 1),
    0,
  );
  if (!Number.isSafeInteger(rawAssetBytes) || rawAssetBytes > maximumRawAssetBytes)
    return undefined;
  const assets = assetIds.map((assetId) => {
    const reference = document.assetsById[assetId];
    const bytes = readAssetBytes(assetId);
    return reference === undefined ||
      bytes === undefined ||
      bytes.byteLength !== reference.byteLength
      ? undefined
      : Object.freeze({ bytesBase64: encodeBytes(bytes), reference });
  });
  if (assets.some((asset) => asset === undefined)) return undefined;

  const parsed = PortableSelectionGraphPayloadSchema.safeParse({
    assets,
    components: componentEntries,
    elements: selectedElements,
    formatVersion: PORTABLE_SELECTION_GRAPH_FORMAT_VERSION,
    kind,
    primaryRootId,
    projectId: document.id,
    rootIds,
    sourceBoardId,
  });
  return parsed.success ? parsed.data : undefined;
};

export const serializePortableSelectionGraph = (
  payload: PortableSelectionGraphPayload,
): string | undefined => {
  const serialized = JSON.stringify(payload);
  return serialized.length <= DESKTOP_CLIPBOARD_LIMITS.payloadCharacters ? serialized : undefined;
};

export const parsePortableSelectionGraph = (
  serialized: unknown,
): PortableSelectionGraphPayload | undefined => {
  if (
    typeof serialized !== 'string' ||
    serialized.length === 0 ||
    serialized.length > DESKTOP_CLIPBOARD_LIMITS.payloadCharacters
  ) {
    return undefined;
  }
  try {
    const parsed = PortableSelectionGraphPayloadSchema.safeParse(JSON.parse(serialized));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const createPortableSelectionGraphPlainText = (
  payload: PortableSelectionGraphPayload,
): string => {
  const elementsById = new Map(payload.elements.map((element) => [element.id, element]));
  return payload.rootIds
    .flatMap((id) => {
      const element = elementsById.get(id);
      const definition = element === undefined ? undefined : getControlSpec(element.controlType);
      return element === undefined
        ? []
        : [
            definition === undefined
              ? element.controlType
              : getControlAccessibleName(definition, element.properties),
          ];
    })
    .join('\n')
    .slice(0, DESKTOP_CLIPBOARD_LIMITS.textCharacters);
};

const assetContentKey = (reference: {
  readonly byteLength: number;
  readonly mediaType: string;
  readonly sha256: string;
}): string => `${reference.sha256}:${reference.mediaType}:${String(reference.byteLength)}`;

const remapLink = (
  link: ElementLink | null,
  sourceBoardId: BoardId,
  targetBoardId: BoardId,
): ElementLink | null => {
  if (link === null || link.kind === 'external') return link;
  return link.boardId === sourceBoardId
    ? Object.freeze({ boardId: targetBoardId, kind: 'board' as const })
    : null;
};

const validateForest = (
  elements: readonly ElementNode[],
  rootIds: readonly ElementId[],
): ReadonlyMap<ElementId, ElementNode> | undefined => {
  const byId = new Map(elements.map((element) => [element.id, element]));
  if (byId.size !== elements.length) return undefined;
  const ordered: ElementId[] = [];
  const visited = new Set<ElementId>();
  const visit = (id: ElementId): boolean => {
    if (visited.has(id)) return false;
    const element = byId.get(id);
    if (element === undefined) return false;
    visited.add(id);
    ordered.push(id);
    return element.childIds.every(visit);
  };
  if (!rootIds.every(visit) || visited.size !== elements.length) return undefined;
  return ordered.every((id, index) => id === elements[index]?.id) ? byId : undefined;
};

const remapIconProperties = (
  properties: ElementProperties,
  definition: NonNullable<ReturnType<typeof getControlSpec>>,
  assetIdBySource: ReadonlyMap<AssetId, AssetId>,
): ElementProperties | undefined => {
  const remapped = { ...properties };
  for (const section of definition.inspector) {
    for (const field of section.fields) {
      if (field.kind !== 'icon') continue;
      const sourceAssetId = parseCustomIconReference(remapped[field.property]);
      const targetAssetId =
        sourceAssetId === undefined ? undefined : assetIdBySource.get(sourceAssetId);
      if (sourceAssetId !== undefined && targetAssetId === undefined) return undefined;
      if (targetAssetId !== undefined) {
        remapped[field.property] = createCustomIconReference(targetAssetId);
      }
    }
  }
  return Object.freeze(remapped);
};

const remapElement = (
  source: ElementNode,
  targetId: ElementId,
  targetChildIds: readonly ElementId[],
  sourceElementsById: ReadonlyMap<ElementId, ElementNode>,
  elementIdBySource: ReadonlyMap<ElementId, ElementId>,
  assetIdBySource: ReadonlyMap<AssetId, AssetId>,
  componentIdBySource: ReadonlyMap<ComponentId, ComponentId>,
  sourceBoardId: BoardId,
  targetBoardId: BoardId,
): ElementNode | undefined => {
  const definition = getControlSpec(source.controlType);
  if (definition === undefined || source.assetIds.some((id) => !assetIdBySource.has(id))) {
    return undefined;
  }
  let properties = remapIconProperties(source.properties, definition, assetIdBySource);
  if (properties === undefined) return undefined;
  if (source.controlType === CONTROL_TYPES.componentInstance) {
    const instance = ComponentInstancePropertiesSchema.safeParse(properties);
    if (!instance.success) return undefined;
    const componentId = componentIdBySource.get(instance.data.componentId);
    if (componentId === undefined) return undefined;
    const overrides: Record<string, ElementProperties> = Object.create(null) as Record<
      string,
      ElementProperties
    >;
    for (const [sourceElementId, override] of Object.entries(instance.data.overrides)) {
      const targetElementId = elementIdBySource.get(ElementIdSchema.parse(sourceElementId));
      const sourceElement = sourceElementsById.get(ElementIdSchema.parse(sourceElementId));
      const overrideDefinition =
        sourceElement === undefined ? undefined : getControlSpec(sourceElement.controlType);
      const remappedOverride =
        overrideDefinition === undefined
          ? undefined
          : remapIconProperties(override, overrideDefinition, assetIdBySource);
      if (targetElementId === undefined || remappedOverride === undefined) return undefined;
      overrides[targetElementId] = remappedOverride;
    }
    properties = Object.freeze({ componentId, overrides: Object.freeze(overrides) });
  }
  const rowData = Object.freeze({
    ...source.rowData,
    bindings: Object.freeze(
      source.rowData.bindings.map((binding) =>
        Object.freeze({
          ...binding,
          link: remapLink(binding.link, sourceBoardId, targetBoardId),
        }),
      ),
    ),
  });
  const rowState = rekeyControlRowState(definition, properties, rowData, targetId);
  if (rowState === undefined) return undefined;
  const assetIds = Object.freeze([
    ...new Set(
      source.assetIds.flatMap((id) => {
        const targetAssetId = assetIdBySource.get(id);
        return targetAssetId === undefined ? [] : [targetAssetId];
      }),
    ),
  ]);
  const parsed = ElementNodeSchema.safeParse({
    ...source,
    assetIds,
    childIds: targetChildIds,
    id: targetId,
    link: remapLink(source.link, sourceBoardId, targetBoardId),
    properties: rowState.properties,
    rowData: rowState.rowData,
  });
  return parsed.success ? parsed.data : undefined;
};

/** Plans one atomic import of a complete, untrusted portable graph. */
export const planPortableSelectionGraphPaste = (
  document: ProjectDocument,
  payloadInput: unknown,
  targetBoardId: BoardId,
  pasteCount: number,
  allocateElementId: SelectionDuplicateIdAllocator,
  allocateAssetId: (sourceAssetId: AssetId, sourceIndex: number) => AssetId | undefined,
  allocateComponentId: PortableComponentIdAllocator,
): PortableSelectionGraphPastePlan | undefined => {
  const parsed = PortableSelectionGraphPayloadSchema.safeParse(payloadInput);
  const targetBoard = document.boardsById[targetBoardId];
  if (
    !parsed.success ||
    targetBoard === undefined ||
    !Number.isSafeInteger(pasteCount) ||
    pasteCount < 0
  ) {
    return undefined;
  }
  const payload = parsed.data;
  const selectionById = validateForest(payload.elements, payload.rootIds);
  const componentById = new Map(payload.components.map((entry) => [entry.component.id, entry]));
  const componentElementById = new Map<ElementId, ElementNode>();
  if (selectionById === undefined || componentById.size !== payload.components.length)
    return undefined;
  for (const entry of payload.components) {
    if (validateForest(entry.elements, [entry.component.rootElementId]) === undefined)
      return undefined;
    for (const element of entry.elements) componentElementById.set(element.id, element);
  }
  if (
    componentElementById.size !==
    payload.components.reduce((total, entry) => total + entry.elements.length, 0)
  ) {
    return undefined;
  }
  const allSourceElements = new Map([...selectionById, ...componentElementById]);

  const orderedComponents: (typeof payload.components)[number][] = [];
  const visitedComponents = new Set<ComponentId>();
  const visitingComponents = new Set<ComponentId>();
  const orderComponent = (componentId: ComponentId): boolean => {
    if (visitedComponents.has(componentId)) return true;
    if (visitingComponents.has(componentId)) return false;
    const entry = componentById.get(componentId);
    if (entry === undefined) return false;
    visitingComponents.add(componentId);
    for (const element of entry.elements) {
      const nestedId = parseInstanceComponentId(element);
      if (nestedId !== undefined && !orderComponent(nestedId)) return false;
    }
    visitingComponents.delete(componentId);
    visitedComponents.add(componentId);
    orderedComponents.push(entry);
    return true;
  };
  for (const element of payload.elements) {
    const componentId = parseInstanceComponentId(element);
    if (componentId !== undefined && !orderComponent(componentId)) return undefined;
  }
  if (visitedComponents.size !== payload.components.length) return undefined;

  const targetAssetsByContent = new Map(
    Object.values(document.assetsById).map((reference) => [
      assetContentKey(reference),
      reference.id,
    ]),
  );
  const assetIdBySource = new Map<AssetId, AssetId>();
  const additions: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  const assetCommands: CreateAssetCommand[] = [];
  const allocatedAssetIds = new Set<AssetId>();
  for (const [index, asset] of payload.assets.entries()) {
    const sourceId = asset.reference.id;
    const existingSource = document.assetsById[sourceId];
    const reusableId =
      existingSource !== undefined &&
      assetContentKey(existingSource) === assetContentKey(asset.reference)
        ? sourceId
        : targetAssetsByContent.get(assetContentKey(asset.reference));
    if (reusableId !== undefined) {
      assetIdBySource.set(sourceId, reusableId);
      continue;
    }
    const targetId = AssetIdSchema.safeParse(allocateAssetId(sourceId, index));
    const bytes = decodeBytes(asset.bytesBase64);
    if (
      !targetId.success ||
      document.assetsById[targetId.data] !== undefined ||
      allocatedAssetIds.has(targetId.data) ||
      bytes === undefined ||
      bytes.byteLength !== asset.reference.byteLength
    ) {
      return undefined;
    }
    const command = CreateAssetCommandSchema.safeParse({
      type: DOCUMENT_COMMAND_TYPES.createAsset,
      asset: { ...asset.reference, id: targetId.data },
    });
    if (!command.success) return undefined;
    allocatedAssetIds.add(targetId.data);
    targetAssetsByContent.set(assetContentKey(asset.reference), targetId.data);
    assetIdBySource.set(sourceId, targetId.data);
    additions[targetId.data] = bytes;
    assetCommands.push(command.data);
  }

  const componentIdBySource = new Map<ComponentId, ComponentId>();
  const importedComponents: typeof orderedComponents = [];
  const allocatedComponentIds = new Set<ComponentId>();
  for (const [index, entry] of orderedComponents.entries()) {
    const live = document.componentsById[entry.component.id];
    if (payload.projectId === document.id && live !== undefined) {
      componentIdBySource.set(entry.component.id, entry.component.id);
      continue;
    }
    const targetId = ComponentIdSchema.safeParse(allocateComponentId(entry.component.id, index));
    if (
      !targetId.success ||
      document.componentsById[targetId.data] !== undefined ||
      allocatedComponentIds.has(targetId.data)
    ) {
      return undefined;
    }
    allocatedComponentIds.add(targetId.data);
    componentIdBySource.set(entry.component.id, targetId.data);
    importedComponents.push(entry);
  }

  const elementIdBySource = new Map<ElementId, ElementId>();
  const allocatedElementIds = new Set<ElementId>();
  const elementsToAllocate = [
    ...importedComponents.flatMap(({ elements }) => elements),
    ...payload.elements,
  ];
  for (const [index, element] of elementsToAllocate.entries()) {
    const targetId = ElementIdSchema.safeParse(allocateElementId(element.id, index));
    if (
      !targetId.success ||
      document.elementsById[targetId.data] !== undefined ||
      allocatedElementIds.has(targetId.data)
    ) {
      return undefined;
    }
    allocatedElementIds.add(targetId.data);
    elementIdBySource.set(element.id, targetId.data);
  }
  for (const entry of orderedComponents) {
    if (!importedComponents.includes(entry)) {
      for (const element of entry.elements) elementIdBySource.set(element.id, element.id);
    }
  }

  const componentCommands: CreateComponentCommand[] = [];
  for (const [index, entry] of importedComponents.entries()) {
    const componentId = componentIdBySource.get(entry.component.id);
    const rootElementId = elementIdBySource.get(entry.component.rootElementId);
    if (componentId === undefined || rootElementId === undefined) return undefined;
    const elements = entry.elements.map((source) => {
      const id = elementIdBySource.get(source.id);
      const childIds = source.childIds.map((childId) => elementIdBySource.get(childId));
      return id === undefined || childIds.some((childId) => childId === undefined)
        ? undefined
        : remapElement(
            source,
            id,
            childIds as ElementId[],
            allSourceElements,
            elementIdBySource,
            assetIdBySource,
            componentIdBySource,
            payload.sourceBoardId,
            targetBoardId,
          );
    });
    if (elements.some((element) => element === undefined)) return undefined;
    const command = CreateComponentCommandSchema.safeParse({
      type: DOCUMENT_COMMAND_TYPES.createComponent,
      component: { ...entry.component, id: componentId, rootElementId },
      elements,
      index: document.componentIds.length + index,
    });
    if (!command.success) return undefined;
    componentCommands.push(command.data);
  }

  const rootSet = new Set(payload.rootIds);
  const sourceParentByChild = new Map<ElementId, ElementId>();
  for (const element of payload.elements) {
    for (const childId of element.childIds) sourceParentByChild.set(childId, element.id);
  }
  const offsetMultiplier = pasteCount + (payload.kind === 'copy' ? 1 : 0);
  const offset = offsetMultiplier * SELECTION_CLIPBOARD_POLICY.offsetWorldUnits;
  if (!Number.isSafeInteger(offsetMultiplier) || !Number.isFinite(offset)) return undefined;
  const elementCommands: CreateElementCommand[] = [];
  for (const source of payload.elements) {
    const id = elementIdBySource.get(source.id);
    if (id === undefined) return undefined;
    const remapped = remapElement(
      source,
      id,
      Object.freeze([]),
      allSourceElements,
      elementIdBySource,
      assetIdBySource,
      componentIdBySource,
      payload.sourceBoardId,
      targetBoardId,
    );
    if (remapped === undefined) return undefined;
    const parentSourceId = sourceParentByChild.get(source.id);
    const parentId =
      parentSourceId === undefined ? undefined : elementIdBySource.get(parentSourceId);
    const rootIndex = payload.rootIds.indexOf(source.id);
    const siblingIndex =
      parentSourceId === undefined
        ? rootIndex
        : selectionById.get(parentSourceId)?.childIds.indexOf(source.id);
    if (
      (rootSet.has(source.id) && rootIndex < 0) ||
      (!rootSet.has(source.id) &&
        (parentId === undefined || siblingIndex === undefined || siblingIndex < 0))
    ) {
      return undefined;
    }
    const command = CreateElementCommandSchema.safeParse({
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        ...remapped,
        frame: rootSet.has(source.id)
          ? { ...remapped.frame, x: remapped.frame.x + offset, y: remapped.frame.y + offset }
          : remapped.frame,
      },
      owner: rootSet.has(source.id)
        ? { boardId: targetBoardId, kind: 'board' }
        : { elementId: parentId, kind: 'element' },
      index: rootSet.has(source.id) ? targetBoard.childIds.length + rootIndex : siblingIndex,
    });
    if (!command.success) return undefined;
    elementCommands.push(command.data);
  }

  const cloneIds = payload.rootIds.flatMap((id) => {
    const targetId = elementIdBySource.get(id);
    return targetId === undefined ? [] : [targetId];
  });
  const primaryCloneId = elementIdBySource.get(payload.primaryRootId);
  const commands = [...assetCommands, ...componentCommands, ...elementCommands];
  if (
    cloneIds.length !== payload.rootIds.length ||
    primaryCloneId === undefined ||
    commands.length === 0 ||
    commands.length > MAX_HISTORY_TRANSACTION_COMMANDS
  ) {
    return undefined;
  }
  return Object.freeze({
    additions: Object.freeze(additions),
    cloneIds: Object.freeze(cloneIds),
    commands: Object.freeze(commands),
    primaryCloneId,
  });
};
