// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { DESIGN_TOKENS } from '../src/shared/design-tokens';
import {
  SHELL_REGIONS,
  getBoundedNormalWindowSize,
  getExpectedShellRegionRects,
} from '../src/shared/shell-layout';

describe('fixed shell geometry contract', () => {
  it('bounds the normal review window to the available native work area', () => {
    expect(getBoundedNormalWindowSize({ width: 2560, height: 1440 })).toEqual({
      width: 1440,
      height: 900,
    });
    expect(getBoundedNormalWindowSize({ width: 1440, height: 680 })).toEqual({
      width: 1440,
      height: 680,
    });
    expect(getBoundedNormalWindowSize({ width: 800, height: 500 })).toEqual({
      width: 1024,
      height: 680,
    });
    expect(() => getBoundedNormalWindowSize({ width: Number.NaN, height: 900 })).toThrow(
      RangeError,
    );
  });

  it('derives every minimum-viewport region from shared tokens', () => {
    const rectangles = getExpectedShellRegionRects(
      DESIGN_TOKENS.shell.minWindowWidth,
      DESIGN_TOKENS.shell.minWindowHeight,
    );

    expect(rectangles[SHELL_REGIONS.root]).toEqual({
      x: 0,
      y: 0,
      width: 1024,
      height: 680,
    });
    expect(rectangles[SHELL_REGIONS.canvas]).toEqual({
      x: 224,
      y: 180,
      width: 480,
      height: 500,
    });
    expect(rectangles[SHELL_REGIONS.inspector]).toEqual({
      x: 704,
      y: 180,
      width: 320,
      height: 500,
    });
  });

  it('keeps only the center viewport flexible at the normal desktop size', () => {
    const minimum = getExpectedShellRegionRects(
      DESIGN_TOKENS.shell.minWindowWidth,
      DESIGN_TOKENS.shell.minWindowHeight,
    );
    const normal = getExpectedShellRegionRects(
      DESIGN_TOKENS.shell.initialWindowWidth,
      DESIGN_TOKENS.shell.initialWindowHeight,
    );

    expect(normal[SHELL_REGIONS.navigator].width).toBe(minimum[SHELL_REGIONS.navigator].width);
    expect(normal[SHELL_REGIONS.inspector].width).toBe(minimum[SHELL_REGIONS.inspector].width);
    expect(normal[SHELL_REGIONS.canvas].width - minimum[SHELL_REGIONS.canvas].width).toBe(
      DESIGN_TOKENS.shell.initialWindowWidth - DESIGN_TOKENS.shell.minWindowWidth,
    );
  });

  it('supports platform-native title chrome without introducing a renderer offset', () => {
    const rectangles = getExpectedShellRegionRects(1024, 648);

    expect(rectangles[SHELL_REGIONS.root].height).toBe(648);
    expect(rectangles[SHELL_REGIONS.canvas]).toEqual({
      x: 224,
      y: 180,
      width: 480,
      height: 468,
    });
  });

  it('rejects invalid and unsupported viewport dimensions', () => {
    expect(() => getExpectedShellRegionRects(959, 680)).toThrow(RangeError);
    expect(() => getExpectedShellRegionRects(1024, 599)).toThrow(RangeError);
    expect(() => getExpectedShellRegionRects(Number.NaN, 680)).toThrow(RangeError);
    expect(() =>
      getExpectedShellRegionRects(1024, 680, {
        inspectorWidth: 287,
        navigatorWidth: DESIGN_TOKENS.shell.navigatorWidth,
      }),
    ).toThrow(RangeError);
  });

  it('derives explicit collapsed-pane geometry without remounting a region', () => {
    const rectangles = getExpectedShellRegionRects(1024, 680, {
      inspectorWidth: DESIGN_TOKENS.shell.collapsedPaneWidth,
      navigatorWidth: DESIGN_TOKENS.shell.collapsedPaneWidth,
    });

    expect(rectangles[SHELL_REGIONS.navigator].width).toBe(32);
    expect(rectangles[SHELL_REGIONS.canvas]).toEqual({
      x: 32,
      y: 180,
      width: 960,
      height: 500,
    });
    expect(rectangles[SHELL_REGIONS.inspector]).toEqual({
      x: 992,
      y: 180,
      width: 32,
      height: 500,
    });
  });
});
