// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { DESIGN_TOKENS } from '../src/shared/design-tokens';
import { SHELL_REGIONS, getExpectedShellRegionRects } from '../src/shared/shell-layout';

describe('fixed shell geometry contract', () => {
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

  it('rejects invalid and unsupported viewport dimensions', () => {
    expect(() => getExpectedShellRegionRects(1023, 680)).toThrow(RangeError);
    expect(() => getExpectedShellRegionRects(1024, 679)).toThrow(RangeError);
    expect(() => getExpectedShellRegionRects(Number.NaN, 680)).toThrow(RangeError);
  });
});
