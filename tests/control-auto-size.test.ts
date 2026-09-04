import { describe, expect, it, vi } from 'vitest';

import {
  AssetIdSchema,
  BoardIdSchema,
  CONTROL_TYPES,
  ElementIdSchema,
  ProjectIdSchema,
  createEmptyProjectDocument,
  createCustomIconReference,
  dispatchDocumentCommand,
  getControlSpec,
} from '../src/domain';
import { calculateControlAutoSizeFrame } from '../src/renderer/controls/control-auto-size';
import { createControlInsertionCommand } from '../src/renderer/controls/control-insertion';
import { createWorldPoint } from '../src/renderer/editor/viewport-transform';

const createElement = (controlType = CONTROL_TYPES.button) => {
  const boardId = BoardIdSchema.parse('board_autosize');
  const created = createEmptyProjectDocument({
    boardId,
    projectId: ProjectIdSchema.parse('project_autosize'),
  });
  if (!created.ok) {
    throw new Error('Auto-size fixture is invalid.');
  }
  const elementId = ElementIdSchema.parse('element_autosize');
  const inserted = dispatchDocumentCommand(
    created.value,
    createControlInsertionCommand({
      boardId,
      center: createWorldPoint(200, 180),
      controlType,
      document: created.value,
      elementId,
    }),
  );
  if (!inserted.ok || !inserted.changed) {
    throw new Error('Auto-size fixture could not insert its control.');
  }
  return inserted.document.elementsById[elementId];
};

