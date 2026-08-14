import type { ElementId } from '../../domain';
import type { DocumentSceneSelectionRegionMode } from './document-scene-model';
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

type ActiveSelectionGesture = ActiveMarquee | ActivePressed;

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

const toPublicSnapshot = (gesture: ActiveSelectionGesture): SelectionInteractionSnapshot =>
  gesture.kind === 'pressed'
    ? Object.freeze({
        clickEligible: gesture.clickEligible,
        kind: 'pressed',
        pointerId: gesture.pointerId,
      })
    : Object.freeze({
        currentViewportPoint: gesture.currentViewportPoint,
        kind: 'marquee',
        mode: gesture.mode,
        pointerId: gesture.pointerId,
        previewIds: gesture.previewIds,
        startViewportPoint: gesture.startViewportPoint,
      });

const copyUniqueIds = (ids: readonly ElementId[]): readonly ElementId[] =>
  Object.freeze([...new Set(ids)]);

/**
 * Session-only selection gesture authority. Click and marquee previews never
 * receive document/history mutation APIs, and completed selection scope
 * changes remain outside persistent history.
 */
export class SelectionInteraction {
  readonly #geometry: SelectionInteractionGeometry;
  readonly #listeners = new Set<() => void>();
  readonly #selection: SelectionStore;
  #activeGesture: ActiveSelectionGesture | undefined;
  #snapshot: SelectionInteractionSnapshot = IDLE_SNAPSHOT;

  constructor(selection: SelectionStore, geometry: SelectionInteractionGeometry) {
    this.#selection = selection;
    this.#geometry = geometry;
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

  updatePress(pointerId: number, position: SelectionPointerPosition): boolean {
    const gesture = this.#activeGesture;
    if (gesture === undefined || gesture.pointerId !== pointerId) {
      return false;
    }
    if (gesture.kind === 'marquee') {
      this.#setActiveGesture(this.#updateMarquee(gesture, position));
      return true;
    }
    if (!exceedsClickMovementThreshold(gesture.startViewportPoint, position.viewportPoint)) {
      return true;
    }
    if (gesture.hitStack.length > 0) {
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

  completePress(pointerId: number, position: SelectionPointerPosition): boolean {
    if (!this.updatePress(pointerId, position)) {
      return false;
    }
    const gesture = this.#activeGesture;
    if (gesture === undefined) {
      return false;
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
