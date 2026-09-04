import {
  DOCUMENT_COMMAND_TYPES,
  EMPTY_ELEMENT_ROW_DATA,
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  GroupElementsCommandSchema,
  UngroupElementCommandSchema,
  createElementLocationIndex,
  getControlSpec,
  selectElementLockState,
  selectOwnerChildIds,
  type ElementId,
  type ElementOwner,
  type GroupElementsCommand,
  type ProjectDocument,
  type UngroupElementCommand,
  type WorldRect,
} from '../../domain';
import type { SelectionStore } from './selection-store';

export type SelectionGroupIdAllocator = (
  canonicalChildIds: readonly ElementId[],
) => ElementId | undefined;

export interface SelectionGroupPlan {
  readonly childIds: readonly ElementId[];
  readonly command: GroupElementsCommand;
  readonly groupId: ElementId;
}

export interface SelectionUngroupPlan {
  readonly childIds: readonly ElementId[];
  readonly command: UngroupElementCommand;
  readonly groupId: ElementId;
}

export interface SelectionGroupingSource {
  /** Returns the accepted document, or undefined when the command did not commit. */
  readonly commit: (
    commands: readonly (GroupElementsCommand | UngroupElementCommand)[],
    label: string,
  ) => ProjectDocument | undefined;
}

const getOwnerKey = (owner: ElementOwner): string =>
  owner.kind === 'board' ? `board:${owner.boardId}` : `element:${owner.elementId}`;

const createFrameUnion = (
  document: ProjectDocument,
  childIds: readonly ElementId[],
): WorldRect | undefined => {
  const first = childIds[0] === undefined ? undefined : document.elementsById[childIds[0]];
  if (first === undefined) {
    return undefined;
  }
  let left = first.frame.x;
  let top = first.frame.y;
  let right = first.frame.x + first.frame.width;
  let bottom = first.frame.y + first.frame.height;

  for (const childId of childIds.slice(1)) {
    const child = document.elementsById[childId];
    if (child === undefined) {
      return undefined;
    }
    left = Math.min(left, child.frame.x);
    top = Math.min(top, child.frame.y);
    right = Math.max(right, child.frame.x + child.frame.width);
    bottom = Math.max(bottom, child.frame.y + child.frame.height);
  }

  const width = right - left;
  const height = bottom - top;
  return [left, top, right, bottom, width, height].every(Number.isFinite) && width > 0 && height > 0
    ? Object.freeze({ x: left, y: top, width, height })
    : undefined;
};

const createTranslatedChildFrames = (
  document: ProjectDocument,
  childIds: readonly ElementId[],
  deltaX: number,
  deltaY: number,
): readonly { readonly elementId: ElementId; readonly frame: WorldRect }[] | undefined => {
  const entries: { readonly elementId: ElementId; readonly frame: WorldRect }[] = [];
  for (const childId of childIds) {
    const child = document.elementsById[childId];
    if (child === undefined) {
      return undefined;
    }
    const x = child.frame.x + deltaX;
    const y = child.frame.y + deltaY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return undefined;
    }
    entries.push(
      Object.freeze({
        elementId: childId,
        frame: Object.freeze({ ...child.frame, x, y }),
      }),
    );
  }
  return Object.freeze(entries);
};

/**
 * Groups at the collapsed position of the visually topmost selected sibling.
 * Canonical childIds are bottom-to-top, so unaffected siblings retain order
 * while any sibling formerly between selected items remains below the group.
 */
