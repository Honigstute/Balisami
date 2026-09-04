import { useEffect, useState, type FormEvent } from 'react';

import { DESIGN_TOKENS } from '../../shared/design-tokens';
import { AppButton } from './AppButton';
import { AppField } from './AppField';
import { AppInput } from './AppInput';
import { AppPopover } from './AppPopover';
import { AppSwatch } from './AppSwatch';
import { normalizeSwatchColor } from './app-color-value';

interface AppColorPopoverProps {
  readonly label: string;
  readonly mixed?: boolean;
  readonly onChange: (value: string) => void;
  readonly value: string | undefined;
}

const COLOR_OPTIONS = Object.freeze([
  Object.freeze({ label: 'Default', preview: DESIGN_TOKENS.color.canvas, value: 'default' }),
  Object.freeze({ label: 'Ink', preview: DESIGN_TOKENS.color.ink, value: DESIGN_TOKENS.color.ink }),
  Object.freeze({
    label: 'Muted',
    preview: DESIGN_TOKENS.color.mutedInk,
    value: DESIGN_TOKENS.color.mutedInk,
  }),
  Object.freeze({
    label: 'Accent',
    preview: DESIGN_TOKENS.color.accentStrong,
    value: DESIGN_TOKENS.color.accentStrong,
  }),
  Object.freeze({
    label: 'Guide',
    preview: DESIGN_TOKENS.color.guide,
    value: DESIGN_TOKENS.color.guide,
  }),
  Object.freeze({
    label: 'Canvas',
    preview: DESIGN_TOKENS.color.canvas,
    value: DESIGN_TOKENS.color.canvas,
  }),
]);

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;

/** Token-seeded color editor with a custom-value path in a fixed portal overlay. */
export const AppColorPopover = ({
  label,
  mixed = false,
  onChange,
  value,
}: AppColorPopoverProps) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value === undefined || value === 'default' ? '' : value);
  const [validation, setValidation] = useState<string>();

  useEffect(() => {
    setDraft(value === undefined || value === 'default' ? '' : value);
    setValidation(undefined);
  }, [open, value]);

  const choose = (nextValue: string): void => {
    onChange(nextValue);
    setOpen(false);
  };

  const applyCustom = (event: FormEvent): void => {
    event.preventDefault();
    if (!HEX_COLOR_PATTERN.test(draft)) {
      setValidation('Use a six-digit hex color.');
      return;
    }
    choose(draft.toUpperCase());
  };

  return (
    <AppField grouped label={label} mixed={mixed}>
      {() => (
        <AppPopover
          label={`${label} colors`}
          onOpenChange={setOpen}
          open={open}
          trigger={(triggerProps) => (
            <AppSwatch
              {...triggerProps}
              color={normalizeSwatchColor(value ?? '')}
              label={`Choose ${label}`}
            />
          )}
        >
          <div className="app-color-popover__palette" role="group" aria-label="Preset colors">
            {COLOR_OPTIONS.map((option) => (
              <AppSwatch
                aria-pressed={option.value === value}
                color={option.preview}
                key={option.value}
                label={option.label}
                onClick={() => choose(option.value)}
              />
            ))}
          </div>
          <form className="app-color-popover__custom" onSubmit={applyCustom}>
            <AppInput
              label="Hex color"
              maxLength={7}
              onChange={(event) => setDraft(event.currentTarget.value)}
              placeholder={DESIGN_TOKENS.color.ink}
              spellCheck={false}
              {...(validation === undefined ? {} : { validation })}
              value={draft}
            />
            <AppButton tone="primary" type="submit">
              Apply
            </AppButton>
          </form>
        </AppPopover>
      )}
    </AppField>
  );
};
