import {
  useEffect,
  useId,
  useRef,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { useAnchoredOverlay } from './use-anchored-overlay';

export interface AppPopoverTriggerProps {
  readonly 'aria-controls': string;
  readonly 'aria-expanded': boolean;
  readonly 'aria-haspopup': 'dialog';
  readonly onClick: MouseEventHandler<HTMLElement>;
  readonly onKeyDown: KeyboardEventHandler<HTMLElement>;
  readonly ref: (node: HTMLElement | null) => void;
}

interface AppPopoverProps {
  readonly children: ReactNode;
  readonly label: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly trigger: (triggerProps: AppPopoverTriggerProps) => ReactElement;
}

export const AppPopover = ({ children, label, onOpenChange, open, trigger }: AppPopoverProps) => {
  const popoverId = `app-popover-${useId()}`;
  const triggerRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const position = useAnchoredOverlay(open, triggerRef, surfaceRef);
  const portalTarget = document.getElementById('overlay-root') ?? document.body;

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (
        target instanceof Node &&
        !surfaceRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        onOpenChange(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onOpenChange, open]);

  const triggerElement = trigger({
    'aria-controls': popoverId,
    'aria-expanded': open,
    'aria-haspopup': 'dialog',
    onClick: () => onOpenChange(!open),
    onKeyDown: (event) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        onOpenChange(false);
      }
    },
    ref: (node) => {
      triggerRef.current = node;
    },
  });

  return (
    <>
      {triggerElement}
      {open
        ? createPortal(
            <div
              aria-label={label}
              className="app-popover"
              id={popoverId}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onOpenChange(false);
                  triggerRef.current?.focus();
                }
              }}
              ref={surfaceRef}
              role="dialog"
              style={{
                left: position.left,
                top: position.top,
                visibility: position.ready ? 'visible' : 'hidden',
              }}
            >
              {children}
            </div>,
            portalTarget,
          )
        : null}
    </>
  );
};
