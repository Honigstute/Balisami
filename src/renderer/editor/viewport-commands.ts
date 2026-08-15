import type { ViewportCameraStore } from './viewport-camera-store';
import { createViewportPoint, type WorldRect } from './viewport-transform';

export const VIEWPORT_COMMAND_IDS = Object.freeze({
  actualSize: 'viewport.actual-size',
  fitBoard: 'viewport.fit-board',
  fitSelection: 'viewport.fit-selection',
  fitWidth: 'viewport.fit-width',
  zoomIn: 'viewport.zoom-in',
  zoomOut: 'viewport.zoom-out',
} as const);

export type ViewportCommandId = (typeof VIEWPORT_COMMAND_IDS)[keyof typeof VIEWPORT_COMMAND_IDS];

export type ViewportShortcutPlatform = 'darwin' | 'win32';

export const VIEWPORT_COMMAND_POLICY = Object.freeze({
  zoomStepFactor: 1.2,
});

export interface ViewportCommandContext {
  readonly boardBounds: WorldRect | undefined;
  readonly camera: ViewportCameraStore;
  readonly selectionBounds: WorldRect | undefined;
}

export interface ViewportShortcutInput {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

/** Keeps visible platform labels beside the same semantic command IDs used by input. */
export const getViewportShortcutLabel = (
  command: ViewportCommandId,
  platform: ViewportShortcutPlatform,
): string | undefined => {
  const modifier = platform === 'darwin' ? '⌘' : 'Ctrl+';
  switch (command) {
    case VIEWPORT_COMMAND_IDS.zoomIn:
      return `${modifier}+`;
    case VIEWPORT_COMMAND_IDS.zoomOut:
      return `${modifier}-`;
    case VIEWPORT_COMMAND_IDS.actualSize:
      return `${modifier}0`;
    case VIEWPORT_COMMAND_IDS.fitBoard:
      return `${modifier}1`;
    case VIEWPORT_COMMAND_IDS.fitWidth:
      return platform === 'darwin' ? '⇧⌘1' : 'Ctrl+Shift+1';
    case VIEWPORT_COMMAND_IDS.fitSelection:
      return undefined;
  }
};

export const executeViewportCommand = (
  command: ViewportCommandId,
  context: ViewportCommandContext,
): boolean => {
  const viewport = context.camera.getViewportSnapshot();
  const center = createViewportPoint(viewport.width / 2, viewport.height / 2);
  switch (command) {
    case VIEWPORT_COMMAND_IDS.zoomIn:
      context.camera.scheduleZoomByFactor(VIEWPORT_COMMAND_POLICY.zoomStepFactor, center);
      return true;
    case VIEWPORT_COMMAND_IDS.zoomOut:
      context.camera.scheduleZoomByFactor(1 / VIEWPORT_COMMAND_POLICY.zoomStepFactor, center);
      return true;
    case VIEWPORT_COMMAND_IDS.actualSize:
      context.camera.scheduleFraming({ kind: 'actual' });
      return true;
    case VIEWPORT_COMMAND_IDS.fitBoard:
      if (context.boardBounds === undefined) {
        return false;
      }
      context.camera.scheduleFraming({ bounds: context.boardBounds, kind: 'fit' });
      return true;
    case VIEWPORT_COMMAND_IDS.fitWidth:
      if (context.boardBounds === undefined) {
        return false;
      }
      context.camera.scheduleFraming({ bounds: context.boardBounds, kind: 'width' });
      return true;
    case VIEWPORT_COMMAND_IDS.fitSelection:
      if (context.selectionBounds === undefined) {
        return false;
      }
      context.camera.scheduleFraming({ bounds: context.selectionBounds, kind: 'fit' });
      return true;
  }
};

/** Cmd on macOS and Ctrl on Windows share one semantic shortcut mapping. */
export const resolveViewportShortcut = (
  input: ViewportShortcutInput,
): ViewportCommandId | undefined => {
  if (input.altKey || input.metaKey === input.ctrlKey) {
    return undefined;
  }
  switch (input.key) {
    case '+':
    case '=':
      return VIEWPORT_COMMAND_IDS.zoomIn;
    case '-':
    case '_':
      return VIEWPORT_COMMAND_IDS.zoomOut;
    case '0':
      return input.shiftKey ? undefined : VIEWPORT_COMMAND_IDS.actualSize;
    case '1':
      return input.shiftKey ? VIEWPORT_COMMAND_IDS.fitWidth : VIEWPORT_COMMAND_IDS.fitBoard;
    default:
      return undefined;
  }
};
