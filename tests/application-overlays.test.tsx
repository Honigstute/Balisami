import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AppChoicePopover } from '../src/renderer/design/AppChoicePopover';
import { AppColorPopover } from '../src/renderer/design/AppColorPopover';
import { AppPopover } from '../src/renderer/design/AppPopover';
import { AppTooltip } from '../src/renderer/design/AppTooltip';
import { DESIGN_TOKENS } from '../src/shared/design-tokens';

const OverlayRoot = () => <div data-testid="overlay-root" id="overlay-root" />;

const PopoverFixture = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <OverlayRoot />
      <AppPopover
        label="Color options"
        onOpenChange={setOpen}
        open={open}
        trigger={(triggerProps) => <button {...triggerProps}>Choose color</button>}
      >
        <button>Apply color</button>
      </AppPopover>
    </>
  );
};

describe('application overlays', () => {
  it('portals a focus/mouse tooltip and connects it only while visible', () => {
    render(
      <>
        <OverlayRoot />
        <AppTooltip content="Full control name">
          {(triggerProps) => <button {...triggerProps}>Truncated name</button>}
        </AppTooltip>
      </>,
    );

    const trigger = screen.getByRole('button', { name: 'Truncated name' });
    expect(trigger).not.toHaveAttribute('aria-describedby');
    fireEvent.mouseEnter(trigger);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Full control name');
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
    expect(screen.getByTestId('overlay-root')).toContainElement(tooltip);

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('can start open for deterministic visual fixtures', () => {
    render(
      <>
        <OverlayRoot />
        <AppTooltip content="Always visible fixture" defaultOpen>
          {(triggerProps) => <button {...triggerProps}>Fixture trigger</button>}
        </AppTooltip>
      </>,
    );

    const tooltip = screen.getByRole('tooltip');
    expect(screen.getByRole('button', { name: 'Fixture trigger' })).toHaveAttribute(
      'aria-describedby',
      tooltip.id,
    );
  });

  it('portals a non-modal popover, closes on Escape, and restores trigger focus', () => {
    render(<PopoverFixture />);

    const trigger = screen.getByRole('button', { name: 'Choose color' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const popover = screen.getByRole('dialog', { name: 'Color options' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('overlay-root')).toContainElement(popover);

    fireEvent.keyDown(popover, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Color options' })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('dismisses a popover on an outside pointer without swallowing its trigger', () => {
    render(<PopoverFixture />);

    const trigger = screen.getByRole('button', { name: 'Choose color' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Color options' })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog', { name: 'Color options' })).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('uses a portalled listbox with roving keyboard selection for compact choices', async () => {
    const onChange = vi.fn();
    render(
      <>
        <OverlayRoot />
        <AppChoicePopover
          label="State"
          onChange={onChange}
          options={[
            { label: 'Normal', value: 'normal' },
            { disabled: true, label: 'Unavailable', value: 'unavailable' },
            { label: 'Disabled', value: 'disabled' },
          ]}
          value="normal"
        />
      </>,
    );

    const trigger = screen.getByRole('button', { name: 'State' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const listbox = screen.getByRole('listbox', { name: 'State options' });
    expect(screen.getByTestId('overlay-root')).toContainElement(listbox);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Normal' })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole('option', { name: 'Normal' }), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Disabled' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('option', { name: 'Disabled' }), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('disabled');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('edits preset and validated custom colors inside a portalled surface', () => {
    const onChange = vi.fn();
    render(
      <>
        <OverlayRoot />
        <AppColorPopover label="Color" onChange={onChange} value="default" />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose Color' }));
    const dialog = screen.getByRole('dialog', { name: 'Color colors' });
    expect(screen.getByTestId('overlay-root')).toContainElement(dialog);
    fireEvent.click(screen.getByRole('button', { name: 'Ink' }));
    expect(onChange).toHaveBeenCalledWith(DESIGN_TOKENS.color.ink);
    expect(screen.queryByRole('dialog', { name: 'Color colors' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Choose Color' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Hex color' }), {
      target: { value: 'invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('Use a six-digit hex color.')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledOnce();
  });
});
