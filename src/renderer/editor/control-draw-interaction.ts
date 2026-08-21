import {
  getControlSpecByDrawShortcut,
  type ControlDefinition,
  type ControlTypeId,
} from '../../domain';
import {
  createWorldRect,
  type ViewportPoint,
  type WorldPoint,
  type WorldRect,
} from './viewport-transform';

export const CONTROL_DRAW_POLICY = Object.freeze({ minimumDragDistancePixels: 4 });

export interface ControlDrawCommitSource {
  readonly commit: (controlType: ControlTypeId, frame: WorldRect) => boolean;
}

export type ControlDrawSnapshot =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{
      controlType: ControlTypeId;
      kind: 'armed';
      label: string;
      shortcut: string;
    }>
  | Readonly<{
      controlType: ControlTypeId;
      currentViewportPoint: ViewportPoint;
      frame: WorldRect;
      kind: 'drawing';
      label: string;
      pointerId: number;
      shortcut: string;
      startViewportPoint: ViewportPoint;
    }>;

interface ActiveDraw {
  readonly currentViewportPoint: ViewportPoint;
  readonly currentWorldPoint: WorldPoint;
  readonly definition: ControlDefinition;
  readonly pointerId: number;
  readonly startViewportPoint: ViewportPoint;
  readonly startWorldPoint: WorldPoint;
}

const IDLE_SNAPSHOT: ControlDrawSnapshot = Object.freeze({ kind: 'idle' });

const clampDimension = (value: number, minimum: number, maximum?: number): number =>
  Math.min(maximum ?? Number.POSITIVE_INFINITY, Math.max(minimum, Math.abs(value)));

/** Registry size limits shape the final document frame; DOM bounds never do. */
export const createControlDrawFrame = (
  definition: ControlDefinition,
  start: WorldPoint,
  current: WorldPoint,
): WorldRect => {
  const width = clampDimension(
    current.x - start.x,
    definition.minimumSize.width,
    definition.maximumSize?.width,
  );
  const height = clampDimension(
    current.y - start.y,
    definition.minimumSize.height,
    definition.maximumSize?.height,
  );
  return createWorldRect(
    current.x >= start.x ? start.x : start.x - width,
    current.y >= start.y ? start.y : start.y - height,
    width,
    height,
  );
};

const exceedsMinimumDrag = (start: ViewportPoint, current: ViewportPoint): boolean => {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  const threshold = CONTROL_DRAW_POLICY.minimumDragDistancePixels;
  return deltaX * deltaX + deltaY * deltaY > threshold * threshold;
};

const requirePointerId = (pointerId: number): number => {
  if (!Number.isSafeInteger(pointerId) || pointerId < 0) {
    throw new RangeError('Control draw pointer ID must be a non-negative safe integer.');
  }
  return pointerId;
};

/**
 * Transient authority for hold-key draw gestures. Pointer motion updates only
 * its preview; completion is the sole route across the document command boundary.
 */
export class ControlDrawInteraction {
  readonly #listeners = new Set<() => void>();
  readonly #source: ControlDrawCommitSource;
  #active: ActiveDraw | undefined;
  #pressedShortcut: string | undefined;
  #snapshot: ControlDrawSnapshot = IDLE_SNAPSHOT;

  constructor(source: ControlDrawCommitSource) {
    this.#source = source;
  }

