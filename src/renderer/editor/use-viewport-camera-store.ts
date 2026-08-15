import { useEffect, useState } from 'react';

import { ViewportCameraStore, createBrowserAnimationFrameScheduler } from './viewport-camera-store';
import {
  createDeviceScale,
  createViewportSize,
  createViewportTransform,
} from './viewport-transform';

const getInitialDeviceScale = (): number => {
  const scale = window.devicePixelRatio;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
};

/** Owns one camera store and cancels pending work on teardown without breaking Strict Mode replay. */
/** Captures the requested session-only starting zoom when the store is first mounted. */
export const useViewportCameraStore = (initialZoom = 1): ViewportCameraStore => {
  const [store] = useState(
    () =>
      new ViewportCameraStore({
        initialDeviceScale: createDeviceScale(getInitialDeviceScale()),
        initialTransform: createViewportTransform({ panX: 0, panY: 0, zoom: initialZoom }),
        initialViewport: createViewportSize(1, 1),
        scheduler: createBrowserAnimationFrameScheduler(),
      }),
  );

  useEffect(() => () => store.cancelPending(), [store]);
  return store;
};
