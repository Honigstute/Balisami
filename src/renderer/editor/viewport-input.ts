import type { ViewportCameraStore } from './viewport-camera-store';
import type { ViewportFramingRequest } from './viewport-framing';
import {
  isKeyboardNudgeKey,
  type KeyboardNudgeInteraction,
  type KeyboardNudgeKey,
} from './keyboard-nudge-interaction';
import type { SelectionInteraction, SelectionPointerPosition } from './selection-interaction';
import type { ResizeHandle } from './resize-geometry';
import type { SelectionStore } from './selection-store';
import type { ViewportShortcutPlatform } from './viewport-commands';
import {
  clientPointToViewport,
  createClientPoint,
  createViewportClientBounds,
  createViewportTransform,
  createViewportVector,
  viewportPointToWorld,
  type ViewportPoint,
  type ViewportTransform,
} from './viewport-transform';

export const VIEWPORT_INPUT_POLICY = Object.freeze({
  lineHeightPixels: 16,
  maximumWheelDeltaPixels: 1_000,
  zoomSensitivity: 0.002,
});

export const VIEWPORT_DELETE_KEYS = Object.freeze(['Delete', 'Backspace'] as const);
export type ViewportDeleteKey = (typeof VIEWPORT_DELETE_KEYS)[number];

export interface ViewportWheelInput {
  readonly clientX: number;
  readonly clientY: number;
  readonly ctrlKey: boolean;
  readonly deltaMode: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

export type ViewportWheelAction =
  | { readonly factor: number; readonly kind: 'zoom' }
  | { readonly deltaX: number; readonly deltaY: number; readonly kind: 'pan' };

export interface ViewportDuplicateShortcutInput {
  readonly altKey: boolean;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

export interface ViewportInputControllerOptions {
  readonly deleteSelection?: () => boolean;
  readonly duplicateSelection?: () => boolean;
  readonly keyboardNudge?: KeyboardNudgeInteraction;
  readonly selection?: SelectionStore;
  readonly selectionInteraction?: SelectionInteraction;
  readonly shortcutPlatform?: ViewportShortcutPlatform;
}

interface ActivePan {
  readonly startFraming: ViewportFramingRequest;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startTransform: ViewportTransform;
}

const PIXEL_DELTA_MODE = 0;
const LINE_DELTA_MODE = 1;
const PAGE_DELTA_MODE = 2;
const VIEWPORT_DELETE_KEY_SET = new Set<string>(VIEWPORT_DELETE_KEYS);

export const isViewportDeleteKey = (code: string): code is ViewportDeleteKey =>
  VIEWPORT_DELETE_KEY_SET.has(code);

/** Cmd+D on macOS and Ctrl+D on Windows own the same editor command. */
export const isViewportDuplicateShortcut = (
  input: ViewportDuplicateShortcutInput,
  platform: ViewportShortcutPlatform,
): boolean =>
  input.code === 'KeyD' &&
  !input.altKey &&
  !input.shiftKey &&
  (platform === 'darwin' ? input.metaKey && !input.ctrlKey : input.ctrlKey && !input.metaKey);

const clampWheelDelta = (value: number): number =>
  Math.max(
    -VIEWPORT_INPUT_POLICY.maximumWheelDeltaPixels,
    Math.min(VIEWPORT_INPUT_POLICY.maximumWheelDeltaPixels, value),
  );

const invertWheelDelta = (value: number): number => (value === 0 ? 0 : -value);

const getDeltaScale = (deltaMode: number, viewportHeight: number): number | undefined => {
  switch (deltaMode) {
    case PIXEL_DELTA_MODE:
      return 1;
    case LINE_DELTA_MODE:
      return VIEWPORT_INPUT_POLICY.lineHeightPixels;
    case PAGE_DELTA_MODE:
      return viewportHeight;
    default:
      return undefined;
  }
};

/** Converts browser wheel units into one platform-neutral pan or zoom intent. */
export const normalizeViewportWheel = (
  input: ViewportWheelInput,
  viewportHeight: number,
): ViewportWheelAction | undefined => {
  if (
    !Number.isFinite(input.clientX) ||
    !Number.isFinite(input.clientY) ||
    !Number.isFinite(input.deltaX) ||
    !Number.isFinite(input.deltaY) ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0
  ) {
    return undefined;
  }
  const scale = getDeltaScale(input.deltaMode, viewportHeight);
  if (scale === undefined) {
    return undefined;
  }
  const deltaX = clampWheelDelta(input.deltaX * scale);
  const deltaY = clampWheelDelta(input.deltaY * scale);
  if (input.ctrlKey || input.metaKey) {
    if (deltaY === 0) {
      return undefined;
    }
    return Object.freeze({
      factor: Math.exp(-deltaY * VIEWPORT_INPUT_POLICY.zoomSensitivity),
      kind: 'zoom',
    });
  }
  if (deltaX === 0 && deltaY === 0) {
    return undefined;
  }
  if (input.shiftKey && deltaX === 0) {
    return Object.freeze({ deltaX: invertWheelDelta(deltaY), deltaY: 0, kind: 'pan' });
  }
  return Object.freeze({
    deltaX: invertWheelDelta(deltaX),
    deltaY: invertWheelDelta(deltaY),
    kind: 'pan',
  });
};

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest(
    'a, button, input, select, textarea, [contenteditable="true"], [role="button"], [role="slider"]',
  ) !== null;

const shouldStartPan = (event: PointerEvent, spacePressed: boolean): boolean =>
  event.button === 1 || (event.button === 0 && spacePressed);

/**
 * DOM adapter for transient viewport navigation. It owns only input lifecycle;
 * the camera store remains the authority for transform state and frame pacing.
 */
export class ViewportInputController {
  readonly #camera: ViewportCameraStore;
  readonly #deleteSelection: (() => boolean) | undefined;
  readonly #duplicateSelection: (() => boolean) | undefined;
  readonly #keyboardNudge: KeyboardNudgeInteraction | undefined;
  readonly #root: HTMLElement;
  readonly #selection: SelectionStore | undefined;
  readonly #selectionInteraction: SelectionInteraction | undefined;
  readonly #shortcutPlatform: ViewportShortcutPlatform | undefined;

