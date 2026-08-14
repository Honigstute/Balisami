import {
  DOCUMENT_COMMAND_TYPES,
  createElementLocationIndex,
  type ElementId,
  type ProjectDocument,
  type SetElementFrameCommand,
  type WorldRect as ElementFrame,
} from '../../domain';
import { createWorldVector, type WorldPoint, type WorldVector } from './viewport-transform';

export interface MoveTargetSnapshot {
  readonly frame: ElementFrame;
  readonly id: ElementId;
}

export interface MoveTargetCapture {
  /** Every descendant that follows a moved root in world space. */
  readonly affectedIds: readonly ElementId[];
  /** Only roots receive frame commands; selected descendants must not move twice. */
  readonly targets: readonly MoveTargetSnapshot[];
}

const hasSelectedAncestor = (
  id: ElementId,
  selectedIds: ReadonlySet<ElementId>,
  locations: ReturnType<typeof createElementLocationIndex>,
): boolean => {
  let location = locations.get(id);
  const visited = new Set<ElementId>();
  while (location?.owner.kind === 'element') {
    const parentId = location.owner.elementId;
    if (selectedIds.has(parentId)) {
      return true;
    }
    if (visited.has(parentId)) {
      return false;
    }
    visited.add(parentId);
    location = locations.get(parentId);
  }
  return false;
};

/**
 * Captures immutable local frames once. Selected descendants of another
 * selected element follow their ancestor visually but do not receive a second
 * local-frame delta.
 */
export const captureMoveTargets = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
): MoveTargetCapture | undefined => {
  const movableIds = [...new Set(selectedIds)].filter((id) => {
    const element = document.elementsById[id];
    return element !== undefined && !element.locked;
  });
  if (movableIds.length === 0) {
    return undefined;
  }

  const movableSet = new Set(movableIds);
  const locations = createElementLocationIndex(document);
  const rootIds = movableIds.filter((id) => !hasSelectedAncestor(id, movableSet, locations));
  const targets = rootIds.map((id): MoveTargetSnapshot => {
    const element = document.elementsById[id];
    if (element === undefined) {
      throw new Error('A captured move target disappeared from the validated document.');
    }
    return Object.freeze({ frame: Object.freeze({ ...element.frame }), id });
  });

  const affectedIds: ElementId[] = [];
  const appendAffected = (id: ElementId): void => {
    affectedIds.push(id);
    const element = document.elementsById[id];
    if (element === undefined) {
      return;
    }
    for (const childId of element.childIds) {
      appendAffected(childId);
    }
  };
  for (const id of rootIds) {
    appendAffected(id);
  }

  return Object.freeze({
    affectedIds: Object.freeze(affectedIds),
    targets: Object.freeze(targets),
  });
};

/** Shift locks to the dominant world axis; an exact tie resolves horizontally. */
export const resolveMoveDelta = (
  start: WorldPoint,
  current: WorldPoint,
  axisLocked: boolean,
): WorldVector => {
  const x = current.x - start.x;
  const y = current.y - start.y;
  if (!axisLocked) {
    return createWorldVector(x, y);
  }
  return Math.abs(x) >= Math.abs(y) ? createWorldVector(x, 0) : createWorldVector(0, y);
};

/** Builds final validated-command inputs from the immutable gesture start. */
export const createMoveCommands = (
  capture: MoveTargetCapture,
  delta: WorldVector,
): readonly SetElementFrameCommand[] =>
  Object.freeze(
    capture.targets.map((target) =>
      Object.freeze({
        type: DOCUMENT_COMMAND_TYPES.setElementFrame,
        elementId: target.id,
        frame: Object.freeze({
          ...target.frame,
          x: target.frame.x + delta.x,
          y: target.frame.y + delta.y,
        }),
      }),
    ),
  );
