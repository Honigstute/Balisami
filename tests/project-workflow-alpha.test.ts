// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { DESIGN_TOKENS } from '../src/shared/design-tokens';
import { PROJECT_WORKFLOW_ALPHA_LAYOUT } from '../src/shared/project-workflow-alpha';
import { getExpectedShellRegionRects, SHELL_REGIONS } from '../src/shared/shell-layout';

describe('packaged alpha composition', () => {
  it('keeps every representative frame inside the minimum fixed-shell canvas', () => {
    const canvas = getExpectedShellRegionRects(
      DESIGN_TOKENS.shell.minViewportWidth,
      DESIGN_TOKENS.shell.minViewportHeight,
    )[SHELL_REGIONS.canvas];

    for (const frame of Object.values(PROJECT_WORKFLOW_ALPHA_LAYOUT)) {
      expect(frame.x).toBeGreaterThanOrEqual(0);
      expect(frame.y).toBeGreaterThanOrEqual(0);
      expect(frame.x + frame.width).toBeLessThanOrEqual(canvas.width - DESIGN_TOKENS.space[6]);
      expect(frame.y + frame.height).toBeLessThanOrEqual(canvas.height - DESIGN_TOKENS.space[6]);
    }
  });
});
