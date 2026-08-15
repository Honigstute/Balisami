import { render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ElementIdSchema } from '../src/domain';
import { MarqueeOverlay } from '../src/renderer/editor/MarqueeOverlay';
import { SelectionInteraction } from '../src/renderer/editor/selection-interaction';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import {
  ViewportCameraStore,
  type AnimationFrameScheduler,
} from '../src/renderer/editor/viewport-camera-store';
import {
  createDeviceScale,
  createViewportPoint,
  createViewportSize,
  createViewportTransform,
  createWorldPoint,
} from '../src/renderer/editor/viewport-transform';
import { ViewportScene } from '../src/renderer/editor/ViewportScene';

const PREVIEW_ID = ElementIdSchema.parse('element_marquee001');

class TestAnimationFrameScheduler implements AnimationFrameScheduler {
  readonly callbacks = new Map<number, (timestamp: number) => void>();
  #nextId = 1;

  cancel = (requestId: number): void => {
    this.callbacks.delete(requestId);
  };

  request = (callback: (timestamp: number) => void): number => {
    const requestId = this.#nextId;
    this.#nextId += 1;
    this.callbacks.set(requestId, callback);
    return requestId;
  };

  flushNext(): void {
    const entry = this.callbacks.entries().next().value as
      readonly [number, (timestamp: number) => void] | undefined;
    if (entry === undefined) {
      throw new Error('No animation frame is pending.');
    }
    this.callbacks.delete(entry[0]);
    entry[1](16.67);
  }
}

describe('marquee overlay', () => {
  it('renders intersecting preview geometry imperatively without React commits', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const scheduler = new TestAnimationFrameScheduler();
    const camera = new ViewportCameraStore({
      initialDeviceScale: createDeviceScale(1),
      initialTransform: createViewportTransform({ panX: 0, panY: 0, zoom: 1 }),
      initialViewport: createViewportSize(1, 1),
      scheduler,
    });
    const interaction = new SelectionInteraction(new SelectionStore(), {
      listSelectableIds: () => [PREVIEW_ID],
      queryHitStack: () => [],
      querySelectionRegion: () => [PREVIEW_ID],
    });
    let renderCount = 0;
    const CountedOverlay = () => {
      const renders = useRef(0);
      renders.current += 1;
      renderCount = renders.current;
      return <MarqueeOverlay interaction={interaction} />;
    };
    const view = render(<ViewportScene camera={camera} interactionChildren={<CountedOverlay />} />);
    scheduler.flushNext();
    const group = view.container.querySelector<SVGGElement>(
      '[data-marquee-overlay="selection-region"]',
    );
    const rectangle = group?.querySelector<SVGRectElement>('.marquee-overlay__rectangle');
    if (group === null || rectangle === null || rectangle === undefined) {
      throw new Error('Marquee overlay did not mount.');
    }
    const start = {
      viewportPoint: createViewportPoint(100, 120),
      worldPoint: createWorldPoint(100, 120),
    };
    const forwardEnd = {
      viewportPoint: createViewportPoint(180, 170),
      worldPoint: createWorldPoint(180, 170),
    };
    interaction.beginPress({ altKey: false, pointerId: 1, shiftKey: false, ...start });
    interaction.updatePress(1, { ...forwardEnd, shiftKey: false });

    expect(group).not.toHaveAttribute('display');
    expect(group).toHaveAttribute('data-marquee-mode', 'intersecting');
    expect(group).toHaveAttribute('data-preview-count', '1');
    expect(rectangle).toHaveAttribute('x', '100');
    expect(rectangle).toHaveAttribute('y', '120');
    expect(rectangle).toHaveAttribute('width', '80');
    expect(rectangle).toHaveAttribute('height', '50');
    expect(renderCount).toBe(1);

    interaction.cancelPress(1);
    expect(group).toHaveAttribute('display', 'none');
    expect(renderCount).toBe(1);
    camera.dispose();
  });
});
