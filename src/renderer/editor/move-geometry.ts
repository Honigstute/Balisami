import {
  DOCUMENT_COMMAND_TYPES,
  selectElementLockState,
  selectSelectionWorldBounds,
  type ElementId,
  type ElementLocationIndex,
  type ElementOwner,
  type ProjectDocument,
  type SetElementFrameCommand,
  type WorldRect as ElementFrame,
} from '../../domain';
import { resolveSelectionRoots } from './selection-roots';
import {
  createWorldRect,
  createWorldVector,
  type WorldPoint,
  type WorldRect,
  type WorldVector,
} from './viewport-transform';

export interface MoveTargetSnapshot {
  readonly frame: ElementFrame;
  readonly id: ElementId;
}

export interface MoveTargetCapture {
  /** Every descendant that follows a moved root in world space. */
  readonly affectedIds: readonly ElementId[];
  /** Shared canonical owner when every moved root is a sibling. */
  readonly sharedOwner?: ElementOwner;
  /** Only roots receive frame commands; selected descendants must not move twice. */
  readonly targets: readonly MoveTargetSnapshot[];
  /** Canonical world-space union of the roots used by snapping and overlays. */
  readonly worldBounds: WorldRect;
}

const ownersEqual = (first: ElementOwner, second: ElementOwner): boolean =>
  first.kind === second.kind &&
  (first.kind === 'board'
    ? first.boardId === (second.kind === 'board' ? second.boardId : undefined)
    : first.elementId === (second.kind === 'element' ? second.elementId : undefined));

const getSharedOwner = (
  rootIds: readonly ElementId[],
  locations: ElementLocationIndex,
): ElementOwner | undefined => {
  const firstRootId = rootIds[0];
  const firstOwner = firstRootId === undefined ? undefined : locations.get(firstRootId)?.owner;
  return firstOwner !== undefined &&
    rootIds.every((elementId) => {
      const owner = locations.get(elementId)?.owner;
      return owner !== undefined && ownersEqual(owner, firstOwner);
    })
    ? firstOwner
    : undefined;
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
  const roots = resolveSelectionRoots(document, selectedIds);
  if (
    roots === undefined ||
    roots.selectedIds.some(
      (id) => selectElementLockState(document, id, roots.locations)?.effectivelyLocked !== false,
    )
  ) {
    return undefined;
  }

  const selectedBounds = selectSelectionWorldBounds(document, roots.rootIds, roots.locations);
  if (selectedBounds === undefined) {
    return undefined;
  }
  const targets = roots.rootIds.map((id): MoveTargetSnapshot => {
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
  for (const id of roots.rootIds) {
    appendAffected(id);
  }
  const sharedOwner = getSharedOwner(roots.rootIds, roots.locations);

  return Object.freeze({
    affectedIds: Object.freeze(affectedIds),
    ...(sharedOwner === undefined ? {} : { sharedOwner }),
    targets: Object.freeze(targets),
    worldBounds: createWorldRect(
      selectedBounds.x,
      selectedBounds.y,
      selectedBounds.width,
      selectedBounds.height,
    ),
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