describe('registry-driven control auto-size', () => {
  it('allocates every equal segment from the widest parsed label without measuring syntax', () => {
    const definition = getControlSpec(CONTROL_TYPES.buttonBar);
    if (definition === undefined) throw new Error('Button Bar definition is missing.');
    const inserted = createElement(CONTROL_TYPES.buttonBar);
    if (inserted === undefined) throw new Error('Button Bar fixture is missing.');
    const element = Object.freeze({
      ...inserted,
      properties: Object.freeze({ ...definition.defaultProperties, items: 'Widest | i' }),
    });
    const measure = vi.fn((request: { text: string }) => ({
      baselineOffsets: [10],
      height: 16,
      lineCount: 1,
      lineHeight: 16,
      lines: [request.text],
      width: request.text === 'Widest' ? 60 : 5,
    }));

    expect(calculateControlAutoSizeFrame(element, { measure })?.width).toBe(152);
    expect(measure.mock.calls.map(([request]) => request.text)).toEqual(['Widest', 'i']);
  });

  it('sizes stacked marker rows from visible labels, marker space, and every row line', () => {
    const element = createElement(CONTROL_TYPES.checkboxGroup);
    if (element === undefined) throw new Error('Checkbox Group fixture is missing.');
    const measure = vi.fn((request: { text: string }) => ({
      baselineOffsets: [10],
      height: 16,
      lineCount: 1,
      lineHeight: 16,
      lines: [request.text],
      width: request.text === 'A row without a checkbox' ? 100 : 80,
    }));

    expect(calculateControlAutoSizeFrame(element, { measure })).toEqual({
      ...element.frame,
      height: 148,
      width: 108,
    });
    expect(measure.mock.calls.map(([request]) => request.text)).not.toContain('[x] selected');
    expect(measure).toHaveBeenCalledTimes(7);
  });

  it('includes hierarchy depth, adornment slot, and the longest label in Tree Pane width', () => {
    const definition = getControlSpec(CONTROL_TYPES.treePane);
    const inserted = createElement(CONTROL_TYPES.treePane);
    if (definition === undefined || inserted === undefined) {
      throw new Error('Tree Pane fixture is missing.');
    }
    const element = Object.freeze({
      ...inserted,
      properties: Object.freeze({
        ...definition.defaultProperties,
        items: 'f Root\n...- A deeply nested long leaf',
      }),
    });
    const measure = vi.fn((request: { text: string }) => ({
      baselineOffsets: [10],
      height: 16,
      lineCount: 1,
      lineHeight: 16,
      lines: [request.text],
      width: request.text === 'A deeply nested long leaf' ? 120 : 30,
    }));

    // 120 label + 3 hierarchy slots + 1 adornment slot + 8 outer insets.
    expect(calculateControlAutoSizeFrame(element, { measure })?.width).toBe(208);
  });

  it('measures registered text and projects the frame without changing its origin', () => {
    const element = createElement();
    if (element === undefined) {
      throw new Error('Auto-size fixture element is missing.');
    }
    const measure = vi.fn(() => ({
      baselineOffsets: [12],
      height: 22,
      lineCount: 1,
      lineHeight: 22,
      lines: ['Button'],
      width: 83.125,
    }));

    expect(calculateControlAutoSizeFrame(element, { measure })).toEqual({
      ...element.frame,
      height: 38,
      width: 99.125,
    });
    expect(measure).toHaveBeenCalledWith({
      fontSize: 16,
      fontStyle: 'normal',
      fontWeight: 'normal',
      mode: 'single-line',
      text: 'Button',
    });
  });

  it.each([
    [CONTROL_TYPES.textSubtitle, 24],
    [CONTROL_TYPES.textTitle, 40],
  ] as const)(
    'uses the registered styled font defaults for %s Auto-Size',
    (controlType, fontSize) => {
      const element = createElement(controlType);
      if (element === undefined) throw new Error('Heading Auto-Size fixture is missing.');
      const text = element.properties.text;
      if (typeof text !== 'string') throw new Error('Heading text fixture is invalid.');
      const measure = vi.fn(() => ({
        baselineOffsets: [fontSize],
        height: fontSize + 2,
        lineCount: 1,
        lineHeight: fontSize + 2,
        lines: [text],
        width: 91,
      }));

      expect(calculateControlAutoSizeFrame(element, { measure })).toEqual({
        ...element.frame,
        height: Math.max(24, fontSize + 2),
        width: 91,
      });
      expect(measure).toHaveBeenCalledWith({
        fontSize,
        fontStyle: 'normal',
        fontWeight: 'normal',
        mode: 'single-line',
        text: element.properties.text,
      });
    },
  );

  it('measures Multiline Button primary and supporting copy with their distinct hierarchy', () => {
    const element = createElement(CONTROL_TYPES.multilineButton);
    if (element === undefined) throw new Error('Multiline Button Auto-Size fixture is missing.');
    const measure = vi.fn((request: { fontSize: number; fontWeight?: string; text: string }) => ({
      baselineOffsets: [request.fontSize],
      height: request.fontSize === 13 ? 16 : 12,
      lineCount: 1,
      lineHeight: request.fontSize === 13 ? 16 : 12,
      lines: [request.text],
      width: request.text === 'Multiline Button' ? 100 : 80,
    }));

    expect(calculateControlAutoSizeFrame(element, { measure })).toEqual({
      ...element.frame,
      height: 56,
      width: 132,
    });
    expect(measure.mock.calls.map(([request]) => request)).toEqual([
      expect.objectContaining({ fontSize: 13, fontWeight: 'bold', text: 'Multiline Button' }),
      expect.objectContaining({ fontSize: 10, fontWeight: 'normal', text: 'Second line of text' }),
    ]);
  });

  it('reserves both evidenced Search Box decoration slots during Auto-Size', () => {
    const element = createElement(CONTROL_TYPES.searchBox);
    if (element === undefined) throw new Error('Search Box fixture is missing.');
    const measure = vi.fn(() => ({
      baselineOffsets: [10],
      height: 16,
      lineCount: 1,
      lineHeight: 16,
      lines: ['search'],
      width: 50,
    }));

    expect(calculateControlAutoSizeFrame(element, { measure })).toEqual({
      ...element.frame,
      height: 24,
      width: 114,
    });
  });

  it('preserves the inactive checkbox height and refuses controls without a policy', () => {
    const checkbox = createElement(CONTROL_TYPES.checkbox);
    const rectangle = createElement(CONTROL_TYPES.rectangle);
    if (checkbox === undefined || rectangle === undefined) {
      throw new Error('Auto-size fixture elements are missing.');
    }
    const measurement = {
      measure: () => ({
        baselineOffsets: [12],
        height: 22,
        lineCount: 1,
        lineHeight: 22,
        lines: ['Checkbox'],
        width: 70,
      }),
    };

    expect(calculateControlAutoSizeFrame(checkbox, measurement)).toEqual({
      ...checkbox.frame,
      height: checkbox.frame.height,
      width: 96,
    });
    expect(calculateControlAutoSizeFrame(rectangle, measurement)).toBeUndefined();
  });

  it('restores an intrinsic non-text control without calling the text measurement service', () => {
    const rule = createElement(CONTROL_TYPES.hRule);
    if (rule === undefined) {
      throw new Error('Intrinsic Auto-Size fixture is missing.');
    }
    const measure = vi.fn();
    expect(
      calculateControlAutoSizeFrame(
        { ...rule, frame: { ...rule.frame, height: 40, width: 260 } },
        { measure },
      ),
    ).toEqual({ ...rule.frame, height: 10, width: 100 });
    expect(measure).not.toHaveBeenCalled();
  });

  it('reserves the tokenized icon size and gap when a button icon is present', () => {
    const element = createElement();
    if (element === undefined) {
      throw new Error('Icon auto-size fixture element is missing.');
    }
    const withIcon = {
      ...element,
      properties: { ...element.properties, iconId: 'arrow-right' },
    };
    const measurement = {
      measure: () => ({
        baselineOffsets: [12],
        height: 22,
        lineCount: 1,
        lineHeight: 22,
        lines: ['Button'],
        width: 83.125,
      }),
    };

    expect(calculateControlAutoSizeFrame(withIcon, measurement)?.width).toBe(119.125);
    expect(
      calculateControlAutoSizeFrame(
        {
          ...element,
          properties: {
            ...element.properties,
            iconId: createCustomIconReference(AssetIdSchema.parse('asset_autosize_icon')),
          },
        },
        measurement,
      )?.width,
    ).toBe(119.125);
  });

  it('keeps the exact Callout default and grows both axes for multiline annotations', () => {
    const callout = createElement(CONTROL_TYPES.callout);
    if (callout === undefined) throw new Error('Callout Auto-Size fixture is missing.');
    const measurement = {
      measure: ({ text }: { text: string }) => ({
        baselineOffsets: text.includes('\n') ? [13, 31.2] : [13],
        height: text.includes('\n') ? 36.4 : 18.2,
        lineCount: text.includes('\n') ? 2 : 1,
        lineHeight: 18.2,
        lines: text.split('\n'),
        width: text.includes('\n') ? 80 : 7,
      }),
    };

    expect(calculateControlAutoSizeFrame(callout, measurement)).toEqual(callout.frame);
    expect(
      calculateControlAutoSizeFrame(
        { ...callout, properties: { ...callout.properties, text: 'Review this\nflow' } },
        measurement,
      ),
    ).toEqual({ ...callout.frame, height: 56.4, width: 112 });
  });
});