export const planSelectionGroup = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
  allocateId: SelectionGroupIdAllocator,
): SelectionGroupPlan | undefined => {
  const uniqueSelectedIds = [...new Set(selectedIds)];
  if (uniqueSelectedIds.length < 2) {
    return undefined;
  }

  const locationIndex = createElementLocationIndex(document);
  let owner: ElementOwner | undefined;
  for (const childId of uniqueSelectedIds) {
    const child = document.elementsById[childId];
    const location = locationIndex.get(childId);
    if (
      child === undefined ||
      location === undefined ||
      selectElementLockState(document, childId, locationIndex)?.effectivelyLocked !== false
    ) {
      return undefined;
    }
    if (owner === undefined) {
      owner = location.owner;
    } else if (getOwnerKey(owner) !== getOwnerKey(location.owner)) {
      return undefined;
    }
  }
  if (owner === undefined) {
    return undefined;
  }

  const ownerChildIds = selectOwnerChildIds(document, owner);
  if (ownerChildIds === undefined) {
    return undefined;
  }
  const selectedSet = new Set(uniqueSelectedIds);
  const childIds = ownerChildIds.filter((childId) => selectedSet.has(childId));
  if (childIds.length !== uniqueSelectedIds.length) {
    return undefined;
  }
  const frame = createFrameUnion(document, childIds);
  if (frame === undefined) {
    return undefined;
  }

  const allocatedId = ElementIdSchema.safeParse(allocateId(Object.freeze([...childIds])));
  if (!allocatedId.success || Object.hasOwn(document.elementsById, allocatedId.data)) {
    return undefined;
  }
  const topmostSelectedIndex = Math.max(
    ...childIds.map((childId) => ownerChildIds.indexOf(childId)),
  );
  const toIndex = ownerChildIds
    .slice(0, topmostSelectedIndex)
    .filter((childId) => !selectedSet.has(childId)).length;
  const childFrames = createTranslatedChildFrames(document, childIds, -frame.x, -frame.y);
  const groupDefinition = getControlSpec(FOUNDATION_CONTROL_TYPES.group);
  if (childFrames === undefined || groupDefinition === undefined) {
    return undefined;
  }
  const command = GroupElementsCommandSchema.safeParse({
    type: DOCUMENT_COMMAND_TYPES.groupElements,
    childFrames,
    group: {
      id: allocatedId.data,
      controlType: FOUNDATION_CONTROL_TYPES.group,
      controlVersion: groupDefinition.fileVersion,
      frame,
      locked: false,
      properties: {},
      childIds,
      assetIds: [],
      link: null,
      rowData: EMPTY_ELEMENT_ROW_DATA,
    },
    owner,
    toIndex,
  });
  if (!command.success) {
    return undefined;
  }

  return Object.freeze({
    childIds: Object.freeze([...childIds]),
    command: command.data,
    groupId: allocatedId.data,
  });
};

export const planSelectionUngroup = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
): SelectionUngroupPlan | undefined => {
  const uniqueSelectedIds = [...new Set(selectedIds)];
  const groupId = uniqueSelectedIds.length === 1 ? uniqueSelectedIds[0] : undefined;
  const group = groupId === undefined ? undefined : document.elementsById[groupId];
  const locationIndex = createElementLocationIndex(document);
  if (
    groupId === undefined ||
    group === undefined ||
    group.controlType !== FOUNDATION_CONTROL_TYPES.group ||
    selectElementLockState(document, groupId, locationIndex)?.effectivelyLocked !== false ||
    group.childIds.length === 0 ||
    group.childIds.some(
      (childId) =>
        selectElementLockState(document, childId, locationIndex)?.effectivelyLocked !== false,
    )
  ) {
    return undefined;
  }

  const location = locationIndex.get(groupId);
  const ownerChildIds =
    location === undefined ? undefined : selectOwnerChildIds(document, location.owner);
  if (location === undefined || ownerChildIds === undefined) {
    return undefined;
  }
  const nextOwnerChildIds = [...ownerChildIds];
  nextOwnerChildIds.splice(location.index, 1, ...group.childIds);
  const childFrames = createTranslatedChildFrames(
    document,
    group.childIds,
    group.frame.x,
    group.frame.y,
  );
  if (childFrames === undefined) {
    return undefined;
  }
  const command = UngroupElementCommandSchema.safeParse({
    type: DOCUMENT_COMMAND_TYPES.ungroupElement,
    childFrames,
    groupId,
    ownerChildIds: nextOwnerChildIds,
  });
  if (!command.success) {
    return undefined;
  }

  return Object.freeze({
    childIds: Object.freeze([...group.childIds]),
    command: command.data,
    groupId,
  });
};

export const groupSelectedElements = (
  document: ProjectDocument,
  selection: SelectionStore,
  allocateId: SelectionGroupIdAllocator,
  source: SelectionGroupingSource,
): boolean => {
  const plan = planSelectionGroup(document, selection.getSnapshot().selectedIds, allocateId);
  if (plan === undefined) {
    return false;
  }
  const acceptedDocument = source.commit([plan.command], 'Group elements');
  const acceptedGroup = acceptedDocument?.elementsById[plan.groupId];
  if (
    acceptedGroup === undefined ||
    acceptedGroup.childIds.length !== plan.childIds.length ||
    !plan.childIds.every((childId, index) => acceptedGroup.childIds[index] === childId)
  ) {
    return false;
  }
  selection.selectOnly(plan.groupId);
  return true;
};

export const ungroupSelectedElement = (
  document: ProjectDocument,
  selection: SelectionStore,
  source: SelectionGroupingSource,
): boolean => {
  const plan = planSelectionUngroup(document, selection.getSnapshot().selectedIds);
  if (plan === undefined) {
    return false;
  }
  const acceptedDocument = source.commit([plan.command], 'Ungroup elements');
  if (
    acceptedDocument === undefined ||
    Object.hasOwn(acceptedDocument.elementsById, plan.groupId) ||
    plan.childIds.some((childId) => !Object.hasOwn(acceptedDocument.elementsById, childId))
  ) {
    return false;
  }
  selection.replace(plan.childIds, plan.childIds.at(-1));
  return true;
};
