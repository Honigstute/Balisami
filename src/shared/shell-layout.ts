import { DESIGN_TOKENS } from './design-tokens';

export const SHELL_REGION_ATTRIBUTE = 'data-shell-region' as const;

export const SHELL_REGIONS = Object.freeze({
  canvas: 'canvas',
  categories: 'categories',
  command: 'command',
  inspector: 'inspector',
  navigator: 'navigator',
  root: 'root',
  shelf: 'shelf',
  status: 'status',
} as const);

export type ShellRegion = (typeof SHELL_REGIONS)[keyof typeof SHELL_REGIONS];

export interface ShellRegionRect {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export type ShellRegionRects = Readonly<Record<ShellRegion, ShellRegionRect>>;

const freezeRect = (rect: ShellRegionRect): ShellRegionRect => Object.freeze(rect);

/**
 * Expected border boxes for the fixed shell tracks. Packaged geometry checks
 * consume this same contract instead of copying CSS dimensions into tests.
 */
export const getExpectedShellRegionRects = (
  viewportWidth: number,
  viewportHeight: number,
): ShellRegionRects => {
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth < DESIGN_TOKENS.shell.minWindowWidth ||
    viewportHeight < DESIGN_TOKENS.shell.minWindowHeight
  ) {
    throw new RangeError('Shell geometry requires finite dimensions at or above the minimum size.');
  }

  const commandBottom = DESIGN_TOKENS.shell.commandBarHeight;
  const statusBottom = commandBottom + DESIGN_TOKENS.shell.statusBarHeight;
  const categoryBottom = statusBottom + DESIGN_TOKENS.shell.categoryBarHeight;
  const contentTop = categoryBottom + DESIGN_TOKENS.shell.controlShelfHeight;
  const contentHeight = viewportHeight - contentTop;
  const canvasWidth =
    viewportWidth - DESIGN_TOKENS.shell.navigatorWidth - DESIGN_TOKENS.shell.inspectorWidth;
  const inspectorX = viewportWidth - DESIGN_TOKENS.shell.inspectorWidth;

  return Object.freeze({
    [SHELL_REGIONS.root]: freezeRect({ x: 0, y: 0, width: viewportWidth, height: viewportHeight }),
    [SHELL_REGIONS.command]: freezeRect({
      x: 0,
      y: 0,
      width: viewportWidth,
      height: DESIGN_TOKENS.shell.commandBarHeight,
    }),
    [SHELL_REGIONS.status]: freezeRect({
      x: 0,
      y: commandBottom,
      width: viewportWidth,
      height: DESIGN_TOKENS.shell.statusBarHeight,
    }),
    [SHELL_REGIONS.categories]: freezeRect({
      x: 0,
      y: statusBottom,
      width: viewportWidth,
      height: DESIGN_TOKENS.shell.categoryBarHeight,
    }),
    [SHELL_REGIONS.shelf]: freezeRect({
      x: 0,
      y: categoryBottom,
      width: viewportWidth,
      height: DESIGN_TOKENS.shell.controlShelfHeight,
    }),
    [SHELL_REGIONS.navigator]: freezeRect({
      x: 0,
      y: contentTop,
      width: DESIGN_TOKENS.shell.navigatorWidth,
      height: contentHeight,
    }),
    [SHELL_REGIONS.canvas]: freezeRect({
      x: DESIGN_TOKENS.shell.navigatorWidth,
      y: contentTop,
      width: canvasWidth,
      height: contentHeight,
    }),
    [SHELL_REGIONS.inspector]: freezeRect({
      x: inspectorX,
      y: contentTop,
      width: DESIGN_TOKENS.shell.inspectorWidth,
      height: contentHeight,
    }),
  });
};