  getSnapshot(): ControlDrawSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  arm(shortcut: string): boolean {
    if (this.#active !== undefined) {
      return false;
    }
    const definition = getControlSpecByDrawShortcut(shortcut);
    const palette = definition?.palette;
    if (
      definition === undefined ||
      palette === null ||
      palette === undefined ||
      palette.drawShortcut !== shortcut
    ) {
      return false;
    }
    this.#pressedShortcut = shortcut;
    this.#setSnapshot(
      Object.freeze({
        controlType: definition.type,
        kind: 'armed',
        label: palette.label,
        shortcut,
      }),
    );
    return true;
  }

  disarm(shortcut: string): boolean {
    if (this.#pressedShortcut !== shortcut) {
      return false;
    }
    this.#pressedShortcut = undefined;
    if (this.#active === undefined) {
      this.#setSnapshot(IDLE_SNAPSHOT);
    }
    return true;
  }

  begin(
    pointerId: number,
    position: Readonly<{ viewportPoint: ViewportPoint; worldPoint: WorldPoint }>,
  ): boolean {
    const snapshot = this.#snapshot;
    if (snapshot.kind !== 'armed' || this.#active !== undefined) {
      return false;
    }
    const definition = getControlSpecByDrawShortcut(snapshot.shortcut);
    if (definition === undefined || definition.type !== snapshot.controlType) {
      return false;
    }
    this.#active = Object.freeze({
      currentViewportPoint: position.viewportPoint,
      currentWorldPoint: position.worldPoint,
      definition,
      pointerId: requirePointerId(pointerId),
      startViewportPoint: position.viewportPoint,
      startWorldPoint: position.worldPoint,
    });
    this.#publishActive();
    return true;
  }

  update(
    pointerId: number,
    position: Readonly<{ viewportPoint: ViewportPoint; worldPoint: WorldPoint }>,
  ): boolean {
    const active = this.#active;
    if (active === undefined || active.pointerId !== pointerId) {
      return false;
    }
    this.#active = Object.freeze({
      ...active,
      currentViewportPoint: position.viewportPoint,
      currentWorldPoint: position.worldPoint,
    });
    this.#publishActive();
    return true;
  }

  complete(
    pointerId: number,
    position: Readonly<{ viewportPoint: ViewportPoint; worldPoint: WorldPoint }>,
  ): boolean {
    if (!this.update(pointerId, position)) {
      return false;
    }
    const active = this.#active;
    if (active === undefined) {
      return false;
    }
    const shouldCommit = exceedsMinimumDrag(active.startViewportPoint, active.currentViewportPoint);
    const frame = createControlDrawFrame(
      active.definition,
      active.startWorldPoint,
      active.currentWorldPoint,
    );
    // Release transient gesture ownership before the synchronous command can
    // publish a new document and selection.
    this.#active = undefined;
    this.#publishResting(active.definition);
    if (shouldCommit) {
      this.#source.commit(active.definition.type, frame);
    }
    return true;
  }

  cancel(pointerId?: number): boolean {
    const active = this.#active;
    if (active === undefined || (pointerId !== undefined && active.pointerId !== pointerId)) {
      return false;
    }
    this.#active = undefined;
    this.#publishResting(active.definition);
    return true;
  }

  clear(): void {
    this.#active = undefined;
    this.#pressedShortcut = undefined;
    this.#setSnapshot(IDLE_SNAPSHOT);
  }

  #publishActive(): void {
    const active = this.#active;
    const palette = active?.definition.palette;
    const shortcut = palette?.drawShortcut;
    if (
      active === undefined ||
      palette === null ||
      palette === undefined ||
      shortcut === null ||
      shortcut === undefined
    ) {
      this.#setSnapshot(IDLE_SNAPSHOT);
      return;
    }
    this.#setSnapshot(
      Object.freeze({
        controlType: active.definition.type,
        currentViewportPoint: active.currentViewportPoint,
        frame: createControlDrawFrame(
          active.definition,
          active.startWorldPoint,
          active.currentWorldPoint,
        ),
        kind: 'drawing',
        label: palette.label,
        pointerId: active.pointerId,
        shortcut,
        startViewportPoint: active.startViewportPoint,
      }),
    );
  }

  #publishResting(definition: ControlDefinition): void {
    const palette = definition.palette;
    const shortcut = palette?.drawShortcut;
    if (
      palette === null ||
      palette === undefined ||
      shortcut === null ||
      shortcut === undefined ||
      shortcut !== this.#pressedShortcut
    ) {
      this.#setSnapshot(IDLE_SNAPSHOT);
      return;
    }
    this.#setSnapshot(
      Object.freeze({
        controlType: definition.type,
        kind: 'armed',
        label: palette.label,
        shortcut,
      }),
    );
  }

  #setSnapshot(snapshot: ControlDrawSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
