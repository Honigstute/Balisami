import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';

import { normalizeSwatchColor } from './app-color-value';

interface AppSwatchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children' | 'className' | 'style' | 'type'
> {
  readonly color: string;
  readonly label: string;
}

type SwatchStyle = CSSProperties & { readonly '--swatch-color': string };

export const AppSwatch = forwardRef<HTMLButtonElement, AppSwatchProps>(function AppSwatch(
  { color, label, ...buttonProps },
  ref,
) {
  return (
    <button
      {...buttonProps}
      aria-label={label}
      className="app-swatch"
      ref={ref}
      style={{ '--swatch-color': normalizeSwatchColor(color) } as SwatchStyle}
      type="button"
    />
  );
});
