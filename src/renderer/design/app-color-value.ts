import { DESIGN_TOKENS } from '../../shared/design-tokens';

export const normalizeSwatchColor = (color: string): string =>
  /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(color) ? color : DESIGN_TOKENS.color.canvas;
