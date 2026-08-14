import {
  useId,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';

import { useAnchoredOverlay } from './use-anchored-overlay';

export interface AppTooltipTriggerProps {
  readonly 'aria-describedby': string | undefined;
  readonly onBlur: FocusEventHandler<HTMLElement>;
  readonly onFocus: FocusEventHandler<HTMLElement>;
  readonly onKeyDown: KeyboardEventHandler<HTMLElement>;
  readonly onMouseEnter: MouseEventHandler<HTMLElement>;
  readonly onMouseLeave: MouseEventHandler<HTMLElement>;
  readonly ref: (node: HTMLElement | null) => void;
}

interface AppTooltipProps {
  readonly children: (triggerProps: AppTooltipTriggerProps) => ReactElement;
  readonly content: string;
}

export const AppTooltip = ({ children, content }: AppTooltipProps) => {
  const tooltipId = `app-tooltip-${useId()}`;
  const triggerRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const position = useAnchoredOverlay(open, triggerRef, surfaceRef);
  const portalTarget = document.getElementById('overlay-root') ?? document.body;

  const trigger = children({
    'aria-describedby': open ? tooltipId : undefined,
    onBlur: () => setOpen(false),
    onFocus: () => setOpen(true),
    onKeyDown: (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    },
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    ref: (node) => {
      triggerRef.current = node;
    },
  });

  return (
    <>
      {trigger}
      {open
        ? createPortal(
            <div
              className="app-tooltip"
              id={tooltipId}
              ref={surfaceRef}
              role="tooltip"
              style={{
                left: position.left,
                top: position.top,
                visibility: position.ready ? 'visible' : 'hidden',
              }}
            >
              {content}
            </div>,
            portalTarget,
          )
        : null}
    </>
  );
};
