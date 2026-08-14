import type { SelectHTMLAttributes } from 'react';

import { Icon } from '../shell/Icon';
import { AppField } from './AppField';

export interface AppSelectOption {
  readonly disabled?: boolean;
  readonly label: string;
  readonly value: string;
}

interface AppSelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'aria-describedby' | 'aria-invalid' | 'children' | 'className' | 'id'
> {
  readonly hint?: string;
  readonly label: string;
  readonly mixed?: boolean;
  readonly options: readonly AppSelectOption[];
  readonly validation?: string;
}

export const AppSelect = ({
  hint,
  label,
  mixed = false,
  options,
  validation,
  ...selectProps
}: AppSelectProps) => (
  <AppField hint={hint} label={label} mixed={mixed} validation={validation}>
    {({ controlId, describedBy, invalid }) => (
      <span className="app-select">
        <select
          {...selectProps}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className="app-control"
          id={controlId}
        >
          {options.map((option) => (
            <option disabled={option.disabled} key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevron" />
      </span>
    )}
  </AppField>
);
