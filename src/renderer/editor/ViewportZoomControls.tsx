import { useMemo, useState, useSyncExternalStore } from 'react';

import { AppButton } from '../design/AppButton';
import { AppPopover } from '../design/AppPopover';
import { Icon } from '../shell/Icon';
import type { ViewportCameraStore } from './viewport-camera-store';
import type { DocumentSceneModel } from './document-scene-model';
import { getSceneSelectionWorldBounds } from './selection-bounds';
import type { SelectionSnapshot, SelectionStore } from './selection-store';
import {
  getViewportShortcutLabel,
  VIEWPORT_COMMAND_IDS,
  type ViewportCommandId,
  type ViewportShortcutPlatform,
} from './viewport-commands';
import { useViewportCommands } from './use-viewport-commands';
import type { WorldRect } from './viewport-transform';

interface ViewportZoomControlsProps {
  readonly boardBounds: WorldRect | undefined;
  readonly camera: ViewportCameraStore;
  readonly defaultMenuOpen?: boolean;
  readonly platform: ViewportShortcutPlatform;
  readonly sceneModel?: DocumentSceneModel;
  readonly selection?: SelectionStore;
}

const subscribeToNothing = (): (() => void) => () => undefined;
const getZeroRevision = (): number => 0;
const EMPTY_SELECTION_SNAPSHOT: SelectionSnapshot = Object.freeze({
  primaryId: undefined,
  revision: 0,
  selectedIds: Object.freeze([]),
});
const getEmptySelectionSnapshot = (): SelectionSnapshot => EMPTY_SELECTION_SNAPSHOT;

export const ViewportZoomControls = ({
  boardBounds,
  camera,
  defaultMenuOpen = false,
  platform,
  sceneModel,
  selection,
}: ViewportZoomControlsProps) => {
  const [open, setOpen] = useState(defaultMenuOpen);
  const sceneRevision = useSyncExternalStore(
    sceneModel?.subscribe ?? subscribeToNothing,
    sceneModel?.getRevisionSnapshot ?? getZeroRevision,
    sceneModel?.getRevisionSnapshot ?? getZeroRevision,
  );
  const selectionSnapshot = useSyncExternalStore(
    selection?.subscribe ?? subscribeToNothing,
    selection?.getSnapshot ?? getEmptySelectionSnapshot,
    selection?.getSnapshot ?? getEmptySelectionSnapshot,
  );
  const selectionBounds = useMemo(() => {
    // Derived scene geometry can change while selected IDs stay identical.
    void sceneRevision;
    return sceneModel === undefined
      ? undefined
      : getSceneSelectionWorldBounds(sceneModel, selectionSnapshot.selectedIds);
  }, [sceneModel, sceneRevision, selectionSnapshot.selectedIds]);
  const commands = useViewportCommands(camera, boardBounds, selectionBounds);
  const invoke = (command: ViewportCommandId): void => {
    commands.execute(command);
    setOpen(false);
  };

  return (
    <>
      <button
        aria-label="Zoom out"
        className="icon-button icon-button--dark"
        disabled={!commands.canZoomOut}
        onClick={() => commands.execute(VIEWPORT_COMMAND_IDS.zoomOut)}
        type="button"
      >
        <Icon name="zoomOut" />
      </button>
      <AppPopover
        label="Zoom options"
        onOpenChange={setOpen}
        open={open}
        trigger={(triggerProps) => (
          <button
            {...triggerProps}
            aria-label={`Zoom options, ${String(commands.percentage)} percent`}
            className="zoom-menu-trigger"
            type="button"
          >
            {commands.percentage}%
          </button>
        )}
      >
        <div className="zoom-menu">
          <AppButton onClick={() => invoke(VIEWPORT_COMMAND_IDS.actualSize)}>
            <span>Actual Size</span>
            <kbd>{getViewportShortcutLabel(VIEWPORT_COMMAND_IDS.actualSize, platform)}</kbd>
          </AppButton>
          <AppButton
            disabled={!commands.canFitBoard}
            onClick={() => invoke(VIEWPORT_COMMAND_IDS.fitBoard)}
          >
            <span>Fit Board</span>
            <kbd>{getViewportShortcutLabel(VIEWPORT_COMMAND_IDS.fitBoard, platform)}</kbd>
          </AppButton>
          <AppButton
            disabled={!commands.canFitBoard}
            onClick={() => invoke(VIEWPORT_COMMAND_IDS.fitWidth)}
          >
            <span>Fit Width</span>
            <kbd>{getViewportShortcutLabel(VIEWPORT_COMMAND_IDS.fitWidth, platform)}</kbd>
          </AppButton>
          <AppButton
            disabled={!commands.canFitSelection}
            onClick={() => invoke(VIEWPORT_COMMAND_IDS.fitSelection)}
          >
            <span>Fit Selection</span>
            {!commands.canFitSelection && <small>Available with selection</small>}
          </AppButton>
        </div>
      </AppPopover>
      <button
        aria-label="Zoom in"
        className="icon-button icon-button--dark"
        disabled={!commands.canZoomIn}
        onClick={() => commands.execute(VIEWPORT_COMMAND_IDS.zoomIn)}
        type="button"
      >
        <Icon name="zoomIn" />
      </button>
    </>
  );
};
