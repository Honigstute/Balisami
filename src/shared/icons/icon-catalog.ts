import generatedCatalog from './icon-catalog.generated.json';

export type IconNodeAttribute = number | string;
export type IconNode = readonly [
  tag: string,
  attributes: Readonly<Record<string, IconNodeAttribute>>,
];

export interface IconDefinition {
  readonly aliases: readonly string[];
  readonly id: string;
  readonly keywords: readonly string[];
  readonly label: string;
  readonly nodes: readonly IconNode[];
}

export interface IconCatalogCounts {
  readonly officialAliases: number;
  readonly semanticDuplicatesRemoved: number;
  readonly sourceIcons: number;
  readonly survivingIcons: number;
}

const icons = Object.freeze(generatedCatalog.icons) as unknown as readonly IconDefinition[];
const iconById = new Map(icons.map((icon) => [icon.id, icon]));
const iconByAlias = new Map<string, IconDefinition>();

for (const icon of icons) {
  for (const alias of icon.aliases) {
    if (iconByAlias.has(alias) || iconById.has(alias)) {
      throw new Error(`Generated icon catalog contains duplicate alias: ${alias}.`);
    }
    iconByAlias.set(alias, icon);
  }
}

export const ICON_CATALOG_COUNTS: IconCatalogCounts = Object.freeze(generatedCatalog.counts);

export const listIconDefinitions = (): readonly IconDefinition[] => icons;

export const getIconDefinition = (idOrAlias: string): IconDefinition | undefined =>
  iconById.get(idOrAlias) ?? iconByAlias.get(idOrAlias);

const normalizeSearchText = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_]+/g, '-');

const getSearchScore = (icon: IconDefinition, query: string): number | null => {
  const id = normalizeSearchText(icon.id);
  const label = normalizeSearchText(icon.label);
  const aliases = icon.aliases.map(normalizeSearchText);
  const keywords = icon.keywords.map(normalizeSearchText);

  if (id === query || label === query) return 0;
  if (aliases.includes(query)) return 1;
  if (id.startsWith(query) || label.startsWith(query)) return 2;
  if (aliases.some((alias) => alias.startsWith(query))) return 3;
  if (keywords.some((keyword) => keyword.startsWith(query))) return 4;
  if ([id, label, ...aliases, ...keywords].some((value) => value.includes(query))) return 5;
  return null;
};

export const searchIconDefinitions = (query: string, limit = 100): readonly IconDefinition[] => {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError('Icon search limit must be a positive safe integer.');
  }

  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) {
    return icons.slice(0, limit);
  }

  return icons
    .map((icon) => ({ icon, score: getSearchScore(icon, normalizedQuery) }))
    .filter(
      (result): result is { readonly icon: IconDefinition; readonly score: number } =>
        result.score !== null,
    )
    .sort(
      (first, second) =>
        first.score - second.score || first.icon.label.localeCompare(second.icon.label),
    )
    .slice(0, limit)
    .map((result) => result.icon);
};
