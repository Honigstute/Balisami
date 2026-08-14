import type { ElementId } from '../../domain';
import type { ViewportPoint, WorldPoint } from './viewport-transform';
import type { SelectionSnapshot, SelectionStore } from './selection-store';

export const SELECTION_INTERACTION_POLICY = Object.freeze({
  clickMovementThresholdPixels: 4,
});

export interface SelectionPressInput {
  readonly pointerId: number;
  readonly shiftKey: boolean;
  readonly viewportPoint: ViewportPoint;
  readonly worldPoint: WorldPoint;
}

export type SelectionInteractionSnapshot =
  | { readonly kind: 'idle' }
  | {
      readonly clickEligible: boolean;
      readonly kind: 'pressed';
      readonly pointerId: number;
    };

interface ActiveSelectionPress {
  readonly hitId: ElementId | undefined;
  readonly pointerId: number;
  readonly selectionAtPress: SelectionSnapshot;
  readonly shiftKey: boolean;
  readonly startViewportPoint: ViewportPoint;
  clickEligible: boolean;
}

const IDLE_SNAPSHOT: SelectionInteractionSnapshot = Object.freeze({ kind: 'idle' });

const createPressedSnapshot = (press: ActiveSelectionPress): SelectionInteractionSnapshot =>
  Object.freeze({
    clickEligible: press.clickEligible,
    kind: 'pressed',
    pointerId: press.pointerId,
  });

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

/**
 * Pure pressed/click lifecycle. Preview-free presses do not mutate selection;
 * completion commits once, and cancellation restores exact session state by
 * having never changed it. Move and marquee promotion will extend this seam.
 */
export class SelectionInteraction {
  readonly #hitTest: (point: WorldPoint) => ElementId | undefined;
  readonly #selection: SelectionStore;
  #activePress: ActiveSelectionPress | undefined;

  constructor(selection: SelectionStore, hitTest: (point: WorldPoint) => ElementId | undefined) {
    this.#selection = selection;
    this.#hitTest = hitTest;
  }

  getSnapshot(): SelectionInteractionSnapshot {
    return this.#activePress === undefined
      ? IDLE_SNAPSHOT
      : createPressedSnapshot(this.#activePress);
  }

  beginPress(input: SelectionPressInput): boolean {
    if (this.#activePress !== undefined) {
      return false;
    }
    this.#activePress = {
      clickEligible: true,
      hitId: this.#hitTest(input.worldPoint),
      pointerId: requirePointerId(input.pointerId),
      selectionAtPress: this.#selection.getSnapshot(),
      shiftKey: input.shiftKey,
      startViewportPoint: input.viewportPoint,
    };
    return true;
  }

  updatePress(pointerId: number, viewportPoint: ViewportPoint): boolean {
    const press = this.#activePress;
    if (press === undefined || press.pointerId !== pointerId) {
      return false;
    }
    if (
      press.clickEligible &&
      exceedsClickMovementThreshold(press.startViewportPoint, viewportPoint)
    ) {
      press.clickEligible = false;
    }
    return true;
  }

  completePress(pointerId: number, viewportPoint: ViewportPoint): boolean {
    const press = this.#activePress;
    if (press === undefined || press.pointerId !== pointerId) {
      return false;
    }
    this.updatePress(pointerId, viewportPoint);
    this.#activePress = undefined;
    if (!press.clickEligible) {
      return true;
    }
    this.#commitClick(press);
    return true;
  }

  cancelPress(pointerId?: number): boolean {
    const press = this.#activePress;
    if (press === undefined || (pointerId !== undefined && press.pointerId !== pointerId)) {
      return false;
    }
    this.#activePress = undefined;
    return true;
  }

  clearSelectionWhenIdle(): boolean {
    return this.#activePress === undefined && this.#selection.clear();
  }

  #commitClick(press: ActiveSelectionPress): void {
    const hitId = press.hitId;
    if (!press.shiftKey) {
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

    const selectedIds = press.selectionAtPress.selectedIds;
    if (selectedIds.includes(hitId)) {
      const remaining = selectedIds.filter((id) => id !== hitId);
      const nextPrimary =
        press.selectionAtPress.primaryId === hitId
          ? remaining[remaining.length - 1]
          : press.selectionAtPress.primaryId;
      this.#selection.replace(remaining, nextPrimary);
      return;
    }
    this.#selection.replace([...selectedIds, hitId], hitId);
  }
}
