// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { CONTROL_TYPES, getControlSpec, type ControlDefinition } from '../src/domain';
import { calculateControlSceneTextLayout } from '../src/renderer/controls/control-scene-text-layout';
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
      fontSize: 16,
      lines: [{ baselineY: 41, text: 'Save now', x: 60 }],
      textAnchor: 'middle',
      width: 70,
    });
    expect(measure).toHaveBeenCalledWith({
      fontSize: 16,
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
      fontSize: 16,
      lines: [
        { baselineY: 39, text: 'One', x: 36 },
        { baselineY: 53, text: '', x: 36 },
        { baselineY: 67, text: 'Three', x: 36 },
      ],
      textAnchor: 'start',
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
});
