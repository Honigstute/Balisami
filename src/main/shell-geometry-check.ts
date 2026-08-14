import type { BrowserWindow } from 'electron';

import { DESIGN_TOKENS } from '../shared/design-tokens';
import {
  SHELL_LAYOUT_ATTRIBUTES,
  SHELL_REGION_ATTRIBUTE,
  SHELL_REGIONS,
  getExpectedShellRegionRects,
  type ShellPaneWidths,
  type ShellRegion,
  type ShellRegionRect,
} from '../shared/shell-layout';

const MAX_GEOMETRY_ERROR_CSS_PX = 0.5;
const MAX_LAYOUT_SETTLE_ATTEMPTS = 60;
const SHELL_REGION_NAMES = Object.freeze(Object.values(SHELL_REGIONS));

interface MeasuredShellGeometry {
  readonly paneWidths: ShellPaneWidths;
  readonly regions: Readonly<Record<ShellRegion, ShellRegionRect>>;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const parseMeasuredRect = (value: unknown): ShellRegionRect | undefined => {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height)
  ) {
    return undefined;
  }
  return Object.freeze({ x: value.x, y: value.y, width: value.width, height: value.height });
};

const parseMeasuredGeometry = (value: unknown): MeasuredShellGeometry | undefined => {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    !isFiniteNumber(value.viewportWidth) ||
    !isFiniteNumber(value.viewportHeight) ||
    !isRecord(value.paneWidths) ||
    Object.keys(value.paneWidths).length !== 2 ||
    !isFiniteNumber(value.paneWidths.navigatorWidth) ||
    !isFiniteNumber(value.paneWidths.inspectorWidth) ||
    !isRecord(value.regions)
  ) {
    return undefined;
  }
  const regions = {} as Record<ShellRegion, ShellRegionRect>;
  for (const region of SHELL_REGION_NAMES) {
    const rect = parseMeasuredRect(value.regions[region]);
    if (rect === undefined) {
      return undefined;
    }
    regions[region] = rect;
  }
  if (Object.keys(value.regions).length !== SHELL_REGION_NAMES.length) {
    return undefined;
  }
  return Object.freeze({
    paneWidths: Object.freeze({
      inspectorWidth: value.paneWidths.inspectorWidth,
      navigatorWidth: value.paneWidths.navigatorWidth,
    }),
    regions: Object.freeze(regions),
    viewportHeight: value.viewportHeight,
    viewportWidth: value.viewportWidth,
  });
};

const createMeasurementScript = (): string => {
  const attribute = JSON.stringify(SHELL_REGION_ATTRIBUTE);
  const layoutAttributes = JSON.stringify(SHELL_LAYOUT_ATTRIBUTES);
  const regions = JSON.stringify(SHELL_REGION_NAMES);
  return `(() => {
    const attribute = ${attribute};
    const layoutAttributes = ${layoutAttributes};
    const regionNames = ${regions};
    const measured = {};
    const elements = {};
    for (const region of regionNames) {
      const matches = document.querySelectorAll('[' + attribute + '="' + region + '"]');
      if (matches.length !== 1) throw new Error('Shell region marker is missing or duplicated.');
      const rect = matches[0].getBoundingClientRect();
      measured[region] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      elements[region] = matches[0];
    }
    const root = elements.root;
    const paneWidths = {
      inspectorWidth: Number(root.getAttribute(layoutAttributes.inspectorWidth)),
      navigatorWidth: Number(root.getAttribute(layoutAttributes.navigatorWidth)),
    };
    return { viewportWidth: document.documentElement.clientWidth, viewportHeight: document.documentElement.clientHeight, paneWidths, regions: measured };
  })()`;
};

const waitForLayout = (window: BrowserWindow): Promise<unknown> =>
  window.webContents.executeJavaScript(
    'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    true,
  );

const assertRect = (
  region: ShellRegion,
  actual: ShellRegionRect,
  expected: ShellRegionRect,
): void => {
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const error = Math.abs(actual[key] - expected[key]);
    if (error > MAX_GEOMETRY_ERROR_CSS_PX) {
      throw new Error(
        `Shell ${region} ${key} moved by ${String(error)} CSS px (expected ${String(expected[key])}, received ${String(actual[key])}).`,
      );
    }
  }
};

const measureAndAssert = async (
  window: BrowserWindow,
  expectedWidth: number,
  expectedHeight: number,
): Promise<void> => {
  window.setContentSize(expectedWidth, expectedHeight, false);
  let measured: MeasuredShellGeometry | undefined;
  for (let attempt = 0; attempt < MAX_LAYOUT_SETTLE_ATTEMPTS; attempt += 1) {
    await waitForLayout(window);
    measured = parseMeasuredGeometry(
      await window.webContents.executeJavaScript(createMeasurementScript(), true),
    );
    if (measured?.viewportWidth === expectedWidth && measured.viewportHeight === expectedHeight) {
      break;
    }
  }
  if (measured === undefined) {
    throw new Error('Packaged shell returned malformed viewport geometry.');
  }
  if (measured.viewportWidth !== expectedWidth || measured.viewportHeight !== expectedHeight) {
    throw new Error(
      `Packaged shell did not settle at ${String(expectedWidth)}x${String(expectedHeight)} CSS px (received ${String(measured.viewportWidth)}x${String(measured.viewportHeight)}).`,
    );
  }
  const expected = getExpectedShellRegionRects(expectedWidth, expectedHeight, measured.paneWidths);
  for (const region of SHELL_REGION_NAMES) {
    assertRect(region, measured.regions[region], expected[region]);
  }
};

/** Verifies fixed shell anchors at the minimum and normal desktop content sizes. */
export const verifyPackagedShellGeometry = async (window: BrowserWindow): Promise<void> => {
  await measureAndAssert(
    window,
    DESIGN_TOKENS.shell.minWindowWidth,
    DESIGN_TOKENS.shell.minWindowHeight,
  );
  await measureAndAssert(
    window,
    DESIGN_TOKENS.shell.initialWindowWidth,
    DESIGN_TOKENS.shell.initialWindowHeight,
  );
};
