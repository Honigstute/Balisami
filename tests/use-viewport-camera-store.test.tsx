import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useViewportCameraStore } from '../src/renderer/editor/use-viewport-camera-store';
import type { ViewportCameraStore } from '../src/renderer/editor/viewport-camera-store';
import { createViewportTransform } from '../src/renderer/editor/viewport-transform';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useViewportCameraStore', () => {
  it('keeps its store usable after Strict Mode replays effect cleanup', () => {
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 41);
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      // Browser cancellation has no return value.
    });
    let camera: ViewportCameraStore | undefined;
    const Consumer = () => {
      camera = useViewportCameraStore();
      return null;
    };

    const view = render(
      <StrictMode>
        <Consumer />
      </StrictMode>,
    );

    const mountedCamera = camera;
    expect(mountedCamera).toBeDefined();
    expect(() =>
      mountedCamera?.scheduleTransform(createViewportTransform({ panX: 12, panY: -7, zoom: 1.25 })),
    ).not.toThrow();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(41);
  });
});
