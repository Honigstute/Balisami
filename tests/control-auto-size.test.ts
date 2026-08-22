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
});
