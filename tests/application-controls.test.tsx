import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppEmptyState, AppScroller } from '../src/renderer/design/AppEmptyState';
import { AppInput } from '../src/renderer/design/AppInput';
import { AppSegmentedControl } from '../src/renderer/design/AppSegmentedControl';
import { AppSelect } from '../src/renderer/design/AppSelect';
import { AppSlider } from '../src/renderer/design/AppSlider';
import { AppSwatch } from '../src/renderer/design/AppSwatch';
import { DESIGN_TOKENS } from '../src/shared/design-tokens';

describe('compact application controls', () => {
  it('associates labels and a permanently reserved help or validation line', () => {
    render(
      <>
        <AppInput hint="World units" kind="number" label="X" readOnly value={24} />
        <AppInput
          kind="number"
          label="Width"
          readOnly
          validation="Use a positive width."
          value={0}
        />
        <AppInput label="Shared value" mixed readOnly value="" />
      </>,
    );

    expect(screen.getByLabelText('X')).toHaveAccessibleDescription('World units');
    expect(screen.getByLabelText('Width')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Width')).toHaveAccessibleDescription('Use a positive width.');
    expect(screen.getByText('Mixed')).toBeInTheDocument();
    expect(document.querySelectorAll('.app-field__message')).toHaveLength(3);
  });

  it('keeps select and segmented states explicit and keyboard-semantic', () => {
    const onSegmentChange = vi.fn();
    render(
      <>
        <AppSelect
          defaultValue="normal"
          label="State"
          options={[
            { label: 'Normal', value: 'normal' },
            { label: 'Disabled', value: 'disabled' },
          ]}
        />
        <AppSegmentedControl
          label="Point"
          onChange={onSegmentChange}
          options={[
            { label: 'Left', value: 'left' },
            { label: 'None', value: 'none' },
            { label: 'Right', value: 'right' },
          ]}
          value="left"
        />
      </>,
    );

    expect(screen.getByLabelText('State')).toHaveValue('normal');
    expect(screen.getByRole('group', { name: 'Point' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Left' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Right' }));
    expect(onSegmentChange).toHaveBeenCalledWith('right');
  });

  it('uses stable slider, swatch, empty-state, and scroller contracts', () => {
    const onSliderChange = vi.fn();
    const onSwatchClick = vi.fn();
    render(
      <>
        <AppSlider
          label="Opacity"
          max={100}
          min={0}
          onChange={onSliderChange}
          output="64%"
          value={64}
        />
        <AppSwatch color="#2E9DDF" label="Choose fill color" onClick={onSwatchClick} />
        <AppSwatch color="url(https://invalid.test)" label="Invalid color" onClick={vi.fn()} />
        <AppScroller>
          <AppEmptyState description="Nothing is available." title="Empty" />
        </AppScroller>
      </>,
    );

    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '72' } });
    expect(onSliderChange).toHaveBeenCalledOnce();
    expect(screen.getByText('64%')).toHaveAttribute('for');
    fireEvent.click(screen.getByRole('button', { name: 'Choose fill color' }));
    expect(onSwatchClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Choose fill color' })).toHaveStyle({
      '--swatch-color': '#2E9DDF',
    });
    expect(screen.getByRole('button', { name: 'Invalid color' })).toHaveStyle({
      '--swatch-color': DESIGN_TOKENS.color.canvas,
    });
    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(document.querySelector('.app-scroller')).toBeInTheDocument();
  });

  it('preserves disabled geometry through semantic disabled states', () => {
    render(
      <>
        <AppInput disabled label="Name" value="Disabled" readOnly />
        <AppSelect disabled label="Mode" options={[{ label: 'One', value: 'one' }]} value="one" />
        <AppSegmentedControl
          disabled
          label="Alignment"
          onChange={vi.fn()}
          options={[{ label: 'Left', value: 'left' }]}
          value="left"
        />
        <AppSwatch color="#FFFFFF" disabled label="Disabled swatch" onClick={vi.fn()} />
      </>,
    );

    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByLabelText('Mode')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Left' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disabled swatch' })).toBeDisabled();
  });
});
