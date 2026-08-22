import type { InputHTMLAttributes, Ref } from 'react';

import { AppField } from './AppField';

interface AppInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'aria-describedby' | 'aria-invalid' | 'className' | 'id' | 'type'
> {
  readonly hint?: string;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly kind?: 'number' | 'text';
  readonly label: string;
  readonly mixed?: boolean;
  readonly validation?: string;
}

export const AppInput = ({
  hint,
  inputRef,
  kind = 'text',
  label,
  mixed = false,
  validation,
  ...inputProps
}: AppInputProps) => (
  <AppField hint={hint} label={label} mixed={mixed} validation={validation}>
    {({ controlId, describedBy, invalid }) => (
      <input
        {...inputProps}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className="app-control app-input"
        id={controlId}
        ref={inputRef}
        type={kind}
      />
    )}
  </AppField>
);
