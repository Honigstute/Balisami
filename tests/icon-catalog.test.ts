import { describe, expect, it } from 'vitest';

import {
  getIconDefinition,
  ICON_CATALOG_COUNTS,
  listIconDefinitions,
  searchIconDefinitions,
} from '../src/shared/icons/icon-catalog';

describe('curated outline icon catalog', () => {
  it('publishes the pinned, deduplicated inventory', () => {
    const icons = listIconDefinitions();

    expect(ICON_CATALOG_COUNTS).toEqual({
      officialAliases: 258,
      semanticDuplicatesRemoved: 135,
      sourceIcons: 1767,
      survivingIcons: 1632,
    });
    expect(icons).toHaveLength(1632);
    expect(new Set(icons.map((icon) => icon.id)).size).toBe(icons.length);
    expect(new Set(icons.map((icon) => JSON.stringify(icon.nodes))).size).toBe(icons.length);
    const aliases = icons.flatMap((icon) => icon.aliases);
    expect(aliases).toHaveLength(393);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it('resolves removed duplicate names to one canonical icon', () => {
    expect(getIconDefinition('trash-2')?.id).toBe('trash');
    expect(getIconDefinition('circle-check')?.id).toBe('check');
    expect(getIconDefinition('clock-4')?.id).toBe('clock');
    expect(getIconDefinition('home')?.id).toBe('house');
  });

  it('returns a canonical icon only once when aliases match', () => {
    const results = searchIconDefinitions('trash', 20);

    expect(results.filter((icon) => icon.id === 'trash')).toHaveLength(1);
    expect(new Set(results.map((icon) => icon.id)).size).toBe(results.length);
    expect(searchIconDefinitions('circle check', 20)[0]?.id).toBe('check');
  });

  it('validates search limits', () => {
    expect(() => searchIconDefinitions('search', 0)).toThrow(RangeError);
    expect(() => searchIconDefinitions('search', 1.5)).toThrow(RangeError);
  });
});
