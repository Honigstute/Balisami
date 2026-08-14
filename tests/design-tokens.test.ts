// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DESIGN_TOKENS } from '../src/shared/design-tokens';

describe('visual token contract', () => {
  it('keeps spacing on the four-pixel foundation grid', () => {
    expect(Object.values(DESIGN_TOKENS.space).every((value) => value % 4 === 0)).toBe(true);
    expect(DESIGN_TOKENS.shell.collapsedPaneWidth % 4).toBe(0);
  });

  it('defines valid pane defaults and ordered global overlay tiers', () => {
    expect(DESIGN_TOKENS.shell.navigatorWidth).toBeGreaterThanOrEqual(
      DESIGN_TOKENS.shell.navigatorMinWidth,
    );
    expect(DESIGN_TOKENS.shell.navigatorWidth).toBeLessThanOrEqual(
      DESIGN_TOKENS.shell.navigatorMaxWidth,
    );
    expect(DESIGN_TOKENS.shell.inspectorWidth).toBeGreaterThanOrEqual(
      DESIGN_TOKENS.shell.inspectorMinWidth,
    );
    expect(DESIGN_TOKENS.shell.inspectorWidth).toBeLessThanOrEqual(
      DESIGN_TOKENS.shell.inspectorMaxWidth,
    );

    const globalLayers = [
      DESIGN_TOKENS.layer.canvasOverlay,
      DESIGN_TOKENS.layer.overlay,
      DESIGN_TOKENS.layer.popover,
      DESIGN_TOKENS.layer.toast,
      DESIGN_TOKENS.layer.modal,
    ];
    expect(
      globalLayers.every((value, index) => index === 0 || value > globalLayers[index - 1]!),
    ).toBe(true);
  });

  it('owns the two allowed font families and visual literals centrally', async () => {
    expect(new Set([DESIGN_TOKENS.font.ui, DESIGN_TOKENS.font.wireframe]).size).toBe(2);

    const stylesheet = await readFile(
      path.join(process.cwd(), 'src/renderer/design/styles.css'),
      'utf8',
    );
    expect(stylesheet).not.toMatch(/#(?:[0-9a-f]{3}){1,2}\b/iu);
    expect(stylesheet).not.toMatch(/\brgba?\(/u);
    expect(stylesheet).not.toMatch(/\bcolor-mix\(/u);
    expect(stylesheet).not.toMatch(/font-weight:\s*\d/u);
    expect(stylesheet).not.toMatch(/z-index:\s*\d/u);
  });
});
