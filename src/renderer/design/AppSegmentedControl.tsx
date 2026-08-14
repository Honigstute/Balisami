import { AppField } from './AppField';

export interface AppSegmentOption {
  readonly disabled?: boolean;
  readonly label: string;
  readonly value: string;
}

interface AppSegmentedControlProps {
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly label: string;
  readonly mixed?: boolean;
  readonly onChange: (value: string) => void;
  readonly options: readonly AppSegmentOption[];
  readonly validation?: string;
  readonly value: string | undefined;
}

export const AppSegmentedControl = ({
  disabled = false,
  hint,
  label,
  mixed = false,
  onChange,
  options,
  validation,
  value,
}: AppSegmentedControlProps) => (
  <AppField grouped hint={hint} label={label} mixed={mixed} validation={validation}>
    {({ describedBy, invalid, labelledBy }) => (
      <div
        aria-describedby={describedBy}
        aria-invalid={invalid}
        aria-labelledby={labelledBy}
        className="app-segments"
        role="group"
      >
        {options.map((option) => (
          <button
            aria-pressed={option.value === value}
            className="app-segments__option"
            disabled={disabled || option.disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    )}
  </AppField>
);
