import {
  listControlPaletteEntries,
  listPaletteControlSpecs,
  type ControlCategory,
  type ControlDefinition,
  type ControlPaletteEntry,
} from '../../domain';

export type ControlLibraryCategory = 'All' | 'Components' | ControlCategory;

export interface ControlLibraryQuery {
  readonly category?: ControlLibraryCategory;
  readonly query?: string;
}

interface RankedDefinition {
  readonly definition: ControlDefinition;
  readonly score: number;
}

interface RankedEntry {
  readonly entry: ControlPaletteEntry;
  readonly score: number;
}

const compareCodePoints = (first: string, second: string): number =>
  first < second ? -1 : first > second ? 1 : 0;

export const normalizeControlLibrarySearchText = (value: string): string =>
  value
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();

const scoreToken = (token: string, value: string, sourceWeight: number): number | undefined => {
  if (value === token) {
    return sourceWeight;
  }
  if (value.startsWith(token)) {
    return sourceWeight + 20;
  }
  const wordIndex = value.split(' ').findIndex((word) => word.startsWith(token));
  if (wordIndex >= 0) {
    return sourceWeight + 40 + wordIndex;
  }
  const substringIndex = value.indexOf(token);
  return substringIndex < 0 ? undefined : sourceWeight + 100 + substringIndex;
};

const rankDefinition = (
  definition: ControlDefinition,
  normalizedQuery: string,
): number | undefined => {
  const palette = definition.palette;
  if (palette === null) {
    return undefined;
  }
  if (normalizedQuery.length === 0) {
    return 0;
  }
  const tokens = normalizedQuery.split(' ');
  const sources = [
    { value: normalizeControlLibrarySearchText(palette.label), weight: 0 },
    ...definition.search.aliases.map((value) => ({
      value: normalizeControlLibrarySearchText(value),
      weight: 5,
    })),
    ...definition.search.tags.map((value) => ({
      value: normalizeControlLibrarySearchText(value),
      weight: 10,
    })),
  ];
  let score = 0;
  for (const token of tokens) {
    const tokenScores = sources.flatMap((source) => {
      const tokenScore = scoreToken(token, source.value, source.weight);
      return tokenScore === undefined ? [] : [tokenScore];
    });
    if (tokenScores.length === 0) {
      return undefined;
    }
    score += Math.min(...tokenScores);
  }
  return score;
};

const rankEntry = (entry: ControlPaletteEntry, normalizedQuery: string): number | undefined => {
  if (normalizedQuery.length === 0) return 0;
  const tokens = normalizedQuery.split(' ');
  const sources = [
    { value: normalizeControlLibrarySearchText(entry.label), weight: 0 },
    ...entry.definition.search.aliases.map((value) => ({
      value: normalizeControlLibrarySearchText(value),
      weight: 5,
    })),
    ...entry.definition.search.tags.map((value) => ({
      value: normalizeControlLibrarySearchText(value),
      weight: 10,
    })),
  ];
  let score = 0;
  for (const token of tokens) {
    const tokenScores = sources.flatMap((source) => {
      const tokenScore = scoreToken(token, source.value, source.weight);
      return tokenScore === undefined ? [] : [tokenScore];
    });
    if (tokenScores.length === 0) return undefined;
    score += Math.min(...tokenScores);
  }
  return score;
};

/**
 * Registry-backed category inventory. New registered categories appear without
 * a parallel shell list; code-point ordering is deterministic across locales.
 */
export const listControlLibraryCategories = (): readonly ControlLibraryCategory[] => {
  const categories = new Set<ControlCategory>();
  for (const definition of listPaletteControlSpecs()) {
    if (definition.palette !== null) {
      categories.add(definition.palette.category);
    }
  }
  return Object.freeze([
    'All',
    ...[...categories, 'Components' as const].sort((first, second) =>
      compareCodePoints(first, second),
    ),
  ]);
};

/** Shared deterministic search path for the shelf and Quick Add. */
export const queryControlLibrary = (
  input: ControlLibraryQuery = {},
): readonly ControlDefinition[] => {
  const category = input.category ?? 'All';
  const normalizedQuery = normalizeControlLibrarySearchText(input.query ?? '');
  const ranked: RankedDefinition[] = [];
  for (const definition of listPaletteControlSpecs()) {
    if (
      definition.palette === null ||
      (category !== 'All' && definition.palette.category !== category)
    ) {
      continue;
    }
    const score = rankDefinition(definition, normalizedQuery);
    if (score !== undefined) {
      ranked.push({ definition, score });
    }
  }
  ranked.sort(
    (first, second) =>
      first.score - second.score ||
      (first.definition.palette?.order ?? 0) - (second.definition.palette?.order ?? 0) ||
      compareCodePoints(first.definition.type, second.definition.type),
  );
  return Object.freeze(ranked.map(({ definition }) => definition));
};

/** Palette-entry query includes shared-schema presets without duplicating definitions. */
export const queryControlLibraryEntries = (
  input: ControlLibraryQuery = {},
): readonly ControlPaletteEntry[] => {
  const category = input.category ?? 'All';
  const normalizedQuery = normalizeControlLibrarySearchText(input.query ?? '');
  const ranked: RankedEntry[] = [];
  for (const entry of listControlPaletteEntries()) {
    const palette = entry.definition.palette;
    if (palette === null || (category !== 'All' && palette.category !== category)) continue;
    const score = rankEntry(entry, normalizedQuery);
    if (score !== undefined) ranked.push({ entry, score });
  }
  ranked.sort(
    (first, second) =>
      first.score - second.score ||
      first.entry.order - second.entry.order ||
      compareCodePoints(first.entry.id, second.entry.id),
  );
  return Object.freeze(ranked.map(({ entry }) => entry));
};
