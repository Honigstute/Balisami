import { useState } from 'react';

import { AppButton } from '../design/AppButton';
import { AppPopover } from '../design/AppPopover';
import { Icon } from '../shell/Icon';
import type { ViewportCameraStore } from './viewport-camera-store';
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
}

export const ViewportZoomControls = ({
  boardBounds,
  camera,
  defaultMenuOpen = false,
  platform,
}: ViewportZoomControlsProps) => {
  const [open, setOpen] = useState(defaultMenuOpen);
  const commands = useViewportCommands(camera, boardBounds);
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
          <AppButton disabled>
            <span>Fit Selection</span>
            <small>Available with selection</small>
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
