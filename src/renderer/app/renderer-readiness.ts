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
    await document.fonts.ready;
  }

  // A callback queued from inside a frame runs in the following frame, guaranteeing a paint
  // opportunity between the renderer state update and the desktop readiness acknowledgement.
  await waitForAnimationFrame();
  await waitForAnimationFrame();
};
