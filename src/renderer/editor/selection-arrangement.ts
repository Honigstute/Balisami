import {
  DOCUMENT_COMMAND_TYPES,
  SetElementFrameCommandSchema,
  selectElementLockState,
  selectElementWorldBounds,
  type ElementId,
  type ProjectDocument,
  type SetElementFrameCommand,
  type WorldRect,
} from '../../domain';
import { resolveSiblingSelectionRoots, type SiblingSelectionRoots } from './selection-roots';
import type { SelectionStore } from './selection-store';

export const SELECTION_ARRANGEMENT_ACTIONS = Object.freeze({
  alignBottom: 'align-bottom',
  alignCenter: 'align-center',
  alignLeft: 'align-left',
  alignMiddle: 'align-middle',
  alignRight: 'align-right',
  alignTop: 'align-top',
  distributeHorizontally: 'distribute-horizontally',
  distributeVertically: 'distribute-vertically',
} as const);
export type SelectionArrangementAction =
  (typeof SELECTION_ARRANGEMENT_ACTIONS)[keyof typeof SELECTION_ARRANGEMENT_ACTIONS];

export interface SelectionArrangementPlan {
  readonly action: SelectionArrangementAction;
  readonly commands: readonly SetElementFrameCommand[];
  /** Canonical root used to preserve primary-selection intent after acceptance. */
  readonly primaryId: ElementId;
  readonly rootIds: readonly ElementId[];
}

export interface SelectionArrangementAvailability {
  readonly canAlignBottom: boolean;
  readonly canAlignCenter: boolean;
  readonly canAlignLeft: boolean;
  readonly canAlignMiddle: boolean;
  readonly canAlignRight: boolean;
  readonly canAlignTop: boolean;
  readonly canDistributeHorizontally: boolean;
  readonly canDistributeVertically: boolean;
}

export interface SelectionArrangementSource {
  /** Returns the accepted document, or undefined when the transaction did not commit. */
  readonly commit: (
    commands: readonly SetElementFrameCommand[],
    label: string,
  ) => ProjectDocument | undefined;
}

interface ArrangementItem {
  readonly bounds: WorldRect;
  readonly canonicalIndex: number;
  readonly frame: WorldRect;
  readonly id: ElementId;
}

type ArrangementAxis = 'x' | 'y';

const numbersNearlyEqual = (first: number, second: number): boolean =>
  Math.abs(first - second) <= Number.EPSILON * Math.max(1, Math.abs(first), Math.abs(second)) * 8;

const isAlignmentAction = (
  action: SelectionArrangementAction,
): action is Exclude<
  SelectionArrangementAction,
  | typeof SELECTION_ARRANGEMENT_ACTIONS.distributeHorizontally
  | typeof SELECTION_ARRANGEMENT_ACTIONS.distributeVertically
> =>
  action !== SELECTION_ARRANGEMENT_ACTIONS.distributeHorizontally &&
  action !== SELECTION_ARRANGEMENT_ACTIONS.distributeVertically;

const resolvePrimaryRootId = (
  roots: SiblingSelectionRoots,
  requestedPrimaryId: ElementId | undefined,
): ElementId | undefined => {
  const rootSet = new Set(roots.rootIds);
  let currentId = requestedPrimaryId;
  const visited = new Set<ElementId>();
  while (currentId !== undefined && !visited.has(currentId)) {
    if (rootSet.has(currentId)) {
      return currentId;
    }
    visited.add(currentId);
    const location = roots.locations.get(currentId);
    currentId = location?.owner.kind === 'element' ? location.owner.elementId : undefined;
  }
  return roots.rootIds.at(-1);
};

const captureArrangementItems = (
  document: ProjectDocument,
  roots: SiblingSelectionRoots,
): readonly ArrangementItem[] | undefined => {
  if (
    roots.selectedIds.some(
      (elementId) =>
        selectElementLockState(document, elementId, roots.locations)?.effectivelyLocked !== false,
    )
  ) {
    return undefined;
  }
  const items: ArrangementItem[] = [];
  for (const [canonicalIndex, id] of roots.rootIds.entries()) {
    const element = document.elementsById[id];
    const bounds = selectElementWorldBounds(document, id, roots.locations);
    if (element === undefined || bounds === undefined) {
      return undefined;
    }
    items.push(
      Object.freeze({
        bounds,
        canonicalIndex,
        frame: element.frame,
        id,
      }),
    );
  }
  return Object.freeze(items);
};

