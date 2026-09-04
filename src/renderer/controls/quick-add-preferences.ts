import {
  ControlTypeIdSchema,
  getControlPaletteEntry,
  getControlPaletteEntryById,
  type ControlPaletteEntry,
  type ControlTypeId,
} from '../../domain';

export const QUICK_ADD_PREFERENCES_FORMAT_VERSION = 2 as const;
export const QUICK_ADD_PREFERENCES_STORAGE_KEY = 'balsamic.quick-add-preferences.v2' as const;
export const LEGACY_QUICK_ADD_PREFERENCES_STORAGE_KEY =
  'balsamic.quick-add-preferences.v1' as const;
export const MAX_QUICK_ADD_FAVORITES = 12;
export const MAX_QUICK_ADD_RECENT = 6;
const MAX_QUICK_ADD_PREFERENCES_BYTES = 4_096;

export type QuickAddEntryId = ControlPaletteEntry['id'];

export interface QuickAddPreferences {
  readonly favorites: readonly QuickAddEntryId[];
  readonly formatVersion: typeof QUICK_ADD_PREFERENCES_FORMAT_VERSION;
  readonly recent: readonly QuickAddEntryId[];
}

export interface QuickAddPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const freezePreferences = (
  favorites: readonly QuickAddEntryId[],
  recent: readonly QuickAddEntryId[],
): QuickAddPreferences =>
  Object.freeze({
    favorites: Object.freeze([...favorites]),
    formatVersion: QUICK_ADD_PREFERENCES_FORMAT_VERSION,
    recent: Object.freeze([...recent]),
  });

export const DEFAULT_QUICK_ADD_PREFERENCES = freezePreferences([], []);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const parseRegisteredEntryIds = (
  value: unknown,
  maximumLength: number,
): readonly QuickAddEntryId[] | undefined => {
  if (!Array.isArray(value) || value.length > maximumLength) return undefined;
  const parsed: QuickAddEntryId[] = [];
  const seen = new Set<QuickAddEntryId>();
  for (const candidate of value) {
    if (
      typeof candidate !== 'string' ||
      getControlPaletteEntryById(candidate) === undefined ||
      seen.has(candidate)
    ) {
      return undefined;
    }
    parsed.push(candidate);
    seen.add(candidate);
  }
  return Object.freeze(parsed);
};

const parseLegacyRegisteredTypes = (
  value: unknown,
  maximumLength: number,
): readonly QuickAddEntryId[] | undefined => {
  if (!Array.isArray(value) || value.length > maximumLength) return undefined;
  const parsed: QuickAddEntryId[] = [];
  const seen = new Set<ControlTypeId>();
  for (const candidate of value) {
    const result = ControlTypeIdSchema.safeParse(candidate);
    if (!result.success || seen.has(result.data)) return undefined;
    const baseEntry = getControlPaletteEntry(result.data);
    if (baseEntry === undefined) return undefined;
    parsed.push(baseEntry.id);
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
  const favorites = parseRegisteredEntryIds(value.favorites, MAX_QUICK_ADD_FAVORITES);
  const recent = parseRegisteredEntryIds(value.recent, MAX_QUICK_ADD_RECENT);
  return favorites === undefined || recent === undefined
    ? undefined
    : freezePreferences(favorites, recent);
};

const parseLegacyQuickAddPreferences = (value: unknown): QuickAddPreferences | undefined => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['favorites', 'formatVersion', 'recent']) ||
    value.formatVersion !== 1
  ) {
    return undefined;
  }
  const favorites = parseLegacyRegisteredTypes(value.favorites, MAX_QUICK_ADD_FAVORITES);
  const recent = parseLegacyRegisteredTypes(value.recent, MAX_QUICK_ADD_RECENT);
  return favorites === undefined || recent === undefined
    ? undefined
    : freezePreferences(favorites, recent);
};

const readBoundedJson = (storage: QuickAddPreferenceStorage, key: string): unknown => {
  const serialized = storage.getItem(key);
  if (
    serialized === null ||
    new TextEncoder().encode(serialized).byteLength > MAX_QUICK_ADD_PREFERENCES_BYTES
  ) {
    return undefined;
  }
  return JSON.parse(serialized) as unknown;
};

export const saveQuickAddPreferences = (
  storage: QuickAddPreferenceStorage | undefined,
  preferences: QuickAddPreferences,
): boolean => {
  if (storage === undefined || parseQuickAddPreferences(preferences) === undefined) return false;
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

export const loadQuickAddPreferences = (
  storage: QuickAddPreferenceStorage | undefined,
): QuickAddPreferences => {
  if (storage === undefined) return DEFAULT_QUICK_ADD_PREFERENCES;
  try {
    const current = parseQuickAddPreferences(
      readBoundedJson(storage, QUICK_ADD_PREFERENCES_STORAGE_KEY),
    );
    if (current !== undefined) return current;
    const migrated = parseLegacyQuickAddPreferences(
      readBoundedJson(storage, LEGACY_QUICK_ADD_PREFERENCES_STORAGE_KEY),
    );
    if (migrated === undefined) return DEFAULT_QUICK_ADD_PREFERENCES;
    saveQuickAddPreferences(storage, migrated);
    return migrated;
  } catch {
    return DEFAULT_QUICK_ADD_PREFERENCES;
  }
};

export const recordQuickAddRecent = (
  preferences: QuickAddPreferences,
  entryId: QuickAddEntryId,
): QuickAddPreferences => {
  if (getControlPaletteEntryById(entryId) === undefined) return preferences;
  return freezePreferences(
    preferences.favorites,
    [entryId, ...preferences.recent.filter((candidate) => candidate !== entryId)].slice(
      0,
      MAX_QUICK_ADD_RECENT,
    ),
  );
};

export const toggleQuickAddFavorite = (
  preferences: QuickAddPreferences,
  entryId: QuickAddEntryId,
): QuickAddPreferences => {
  if (getControlPaletteEntryById(entryId) === undefined) return preferences;
  const favorite = preferences.favorites.includes(entryId);
  return freezePreferences(
    favorite
      ? preferences.favorites.filter((candidate) => candidate !== entryId)
      : [entryId, ...preferences.favorites].slice(0, MAX_QUICK_ADD_FAVORITES),
    preferences.recent,
  );
};
