import type { CSSProperties } from 'react';

import { DESIGN_TOKENS } from '../../shared/design-tokens';

interface AppSwatchProps {
  readonly color: string;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onClick: () => void;
}

type SwatchStyle = CSSProperties & { readonly '--swatch-color': string };

const normalizeSwatchColor = (color: string): string =>
  /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(color) ? color : DESIGN_TOKENS.color.canvas;

export const AppSwatch = ({ color, disabled = false, label, onClick }: AppSwatchProps) => (
  <button
    aria-label={label}
    className="app-swatch"
    disabled={disabled}
    onClick={onClick}
    style={{ '--swatch-color': normalizeSwatchColor(color) } as SwatchStyle}
    type="button"
  />
);
