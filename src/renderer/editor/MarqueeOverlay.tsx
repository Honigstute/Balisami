import { useLayoutEffect, useRef } from 'react';

import type { SelectionInteraction } from './selection-interaction';

interface MarqueeOverlayProps {
  readonly interaction: SelectionInteraction;
}

/** Imperative viewport-space marquee; raw pointer motion never enters React. */
export const MarqueeOverlay = ({ interaction }: MarqueeOverlayProps) => {
  const groupRef = useRef<SVGGElement | null>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    const rectangle = group?.children[0];
    if (group === null || rectangle?.localName !== 'rect') {
      return;
    }
    const apply = (): void => {
      const snapshot = interaction.getSnapshot();
      if (snapshot.kind !== 'marquee') {
        group.setAttribute('display', 'none');
        group.dataset.marqueeMode = 'none';
        group.dataset.previewCount = '0';
        return;
      }
      const x = Math.min(snapshot.startViewportPoint.x, snapshot.currentViewportPoint.x);
      const y = Math.min(snapshot.startViewportPoint.y, snapshot.currentViewportPoint.y);
      rectangle.setAttribute('x', String(x));
      rectangle.setAttribute('y', String(y));
      rectangle.setAttribute(
        'width',
        String(Math.abs(snapshot.currentViewportPoint.x - snapshot.startViewportPoint.x)),
      );
      rectangle.setAttribute(
        'height',
        String(Math.abs(snapshot.currentViewportPoint.y - snapshot.startViewportPoint.y)),
      );
      group.removeAttribute('display');
      group.dataset.marqueeMode = snapshot.mode;
      group.dataset.previewCount = String(snapshot.previewIds.length);
    };

    apply();
    return interaction.subscribe(apply);
  }, [interaction]);

  return (
    <g
      data-marquee-mode="none"
      data-marquee-overlay="selection-region"
      data-preview-count="0"
      display="none"
      ref={groupRef}
    >
      <rect className="marquee-overlay__rectangle" />
    </g>
  );
};
