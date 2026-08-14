import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { ViewportCameraStore } from './viewport-camera-store';
import {
  executeViewportCommand,
  resolveViewportShortcut,
  type ViewportCommandId,
} from './viewport-commands';
import { VIEWPORT_NUMERIC_POLICY, type WorldRect } from './viewport-transform';

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest('a, button, input, select, textarea, [contenteditable="true"]') !== null;

export const useViewportCommands = (
  camera: ViewportCameraStore,
  boardBounds: WorldRect | undefined,
) => {
  const zoom = useSyncExternalStore(
    camera.subscribe,
    camera.getZoomSnapshot,
    camera.getZoomSnapshot,
  );
  const execute = useCallback(
    (command: ViewportCommandId): boolean =>
      executeViewportCommand(command, { boardBounds, camera }),
    [boardBounds, camera],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }
      const command = resolveViewportShortcut(event);
      if (command === undefined) {
        return;
      }
      event.preventDefault();
      execute(command);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [execute]);

  return Object.freeze({
    canFitBoard: boardBounds !== undefined,
    canZoomIn: zoom < VIEWPORT_NUMERIC_POLICY.maximumZoom,
    canZoomOut: zoom > VIEWPORT_NUMERIC_POLICY.minimumZoom,
    execute,
    percentage: Math.round(zoom * 100),
  });
};
