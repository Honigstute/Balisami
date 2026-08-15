import { ElementIdSchema, type ElementId } from '../../domain';
import { CONTROL_TEXT_POLICY } from '../../shared/control-text';
import type { SelectionStore } from './selection-store';
import { createWorldRect, type WorldPoint, type WorldRect } from './viewport-transform';

export const TEXT_EDIT_POLICY = Object.freeze({
  maximumAccessibleLabelLength: 120,
  maximumTextLength: CONTROL_TEXT_POLICY.maximumLength,
});

export type TextEditMode = 'multiline' | 'single-line';

export interface TextEditTarget {
  readonly accessibleLabel: string;
  readonly elementId: ElementId;
  readonly fontSizeWorldUnits: number;
  readonly mode: TextEditMode;
  readonly text: string;
  readonly worldBounds: WorldRect;
}

export interface TextEditInteractionSource {
  readonly capture: (elementId: ElementId) => TextEditTarget | undefined;
  readonly commit: (target: TextEditTarget, text: string) => boolean;
}

export type TextEditCompletion = 'committed' | 'failed' | 'unchanged';

export type TextEditInteractionSnapshot =
  | { readonly kind: 'idle'; readonly revision: number }
  | {
      readonly draft: string;
      readonly isComposing: boolean;
      readonly kind: 'editingText';
      readonly revision: number;
      readonly target: TextEditTarget;
    };

interface ActiveTextEdit {
  readonly draft: string;
  readonly isComposing: boolean;
  readonly target: TextEditTarget;
}

export interface TextEditViewportRoute {
  readonly beginFromSelection: () => boolean;
  readonly beginFromWorldPoint: (point: WorldPoint) => boolean;
  readonly cancel: () => boolean;
  readonly getSnapshot: () => TextEditInteractionSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
}

interface TextEditViewportRouteOptions {
  readonly interaction: TextEditInteraction;
  readonly queryPointerTarget: (point: WorldPoint) => ElementId | undefined;
  readonly selection: SelectionStore;
}

const normalizeTarget = (
  target: TextEditTarget,
  expectedId: ElementId,
): TextEditTarget | undefined => {
  const parsedId = ElementIdSchema.safeParse(target.elementId);
  if (
    !parsedId.success ||
    parsedId.data !== expectedId ||
    (target.mode !== 'multiline' && target.mode !== 'single-line') ||
    typeof target.text !== 'string' ||
    target.text.length > TEXT_EDIT_POLICY.maximumTextLength ||
    typeof target.accessibleLabel !== 'string' ||
    target.accessibleLabel.trim().length === 0 ||
    target.accessibleLabel.length > TEXT_EDIT_POLICY.maximumAccessibleLabelLength ||
    !Number.isFinite(target.fontSizeWorldUnits) ||
    target.fontSizeWorldUnits <= 0
  ) {
    return undefined;
  }
  try {
    return Object.freeze({
      accessibleLabel: target.accessibleLabel,
      elementId: parsedId.data,
      fontSizeWorldUnits: target.fontSizeWorldUnits,
      mode: target.mode,
      text: target.text,
      worldBounds: createWorldRect(
        target.worldBounds.x,
        target.worldBounds.y,
        target.worldBounds.width,
        target.worldBounds.height,
      ),
    });
  } catch {
    return undefined;
  }
};

const targetsEqual = (first: TextEditTarget, second: TextEditTarget): boolean =>
  first.elementId === second.elementId &&
  first.text === second.text &&
  first.mode === second.mode &&
  first.accessibleLabel === second.accessibleLabel &&
  first.fontSizeWorldUnits === second.fontSizeWorldUnits &&
  first.worldBounds.x === second.worldBounds.x &&
  first.worldBounds.y === second.worldBounds.y &&
  first.worldBounds.width === second.worldBounds.width &&
  first.worldBounds.height === second.worldBounds.height;

/**
 * Sole authority for one in-place text edit. Draft and composition state are
 * session-only; completion releases edit ownership before a synchronous
 * document commit can reconcile the scene.
 */
export class TextEditInteraction {
  readonly #listeners = new Set<() => void>();
  readonly #source: TextEditInteractionSource;
  #active: ActiveTextEdit | undefined;
  #revision = 0;
  #snapshot: TextEditInteractionSnapshot = Object.freeze({ kind: 'idle', revision: 0 });

  constructor(source: TextEditInteractionSource) {
    this.#source = source;
  }

