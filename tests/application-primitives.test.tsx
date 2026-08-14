import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppButton } from '../src/renderer/design/AppButton';
import { AppModal, AppModalActions, AppModalHeading } from '../src/renderer/design/AppModal';

describe('application design primitives', () => {
  it('labels the modal, focuses its intended action, and traps tab navigation', async () => {
    const priorOwner = document.createElement('button');
    document.body.append(priorOwner);
    priorOwner.focus();
    const { unmount } = render(
      <AppModal describedBy="test-modal-copy" labelledBy="test-modal-title">
        <AppModalHeading
          description="A stable modal description."
          descriptionId="test-modal-copy"
          eyebrow="Safety"
          title="Choose an action"
          titleId="test-modal-title"
        />
        <AppModalActions>
          <AppButton initialFocus>First action</AppButton>
          <AppButton tone="primary">Last action</AppButton>
        </AppModalActions>
      </AppModal>,
    );

    const modal = screen.getByRole('dialog', { name: 'Choose an action' });
    const first = screen.getByRole('button', { name: 'First action' });
    const last = screen.getByRole('button', { name: 'Last action' });
    expect(modal).toHaveAccessibleDescription('A stable modal description.');
    await waitFor(() => expect(first).toHaveFocus());

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    unmount();
    expect(priorOwner).toHaveFocus();
    priorOwner.remove();
  });

  it('falls back to the first available action when the preferred action is disabled', async () => {
    render(
      <AppModal labelledBy="availability-title">
        <h2 id="availability-title">Availability</h2>
        <AppButton disabled initialFocus>
          Unavailable
        </AppButton>
        <AppButton>Available</AppButton>
      </AppModal>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Available' })).toHaveFocus();
    });
  });

  it('dismisses only when an explicit modal policy handles Escape', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <AppModal labelledBy="dismissible-title" onDismiss={onDismiss}>
        <h2 id="dismissible-title">Dismissible</h2>
        <AppButton>Close</AppButton>
      </AppModal>,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledOnce();

    rerender(
      <AppModal labelledBy="required-title">
        <h2 id="required-title">Required choice</h2>
        <AppButton>Continue</AppButton>
      </AppModal>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('uses stable tone classes without changing the button contract', () => {
    render(
      <>
        <AppButton>Neutral</AppButton>
        <AppButton disabled tone="danger">
          Danger
        </AppButton>
        <AppButton tone="primary">Primary</AppButton>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Neutral' })).toHaveClass(
      'app-button',
      'app-button--neutral',
    );
    expect(screen.getByRole('button', { name: 'Danger' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Danger' })).toHaveClass('app-button--danger');
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass('app-button--primary');
  });
});
