import {
  CreateComponentCommandSchema,
  DOCUMENT_COMMAND_TYPES,
  DocumentTitleSchema,
  ElementIdSchema,
  rekeyElementRowData,
  type ComponentId,
  type CreateComponentCommand,
  type ElementId,
  type ElementNode,
  type ProjectDocument,
} from '../../domain';

export type ComponentDuplicateElementIdAllocator = (
  sourceElementId: ElementId,
  sourceIndex: number,
) => ElementId | undefined;

const createUniqueCopyName = (
  document: ProjectDocument,
  sourceName: string,
): string | undefined => {
  const existingNames = new Set(Object.values(document.componentsById).map((item) => item.name));
  for (let copyNumber = 1; copyNumber <= document.componentIds.length + 1; copyNumber += 1) {
    const suffix = copyNumber === 1 ? ' Copy' : ` Copy ${String(copyNumber)}`;
    const base = sourceName.slice(0, 120 - suffix.length).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!existingNames.has(candidate) && DocumentTitleSchema.safeParse(candidate).success) {
      return candidate;
    }
  }
  return undefined;
};

const collectSubtreePreOrder = (
  document: ProjectDocument,
  rootElementId: ElementId,
): readonly ElementNode[] | undefined => {
  const elements: ElementNode[] = [];
  const visited = new Set<ElementId>();
  const visit = (elementId: ElementId): boolean => {
    if (visited.has(elementId)) return false;
    visited.add(elementId);
    const element = document.elementsById[elementId];
    if (element === undefined) return false;
    elements.push(element);
    return element.childIds.every(visit);
  };
  return visit(rootElementId) ? Object.freeze(elements) : undefined;
};

/** Clones one complete hidden definition tree while retaining referenced assets/nested definitions. */
export const planComponentDuplicate = (
  document: ProjectDocument,
  sourceComponentId: ComponentId,
  componentId: ComponentId,
  allocateElementId: ComponentDuplicateElementIdAllocator,
): CreateComponentCommand | undefined => {
  const source = document.componentsById[sourceComponentId];
  const sourceIndex = document.componentIds.indexOf(sourceComponentId);
  if (
    source === undefined ||
    sourceIndex < 0 ||
    document.componentsById[componentId] !== undefined
  ) {
    return undefined;
  }
  const sourceElements = collectSubtreePreOrder(document, source.rootElementId);
  const name = createUniqueCopyName(document, source.name);
  if (sourceElements === undefined || name === undefined) return undefined;

  const cloneIdBySource = new Map<ElementId, ElementId>();
  const allocatedIds = new Set<ElementId>();
  for (const [index, sourceElement] of sourceElements.entries()) {
    const parsed = ElementIdSchema.safeParse(allocateElementId(sourceElement.id, index));
    if (
      !parsed.success ||
      allocatedIds.has(parsed.data) ||
      document.elementsById[parsed.data] !== undefined
    ) {
      return undefined;
    }
    allocatedIds.add(parsed.data);
    cloneIdBySource.set(sourceElement.id, parsed.data);
  }

  const elements = sourceElements.map((sourceElement) => {
    const id = cloneIdBySource.get(sourceElement.id);
    const childIds = sourceElement.childIds.map((childId) => cloneIdBySource.get(childId));
    if (id === undefined || childIds.some((childId) => childId === undefined)) {
      return undefined;
    }
    return Object.freeze({
      ...sourceElement,
      childIds: Object.freeze(childIds as ElementId[]),
      id,
      rowData: rekeyElementRowData(sourceElement.rowData, id),
    });
  });
  if (elements.some((element) => element === undefined)) return undefined;
  const rootElementId = cloneIdBySource.get(source.rootElementId);
  if (rootElementId === undefined) return undefined;

  const command = CreateComponentCommandSchema.safeParse({
    type: DOCUMENT_COMMAND_TYPES.createComponent,
    component: { id: componentId, name, rootElementId },
    elements,
    index: sourceIndex + 1,
  });
  return command.success ? command.data : undefined;
};
