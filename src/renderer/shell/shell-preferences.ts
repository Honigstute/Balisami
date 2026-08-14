import { DESIGN_TOKENS } from '../../shared/design-tokens';

export const SHELL_PREFERENCES_FORMAT_VERSION = 1 as const;
export const SHELL_PREFERENCES_STORAGE_KEY = 'balsamic.shell-preferences.v1' as const;
const MAX_SHELL_PREFERENCES_BYTES = 1_024;

export type ShellPane = 'inspector' | 'navigator';

export interface ShellPanePreference {
  readonly collapsed: boolean;
  /** Last expanded width in CSS pixels. */
  readonly width: number;
}

export interface ShellPreferences {
  readonly formatVersion: typeof SHELL_PREFERENCES_FORMAT_VERSION;
  readonly inspector: ShellPanePreference;
  readonly navigator: ShellPanePreference;
}

export interface ShellPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const freezePane = (preference: ShellPanePreference): ShellPanePreference =>
  Object.freeze(preference);

const freezePreferences = (preferences: ShellPreferences): ShellPreferences =>
  Object.freeze({
    formatVersion: preferences.formatVersion,
    inspector: freezePane(preferences.inspector),
    navigator: freezePane(preferences.navigator),
  });

export const DEFAULT_SHELL_PREFERENCES = freezePreferences({
  formatVersion: SHELL_PREFERENCES_FORMAT_VERSION,
  inspector: { collapsed: false, width: DESIGN_TOKENS.shell.inspectorWidth },
  navigator: { collapsed: false, width: DESIGN_TOKENS.shell.navigatorWidth },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const getPaneBounds = (pane: ShellPane): { readonly max: number; readonly min: number } =>
  pane === 'navigator'
    ? { max: DESIGN_TOKENS.shell.navigatorMaxWidth, min: DESIGN_TOKENS.shell.navigatorMinWidth }
    : { max: DESIGN_TOKENS.shell.inspectorMaxWidth, min: DESIGN_TOKENS.shell.inspectorMinWidth };

const isPanePreference = (value: unknown, pane: ShellPane): value is ShellPanePreference => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['collapsed', 'width']) ||
    typeof value.collapsed !== 'boolean' ||
    typeof value.width !== 'number' ||
    !Number.isSafeInteger(value.width)
  ) {
    return false;
  }
  const bounds = getPaneBounds(pane);
  return value.width >= bounds.min && value.width <= bounds.max;
};

export const parseShellPreferences = (value: unknown): ShellPreferences | undefined => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['formatVersion', 'inspector', 'navigator']) ||
    value.formatVersion !== SHELL_PREFERENCES_FORMAT_VERSION ||
    !isPanePreference(value.inspector, 'inspector') ||
    !isPanePreference(value.navigator, 'navigator')
  ) {
    return undefined;
  }
  return freezePreferences({
    formatVersion: SHELL_PREFERENCES_FORMAT_VERSION,
    inspector: value.inspector,
    navigator: value.navigator,
  });
};

/** Invalid/unavailable profile data safely falls back without changing the stored source. */
export const loadShellPreferences = (
  storage: ShellPreferenceStorage | undefined,
): ShellPreferences => {
  if (storage === undefined) {
    return DEFAULT_SHELL_PREFERENCES;
  }
  try {
    const serialized = storage.getItem(SHELL_PREFERENCES_STORAGE_KEY);
    if (
      serialized === null ||
      new TextEncoder().encode(serialized).byteLength > MAX_SHELL_PREFERENCES_BYTES
    ) {
      return DEFAULT_SHELL_PREFERENCES;
    }
    return parseShellPreferences(JSON.parse(serialized) as unknown) ?? DEFAULT_SHELL_PREFERENCES;
  } catch {
    return DEFAULT_SHELL_PREFERENCES;
  }
};

export const saveShellPreferences = (
  storage: ShellPreferenceStorage | undefined,
  preferences: ShellPreferences,
): boolean => {
  if (storage === undefined || parseShellPreferences(preferences) === undefined) {
    return false;
  }
  try {
    const serialized = JSON.stringify(preferences);
    if (new TextEncoder().encode(serialized).byteLength > MAX_SHELL_PREFERENCES_BYTES) {
      return false;
    }
    storage.setItem(SHELL_PREFERENCES_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
};

export const setShellPaneCollapsed = (
  preferences: ShellPreferences,
  pane: ShellPane,
  collapsed: boolean,
): ShellPreferences =>
  freezePreferences({
    ...preferences,
    [pane]: { ...preferences[pane], collapsed },
  });

export const setShellPaneWidth = (
  preferences: ShellPreferences,
  pane: ShellPane,
  width: number,
): ShellPreferences => {
  const bounds = getPaneBounds(pane);
  const nextWidth = Number.isFinite(width)
    ? Math.min(bounds.max, Math.max(bounds.min, Math.round(width)))
    : preferences[pane].width;
  if (nextWidth === preferences[pane].width) {
    return preferences;
  }
  return freezePreferences({
    ...preferences,
    [pane]: { ...preferences[pane], width: nextWidth },
  });
};
