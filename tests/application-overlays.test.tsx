import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { AppPopover } from '../src/renderer/design/AppPopover';
import { AppTooltip } from '../src/renderer/design/AppTooltip';

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
});
