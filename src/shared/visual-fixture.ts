import visualFixtureContract from '../../visual-fixture-contract.json';

export const VISUAL_FIXTURE_NAMES = Object.freeze([
  'default',
  'scene',
  'selection',
  'move',
  'smartGuides',
  'equalGaps',
  'resize',
  'groupSelection',
  'alignSelection',
  'delete',
  'duplicate',
  'paste',
  'textEdit',
  'nudge',
  'marquee',
  'viewportZoom',
  'viewportSelectionZoom',
  'mvpAlpha',
  'iconPicker',
  'components',
  'presentation',
  'registryControl',
  'searchBox',
  'textArea',
  'textHeadings',
  'circleButton',
  'comment',
  'catalogTooltip',
  'controls',
  'feedback',
  'tooltip',
  'popover',
  'modal',
] as const);

export type VisualFixtureName = (typeof VISUAL_FIXTURE_NAMES)[number];

export type VisualFixtureInvocation =
  | { readonly kind: 'none' }
  | { readonly fixture: VisualFixtureName; readonly kind: 'fixture' }
  | { readonly kind: 'invalid'; readonly message: string };

const VISUAL_FIXTURE_NAME_SET = new Set<string>(VISUAL_FIXTURE_NAMES);

export const isVisualFixtureName = (value: unknown): value is VisualFixtureName =>
  typeof value === 'string' && VISUAL_FIXTURE_NAME_SET.has(value);

export const getRequestedVisualFixture = (search: string): VisualFixtureName | undefined => {
  const value = new URLSearchParams(search).get(visualFixtureContract.queryKey);
  return isVisualFixtureName(value) ? value : undefined;
};

export const parseVisualFixtureInvocation = (
  arguments_: readonly string[],
  argumentPrefix: string,
): VisualFixtureInvocation => {
  const matchingArguments = arguments_.filter((argument) => argument.startsWith(argumentPrefix));
  if (matchingArguments.length === 0) {
    return { kind: 'none' };
  }
  const argument = matchingArguments[0];
  if (matchingArguments.length !== 1 || argument === undefined) {
    return { kind: 'invalid', message: 'Only one visual fixture may be requested.' };
  }
  const fixture = argument.slice(argumentPrefix.length);
  return isVisualFixtureName(fixture)
    ? { fixture, kind: 'fixture' }
    : { kind: 'invalid', message: 'The requested visual fixture is unsupported.' };
};

/** Keeps the external JSON harness and the executable renderer registry identical. */
export const isVisualFixtureContractSynchronized = (): boolean =>
  visualFixtureContract.fixtures.length === VISUAL_FIXTURE_NAMES.length &&
  visualFixtureContract.fixtures.every((fixture, index) => fixture === VISUAL_FIXTURE_NAMES[index]);