const createFrameCommand = (
  item: ArrangementItem,
  worldX: number,
  worldY: number,
): SetElementFrameCommand | undefined | false => {
  const rawX = item.frame.x + (worldX - item.bounds.x);
  const rawY = item.frame.y + (worldY - item.bounds.y);
  const x = numbersNearlyEqual(rawX, item.frame.x) ? item.frame.x : rawX;
  const y = numbersNearlyEqual(rawY, item.frame.y) ? item.frame.y : rawY;
  if (x === item.frame.x && y === item.frame.y) {
    return undefined;
  }
  const command = SetElementFrameCommandSchema.safeParse({
    type: DOCUMENT_COMMAND_TYPES.setElementFrame,
    elementId: item.id,
    frame: { ...item.frame, x, y },
  });
  return command.success ? command.data : false;
};

const getAlignmentPosition = (
  action: SelectionArrangementAction,
  reference: WorldRect,
  item: WorldRect,
): Readonly<{ x: number; y: number }> => {
  switch (action) {
    case SELECTION_ARRANGEMENT_ACTIONS.alignLeft:
      return Object.freeze({ x: reference.x, y: item.y });
    case SELECTION_ARRANGEMENT_ACTIONS.alignCenter:
      return Object.freeze({
        x: reference.x + reference.width / 2 - item.width / 2,
        y: item.y,
      });
    case SELECTION_ARRANGEMENT_ACTIONS.alignRight:
      return Object.freeze({ x: reference.x + reference.width - item.width, y: item.y });
    case SELECTION_ARRANGEMENT_ACTIONS.alignTop:
      return Object.freeze({ x: item.x, y: reference.y });
    case SELECTION_ARRANGEMENT_ACTIONS.alignMiddle:
      return Object.freeze({
        x: item.x,
        y: reference.y + reference.height / 2 - item.height / 2,
      });
    case SELECTION_ARRANGEMENT_ACTIONS.alignBottom:
      return Object.freeze({ x: item.x, y: reference.y + reference.height - item.height });
    case SELECTION_ARRANGEMENT_ACTIONS.distributeHorizontally:
    case SELECTION_ARRANGEMENT_ACTIONS.distributeVertically:
      return Object.freeze({ x: item.x, y: item.y });
  }
};

const createAlignmentCommands = (
  items: readonly ArrangementItem[],
  primaryId: ElementId,
  action: SelectionArrangementAction,
): readonly SetElementFrameCommand[] | undefined => {
  const reference = items.find((item) => item.id === primaryId)?.bounds;
  if (reference === undefined) {
    return undefined;
  }
  const commands: SetElementFrameCommand[] = [];
  for (const item of items) {
    const position = getAlignmentPosition(action, reference, item.bounds);
    const command = createFrameCommand(item, position.x, position.y);
    if (command === false) {
      return undefined;
    }
    if (command !== undefined) {
      commands.push(command);
    }
  }
  return Object.freeze(commands);
};

const createDistributionCommands = (
  items: readonly ArrangementItem[],
  axis: ArrangementAxis,
): readonly SetElementFrameCommand[] | undefined => {
  const sizeKey = axis === 'x' ? 'width' : 'height';
  const ordered = [...items].sort((first, second) => {
    const leading = first.bounds[axis] - second.bounds[axis];
    return leading !== 0 ? leading : first.canonicalIndex - second.canonicalIndex;
  });
  const first = ordered[0];
  const last = ordered.at(-1);
  if (first === undefined || last === undefined) {
    return undefined;
  }
  const totalSize = ordered.reduce((sum, item) => sum + item.bounds[sizeKey], 0);
  const span = last.bounds[axis] + last.bounds[sizeKey] - first.bounds[axis];
  const rawAvailable = span - totalSize;
  const tolerance =
    Number.EPSILON * Math.max(1, Math.abs(span), Math.abs(totalSize), Math.abs(rawAvailable)) * 8;
  if (!Number.isFinite(rawAvailable) || rawAvailable < -tolerance) {
    return undefined;
  }
  const gap = Math.max(0, rawAvailable) / (ordered.length - 1);
  let cursor = first.bounds[axis] + first.bounds[sizeKey] + gap;
  const commands: SetElementFrameCommand[] = [];
  for (const item of ordered.slice(1, -1)) {
    const worldX = axis === 'x' ? cursor : item.bounds.x;
    const worldY = axis === 'y' ? cursor : item.bounds.y;
    const command = createFrameCommand(item, worldX, worldY);
    if (command === false) {
      return undefined;
    }
    if (command !== undefined) {
      commands.push(command);
    }
    cursor += item.bounds[sizeKey] + gap;
  }
  return Object.freeze(commands);
};

