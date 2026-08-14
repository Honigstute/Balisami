import type { ElementId } from '../../domain';
import type { DocumentSceneSelectionRegionMode } from './document-scene-model';
import type { MoveInteraction } from './move-interaction';
import type { SelectionSnapshot, SelectionStore } from './selection-store';
import {
  createWorldRect,
  type ViewportPoint,
  type WorldPoint,
  type WorldRect,
} from './viewport-transform';

export const SELECTION_INTERACTION_POLICY = Object.freeze({
  clickMovementThresholdPixels: 4,
});

export interface SelectionInteractionGeometry {
  readonly listSelectableIds: () => readonly ElementId[];
  readonly queryHitStack: (point: WorldPoint) => readonly ElementId[];
  readonly querySelectionRegion: (
    bounds: WorldRect,
    mode: DocumentSceneSelectionRegionMode,
  ) => readonly ElementId[];
}

export interface SelectionPointerPosition {
  readonly viewportPoint: ViewportPoint;
  readonly worldPoint: WorldPoint;
}

export interface SelectionPointerUpdate extends SelectionPointerPosition {
  readonly shiftKey: boolean;
}

export interface SelectionPressInput extends SelectionPointerPosition {
  readonly altKey: boolean;
  readonly pointerId: number;
  readonly shiftKey: boolean;
}

export type SelectionInteractionSnapshot =
  | { readonly kind: 'idle' }
  | {
      readonly clickEligible: boolean;
      readonly kind: 'pressed';
      readonly pointerId: number;
    }
  | {
      readonly kind: 'moving';
      readonly pointerId: number;
    }
  | {
      readonly currentViewportPoint: ViewportPoint;
      readonly kind: 'marquee';
      readonly mode: DocumentSceneSelectionRegionMode;
      readonly pointerId: number;
      readonly previewIds: readonly ElementId[];
      readonly startViewportPoint: ViewportPoint;
    };

interface ActivePressed {
  readonly altKey: boolean;
  readonly clickEligible: boolean;
  readonly hitStack: readonly ElementId[];
  readonly kind: 'pressed';
  readonly pointerId: number;
  readonly selectionAtPress: SelectionSnapshot;
  readonly shiftKey: boolean;
  readonly startViewportPoint: ViewportPoint;
  readonly startWorldPoint: WorldPoint;
}

interface ActiveMarquee {
  readonly currentViewportPoint: ViewportPoint;
  readonly kind: 'marquee';
  readonly mode: DocumentSceneSelectionRegionMode;
  readonly pointerId: number;
  readonly previewIds: readonly ElementId[];
  readonly selectionAtPress: SelectionSnapshot;
  readonly shiftKey: boolean;
  readonly startViewportPoint: ViewportPoint;
  readonly startWorldPoint: WorldPoint;
}

interface ActiveMoving {
  readonly kind: 'moving';
  readonly pointerId: number;
  readonly selectionAtPress: SelectionSnapshot;
}

type ActiveSelectionGesture = ActiveMarquee | ActiveMoving | ActivePressed;

const IDLE_SNAPSHOT: SelectionInteractionSnapshot = Object.freeze({ kind: 'idle' });

const requirePointerId = (pointerId: number): number => {
  if (!Number.isSafeInteger(pointerId) || pointerId < 0) {
    throw new RangeError('Selection pointer ID must be a non-negative safe integer.');
  }
  return pointerId;
};

const exceedsClickMovementThreshold = (start: ViewportPoint, current: ViewportPoint): boolean => {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  const threshold = SELECTION_INTERACTION_POLICY.clickMovementThresholdPixels;
  return deltaX * deltaX + deltaY * deltaY > threshold * threshold;
};

const getMarqueeMode = (
  start: ViewportPoint,
  current: ViewportPoint,
): DocumentSceneSelectionRegionMode => (current.x >= start.x ? 'contained' : 'intersecting');

const getMinimumWorldDimension = (first: number, second: number): number =>
  Number.EPSILON * Math.max(1, Math.abs(first), Math.abs(second)) * 8;

/** Converts pointer endpoints into a positive rectangle while preserving line-like drags. */
const createMarqueeWorldBounds = (first: WorldPoint, second: WorldPoint): WorldRect => {
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  return createWorldRect(
    x,
    y,
    Math.max(Math.abs(second.x - first.x), getMinimumWorldDimension(first.x, second.x)),
    Math.max(Math.abs(second.y - first.y), getMinimumWorldDimension(first.y, second.y)),
  );
};