  getSnapshot = (): TextEditInteractionSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  begin(elementId: ElementId): boolean {
    if (this.#active !== undefined) {
      return false;
    }
    let captured: TextEditTarget | undefined;
    try {
      const target = this.#source.capture(elementId);
      captured = target === undefined ? undefined : normalizeTarget(target, elementId);
    } catch {
      captured = undefined;
    }
    if (captured === undefined) {
      return false;
    }
    this.#active = Object.freeze({
      draft: captured.text,
      isComposing: false,
      target: captured,
    });
    this.#publishActive();
    return true;
  }

  updateDraft(draft: string): boolean {
    const active = this.#active;
    if (active === undefined || typeof draft !== 'string') {
      return false;
    }
    const normalizedDraft =
      active.target.mode === 'single-line' ? draft.replace(/[\r\n]+/gu, ' ') : draft;
    if (
      normalizedDraft.length > TEXT_EDIT_POLICY.maximumTextLength ||
      normalizedDraft === active.draft
    ) {
      return false;
    }
    this.#active = Object.freeze({ ...active, draft: normalizedDraft });
    this.#publishActive();
    return true;
  }

  setComposing(isComposing: boolean): boolean {
    const active = this.#active;
    if (active === undefined || active.isComposing === isComposing) {
      return false;
    }
    this.#active = Object.freeze({ ...active, isComposing });
    this.#publishActive();
    return true;
  }

  complete(): TextEditCompletion | false {
    const active = this.#active;
    if (active === undefined || active.isComposing) {
      return false;
    }
    if (active.draft === active.target.text) {
      this.#finish();
      return 'unchanged';
    }

    // Release internal ownership first: an accepted synchronous command may
    // reconcile the scene. Publish only the final outcome so a failed commit
    // cannot flicker or remount the DOM editor between states.
    this.#active = undefined;
    let committed = false;
    try {
      committed = this.#source.commit(active.target, active.draft);
    } catch {
      committed = false;
    }
    if (committed) {
      this.#publishIdle();
      return 'committed';
    }
    this.#active = active;
    this.#publishActive();
    return 'failed';
  }

  cancel(): boolean {
    if (this.#active === undefined) {
      return false;
    }
    this.#finish();
    return true;
  }

  /** Cancels when selection or canonical target data no longer matches capture. */
  reconcileTarget(selectedElementId: ElementId | undefined): boolean {
    const active = this.#active;
    if (active === undefined) {
      return false;
    }
    if (selectedElementId !== active.target.elementId) {
      return this.cancel();
    }
    let current: TextEditTarget | undefined;
    try {
      const captured = this.#source.capture(active.target.elementId);
      current =
        captured === undefined ? undefined : normalizeTarget(captured, active.target.elementId);
    } catch {
      current = undefined;
    }
    return current === undefined || !targetsEqual(current, active.target) ? this.cancel() : false;
  }

  #finish(): void {
    this.#active = undefined;
    this.#publishIdle();
  }

  #publishIdle(): void {
    this.#publish(Object.freeze({ kind: 'idle', revision: this.#nextRevision() }));
  }

  #nextRevision(): number {
    this.#revision += 1;
    return this.#revision;
  }

  #publishActive(): void {
    const active = this.#active;
    if (active === undefined) {
      return;
    }
    this.#publish(
      Object.freeze({
        draft: active.draft,
        isComposing: active.isComposing,
        kind: 'editingText',
        revision: this.#nextRevision(),
        target: active.target,
      }),
    );
  }

  #publish(snapshot: TextEditInteractionSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

/** Binds pointer/keyboard entry to selection without creating another state owner. */
export const createTextEditViewportRoute = ({
  interaction,
  queryPointerTarget,
  selection,
}: TextEditViewportRouteOptions): TextEditViewportRoute =>
  Object.freeze({
    beginFromSelection: () => {
      const snapshot = selection.getSnapshot();
      const targetId = snapshot.selectedIds.length === 1 ? snapshot.primaryId : undefined;
      return targetId === undefined ? false : interaction.begin(targetId);
    },
    beginFromWorldPoint: (point: WorldPoint) => {
      const targetId = queryPointerTarget(point);
      if (targetId === undefined || !interaction.begin(targetId)) {
        return false;
      }
      selection.selectOnly(targetId);
      return true;
    },
    cancel: () => interaction.cancel(),
    getSnapshot: interaction.getSnapshot,
    subscribe: interaction.subscribe,
  });
