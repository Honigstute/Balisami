import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

import { DESIGN_TOKENS } from '../../shared/design-tokens';

export interface AnchoredOverlayPosition {
  readonly left: number;
  readonly ready: boolean;
  readonly top: number;
}

const HIDDEN_POSITION: AnchoredOverlayPosition = Object.freeze({ left: 0, ready: false, top: 0 });

/** Positions a small overlay below its trigger, flipping above and clamping to the viewport. */
export const useAnchoredOverlay = (
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  surfaceRef: RefObject<HTMLElement | null>,
): AnchoredOverlayPosition => {
  const [position, setPosition] = useState(HIDDEN_POSITION);

  const update = useCallback((): void => {
    const trigger = triggerRef.current;
    const surface = surfaceRef.current;
    if (!open || trigger === null || surface === null) {
      setPosition(HIDDEN_POSITION);
      return;
    }
    const triggerRect = trigger.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const margin = DESIGN_TOKENS.space[2];
    const gap = DESIGN_TOKENS.space[1];
    const maximumLeft = Math.max(margin, window.innerWidth - surfaceRect.width - margin);
    const left = Math.min(maximumLeft, Math.max(margin, triggerRect.left));
    const below = triggerRect.bottom + gap;
    const above = triggerRect.top - surfaceRect.height - gap;
    const top =
      below + surfaceRect.height <= window.innerHeight - margin ? below : Math.max(margin, above);
    setPosition(Object.freeze({ left, ready: true, top }));
  }, [open, surfaceRef, triggerRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(HIDDEN_POSITION);
      return;
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, update]);

  return position;
};