const toPublicSnapshot = (gesture: ActiveSelectionGesture): SelectionInteractionSnapshot => {
  if (gesture.kind === 'pressed') {
    return Object.freeze({
      clickEligible: gesture.clickEligible,
      kind: 'pressed',
      pointerId: gesture.pointerId,
    });
  }
  if (gesture.kind === 'moving') {
    return Object.freeze({ kind: 'moving', pointerId: gesture.pointerId });
  }
  return Object.freeze({
    currentViewportPoint: gesture.currentViewportPoint,
    kind: 'marquee',
    mode: gesture.mode,
    pointerId: gesture.pointerId,
    previewIds: gesture.previewIds,
    startViewportPoint: gesture.startViewportPoint,
  });
};

const copyUniqueIds = (ids: readonly ElementId[]): readonly ElementId[] =>
  Object.freeze([...new Set(ids)]);

/**
 * Pointer gesture authority for selection scope and move promotion. Click and
 * marquee remain session-only; raw move updates stay in the delegated
 * transient authority and only completion may cross its command boundary.
 */
export class SelectionInteraction {
  readonly #geometry: SelectionInteractionGeometry;
  readonly #listeners = new Set<() => void>();
  readonly #move: MoveInteraction | undefined;
  readonly #selection: SelectionStore;
  #activeGesture: ActiveSelectionGesture | undefined;
  #snapshot: SelectionInteractionSnapshot = IDLE_SNAPSHOT;

  constructor(
    selection: SelectionStore,
    geometry: SelectionInteractionGeometry,
    move?: MoveInteraction,
  ) {
    this.#selection = selection;
    this.#geometry = geometry;
    this.#move = move;
  }

