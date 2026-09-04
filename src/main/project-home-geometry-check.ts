import { screen, type BrowserWindow } from 'electron';

import { DESIGN_TOKENS } from '../shared/design-tokens';
import {
  PROJECT_HOME_ACTION_ATTRIBUTE,
  PROJECT_HOME_ACTIONS,
  PROJECT_HOME_REGION_ATTRIBUTE,
  PROJECT_HOME_REGIONS,
} from '../shared/project-home';
import { getBoundedNormalWindowSize } from '../shared/shell-layout';

const MAX_GEOMETRY_ERROR_CSS_PX = 0.5;
const MAX_NATIVE_WINDOW_ERROR_DIP = 2;
const MAX_LAYOUT_SETTLE_ATTEMPTS = 60;

interface HomeRect {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

interface MeasuredHomeGeometry {
  readonly actionsReady: boolean;
  readonly main: HomeRect;
  readonly recent: HomeRect;
  readonly root: HomeRect;
  readonly start: HomeRect;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const parseRect = (value: unknown): HomeRect | undefined => {
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

const parseMeasurement = (value: unknown): MeasuredHomeGeometry | undefined => {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 7 ||
    typeof value.actionsReady !== 'boolean' ||
    !isFiniteNumber(value.viewportWidth) ||
    !isFiniteNumber(value.viewportHeight)
  ) {
    return undefined;
  }
  const root = parseRect(value.root);
  const main = parseRect(value.main);
  const start = parseRect(value.start);
  const recent = parseRect(value.recent);
  return root === undefined || main === undefined || start === undefined || recent === undefined
    ? undefined
    : Object.freeze({
        actionsReady: value.actionsReady,
        main,
        recent,
        root,
        start,
        viewportHeight: value.viewportHeight,
        viewportWidth: value.viewportWidth,
      });
};

const createMeasurementScript = (): string => {
  const regionAttribute = JSON.stringify(PROJECT_HOME_REGION_ATTRIBUTE);
  const regions = JSON.stringify(PROJECT_HOME_REGIONS);
  const actionAttribute = JSON.stringify(PROJECT_HOME_ACTION_ATTRIBUTE);
  const actions = JSON.stringify(PROJECT_HOME_ACTIONS);
  return `(() => {
    const regionAttribute = ${regionAttribute};
    const regions = ${regions};
    const actionAttribute = ${actionAttribute};
    const actions = ${actions};
    const measure = (region) => {
      const matches = document.querySelectorAll('[' + regionAttribute + '="' + region + '"]');
      if (matches.length !== 1) return undefined;
      const rect = matches[0].getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const newAction = document.querySelector('[' + actionAttribute + '="' + actions.newProject + '"]');
    const openAction = document.querySelector('[' + actionAttribute + '="' + actions.openProject + '"]');
    return {
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      actionsReady: newAction instanceof HTMLButtonElement && openAction instanceof HTMLButtonElement && !newAction.disabled && !openAction.disabled,
      root: measure(regions.root),
      main: measure(regions.main),
      start: measure(regions.start),
      recent: measure(regions.recent),
    };
  })()`;
};

const waitForLayout = (window: BrowserWindow): Promise<unknown> =>
  window.webContents.executeJavaScript(
    'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    true,
  );

const assertInside = (name: string, child: HomeRect, parent: HomeRect): void => {
  if (
    child.width <= 0 ||
    child.height <= 0 ||
    child.x < parent.x - MAX_GEOMETRY_ERROR_CSS_PX ||
    child.y < parent.y - MAX_GEOMETRY_ERROR_CSS_PX ||
    child.x + child.width > parent.x + parent.width + MAX_GEOMETRY_ERROR_CSS_PX ||
    child.y + child.height > parent.y + parent.height + MAX_GEOMETRY_ERROR_CSS_PX
  ) {
    throw new Error(
      `Packaged project home ${name} is clipped or outside its parent (${JSON.stringify({ child, parent })}).`,
    );
  }
};

const measureAndAssert = async (
  window: BrowserWindow,
  expectedWindowWidth: number,
  expectedWindowHeight: number,
): Promise<void> => {
  window.setSize(expectedWindowWidth, expectedWindowHeight, false);
  let measured: MeasuredHomeGeometry | undefined;
  for (let attempt = 0; attempt < MAX_LAYOUT_SETTLE_ATTEMPTS; attempt += 1) {
    await waitForLayout(window);
    measured = parseMeasurement(
      await window.webContents.executeJavaScript(createMeasurementScript(), true),
    );
    if (measured?.actionsReady === true) {
      break;
    }
  }
  if (measured === undefined || !measured.actionsReady) {
    throw new Error('Packaged project home did not become ready with usable actions.');
  }
  const [windowWidth = Number.NaN, windowHeight = Number.NaN] = window.getSize();
  if (
    Math.abs(windowWidth - expectedWindowWidth) > MAX_NATIVE_WINDOW_ERROR_DIP ||
    Math.abs(windowHeight - expectedWindowHeight) > MAX_NATIVE_WINDOW_ERROR_DIP
  ) {
    throw new Error('Packaged project home did not settle at the requested native window size.');
  }
  const expectedRoot: HomeRect = {
    height: measured.viewportHeight,
    width: measured.viewportWidth,
    x: 0,
    y: 0,
  };
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (Math.abs(measured.root[key] - expectedRoot[key]) > MAX_GEOMETRY_ERROR_CSS_PX) {
      throw new Error(`Packaged project home root ${key} does not fill the renderer viewport.`);
    }
  }
  assertInside('main content', measured.main, measured.root);
  assertInside('start actions', measured.start, measured.main);
  assertInside('recent projects', measured.recent, measured.main);
  if (measured.start.x + measured.start.width > measured.recent.x) {
    throw new Error('Packaged project home start and recent-project regions overlap.');
  }
};

/** Verifies the ordinary startup home at minimum and normal native window sizes. */
export const verifyPackagedProjectHomeGeometry = async (window: BrowserWindow): Promise<void> => {
  await measureAndAssert(
    window,
    DESIGN_TOKENS.shell.minWindowWidth,
    DESIGN_TOKENS.shell.minWindowHeight,
  );
  const normalSize = getBoundedNormalWindowSize(
    screen.getDisplayMatching(window.getBounds()).workAreaSize,
  );
  await measureAndAssert(window, normalSize.width, normalSize.height);
};
