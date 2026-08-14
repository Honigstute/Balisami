import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../src/renderer/shell/AppShell';
import { SHELL_LAYOUT_ATTRIBUTES } from '../src/shared/shell-layout';

const FailingRegion = (): never => {
  throw new Error('Sensitive technical detail');
};

describe('regional failure containment', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('isolates a canvas render failure, preserves shell tracks, and reports one bounded notice', () => {
    render(
      <AppShell
        quickAddShortcut="Ctrl/Cmd K"
        regionContent={{ canvas: <FailingRegion /> }}
        statusLabel="Ready"
        statusTone="ready"
      />,
    );

    expect(screen.getByRole('main', { name: 'Canvas viewport' })).toBeInTheDocument();
    expect(screen.getByText('Canvas unavailable')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Wireframes' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      SHELL_LAYOUT_ATTRIBUTES.navigatorWidth,
      '224',
    );
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      SHELL_LAYOUT_ATTRIBUTES.inspectorWidth,
      '320',
    );
    expect(screen.getAllByText('Canvas was isolated')).toHaveLength(1);
    expect(screen.queryByText('Sensitive technical detail')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getAllByText('Canvas was isolated')).toHaveLength(1);
    expect(screen.getByText('Canvas unavailable')).toBeInTheDocument();
  });

  it('dismisses feedback without changing or retrying the failed region', () => {
    render(
      <AppShell
        quickAddShortcut="Ctrl/Cmd K"
        regionContent={{ inspector: <FailingRegion /> }}
        statusLabel="Ready"
        statusTone="ready"
      />,
    );

    expect(screen.getByText('Inspector unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Inspector was isolated' }));
    expect(screen.queryByText('Inspector was isolated')).toBeNull();
    expect(screen.getByText('Inspector unavailable')).toBeInTheDocument();
  });
});
