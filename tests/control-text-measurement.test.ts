import { describe, expect, it, vi } from 'vitest';

import {
  CONTROL_TEXT_MEASUREMENT_POLICY,
  ControlTextMeasurementError,
  calculateControlTextAutoSize,
  createControlTextMeasurementService,
  prepareBundledWireframeFont,
  type ControlTextCanvasContext,
} from '../src/renderer/controls/control-text-measurement';
import { DESIGN_TOKENS } from '../src/shared/design-tokens';

const createContext = (): ControlTextCanvasContext => ({
  font: '',
  measureText: (text) => ({
    actualBoundingBoxAscent: 8,
    actualBoundingBoxDescent: 2,
    width: text.length * 5.125_4,
  }),
  textBaseline: 'top',
});

describe('control text measurement', () => {
  it('normalizes single-line text and returns rounded bundled-font metrics', () => {
    const context = createContext();
    const service = createControlTextMeasurementService(context);

    const measurement = service.measure({
      fontSize: 10,
      lineHeight: 1.5,
      mode: 'single-line',
      text: 'Save\r\nnow',
    });

    expect(context.font).toBe(`400 10px "${DESIGN_TOKENS.font.family.wireframe}"`);
    expect(context.textBaseline).toBe('alphabetic');
    expect(measurement).toEqual({
      baselineOffsets: [10.5],
      height: 15,
      lineCount: 1,
      lineHeight: 15,
      width: 41.003,
    });
  });

  it('measures multiline width once and exposes every canonical baseline', () => {
    const service = createControlTextMeasurementService(createContext());

    expect(
      service.measure({
        fontSize: 10,
        mode: 'multiline',
        text: 'wide\n\nxx',
      }),
    ).toEqual({
      baselineOffsets: [10, 24, 38],
      height: 42,
      lineCount: 3,
      lineHeight: 14,
      width: 20.502,
    });
  });

  it('rejects invalid requests and unusable vertical font metrics', () => {
    const service = createControlTextMeasurementService(createContext());
    expect(() => service.measure({ fontSize: 0, mode: 'single-line', text: 'invalid' })).toThrow(
      ControlTextMeasurementError,
    );
    expect(() =>
      service.measure({
        fontSize: CONTROL_TEXT_MEASUREMENT_POLICY.maximumFontSize + 1,
        mode: 'single-line',
        text: 'invalid',
      }),
    ).toThrow('invalid text or font settings');

    const invalidMetrics: ControlTextCanvasContext = {
      ...createContext(),
      measureText: () => ({
        actualBoundingBoxAscent: 0,
        actualBoundingBoxDescent: 0,
        width: 1,
      }),
    };
    expect(() =>
      createControlTextMeasurementService(invalidMetrics).measure({
        fontSize: 16,
        mode: 'single-line',
        text: 'invalid',
      }),
    ).toThrow('usable vertical metrics');
  });

  it('loads and verifies the exact bundled wireframe font before measurement', async () => {
    const load = vi.fn(() => Promise.resolve([]));
    const check = vi.fn(() => true);
    await prepareBundledWireframeFont({ check, load, ready: Promise.resolve() });

    const expectedFont = `400 16px "${DESIGN_TOKENS.font.family.wireframe}"`;
    expect(load).toHaveBeenCalledWith(expectedFont, CONTROL_TEXT_MEASUREMENT_POLICY.fontProbeText);
    expect(check).toHaveBeenCalledWith(expectedFont, CONTROL_TEXT_MEASUREMENT_POLICY.fontProbeText);

    await expect(
      prepareBundledWireframeFont({
        check: () => false,
        load: () => Promise.resolve([]),
        ready: Promise.resolve(),
      }),
    ).rejects.toMatchObject({ code: 'font-unavailable' });
  });
});

describe('control text auto-size', () => {
  const baseInput = {
    currentSize: { height: 40, width: 80 },
    insets: { bottom: 4, left: 8, right: 8, top: 4 },
    maximumSize: { height: 70, width: 120 },
    measurement: { height: 84, width: 96.125_4 },
    minimumSize: { height: 24, width: 48 },
  } as const;

  it('clamps active axes while preserving an inactive canonical dimension exactly', () => {
    expect(calculateControlTextAutoSize({ ...baseInput, axis: 'both' })).toEqual({
      height: 70,
      width: 112.125,
    });
    expect(calculateControlTextAutoSize({ ...baseInput, axis: 'horizontal' })).toEqual({
      height: 40,
      width: 112.125,
    });
    expect(calculateControlTextAutoSize({ ...baseInput, axis: 'vertical' })).toEqual({
      height: 70,
      width: 80,
    });
  });

  it('rejects inverted constraints and non-finite geometry', () => {
    expect(() =>
      calculateControlTextAutoSize({
        ...baseInput,
        axis: 'both',
        maximumSize: { height: 20, width: 120 },
      }),
    ).toThrow('maximum is smaller');
    expect(() =>
      calculateControlTextAutoSize({
        ...baseInput,
        axis: 'both',
        measurement: { height: Number.NaN, width: 20 },
      }),
    ).toThrow('invalid measurement');
    expect(() =>
      calculateControlTextAutoSize({
        ...baseInput,
        axis: 'both',
        insets: { ...baseInput.insets, left: Number.MAX_VALUE },
        measurement: { height: 20, width: Number.MAX_VALUE },
      }),
    ).toThrow('exceeds finite world geometry');
  });
});
