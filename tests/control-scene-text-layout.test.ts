// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { CONTROL_TYPES, getControlSpec, type ControlDefinition } from '../src/domain';
import { calculateControlSceneTextLayout } from '../src/renderer/controls/control-scene-text-layout';
import {
  createControlTextMeasurementService,
  type ControlTextCanvasContext,
} from '../src/renderer/controls/control-text-measurement';
import { createWorldRect } from '../src/renderer/editor/viewport-transform';

const requireDefinition = (type: string): ControlDefinition => {
  const definition = getControlSpec(type);
  if (definition === undefined) {
    throw new Error(`Missing test control definition '${type}'.`);
  }
  return definition;
};

describe('canonical control scene text layout', () => {
  it('centers measured button lines on real alphabetic baselines', () => {
    const measure = vi.fn(() => ({
      baselineOffsets: [12],
      height: 22,
      lineCount: 1,
      lineHeight: 22,
      lines: ['Save now'],
      width: 70,
    }));

    expect(
      calculateControlSceneTextLayout(
        requireDefinition(CONTROL_TYPES.button),
        createWorldRect(10, 20, 100, 40),
        { iconId: null, text: 'Save\r\nnow' },
        { measure },
      ),
    ).toEqual({
      color: undefined,
      fontSize: 16,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lines: [{ baselineY: 41, text: 'Save now', x: 60 }],
      textAnchor: 'middle',
      textDecoration: 'none',
      width: 70,
    });
    expect(measure).toHaveBeenCalledWith({
      fontSize: 16,
      fontStyle: 'normal',
      fontWeight: 'normal',
      mode: 'single-line',
      text: 'Save\r\nnow',
    });
  });

  it('uses definition-owned checkbox geometry and preserves multiline baseline order', () => {
    const definition = requireDefinition(CONTROL_TYPES.checkbox);
    const multilineDefinition: ControlDefinition = {
      ...definition,
      capabilities: {
        ...definition.capabilities,
        text:
          definition.capabilities.text === null
            ? null
            : { ...definition.capabilities.text, mode: 'multiline' },
      },
    };
    const measure = () => ({
      baselineOffsets: [10, 24, 38],
      height: 42,
      lineCount: 3,
      lineHeight: 14,
      lines: ['One', '', 'Three'],
      width: 40,
    });

    expect(
      calculateControlSceneTextLayout(
        multilineDefinition,
        createWorldRect(10, 20, 180, 60),
        { checked: false, text: 'One\n\nThree' },
        { measure },
      ),
    ).toEqual({
      color: undefined,
      fontSize: 16,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lines: [
        { baselineY: 39, text: 'One', x: 36 },
        { baselineY: 53, text: '', x: 36 },
        { baselineY: 67, text: 'Three', x: 36 },
      ],
      textAnchor: 'start',
      textDecoration: 'none',
      width: 40,
    });
  });

  it('centers button icon and text as one token-spaced content group', () => {
    const layout = calculateControlSceneTextLayout(
      requireDefinition(CONTROL_TYPES.button),
      createWorldRect(10, 20, 120, 40),
      { iconId: 'arrow-right', text: 'Go' },
      {
        measure: () => ({
          baselineOffsets: [12],
          height: 22,
          lineCount: 1,
          lineHeight: 22,
          lines: ['Go'],
          width: 20,
        }),
      },
    );

    expect(layout).toMatchObject({
      lines: [{ text: 'Go', x: 80 }],
      textAnchor: 'middle',
      width: 20,
    });
  });

  it('rejects inconsistent derived line geometry', () => {
    expect(() =>
      calculateControlSceneTextLayout(
        requireDefinition(CONTROL_TYPES.textLabel),
        createWorldRect(0, 0, 100, 40),
        { text: 'Broken' },
        {
          measure: () => ({
            baselineOffsets: [],
            height: 20,
            lineCount: 1,
            lineHeight: 20,
            lines: ['Broken'],
            width: 50,
          }),
        },
      ),
    ).toThrow('inconsistent line geometry');
  });

  it('measures Text Area content as canonical multiline text at normal and dense bounds', () => {
    const context: ControlTextCanvasContext = {
      font: '',
      measureText: (text) => ({
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
        width: text.length * 5.25,
      }),
      textBaseline: 'top',
    };
    const service = createControlTextMeasurementService(context);
    const definition = requireDefinition(CONTROL_TYPES.textArea);
    const properties = {
      ...definition.defaultProperties,
      bold: true,
      italic: true,
      text: 'First line\n\nThird line',
      textAlignment: 'end',
    };

    for (const bounds of [createWorldRect(10, 20, 200, 140), createWorldRect(10, 20, 72, 40)]) {
      const layout = calculateControlSceneTextLayout(definition, bounds, properties, service);
      if (layout === undefined) throw new Error('Text Area multiline layout is missing.');
      expect(layout.lines.map(({ text }) => text)).toEqual(['First line', '', 'Third line']);
      expect(
        layout.lines.every(({ baselineY, x }) => Number.isFinite(baselineY) && Number.isFinite(x)),
      ).toBe(true);
      expect(layout.lines.map(({ baselineY }) => baselineY)).toEqual(
        [...layout.lines.map(({ baselineY }) => baselineY)].sort((left, right) => left - right),
      );
      expect(layout).toMatchObject({
        fontStyle: 'italic',
        fontWeight: 'bold',
        textAnchor: 'end',
      });
    }
    expect(context.font).toContain('italic 700 13px');
  });
});
