import { getControlPaletteEntryById, type ControlPaletteEntry } from '../../domain';
import { queryControlLibraryEntries } from './control-library-query';
import type { QuickAddPreferences } from './quick-add-preferences';

export interface QuickAddResult {
  readonly entry: ControlPaletteEntry;
  readonly section: 'Controls' | 'Favorites' | 'Recent';
}

const getStoredEntries = (entryIds: readonly string[]): readonly ControlPaletteEntry[] =>
  entryIds.flatMap((entryId) => {
    const entry = getControlPaletteEntryById(entryId);
    return entry === undefined ? [] : [entry];
  });

/**
 * Empty Quick Add searches prioritize explicit favorites and successful recent
 * insertions. Every definition still comes from the registry query path.
 */
export const createQuickAddResults = (
  query: string,
  preferences: QuickAddPreferences,
): readonly QuickAddResult[] => {
  if (query.trim().length > 0) {
    return Object.freeze(
      queryControlLibraryEntries({ query }).map((entry) => ({
        entry,
        section: 'Controls' as const,
      })),
    );
  }
  const favorites = getStoredEntries(preferences.favorites);
  const favoriteIds = new Set(favorites.map(({ id }) => id));
  const recent = getStoredEntries(preferences.recent).filter(({ id }) => !favoriteIds.has(id));
  const promotedIds = new Set([...favoriteIds, ...recent.map(({ id }) => id)]);
  const controls = queryControlLibraryEntries().filter(({ id }) => !promotedIds.has(id));
  return Object.freeze([
    ...favorites.map((entry) => ({ entry, section: 'Favorites' as const })),
    ...recent.map((entry) => ({ entry, section: 'Recent' as const })),
    ...controls.map((entry) => ({ entry, section: 'Controls' as const })),
  ]);
};