  getSnapshot = (): SelectionInteractionSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  beginPress(input: SelectionPressInput): boolean {
    if (this.#activeGesture !== undefined) {
      return false;
    }
    const pointerId = requirePointerId(input.pointerId);
    const gesture: ActivePressed = Object.freeze({
      altKey: input.altKey,
      clickEligible: true,
      hitStack: copyUniqueIds(this.#geometry.queryHitStack(input.worldPoint)),
      kind: 'pressed',
      pointerId,
      selectionAtPress: this.#selection.getSnapshot(),
      shiftKey: input.shiftKey,
      startViewportPoint: input.viewportPoint,
      startWorldPoint: input.worldPoint,
    });
    this.#setActiveGesture(gesture);
    return true;
  }

  updatePress(pointerId: number, position: SelectionPointerUpdate): boolean {
    const gesture = this.#activeGesture;
    if (gesture === undefined || gesture.pointerId !== pointerId) {
      return false;
    }
    if (gesture.kind === 'marquee') {
      this.#setActiveGesture(this.#updateMarquee(gesture, position));
      return true;
    }
    if (gesture.kind === 'moving') {
      return (
        this.#move?.update({
          pointerId,
          shiftKey: position.shiftKey,
          worldPoint: position.worldPoint,
        }) ?? false
      );
    }
    if (!exceedsClickMovementThreshold(gesture.startViewportPoint, position.viewportPoint)) {
      return true;
    }
    if (gesture.hitStack.length > 0) {
      if (this.#beginMove(gesture, position)) {
        return true;
      }
      if (gesture.clickEligible) {
        this.#setActiveGesture(Object.freeze({ ...gesture, clickEligible: false }));
      }
      return true;
    }
    const marquee: ActiveMarquee = Object.freeze({
      currentViewportPoint: position.viewportPoint,
      kind: 'marquee',
      mode: getMarqueeMode(gesture.startViewportPoint, position.viewportPoint),
      pointerId: gesture.pointerId,
      previewIds: Object.freeze([]),
      selectionAtPress: gesture.selectionAtPress,
      shiftKey: gesture.shiftKey,
      startViewportPoint: gesture.startViewportPoint,
      startWorldPoint: gesture.startWorldPoint,
    });
    this.#setActiveGesture(this.#updateMarquee(marquee, position));
    return true;
  }

  completePress(pointerId: number, position: SelectionPointerUpdate): boolean {
    if (!this.updatePress(pointerId, position)) {
      return false;
    }
    const gesture = this.#activeGesture;
    if (gesture === undefined) {
      return false;
    }
    if (gesture.kind === 'moving') {
      // Release gesture ownership before the synchronous document commit can
      // reconcile the scene and notify cancellation observers.
      this.#setActiveGesture(undefined);
      const completion = this.#move?.complete({
        pointerId,
        shiftKey: position.shiftKey,
        worldPoint: position.worldPoint,
      });
      if (completion === false || completion === 'failed' || completion === undefined) {
        this.#restoreSelection(gesture.selectionAtPress);
      }
      return true;
    }
    this.#setActiveGesture(undefined);
    if (gesture.kind === 'marquee') {
      this.#commitMarquee(gesture);
    } else if (gesture.clickEligible) {
      this.#commitClick(gesture);
    }
    return true;
  }

  cancelPress(pointerId?: number): boolean {
    const gesture = this.#activeGesture;
    if (gesture === undefined || (pointerId !== undefined && gesture.pointerId !== pointerId)) {
      return false;
    }
    if (gesture.kind === 'moving') {
      this.#move?.cancel(gesture.pointerId);
      this.#restoreSelection(gesture.selectionAtPress);
    }
    this.#setActiveGesture(undefined);
    return true;
  }

  clearSelectionWhenIdle(): boolean {
    return this.#activeGesture === undefined && this.#selection.clear();
  }

  selectAllWhenIdle(): boolean {
    return (
      this.#activeGesture === undefined &&
      this.#selection.replace(copyUniqueIds(this.#geometry.listSelectableIds()))
    );
  }

  #commitClick(gesture: ActivePressed): void {
    const hitId = this.#resolveClickHit(gesture);
    if (!gesture.shiftKey) {
      if (hitId === undefined) {
        this.#selection.clear();
      } else {
        this.#selection.selectOnly(hitId);
      }
      return;
    }
    if (hitId === undefined) {
      return;
    }

    const selectedIds = gesture.selectionAtPress.selectedIds;
    if (selectedIds.includes(hitId)) {
      const remaining = selectedIds.filter((id) => id !== hitId);
      const nextPrimary =
        gesture.selectionAtPress.primaryId === hitId
          ? remaining[remaining.length - 1]
          : gesture.selectionAtPress.primaryId;
      this.#selection.replace(remaining, nextPrimary);
      return;
    }
    this.#selection.replace([...selectedIds, hitId], hitId);
  }

  #beginMove(gesture: ActivePressed, position: SelectionPointerUpdate): boolean {
    const hitId = this.#resolveClickHit(gesture);
    if (hitId === undefined || this.#move === undefined) {
      return false;
    }
    const selectedIds = gesture.selectionAtPress.selectedIds;
    const targetIds = selectedIds.includes(hitId)
      ? selectedIds
      : gesture.shiftKey
        ? [...selectedIds, hitId]
        : [hitId];
    this.#selection.replace(targetIds, hitId);
    if (
      !this.#move.begin({
        pointerId: gesture.pointerId,
        shiftKey: position.shiftKey,
        startWorldPoint: gesture.startWorldPoint,
        targetIds,
        worldPoint: position.worldPoint,
      })
    ) {
      this.#restoreSelection(gesture.selectionAtPress);
      return false;
    }
    this.#setActiveGesture(
      Object.freeze({
        kind: 'moving',
        pointerId: gesture.pointerId,
        selectionAtPress: gesture.selectionAtPress,
      }),
    );
    return true;
  }

  #commitMarquee(gesture: ActiveMarquee): void {
    if (!gesture.shiftKey) {
      this.#selection.replace(gesture.previewIds);
      return;
    }
    const combined = [...gesture.selectionAtPress.selectedIds];
    for (const id of gesture.previewIds) {
      if (!combined.includes(id)) {
        combined.push(id);
      }
    }
    this.#selection.replace(
      combined,
      gesture.previewIds[gesture.previewIds.length - 1] ?? gesture.selectionAtPress.primaryId,
    );
  }

  #resolveClickHit(gesture: ActivePressed): ElementId | undefined {
    const topmost = gesture.hitStack[0];
    if (!gesture.altKey || topmost === undefined) {
      return topmost;
    }
    const currentIndex =
      gesture.selectionAtPress.primaryId === undefined
        ? -1
        : gesture.hitStack.indexOf(gesture.selectionAtPress.primaryId);
    return gesture.hitStack[(currentIndex + 1) % gesture.hitStack.length];
  }

  #restoreSelection(snapshot: SelectionSnapshot): void {
    this.#selection.replace(snapshot.selectedIds, snapshot.primaryId);
  }

  #setActiveGesture(gesture: ActiveSelectionGesture | undefined): void {
    this.#activeGesture = gesture;
    this.#snapshot = gesture === undefined ? IDLE_SNAPSHOT : toPublicSnapshot(gesture);
    for (const listener of this.#listeners) {
      listener();
    }
  }

  #updateMarquee(gesture: ActiveMarquee, position: SelectionPointerPosition): ActiveMarquee {
    const mode = getMarqueeMode(gesture.startViewportPoint, position.viewportPoint);
    const previewIds = copyUniqueIds(
      this.#geometry.querySelectionRegion(
        createMarqueeWorldBounds(gesture.startWorldPoint, position.worldPoint),
        mode,
      ),
    );
    return Object.freeze({
      ...gesture,
      currentViewportPoint: position.viewportPoint,
      mode,
      previewIds,
    });
  }
}
