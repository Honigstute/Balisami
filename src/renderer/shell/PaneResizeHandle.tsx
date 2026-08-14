import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

import { DESIGN_TOKENS } from '../../shared/design-tokens';
import type { ShellPane } from './shell-preferences';

interface PaneResizeHandleProps {
  readonly collapsed: boolean;
  readonly currentWidth: number;
  readonly onCancel: (originalWidth: number) => void;
  readonly onCommit: (width?: number) => void;
  readonly onPreview: (width: number) => void;
  readonly pane: ShellPane;
}

interface ActivePaneResize {
  readonly originalWidth: number;
  readonly pointerId: number;
  readonly startClientX: number;
}

const getPaneMetrics = (pane: ShellPane) =>
  pane === 'navigator'
    ? {
        defaultWidth: DESIGN_TOKENS.shell.navigatorWidth,
        label: 'Wireframes navigator',
        maxWidth: DESIGN_TOKENS.shell.navigatorMaxWidth,
        minWidth: DESIGN_TOKENS.shell.navigatorMinWidth,
        pointerDirection: 1,
      }
    : {
        defaultWidth: DESIGN_TOKENS.shell.inspectorWidth,
        label: 'Inspector',
        maxWidth: DESIGN_TOKENS.shell.inspectorMaxWidth,
        minWidth: DESIGN_TOKENS.shell.inspectorMinWidth,
        pointerDirection: -1,
      };

export const PaneResizeHandle = ({
  collapsed,
  currentWidth,
  onCancel,
  onCommit,
  onPreview,
  pane,
}: PaneResizeHandleProps) => {
  const activeResizeRef = useRef<ActivePaneResize | undefined>(undefined);
  const metrics = getPaneMetrics(pane);

  if (collapsed) {
    return null;
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || activeResizeRef.current !== undefined) {
      return;
    }
    event.preventDefault();
    activeResizeRef.current = {
      originalWidth: currentWidth,
      pointerId: event.pointerId,
      startClientX: event.clientX,
    };
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.currentTarget.focus();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const active = activeResizeRef.current;
    if (active === undefined || active.pointerId !== event.pointerId) {
      return;
    }
    const delta = (event.clientX - active.startClientX) * metrics.pointerDirection;
    onPreview(active.originalWidth + delta);
  };

  const finishPointerResize = (event: PointerEvent<HTMLDivElement>): void => {
    const active = activeResizeRef.current;
    if (active === undefined || active.pointerId !== event.pointerId) {
      return;
    }
    activeResizeRef.current = undefined;
    if (
      typeof event.currentTarget.hasPointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const delta = (event.clientX - active.startClientX) * metrics.pointerDirection;
    onCommit(active.originalWidth + delta);
  };

  const cancelPointerResize = (event: PointerEvent<HTMLDivElement>): void => {
    const active = activeResizeRef.current;
    if (active === undefined || active.pointerId !== event.pointerId) {
      return;
    }
    activeResizeRef.current = undefined;
    onCancel(active.originalWidth);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    let nextWidth: number | undefined;
    if (event.key === 'Home') {
      nextWidth = metrics.minWidth;
    } else if (event.key === 'End') {
      nextWidth = metrics.maxWidth;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const screenDelta =
        event.key === 'ArrowRight' ? DESIGN_TOKENS.space[1] : -DESIGN_TOKENS.space[1];
      nextWidth = currentWidth + screenDelta * metrics.pointerDirection;
    }
    if (nextWidth !== undefined) {
      event.preventDefault();
      onCommit(nextWidth);
    }
  };

  return (
    <div
      aria-label={`Resize ${metrics.label}`}
      aria-orientation="vertical"
      aria-valuemax={metrics.maxWidth}
      aria-valuemin={metrics.minWidth}
      aria-valuenow={currentWidth}
      className={`pane-resizer pane-resizer--${pane}`}
      onDoubleClick={() => onCommit(metrics.defaultWidth)}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={cancelPointerResize}
      onPointerCancel={cancelPointerResize}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerResize}
      role="separator"
      tabIndex={0}
    />
  );
};
