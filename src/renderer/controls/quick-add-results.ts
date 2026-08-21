import { getControlSpec, type ControlDefinition, type ControlTypeId } from '../../domain';
import { queryControlLibrary } from './control-library-query';
import type { QuickAddPreferences } from './quick-add-preferences';

export interface QuickAddResult {
  readonly definition: ControlDefinition;
  readonly section: 'Controls' | 'Favorites' | 'Recent';
}

const getStoredDefinitions = (types: readonly ControlTypeId[]): readonly ControlDefinition[] =>
  types.flatMap((type) => {
    const definition = getControlSpec(type);
    return definition?.palette === null || definition === undefined ? [] : [definition];
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
      queryControlLibrary({ query }).map((definition) => ({
        definition,
        section: 'Controls' as const,
      })),
    );
  }
  const favorites = getStoredDefinitions(preferences.favorites);
  const favoriteTypes = new Set(favorites.map(({ type }) => type));
  const recent = getStoredDefinitions(preferences.recent).filter(
    ({ type }) => !favoriteTypes.has(type),
  );
  const promotedTypes = new Set([...favoriteTypes, ...recent.map(({ type }) => type)]);
  const controls = queryControlLibrary().filter(({ type }) => !promotedTypes.has(type));
  return Object.freeze([
    ...favorites.map((definition) => ({ definition, section: 'Favorites' as const })),
    ...recent.map((definition) => ({ definition, section: 'Recent' as const })),
    ...controls.map((definition) => ({ definition, section: 'Controls' as const })),
  ]);
};