export const planSelectionArrangement = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
  primaryId: ElementId | undefined,
  action: SelectionArrangementAction,
): SelectionArrangementPlan | undefined => {
  const roots = resolveSiblingSelectionRoots(document, selectedIds);
  const minimumCount = isAlignmentAction(action) ? 2 : 3;
  if (roots === undefined || roots.rootIds.length < minimumCount) {
    return undefined;
  }
  const resolvedPrimaryId = resolvePrimaryRootId(roots, primaryId);
  const items = captureArrangementItems(document, roots);
  if (resolvedPrimaryId === undefined || items === undefined) {
    return undefined;
  }
  const commands = isAlignmentAction(action)
    ? createAlignmentCommands(items, resolvedPrimaryId, action)
    : createDistributionCommands(
        items,
        action === SELECTION_ARRANGEMENT_ACTIONS.distributeHorizontally ? 'x' : 'y',
      );
  return commands === undefined || commands.length === 0
    ? undefined
    : Object.freeze({
        action,
        commands,
        primaryId: resolvedPrimaryId,
        rootIds: roots.rootIds,
      });
};

export const selectSelectionArrangementAvailability = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
  primaryId: ElementId | undefined,
): SelectionArrangementAvailability =>
  Object.freeze({
    canAlignBottom:
      planSelectionArrangement(
        document,
        selectedIds,
        primaryId,
        SELECTION_ARRANGEMENT_ACTIONS.alignBottom,
      ) !== undefined,
    canAlignCenter:
      planSelectionArrangement(
        document,
        selectedIds,
        primaryId,
        SELECTION_ARRANGEMENT_ACTIONS.alignCenter,
      ) !== undefined,
    canAlignLeft:
      planSelectionArrangement(
        document,
        selectedIds,
        primaryId,
        SELECTION_ARRANGEMENT_ACTIONS.alignLeft,
      ) !== undefined,
    canAlignMiddle:
      planSelectionArrangement(
        document,
        selectedIds,
        primaryId,
        SELECTION_ARRANGEMENT_ACTIONS.alignMiddle,
      ) !== undefined,
    canAlignRight:
      planSelectionArrangement(
        document,
        selectedIds,
        primaryId,
        SELECTION_ARRANGEMENT_ACTIONS.alignRight,
      ) !== undefined,
    canAlignTop:
      planSelectionArrangement(
        document,
        selectedIds,
        primaryId,
        SELECTION_ARRANGEMENT_ACTIONS.alignTop,
      ) !== undefined,
    canDistributeHorizontally:
      planSelectionArrangement(
        document,
        selectedIds,
        primaryId,
        SELECTION_ARRANGEMENT_ACTIONS.distributeHorizontally,
      ) !== undefined,
    canDistributeVertically:
      planSelectionArrangement(
        document,
        selectedIds,
        primaryId,
        SELECTION_ARRANGEMENT_ACTIONS.distributeVertically,
      ) !== undefined,
  });

const actionLabel = (action: SelectionArrangementAction): string => {
  switch (action) {
    case SELECTION_ARRANGEMENT_ACTIONS.alignLeft:
      return 'Align elements left';
    case SELECTION_ARRANGEMENT_ACTIONS.alignCenter:
      return 'Align elements center';
    case SELECTION_ARRANGEMENT_ACTIONS.alignRight:
      return 'Align elements right';
    case SELECTION_ARRANGEMENT_ACTIONS.alignTop:
      return 'Align elements top';
    case SELECTION_ARRANGEMENT_ACTIONS.alignMiddle:
      return 'Align elements middle';
    case SELECTION_ARRANGEMENT_ACTIONS.alignBottom:
      return 'Align elements bottom';
    case SELECTION_ARRANGEMENT_ACTIONS.distributeHorizontally:
      return 'Distribute elements horizontally';
    case SELECTION_ARRANGEMENT_ACTIONS.distributeVertically:
      return 'Distribute elements vertically';
  }
};

export const arrangeSelectedElements = (
  document: ProjectDocument,
  selection: SelectionStore,
  action: SelectionArrangementAction,
  source: SelectionArrangementSource,
): boolean => {
  const selectionBefore = selection.getSnapshot();
  const plan = planSelectionArrangement(
    document,
    selectionBefore.selectedIds,
    selectionBefore.primaryId,
    action,
  );
  if (plan === undefined) {
    return false;
  }
  const acceptedDocument = source.commit(plan.commands, actionLabel(action));
  if (
    acceptedDocument === undefined ||
    plan.commands.some((command) => {
      const frame = acceptedDocument.elementsById[command.elementId]?.frame;
      return (
        frame === undefined ||
        frame.x !== command.frame.x ||
        frame.y !== command.frame.y ||
        frame.width !== command.frame.width ||
        frame.height !== command.frame.height
      );
    })
  ) {
    return false;
  }
  selection.replace(plan.rootIds, plan.primaryId);
  return true;
};
