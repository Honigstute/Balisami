import type { InputHTMLAttributes } from 'react';

import { AppField } from './AppField';

interface AppSliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'aria-describedby' | 'aria-invalid' | 'className' | 'id' | 'type'
> {
  readonly hint?: string;
  readonly label: string;
  readonly output: string;
  readonly validation?: string;
}

export const AppSlider = ({ hint, label, output, validation, ...inputProps }: AppSliderProps) => (
  <AppField hint={hint} label={label} validation={validation}>
    {({ controlId, describedBy, invalid }) => (
      <span className="app-slider">
        <input
          {...inputProps}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          id={controlId}
          type="range"
        />
        <output htmlFor={controlId}>{output}</output>
      </span>
    )}
  </AppField>
);
