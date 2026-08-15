import {
  CONTROL_TEXT_MEASUREMENT_POLICY,
  getBrowserControlTextMeasurementService,
} from '../controls/control-text-measurement';

const waitForAnimationFrame = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    // JSDOM and other non-visual test environments do not schedule animation frames.
    window.setTimeout(resolve, 0);
  });

/**
 * Wait until fonts have settled and React's latest committed UI has crossed a paint boundary.
 * Packaged smoke tests use this signal before capturing the window.
 */
export const waitForRendererPresentation = async (): Promise<void> => {
  if (document.fonts !== undefined) {
    const measurementService = await getBrowserControlTextMeasurementService(document);
    // This startup probe proves the exact bundled font exposes usable canvas metrics before any
    // auto-size command or packaged screenshot can rely on them.
    measurementService.measure({
      fontSize: CONTROL_TEXT_MEASUREMENT_POLICY.fontProbeSize,
      mode: 'single-line',
      text: CONTROL_TEXT_MEASUREMENT_POLICY.fontProbeText,
    });
  }

  // A callback queued from inside a frame runs in the following frame, guaranteeing a paint
  // opportunity between the renderer state update and the desktop readiness acknowledgement.
  await waitForAnimationFrame();
  await waitForAnimationFrame();
};
