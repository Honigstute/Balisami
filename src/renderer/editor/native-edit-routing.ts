/**
 * Native menu editing belongs to a focused text editor. Canvas commands stay
 * with Balsamic's validated document/selection owners instead of Electron's
 * generic DOM editing stack.
 */
export const isNativeTextEditTarget = (target: Element | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);
