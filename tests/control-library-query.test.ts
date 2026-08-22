// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { CONTROL_TYPES } from '../src/domain';
import {
  listControlLibraryCategories,
  queryControlLibrary,
} from '../src/renderer/controls/control-library-query';

describe('control library query', () => {
  it('derives a deterministic category inventory from palette definitions', () => {
    expect(listControlLibraryCategories()).toEqual([
      'All',
      'Assets',
      'Buttons',
      'Common',
      'Components',
      'Containers',
      'Forms',
      'Text',
    ]);
  });

  it('filters categories without changing canonical palette order', () => {
    expect(queryControlLibrary({ category: 'Forms' }).map(({ type }) => type)).toEqual([
      CONTROL_TYPES.textInput,
      CONTROL_TYPES.checkbox,
    ]);
    expect(queryControlLibrary({ category: 'All' }).map(({ type }) => type)).toEqual([
      CONTROL_TYPES.rectangle,
      CONTROL_TYPES.textLabel,
      CONTROL_TYPES.button,
      CONTROL_TYPES.textInput,
      CONTROL_TYPES.checkbox,
      CONTROL_TYPES.imagePlaceholder,
      CONTROL_TYPES.browser,
      CONTROL_TYPES.arrow,
    ]);
  });

  it('ranks labels, aliases, and tags through one normalized search path', () => {
    expect(queryControlLibrary({ query: 'button' })[0]?.type).toBe(CONTROL_TYPES.button);
    expect(queryControlLibrary({ query: 'cta' })[0]?.type).toBe(CONTROL_TYPES.button);
    expect(queryControlLibrary({ query: 'photo' })[0]?.type).toBe(CONTROL_TYPES.imagePlaceholder);
    expect(queryControlLibrary({ query: 'website' })[0]?.type).toBe(CONTROL_TYPES.browser);
    expect(queryControlLibrary({ query: '  BROWSER-window ' })[0]?.type).toBe(
      CONTROL_TYPES.browser,
    );
    expect(queryControlLibrary({ category: 'Forms', query: 'line' })).toEqual([]);
    expect(queryControlLibrary({ query: 'does not exist' })).toEqual([]);
  });
});
