import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../src/renderer/shell/AppShell';
import {
  DEFAULT_SHELL_PREFERENCES,
  SHELL_PREFERENCES_STORAGE_KEY,
  loadShellPreferences,
  parseShellPreferences,
  saveShellPreferences,
  setShellPaneCollapsed,
  setShellPaneWidth,
  type ShellPreferenceStorage,
} from '../src/renderer/shell/shell-preferences';
import { DESIGN_TOKENS } from '../src/shared/design-tokens';
import { SHELL_LAYOUT_ATTRIBUTES } from '../src/shared/shell-layout';

const renderShell = () =>
  render(<AppShell quickAddShortcut="Ctrl/Cmd K" statusLabel="Ready" statusTone="ready" />);

describe('shell preferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('strictly validates one bounded versioned preference record', () => {
    expect(parseShellPreferences(DEFAULT_SHELL_PREFERENCES)).toEqual(DEFAULT_SHELL_PREFERENCES);
    expect(
      parseShellPreferences({ ...DEFAULT_SHELL_PREFERENCES, formatVersion: 2 }),
    ).toBeUndefined();
    expect(
      parseShellPreferences({
        ...DEFAULT_SHELL_PREFERENCES,
        inspector: { collapsed: false, width: 10_000 },
      }),
    ).toBeUndefined();
    expect(
      parseShellPreferences({ ...DEFAULT_SHELL_PREFERENCES, unexpected: true }),
    ).toBeUndefined();
  });

  it('clamps widths while preserving the last expanded width through collapse', () => {
    const expanded = setShellPaneWidth(DEFAULT_SHELL_PREFERENCES, 'navigator', 10_000);
    expect(expanded.navigator.width).toBe(DESIGN_TOKENS.shell.navigatorMaxWidth);

    const collapsed = setShellPaneCollapsed(expanded, 'navigator', true);
    expect(collapsed.navigator).toEqual({
      collapsed: true,
      width: DESIGN_TOKENS.shell.navigatorMaxWidth,
    });
    expect(setShellPaneWidth(collapsed, 'inspector', Number.NaN)).toBe(collapsed);
  });

  it('falls back without overwriting malformed or unavailable profile storage', () => {
    const setItem = vi.fn();
    const malformedStorage: ShellPreferenceStorage = {
      getItem: () => '{malformed',
      setItem,
    };
    expect(loadShellPreferences(malformedStorage)).toBe(DEFAULT_SHELL_PREFERENCES);
    expect(setItem).not.toHaveBeenCalled();

    const unavailableStorage: ShellPreferenceStorage = {
      getItem: () => {
        throw new Error('Profile unavailable');
      },
      setItem: () => {
        throw new Error('Profile unavailable');
      },
    };
    expect(loadShellPreferences(unavailableStorage)).toBe(DEFAULT_SHELL_PREFERENCES);
    expect(saveShellPreferences(unavailableStorage, DEFAULT_SHELL_PREFERENCES)).toBe(false);
  });

  it('persists explicit collapse and expand without removing either shell region', () => {
    const first = renderShell();
    const root = screen.getByTestId('app-shell');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Wireframes navigator' }));
    expect(root).toHaveAttribute(
      SHELL_LAYOUT_ATTRIBUTES.navigatorWidth,
      String(DESIGN_TOKENS.shell.collapsedPaneWidth),
    );
    expect(screen.getByRole('complementary', { name: 'Wireframes' })).toBeInTheDocument();
    expect(screen.queryByRole('separator', { name: 'Resize Wireframes navigator' })).toBeNull();
    expect(window.localStorage.getItem(SHELL_PREFERENCES_STORAGE_KEY)).not.toBeNull();

    first.unmount();
    renderShell();
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      SHELL_LAYOUT_ATTRIBUTES.navigatorWidth,
      String(DESIGN_TOKENS.shell.collapsedPaneWidth),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand Wireframes navigator' }));
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      SHELL_LAYOUT_ATTRIBUTES.navigatorWidth,
      String(DESIGN_TOKENS.shell.navigatorWidth),
    );
  });

  it('supports spatial keyboard resizing and persists only bounded values', () => {
    renderShell();
    const root = screen.getByTestId('app-shell');
    const navigator = screen.getByRole('separator', { name: 'Resize Wireframes navigator' });
    const inspector = screen.getByRole('separator', { name: 'Resize Inspector' });

    fireEvent.keyDown(navigator, { key: 'ArrowRight' });
    expect(root).toHaveAttribute(SHELL_LAYOUT_ATTRIBUTES.navigatorWidth, '228');
    fireEvent.keyDown(inspector, { key: 'ArrowRight' });
    expect(root).toHaveAttribute(SHELL_LAYOUT_ATTRIBUTES.inspectorWidth, '316');

    fireEvent.keyDown(navigator, { key: 'End' });
    fireEvent.keyDown(inspector, { key: 'Home' });
    expect(root).toHaveAttribute(
      SHELL_LAYOUT_ATTRIBUTES.navigatorWidth,
      String(DESIGN_TOKENS.shell.navigatorMaxWidth),
    );
    expect(root).toHaveAttribute(
      SHELL_LAYOUT_ATTRIBUTES.inspectorWidth,
      String(DESIGN_TOKENS.shell.inspectorMinWidth),
    );
    expect(loadShellPreferences(window.localStorage)).toMatchObject({
      inspector: { width: DESIGN_TOKENS.shell.inspectorMinWidth },
      navigator: { width: DESIGN_TOKENS.shell.navigatorMaxWidth },
    });
  });

  it('keeps pointer previews transient and restores the original width on cancellation', () => {
    renderShell();
    const root = screen.getByTestId('app-shell');
    const navigator = screen.getByRole('separator', { name: 'Resize Wireframes navigator' });

    fireEvent.pointerDown(navigator, { button: 0, clientX: 224, pointerId: 7 });
    fireEvent.pointerMove(navigator, { clientX: 284, pointerId: 7 });
    expect(root).toHaveAttribute(SHELL_LAYOUT_ATTRIBUTES.navigatorWidth, '284');
    expect(loadShellPreferences(window.localStorage).navigator.width).toBe(
      DESIGN_TOKENS.shell.navigatorWidth,
    );

    fireEvent.pointerCancel(navigator, { pointerId: 7 });
    expect(root).toHaveAttribute(
      SHELL_LAYOUT_ATTRIBUTES.navigatorWidth,
      String(DESIGN_TOKENS.shell.navigatorWidth),
    );

    fireEvent.pointerDown(navigator, { button: 0, clientX: 224, pointerId: 8 });
    fireEvent.pointerUp(navigator, { clientX: 260, pointerId: 8 });
    expect(root).toHaveAttribute(SHELL_LAYOUT_ATTRIBUTES.navigatorWidth, '260');
    expect(loadShellPreferences(window.localStorage).navigator.width).toBe(260);
  });
});
