// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { DESIGN_TOKENS } from '../src/shared/design-tokens';

type Rgb = readonly [number, number, number];

const parseHex = (value: string): Rgb => {
  const match = /^#([\dA-F]{2})([\dA-F]{2})([\dA-F]{2})$/iu.exec(value);
  if (match === null) {
    throw new Error(`Expected a six-digit hex color, received ${value}.`);
  }
  return [
    Number.parseInt(match[1]!, 16),
    Number.parseInt(match[2]!, 16),
    Number.parseInt(match[3]!, 16),
  ];
};

const relativeLuminance = (rgb: Rgb): number => {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
};

const contrastRatio = (first: string, second: string): number => {
  const firstLuminance = relativeLuminance(parseHex(first));
  const secondLuminance = relativeLuminance(parseHex(second));
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
};

const compositeWhiteAlpha = (value: string, background: string): string => {
  const match = /^rgba\(255, 255, 255, (0(?:\.\d+)?|1)\)$/u.exec(value);
  if (match === null) {
    throw new Error(`Expected a white rgba token, received ${value}.`);
  }
  const alpha = Number.parseFloat(match[1]!);
  const composite = parseHex(background).map((channel) =>
    Math.round(255 * alpha + channel * (1 - alpha)),
  );
  return `#${composite.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

describe('visual contrast contract', () => {
  it.each([
    ['primary text', DESIGN_TOKENS.color.ink, DESIGN_TOKENS.color.canvas],
    ['secondary text on canvas', DESIGN_TOKENS.color.mutedInk, DESIGN_TOKENS.color.canvas],
    ['secondary text on chrome', DESIGN_TOKENS.color.mutedInk, DESIGN_TOKENS.color.chrome],
    ['selected text', DESIGN_TOKENS.color.canvas, DESIGN_TOKENS.color.accentStrong],
    ['danger text', DESIGN_TOKENS.color.danger, DESIGN_TOKENS.color.canvas],
    ['warning text', DESIGN_TOKENS.color.warning, DESIGN_TOKENS.color.canvas],
    ['success text', DESIGN_TOKENS.color.success, DESIGN_TOKENS.color.canvas],
  ])('%s meets the compact-text 4.5:1 floor', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps faint command-bar text readable after alpha compositing', () => {
    const composite = compositeWhiteAlpha(DESIGN_TOKENS.color.onDarkFaint, DESIGN_TOKENS.color.ink);
    expect(contrastRatio(composite, DESIGN_TOKENS.color.ink)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['control borders', DESIGN_TOKENS.color.controlBorder, DESIGN_TOKENS.color.canvas],
    ['selection handles', DESIGN_TOKENS.color.accent, DESIGN_TOKENS.color.canvas],
    ['focus indicators', DESIGN_TOKENS.color.accentStrong, DESIGN_TOKENS.color.chrome],
  ])('%s meet the 3:1 non-text floor', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(3);
  });
});
