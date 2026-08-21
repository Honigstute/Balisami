import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { Icon } from '../shell/Icon';
import { AppField } from './AppField';
import { AppPopover } from './AppPopover';

export interface AppChoicePopoverOption {
  readonly disabled?: boolean;
  readonly label: string;
  readonly value: string;
}

interface AppChoicePopoverProps {
  readonly label: string;
  readonly mixed?: boolean;
  readonly onChange: (value: string) => void;
  readonly options: readonly AppChoicePopoverOption[];
  readonly value: string | undefined;
}

const findAvailableIndex = (
  options: readonly AppChoicePopoverOption[],
  start: number,
  direction: -1 | 1,
): number => {
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (start + direction * offset + options.length) % options.length;
    if (options[index]?.disabled !== true) {
      return index;
    }
  }
  return start;
};

/** Accessible select whose list is portalled so it cannot resize its field or the shell. */
export const AppChoicePopover = ({
  label,
  mixed = false,
  onChange,
  options,
  value,
}: AppChoicePopoverProps) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
  const selectedLabel = selectedIndex < 0 ? undefined : options[selectedIndex]?.label;

  useEffect(() => {
    if (!open) {
      return;
    }
    const nextIndex = selectedIndex >= 0 ? selectedIndex : findAvailableIndex(options, -1, 1);
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  }, [open, options, selectedIndex]);

  const choose = (index: number): void => {
    const option = options[index];
    if (option === undefined || option.disabled) {
      return;
    }
    onChange(option.value);
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowDown') {
      nextIndex = findAvailableIndex(options, activeIndex, 1);
    } else if (event.key === 'ArrowUp') {
      nextIndex = findAvailableIndex(options, activeIndex, -1);
    } else if (event.key === 'Home') {
      nextIndex = findAvailableIndex(options, -1, 1);
    } else if (event.key === 'End') {
      nextIndex = findAvailableIndex(options, 0, -1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(activeIndex);
      return;
    } else {
      return;
    }
    event.preventDefault();
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <AppField grouped label={label} mixed={mixed}>
      {({ describedBy, invalid, labelledBy }) => (
        <AppPopover
          label={`${label} options`}
          onOpenChange={setOpen}
          open={open}
          role="listbox"
          trigger={(triggerProps) => (
            <button
              {...triggerProps}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              aria-labelledby={labelledBy}
              className="app-control app-choice-popover__trigger"
              onKeyDown={(event) => {
                triggerProps.onKeyDown(event);
                if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                  event.preventDefault();
                  setOpen(true);
                }
              }}
              ref={(node) => {
                triggerRef.current = node;
                triggerProps.ref(node);
              }}
              type="button"
            >
              <span>{selectedLabel ?? (mixed ? 'Mixed' : 'Choose')}</span>
              <Icon name="chevron" />
            </button>
          )}
        >
          <div className="app-choice-popover__options">
            {options.map((option, index) => (
              <button
                aria-selected={index === selectedIndex}
                className="app-choice-popover__option"
                disabled={option.disabled}
                key={option.value}
                onClick={() => choose(index)}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={handleOptionKeyDown}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                role="option"
                tabIndex={index === activeIndex ? 0 : -1}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </AppPopover>
      )}
    </AppField>
  );
};
