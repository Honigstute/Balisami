// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { CONTROL_TYPES } from '../src/domain';
import {
  listControlLibraryCategories,
  queryControlLibrary,
  queryControlLibraryEntries,
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
      'Layout',
      'Markup',
      'Media',
      'Text',
      'iOS',
    ]);
  });

  it('filters categories without changing canonical palette order', () => {
    expect(queryControlLibrary({ category: 'Forms' }).map(({ type }) => type)).toEqual([
      CONTROL_TYPES.textInput,
      CONTROL_TYPES.checkbox,
      CONTROL_TYPES.colorPicker,
      CONTROL_TYPES.onOffSwitch,
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
      CONTROL_TYPES.calendar,
      CONTROL_TYPES.chartBar,
      CONTROL_TYPES.chartLine,
      CONTROL_TYPES.chartPie,
      CONTROL_TYPES.playback,
      CONTROL_TYPES.videoPlayer,
      CONTROL_TYPES.volumeSlider,
      CONTROL_TYPES.webcam,
      CONTROL_TYPES.iosPicker,
      CONTROL_TYPES.hSplitter,
      CONTROL_TYPES.vSplitter,
      CONTROL_TYPES.redX,
      CONTROL_TYPES.squigglyBlock,
      CONTROL_TYPES.streetMap,
      CONTROL_TYPES.toolbar,
      CONTROL_TYPES.hRule,
      CONTROL_TYPES.vRule,
      CONTROL_TYPES.scratchOut,
      CONTROL_TYPES.helpButton,
      CONTROL_TYPES.modalScreen,
      CONTROL_TYPES.colorPicker,
      CONTROL_TYPES.onOffSwitch,
      CONTROL_TYPES.breadcrumbs,
      CONTROL_TYPES.buttonBar,
      CONTROL_TYPES.linkBar,
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

  it('keeps shared-schema presets independently searchable and ordered', () => {
    expect(queryControlLibraryEntries({ category: 'Forms' }).map(({ id }) => id)).toEqual([
      CONTROL_TYPES.textInput,
      `${CONTROL_TYPES.textInput}:underline`,
      CONTROL_TYPES.checkbox,
      CONTROL_TYPES.colorPicker,
      CONTROL_TYPES.onOffSwitch,
    ]);
    expect(queryControlLibraryEntries({ query: 'underline' })[0]).toMatchObject({
      definition: { type: CONTROL_TYPES.textInput },
      presetId: 'underline',
    });
  });
});
