import { describe, expect, it, vi } from 'vitest';

import { waitForRendererPresentation } from '../src/renderer/app/renderer-readiness';

describe('renderer presentation readiness', () => {
  it('crosses two animation frames before resolving', async () => {
    const callbacks: FrameRequestCallback[] = [];
    const animationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callbacks.push(callback);
        return callbacks.length;
      });

    const readiness = waitForRendererPresentation();
    await Promise.resolve();

    expect(callbacks).toHaveLength(1);
    callbacks.shift()?.(1);
    await Promise.resolve();

    expect(callbacks).toHaveLength(1);
    callbacks.shift()?.(2);
    await readiness;

    expect(animationFrame).toHaveBeenCalledTimes(2);
  });
});
