/** Shared validation limits for persisted, edited, and measured control text. */
export const CONTROL_TEXT_POLICY = Object.freeze({
  maximumFontSize: 1_024,
  maximumLength: 100_000,
  maximumLineHeight: 10,
  measurementPrecision: 1_000,
});
