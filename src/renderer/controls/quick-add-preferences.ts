import { ControlTypeIdSchema, getControlSpec, type ControlTypeId } from '../../domain';

export const QUICK_ADD_PREFERENCES_FORMAT_VERSION = 1 as const;
export const QUICK_ADD_PREFERENCES_STORAGE_KEY = 'balsamic.quick-add-preferences.v1' as const;
export const MAX_QUICK_ADD_FAVORITES = 12;
export const MAX_QUICK_ADD_RECENT = 6;
const MAX_QUICK_ADD_PREFERENCES_BYTES = 4_096;

export interface QuickAddPreferences {
  readonly favorites: readonly ControlTypeId[];
  readonly formatVersion: typeof QUICK_ADD_PREFERENCES_FORMAT_VERSION;
  readonly recent: readonly ControlTypeId[];
}

export interface QuickAddPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const freezePreferences = (
  favorites: readonly ControlTypeId[],
  recent: readonly ControlTypeId[],
): QuickAddPreferences =>
  Object.freeze({
    favorites: Object.freeze([...favorites]),
    formatVersion: QUICK_ADD_PREFERENCES_FORMAT_VERSION,
    recent: Object.freeze([...recent]),
  });

export const DEFAULT_QUICK_ADD_PREFERENCES = freezePreferences([], []);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const parseRegisteredTypes = (
  value: unknown,
  maximumLength: number,
): readonly ControlTypeId[] | undefined => {
  if (!Array.isArray(value) || value.length > maximumLength) {
    return undefined;
  }
  const parsed: ControlTypeId[] = [];
  const seen = new Set<ControlTypeId>();
  for (const candidate of value) {
    const result = ControlTypeIdSchema.safeParse(candidate);
    if (
      !result.success ||
      getControlSpec(result.data)?.palette === null ||
      getControlSpec(result.data) === undefined ||
      seen.has(result.data)
    ) {
      return undefined;
    }
    parsed.push(result.data);
    seen.add(result.data);
  }
  return Object.freeze(parsed);
};

export const parseQuickAddPreferences = (value: unknown): QuickAddPreferences | undefined => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['favorites', 'formatVersion', 'recent']) ||
    value.formatVersion !== QUICK_ADD_PREFERENCES_FORMAT_VERSION
  ) {
    return undefined;
  }
  const favorites = parseRegisteredTypes(value.favorites, MAX_QUICK_ADD_FAVORITES);
  const recent = parseRegisteredTypes(value.recent, MAX_QUICK_ADD_RECENT);
  return favorites === undefined || recent === undefined
    ? undefined
    : freezePreferences(favorites, recent);
};

export const loadQuickAddPreferences = (
  storage: QuickAddPreferenceStorage | undefined,
): QuickAddPreferences => {
  if (storage === undefined) {
    return DEFAULT_QUICK_ADD_PREFERENCES;
  }
  try {
    const serialized = storage.getItem(QUICK_ADD_PREFERENCES_STORAGE_KEY);
    if (
      serialized === null ||
      new TextEncoder().encode(serialized).byteLength > MAX_QUICK_ADD_PREFERENCES_BYTES
    ) {
      return DEFAULT_QUICK_ADD_PREFERENCES;
    }
    return (
      parseQuickAddPreferences(JSON.parse(serialized) as unknown) ?? DEFAULT_QUICK_ADD_PREFERENCES
    );
  } catch {
    return DEFAULT_QUICK_ADD_PREFERENCES;
  }
};

export const saveQuickAddPreferences = (
  storage: QuickAddPreferenceStorage | undefined,
  preferences: QuickAddPreferences,
): boolean => {
  if (storage === undefined || parseQuickAddPreferences(preferences) === undefined) {
    return false;
  }
  try {
    const serialized = JSON.stringify(preferences);
    if (new TextEncoder().encode(serialized).byteLength > MAX_QUICK_ADD_PREFERENCES_BYTES) {
      return false;
    }
    storage.setItem(QUICK_ADD_PREFERENCES_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
};

export const recordQuickAddRecent = (
  preferences: QuickAddPreferences,
  controlType: ControlTypeId,
): QuickAddPreferences =>
  freezePreferences(
    preferences.favorites,
    [controlType, ...preferences.recent.filter((candidate) => candidate !== controlType)].slice(
      0,
      MAX_QUICK_ADD_RECENT,
    ),
  );

export const toggleQuickAddFavorite = (
  preferences: QuickAddPreferences,
  controlType: ControlTypeId,
): QuickAddPreferences => {
  const favorite = preferences.favorites.includes(controlType);
  return freezePreferences(
    favorite
      ? preferences.favorites.filter((candidate) => candidate !== controlType)
      : [controlType, ...preferences.favorites].slice(0, MAX_QUICK_ADD_FAVORITES),
    preferences.recent,
  );
};
