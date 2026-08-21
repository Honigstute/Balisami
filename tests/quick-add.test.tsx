import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CONTROL_TYPES, type ControlTypeId } from '../src/domain';
import { QuickAdd } from '../src/renderer/controls/QuickAdd';
import {
  DEFAULT_QUICK_ADD_PREFERENCES,
  MAX_QUICK_ADD_RECENT,
  QUICK_ADD_PREFERENCES_STORAGE_KEY,
  loadQuickAddPreferences,
  recordQuickAddRecent,
  toggleQuickAddFavorite,
} from '../src/renderer/controls/quick-add-preferences';
import { createQuickAddResults } from '../src/renderer/controls/quick-add-results';

const QuickAddFixture = ({
  onInsert = () => true,
}: {
  readonly onInsert?: (controlType: ControlTypeId) => boolean;
}) => (
  <>
    <div id="overlay-root" />
    <QuickAdd onInsert={onInsert} shortcutLabel="⌘ K" storage={window.localStorage} />
  </>
);

describe('Quick Add', () => {
  beforeEach(() => window.localStorage.clear());

  it('opens from the command shortcut, ranks aliases, and inserts the active result once', () => {
    const onInsert = vi.fn<(controlType: ControlTypeId) => boolean>(() => true);
    render(<QuickAddFixture onInsert={onInsert} />);

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const search = screen.getByRole('combobox', { name: 'Find a control' });
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: 'cta' } });
    expect(screen.getByRole('option', { name: 'Insert Button' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onInsert).toHaveBeenCalledOnce();
    expect(onInsert).toHaveBeenCalledWith(CONTROL_TYPES.button);
    expect(screen.queryByRole('dialog', { name: 'Quick add controls' })).toBeNull();
    expect(loadQuickAddPreferences(window.localStorage).recent).toEqual([CONTROL_TYPES.button]);
  });

  it('navigates results without moving search focus and keeps failed insertion open', () => {
    const onInsert = vi.fn<(controlType: ControlTypeId) => boolean>(() => false);
    render(<QuickAddFixture onInsert={onInsert} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quick add' }));
    const search = screen.getByRole('combobox', { name: 'Find a control' });

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(search).toHaveFocus();
    expect(screen.getByRole('option', { name: 'Insert Text Label' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onInsert).toHaveBeenCalledWith(CONTROL_TYPES.textLabel);
    expect(screen.getByRole('dialog', { name: 'Quick add controls' })).toBeInTheDocument();
    expect(loadQuickAddPreferences(window.localStorage).recent).toEqual([]);
  });

  it('promotes bounded favorites and recent controls without duplicating registry results', () => {
    const favorite = toggleQuickAddFavorite(DEFAULT_QUICK_ADD_PREFERENCES, CONTROL_TYPES.checkbox);
    const recent = recordQuickAddRecent(favorite, CONTROL_TYPES.button);
    const results = createQuickAddResults('', recent);

    expect(results[0]).toMatchObject({
      definition: { type: CONTROL_TYPES.checkbox },
      section: 'Favorites',
    });
    expect(results[1]).toMatchObject({
      definition: { type: CONTROL_TYPES.button },
      section: 'Recent',
    });
    expect(new Set(results.map(({ definition }) => definition.type)).size).toBe(results.length);
  });

  it('persists favorite toggles and rejects malformed or oversized preference data', () => {
    render(<QuickAddFixture />);
    fireEvent.click(screen.getByRole('button', { name: 'Quick add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Rectangle to favorites' }));

    expect(loadQuickAddPreferences(window.localStorage).favorites).toEqual([
      CONTROL_TYPES.rectangle,
    ]);
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Rectangle from favorites' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    window.localStorage.setItem(QUICK_ADD_PREFERENCES_STORAGE_KEY, '{"formatVersion":1}');
    expect(loadQuickAddPreferences(window.localStorage)).toBe(DEFAULT_QUICK_ADD_PREFERENCES);

    let preferences = DEFAULT_QUICK_ADD_PREFERENCES;
    for (const type of [
      CONTROL_TYPES.rectangle,
      CONTROL_TYPES.textLabel,
      CONTROL_TYPES.button,
      CONTROL_TYPES.textInput,
      CONTROL_TYPES.checkbox,
      CONTROL_TYPES.imagePlaceholder,
      CONTROL_TYPES.browser,
      CONTROL_TYPES.arrow,
    ]) {
      preferences = recordQuickAddRecent(preferences, type);
    }
    expect(preferences.recent).toHaveLength(MAX_QUICK_ADD_RECENT);
    expect(preferences.recent[0]).toBe(CONTROL_TYPES.arrow);
  });
});