  #activePan: ActivePan | undefined;
  #activeNudgeKeys = new Set<KeyboardNudgeKey>();
  #activeNudgeSelectionRevision: number | undefined;
  #connected = false;
  #hoveredResizeHandle: ResizeHandle | undefined;
  #spacePressed = false;
  #unsubscribeKeyboardNudge: (() => void) | undefined;
  #unsubscribeSelection: (() => void) | undefined;
  #unsubscribeSelectionInteraction: (() => void) | undefined;

  constructor(
    root: HTMLElement,
    camera: ViewportCameraStore,
    options: ViewportInputControllerOptions = {},
  ) {
    this.#root = root;
    this.#camera = camera;
    this.#selectionInteraction = options.selectionInteraction;
    this.#keyboardNudge = options.keyboardNudge;
    this.#selection = options.selection;
    this.#deleteSelection = options.deleteSelection;
    this.#duplicateSelection = options.duplicateSelection;
    this.#shortcutPlatform = options.shortcutPlatform;
  }

  connect(): void {
    if (this.#connected) {
      return;
    }
    this.#connected = true;
    this.#root.addEventListener('keydown', this.#handleKeyDown);
    this.#root.addEventListener('pointercancel', this.#handlePointerCancel);
    this.#root.addEventListener('pointerdown', this.#handlePointerDown);
    this.#root.addEventListener('pointerleave', this.#handlePointerLeave);
    this.#root.addEventListener('pointermove', this.#handlePointerMove);
    this.#root.addEventListener('pointerup', this.#handlePointerUp);
    this.#root.addEventListener('lostpointercapture', this.#handleLostPointerCapture);
    this.#root.addEventListener('wheel', this.#handleWheel, { passive: false });
    window.addEventListener('blur', this.#handleWindowBlur);
    window.addEventListener('keyup', this.#handleKeyUp);
    this.#unsubscribeKeyboardNudge = this.#keyboardNudge?.subscribe(this.#updateSelectionState);
    this.#unsubscribeSelection = this.#selection?.subscribe(this.#handleSelectionChange);
    this.#unsubscribeSelectionInteraction = this.#selectionInteraction?.subscribe(
      this.#updateSelectionState,
    );
    this.#updateSelectionState();
  }

  disconnect(): void {
    if (!this.#connected) {
      return;
    }
    this.#cancelPan();
    this.#cancelKeyboardNudge();
    this.#cancelSelectionPress();
    this.#connected = false;
    this.#spacePressed = false;
    this.#hoveredResizeHandle = undefined;
    this.#unsubscribeKeyboardNudge?.();
    this.#unsubscribeKeyboardNudge = undefined;
    this.#unsubscribeSelection?.();
    this.#unsubscribeSelection = undefined;
    this.#unsubscribeSelectionInteraction?.();
    this.#unsubscribeSelectionInteraction = undefined;
    this.#updatePanState();
    this.#updateSelectionState();
    this.#root.removeEventListener('keydown', this.#handleKeyDown);
    this.#root.removeEventListener('pointercancel', this.#handlePointerCancel);
    this.#root.removeEventListener('pointerdown', this.#handlePointerDown);
    this.#root.removeEventListener('pointerleave', this.#handlePointerLeave);
    this.#root.removeEventListener('pointermove', this.#handlePointerMove);
    this.#root.removeEventListener('pointerup', this.#handlePointerUp);
    this.#root.removeEventListener('lostpointercapture', this.#handleLostPointerCapture);
    this.#root.removeEventListener('wheel', this.#handleWheel);
    window.removeEventListener('blur', this.#handleWindowBlur);
    window.removeEventListener('keyup', this.#handleKeyUp);
  }

  #handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' && this.#activePan !== undefined) {
      event.preventDefault();
      this.#cancelPan();
      return;
    }
    if (event.code === 'Escape' && this.#cancelKeyboardNudge()) {
      event.preventDefault();
      return;
    }
    if (event.code === 'Escape') {
      const selectionSnapshot = this.#selectionInteraction?.getSnapshot();
      if (
        selectionSnapshot !== undefined &&
        selectionSnapshot.kind !== 'idle' &&
        this.#selectionInteraction?.cancelPress(selectionSnapshot.pointerId)
      ) {
        event.preventDefault();
        this.#releaseSelectionPointerCapture(selectionSnapshot.pointerId);
        this.#updateSelectionState();
        return;
      }
      if (this.#selectionInteraction?.clearSelectionWhenIdle()) {
        event.preventDefault();
        this.#updateSelectionState();
        return;
      }
    }
    if (isViewportDeleteKey(event.code) && this.#handleDeleteKeyDown(event)) {
      return;
    }
    if (event.code === 'KeyD' && this.#handleDuplicateKeyDown(event)) {
      return;
    }
    if (
      event.code === 'KeyA' &&
      event.ctrlKey !== event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      !isEditableTarget(event.target) &&
      this.#activePan === undefined &&
      !this.#isKeyboardNudgeActive() &&
      !this.#spacePressed &&
      this.#selectionInteraction?.getSnapshot().kind === 'idle'
    ) {
      event.preventDefault();
      this.#selectionInteraction.selectAllWhenIdle();
      this.#updateSelectionState();
      return;
    }
    if (isKeyboardNudgeKey(event.code) && this.#handleKeyboardNudgeKeyDown(event, event.code)) {
      return;
    }
    if (event.code !== 'Space' || event.repeat || isEditableTarget(event.target)) {
      return;
    }
    if (
      this.#isKeyboardNudgeActive() ||
      (this.#selectionInteraction?.getSnapshot().kind ?? 'idle') !== 'idle'
    ) {
      return;
    }
    event.preventDefault();
    this.#spacePressed = true;
    this.#hoveredResizeHandle = undefined;
    this.#updatePanState();
    this.#updateSelectionState();
  };

  #handleKeyUp = (event: KeyboardEvent): void => {
    if (isKeyboardNudgeKey(event.code) && this.#activeNudgeKeys.delete(event.code)) {
      event.preventDefault();
      if (this.#activeNudgeKeys.size === 0) {
        this.#activeNudgeSelectionRevision = undefined;
        this.#keyboardNudge?.complete();
        this.#updateSelectionState();
      }
      return;
    }
    if (event.code !== 'Space') {
      return;
    }
    this.#spacePressed = false;
    this.#updatePanState();
  };

  #handlePointerDown = (event: PointerEvent): void => {
    const editable = isEditableTarget(event.target);
    if (!editable) {
      this.#root.focus({ preventScroll: true });
    }
    if (this.#activePan !== undefined || this.#isKeyboardNudgeActive()) {
      return;
    }
    if (shouldStartPan(event, this.#spacePressed)) {
      event.preventDefault();
      this.#hoveredResizeHandle = undefined;
      this.#camera.flushPending();
      this.#activePan = Object.freeze({
        pointerId: event.pointerId,
        startFraming: this.#camera.getFramingSnapshot(),
        startClientX: event.clientX,
        startClientY: event.clientY,
        startTransform: this.#camera.getTransformSnapshot(),
      });
      this.#root.setPointerCapture?.(event.pointerId);
      this.#updatePanState();
      this.#updateSelectionState();
      return;
    }
    if (
      editable ||
      event.button !== 0 ||
      this.#selectionInteraction === undefined ||
      this.#selectionInteraction.getSnapshot().kind !== 'idle'
    ) {
      return;
    }
    this.#camera.flushPending();
    const position = this.#getSelectionPosition(event);
    if (position === undefined) {
      return;
    }
    if (
      this.#selectionInteraction.beginPress({
        altKey: event.altKey,
        pointerId: event.pointerId,
        shiftKey: event.shiftKey,
        ...position,
      })
    ) {
      event.preventDefault();
      this.#hoveredResizeHandle = undefined;
      this.#root.setPointerCapture?.(event.pointerId);
      this.#updateSelectionState();
    }
  };

  #handlePointerMove = (event: PointerEvent): void => {
    if (this.#isKeyboardNudgeActive()) {
      return;
    }
    const activePan = this.#activePan;
    if (activePan === undefined) {
      const position = this.#getSelectionPosition(event);
      if (
        position !== undefined &&
        this.#selectionInteraction?.updatePress(event.pointerId, {
          ...position,
          shiftKey: event.shiftKey,
        })
      ) {
        event.preventDefault();
        this.#updateSelectionState();
      } else {
        this.#updateResizeHover(position?.viewportPoint);
      }
      return;
    }
    if (activePan.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    this.#schedulePanPosition(activePan, event.clientX, event.clientY);
  };

  #handlePointerUp = (event: PointerEvent): void => {
    const activePan = this.#activePan;
    if (activePan === undefined || activePan.pointerId !== event.pointerId) {
      const position = this.#getSelectionPosition(event);
      if (
        position !== undefined &&
        this.#selectionInteraction?.completePress(event.pointerId, {
          ...position,
          shiftKey: event.shiftKey,
        })
      ) {
        event.preventDefault();
        if (this.#root.hasPointerCapture?.(event.pointerId)) {
          this.#root.releasePointerCapture?.(event.pointerId);
        }
        this.#updateSelectionState();
      }
      return;
    }
    event.preventDefault();
    this.#schedulePanPosition(activePan, event.clientX, event.clientY);
    this.#camera.flushPending();
    this.#activePan = undefined;
    if (this.#root.hasPointerCapture?.(event.pointerId)) {
      this.#root.releasePointerCapture?.(event.pointerId);
    }
    this.#updatePanState();
  };

  #handlePointerCancel = (event: PointerEvent): void => {
    if (this.#activePan?.pointerId === event.pointerId) {
      this.#cancelPan();
      return;
    }
    if (this.#selectionInteraction?.cancelPress(event.pointerId)) {
      this.#updateSelectionState();
    }
  };

  #handlePointerLeave = (): void => {
    if (
      this.#activePan === undefined &&
      (this.#selectionInteraction?.getSnapshot().kind ?? 'idle') === 'idle'
    ) {
      this.#updateResizeHover(undefined);
    }
  };

  #handleLostPointerCapture = (event: PointerEvent): void => {
    if (this.#activePan?.pointerId === event.pointerId) {
      this.#cancelPan();
      return;
    }
    if (this.#selectionInteraction?.cancelPress(event.pointerId)) {
      this.#updateSelectionState();
    }
  };

  #handleWheel = (event: WheelEvent): void => {
    if (
      this.#activePan !== undefined ||
      this.#isKeyboardNudgeActive() ||
      (this.#selectionInteraction?.getSnapshot().kind ?? 'idle') !== 'idle'
    ) {
      event.preventDefault();
      return;
    }
    this.#updateResizeHover(undefined);
    const bounds = this.#root.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }
    const action = normalizeViewportWheel(event, bounds.height);
    if (action === undefined) {
      return;
    }
    event.preventDefault();
    if (action.kind === 'pan') {
      this.#camera.scheduleTranslation(createViewportVector(action.deltaX, action.deltaY));
      return;
    }
    const anchor = clientPointToViewport(
      createClientPoint(event.clientX, event.clientY),
      createViewportClientBounds(bounds.left, bounds.top, bounds.width, bounds.height),
    );
    this.#camera.scheduleZoomByFactor(action.factor, anchor);
  };

  #handleWindowBlur = (): void => {
    this.#spacePressed = false;
    this.#hoveredResizeHandle = undefined;
    this.#cancelPan();
    this.#cancelKeyboardNudge();
    this.#cancelSelectionPress();
  };

  #handleKeyboardNudgeKeyDown(event: KeyboardEvent, key: KeyboardNudgeKey): boolean {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      isEditableTarget(event.target) ||
      this.#activePan !== undefined ||
      this.#spacePressed ||
      (this.#selectionInteraction?.getSnapshot().kind ?? 'idle') !== 'idle'
    ) {
      return false;
    }
    const interaction = this.#keyboardNudge;
    const selectionSnapshot = this.#selection?.getSnapshot();
    if (interaction === undefined || selectionSnapshot === undefined) {
      return false;
    }

    if (!this.#isKeyboardNudgeActive()) {
      if (!interaction.begin(selectionSnapshot.selectedIds, key, event.shiftKey)) {
        return false;
      }
      this.#activeNudgeSelectionRevision = selectionSnapshot.revision;
    } else if (!interaction.step(key, event.shiftKey)) {
      return false;
    }
    this.#activeNudgeKeys.add(key);
    event.preventDefault();
    this.#hoveredResizeHandle = undefined;
    this.#updateSelectionState();
    return true;
  }

  #handleDeleteKeyDown(event: KeyboardEvent): boolean {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      !this.#isIdleEditTarget(event)
    ) {
      return false;
    }
    event.preventDefault();
    if (!event.repeat) {
      this.#deleteSelection?.();
    }
    return true;
  }

  #handleDuplicateKeyDown(event: KeyboardEvent): boolean {
    const platform = this.#shortcutPlatform;
    if (
      platform === undefined ||
      !isViewportDuplicateShortcut(event, platform) ||
      !this.#isIdleEditTarget(event)
    ) {
      return false;
    }
    event.preventDefault();
    if (!event.repeat) {
      this.#duplicateSelection?.();
    }
    return true;
  }

  #isIdleEditTarget(event: KeyboardEvent): boolean {
    return (
      !isEditableTarget(event.target) &&
      this.#activePan === undefined &&
      !this.#isKeyboardNudgeActive() &&
      !this.#spacePressed &&
      (this.#selectionInteraction?.getSnapshot().kind ?? 'idle') === 'idle'
    );
  }

  #handleSelectionChange = (): void => {
    const activeRevision = this.#activeNudgeSelectionRevision;
    if (
      activeRevision !== undefined &&
      this.#selection?.getSnapshot().revision !== activeRevision
    ) {
      this.#cancelKeyboardNudge();
    }
  };

  #schedulePanPosition(activePan: ActivePan, clientX: number, clientY: number): void {
    this.#camera.scheduleTransform(
      createViewportTransform({
        panX: activePan.startTransform.pan.x + clientX - activePan.startClientX,
        panY: activePan.startTransform.pan.y + clientY - activePan.startClientY,
        zoom: activePan.startTransform.zoom,
      }),
    );
  }

  #cancelPan(): void {
    const activePan = this.#activePan;
    if (activePan === undefined) {
      return;
    }
    this.#activePan = undefined;
    this.#camera.scheduleTransform(activePan.startTransform, activePan.startFraming);
    this.#camera.flushPending();
    if (this.#root.hasPointerCapture?.(activePan.pointerId)) {
      this.#root.releasePointerCapture?.(activePan.pointerId);
    }
    this.#updatePanState();
  }

  #cancelKeyboardNudge(): boolean {
    this.#activeNudgeKeys.clear();
    this.#activeNudgeSelectionRevision = undefined;
    const cancelled = this.#keyboardNudge?.cancel() ?? false;
    if (cancelled) {
      this.#updateSelectionState();
    }
    return cancelled;
  }

  #cancelSelectionPress(): void {
    const snapshot = this.#selectionInteraction?.getSnapshot();
    if (
      snapshot === undefined ||
      snapshot.kind === 'idle' ||
      !this.#selectionInteraction?.cancelPress(snapshot.pointerId)
    ) {
      return;
    }
    this.#releaseSelectionPointerCapture(snapshot.pointerId);
    this.#updateSelectionState();
  }

  #getSelectionPosition(event: PointerEvent): SelectionPointerPosition | undefined {
    const bounds = this.#root.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return undefined;
    }
    const viewportPoint = clientPointToViewport(
      createClientPoint(event.clientX, event.clientY),
      createViewportClientBounds(bounds.left, bounds.top, bounds.width, bounds.height),
    );
    return Object.freeze({
      viewportPoint,
      worldPoint: viewportPointToWorld(viewportPoint, this.#camera.getTransformSnapshot()),
    });
  }

  #releaseSelectionPointerCapture(pointerId: number): void {
    if (this.#root.hasPointerCapture?.(pointerId)) {
      this.#root.releasePointerCapture?.(pointerId);
    }
  }

  #updatePanState(): void {
    this.#root.dataset.panState =
      this.#activePan === undefined ? (this.#spacePressed ? 'ready' : 'idle') : 'active';
  }

  #updateSelectionState = (): void => {
    const snapshot = this.#selectionInteraction?.getSnapshot();
    const nudgeSnapshot = this.#keyboardNudge?.getSnapshot();
    this.#root.dataset.selectionState =
      nudgeSnapshot?.kind === 'nudging' ? 'nudging' : (snapshot?.kind ?? 'idle');
    const resizeHandle =
      snapshot?.kind === 'resizing' ? snapshot.handle : this.#hoveredResizeHandle;
    if (resizeHandle === undefined) {
      delete this.#root.dataset.resizeHandle;
    } else {
      this.#root.dataset.resizeHandle = resizeHandle;
    }
  };

  #isKeyboardNudgeActive(): boolean {
    return this.#keyboardNudge?.getSnapshot().kind === 'nudging';
  }

  #updateResizeHover(point: ViewportPoint | undefined): void {
    const handle =
      point === undefined
        ? undefined
        : this.#selectionInteraction?.queryResizeHandleWhenIdle(point);
    if (handle === this.#hoveredResizeHandle) {
      return;
    }
    this.#hoveredResizeHandle = handle;
    this.#updateSelectionState();
  }
}
