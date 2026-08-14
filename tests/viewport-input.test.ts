// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  VIEWPORT_INPUT_POLICY,
  isViewportDeleteKey,
  normalizeViewportWheel,
  type ViewportWheelInput,
} from '../src/renderer/editor/viewport-input';

const wheelInput = (overrides: Partial<ViewportWheelInput> = {}): ViewportWheelInput => ({
  clientX: 400,
  clientY: 300,
  ctrlKey: false,
  deltaMode: 0,
  deltaX: 0,
  deltaY: 0,
  metaKey: false,
  shiftKey: false,
  ...overrides,
});

describe('viewport wheel normalization', () => {
  it('recognizes only the platform-neutral Delete and Backspace codes', () => {
    expect(isViewportDeleteKey('Delete')).toBe(true);
    expect(isViewportDeleteKey('Backspace')).toBe(true);
    expect(isViewportDeleteKey('KeyD')).toBe(false);
  });

  it('normalizes pixel, line, and page wheel units into viewport-pixel pan', () => {
    expect(normalizeViewportWheel(wheelInput({ deltaX: 8, deltaY: 20 }), 600)).toEqual({
      deltaX: -8,
      deltaY: -20,
      kind: 'pan',
    });
    expect(normalizeViewportWheel(wheelInput({ deltaMode: 1, deltaY: 3 }), 600)).toEqual({
      deltaX: 0,
      deltaY: -3 * VIEWPORT_INPUT_POLICY.lineHeightPixels,
      kind: 'pan',
    });
    expect(normalizeViewportWheel(wheelInput({ deltaMode: 2, deltaY: 1 }), 600)).toEqual({
      deltaX: 0,
      deltaY: -600,
      kind: 'pan',
    });
  });

  it('maps shift-wheel onto horizontal pan only when native horizontal input is absent', () => {
    expect(normalizeViewportWheel(wheelInput({ deltaY: 24, shiftKey: true }), 600)).toEqual({
      deltaX: -24,
      deltaY: 0,
      kind: 'pan',
    });
    expect(
      normalizeViewportWheel(wheelInput({ deltaX: 5, deltaY: 24, shiftKey: true }), 600),
    ).toEqual({ deltaX: -5, deltaY: -24, kind: 'pan' });
  });

  it('turns Chromium pinch and command/control wheel into bounded exponential zoom factors', () => {
    const controlZoom = normalizeViewportWheel(wheelInput({ ctrlKey: true, deltaY: -100 }), 600);
    const commandZoom = normalizeViewportWheel(wheelInput({ deltaY: 100, metaKey: true }), 600);
    const boundedZoom = normalizeViewportWheel(
      wheelInput({ ctrlKey: true, deltaY: -1_000_000 }),
      600,
    );

    expect(controlZoom).toEqual({ factor: Math.exp(0.2), kind: 'zoom' });
    expect(commandZoom).toEqual({ factor: Math.exp(-0.2), kind: 'zoom' });
    expect(boundedZoom).toEqual({
      factor: Math.exp(
        VIEWPORT_INPUT_POLICY.maximumWheelDeltaPixels * VIEWPORT_INPUT_POLICY.zoomSensitivity,
      ),
      kind: 'zoom',
    });
  });

  it('ignores zero, malformed, and unknown-mode input without destabilizing the editor', () => {
    expect(normalizeViewportWheel(wheelInput(), 600)).toBeUndefined();
    expect(normalizeViewportWheel(wheelInput({ ctrlKey: true, deltaY: 0 }), 600)).toBeUndefined();
    expect(normalizeViewportWheel(wheelInput({ deltaMode: 99, deltaY: 10 }), 600)).toBeUndefined();
    expect(normalizeViewportWheel(wheelInput({ deltaY: Number.NaN }), 600)).toBeUndefined();
    expect(normalizeViewportWheel(wheelInput({ deltaY: 10 }), 0)).toBeUndefined();
  });
});
