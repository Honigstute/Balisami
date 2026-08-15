import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  BoardIdSchema,
  CONTROL_TYPES,
  ElementIdSchema,
  ProjectIdSchema,
  createEmptyProjectDocument,
  dispatchDocumentCommand,
  type ElementProperties,
  type ControlTypeId,
  type WorldRect,
} from '../src/domain';
import { ControlInspector, ControlInspectorTitle } from '../src/renderer/controls/ControlInspector';
import { ControlShelf } from '../src/renderer/controls/ControlShelf';
import { CONTROL_DRAG_MIME_TYPE } from '../src/renderer/controls/control-drag-transfer';
import { createControlInsertionCommand } from '../src/renderer/controls/control-insertion';
import type { ControlTextMeasurementService } from '../src/renderer/controls/control-text-measurement';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { createWorldPoint } from '../src/renderer/editor/viewport-transform';

const createControlDocument = (controlType = CONTROL_TYPES.button) => {
  const boardId = BoardIdSchema.parse('board_controlui');
  const elementId = ElementIdSchema.parse('element_controlui');
  const created = createEmptyProjectDocument({
    boardId,
    projectId: ProjectIdSchema.parse('project_controlui'),
  });
  if (!created.ok) {
    throw new Error('Control UI fixture is invalid.');
  }
  const command = createControlInsertionCommand({
    boardId,
    center: createWorldPoint(300, 240),
    controlType,
    document: created.value,
    elementId,
  });
  const result = dispatchDocumentCommand(created.value, command);
  if (!result.ok || !result.changed) {
    throw new Error('Control UI fixture button could not be inserted.');
  }
  return Object.freeze({ document: result.document, elementId });
};

const thumbnailTextMeasurementService: ControlTextMeasurementService = {
  measure: ({ fontSize, text }) => ({
    baselineOffsets: [fontSize],
    height: fontSize * 1.2,
    lineCount: 1,
    lineHeight: fontSize * 1.2,
    lines: [text],
    width: text.length * fontSize * 0.5,
  }),
};

describe('alpha control authoring UI', () => {
  it('exposes every representative control as a stable insert action', () => {
    const onInsert = vi.fn<(controlType: ControlTypeId) => boolean>(() => true);
    render(<ControlShelf onInsert={onInsert} />);

    for (const label of [
      'Rectangle',
      'Text Label',
      'Button',
      'Text Input',
      'Checkbox',
      'Image',
      'Browser Window',
      'Arrow',
    ]) {
      fireEvent.click(screen.getByRole('button', { name: `Insert ${label}` }));
    }
    expect(onInsert.mock.calls.map(([type]) => type)).toEqual([
      CONTROL_TYPES.rectangle,
      CONTROL_TYPES.textLabel,
      CONTROL_TYPES.button,
      CONTROL_TYPES.textInput,
      CONTROL_TYPES.checkbox,
      CONTROL_TYPES.imagePlaceholder,
      CONTROL_TYPES.browser,
      CONTROL_TYPES.arrow,
    ]);
  });

  it('makes every palette control a typed draggable shelf source', () => {
    render(<ControlShelf onInsert={() => true} />);
    const data = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: 'none',
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
    } as unknown as DataTransfer;
    const button = screen.getByRole('button', { name: 'Insert Button' });

    expect(button).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(button, { dataTransfer });

    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(data.get(CONTROL_DRAG_MIME_TYPE)).toBe(CONTROL_TYPES.button);
    for (const shelfItem of screen.getAllByRole('button')) {
      expect(shelfItem).toHaveAttribute('draggable', 'true');
    }
  });

  it('renders every palette preview through a definition-derived SVG projection', () => {
    render(
      <ControlShelf
        onInsert={() => true}
        textMeasurementService={thumbnailTextMeasurementService}
      />,
    );

    for (const type of [
      CONTROL_TYPES.rectangle,
      CONTROL_TYPES.textLabel,
      CONTROL_TYPES.button,
      CONTROL_TYPES.textInput,
      CONTROL_TYPES.checkbox,
      CONTROL_TYPES.imagePlaceholder,
      CONTROL_TYPES.browser,
      CONTROL_TYPES.arrow,
    ]) {
      const thumbnail = document.querySelector(`[data-control-thumbnail='${type}']`);
      expect(thumbnail).toBeInstanceOf(SVGSVGElement);
      expect(thumbnail).toHaveAttribute('viewBox');
    }
    expect(document.querySelector('[data-control-preview]')).toBeNull();
    expect(screen.getByText('Text label', { selector: 'tspan' })).toBeInTheDocument();
    expect(screen.getByText('Button', { selector: 'tspan' })).toBeInTheDocument();
    expect(screen.getByText('Text input', { selector: 'tspan' })).toBeInTheDocument();
    expect(screen.getByText('Checkbox', { selector: 'tspan' })).toBeInTheDocument();
  });

  it('edits selected geometry and text while reserving validation space', () => {
    const { document, elementId } = createControlDocument();
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetFrame = vi.fn<(id: typeof elementId, frame: WorldRect) => boolean>(() => true);
    const onSetProperties = vi.fn<(id: typeof elementId, properties: ElementProperties) => boolean>(
      () => true,
    );
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrame={onSetFrame}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    expect(screen.queryByText('Selected control')).not.toBeInTheDocument();
    const x = screen.getByRole('spinbutton', { name: 'X' });
    fireEvent.change(x, { target: { value: '260' } });
    fireEvent.blur(x);
    expect(onSetFrame).toHaveBeenCalledWith(elementId, expect.objectContaining({ x: 260 }));

    const width = screen.getByRole('spinbutton', { name: 'Width' });
    fireEvent.change(width, { target: { value: '2' } });
    fireEvent.blur(width);
    expect(screen.getByText('Minimum 48.')).toBeInTheDocument();

    const content = screen.getByRole('textbox', { name: 'Content' });
    fireEvent.change(content, { target: { value: 'Continue' } });
    fireEvent.blur(content);
    expect(onSetProperties).toHaveBeenCalledWith(
      elementId,
      expect.objectContaining({ text: 'Continue' }),
    );
  });

  it('renders registry boolean fields without a checkbox-specific inspector branch', () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.checkbox);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetProperties = vi.fn<(id: typeof elementId, properties: ElementProperties) => boolean>(
      () => true,
    );
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrame={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Checked' }));
    expect(onSetProperties).toHaveBeenCalledWith(
      elementId,
      expect.objectContaining({ checked: true, text: 'Checkbox' }),
    );
  });

  it('renders Arrow choice and number fields through the generic inspector vocabulary', () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.arrow);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetProperties = vi.fn<(id: typeof elementId, properties: ElementProperties) => boolean>(
      () => true,
    );
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrame={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    expect(screen.getAllByRole('heading', { name: 'Arrow' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Visual 2' }));
    expect(onSetProperties).toHaveBeenCalledWith(
      elementId,
      expect.objectContaining({ routing: 'visual-2' }),
    );
    const labelPosition = screen.getByRole('spinbutton', { name: 'Label Position' });
    fireEvent.change(labelPosition, { target: { value: '0.75' } });
    fireEvent.blur(labelPosition);
    expect(onSetProperties).toHaveBeenCalledWith(
      elementId,
      expect.objectContaining({ labelPosition: 0.75 }),
    );
  });

  it('exposes the definition-owned Auto-Size action without a control-type branch', async () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.button);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onAutoSize = vi.fn<(id: typeof elementId) => Promise<boolean>>(() =>
      Promise.resolve(true),
    );
    render(
      <ControlInspector
        document={document}
        onAutoSize={onAutoSize}
        onSetFrame={() => true}
        onSetProperties={() => true}
        selection={selection}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '↔ Auto-Size' }));
    await waitFor(() => expect(onAutoSize).toHaveBeenCalledOnce());
    expect(onAutoSize).toHaveBeenCalledWith(elementId);
  });

  it('puts the selected control identity in the fixed inspector header title', async () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.button);
    const secondId = ElementIdSchema.parse('element_controlui_second');
    const secondCommand = createControlInsertionCommand({
      boardId: document.boardIds[0]!,
      center: createWorldPoint(500, 240),
      controlType: CONTROL_TYPES.rectangle,
      document,
      elementId: secondId,
    });
    const withSecond = dispatchDocumentCommand(document, secondCommand);
    if (!withSecond.ok || !withSecond.changed) {
      throw new Error('Second inspector-title fixture control could not be inserted.');
    }
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    render(
      <h2>
        <ControlInspectorTitle document={withSecond.document} selection={selection} />
      </h2>,
    );

    expect(screen.getByRole('heading', { name: 'Button' })).toBeInTheDocument();
    await act(() => selection.replace([elementId, secondId], secondId));
    expect(screen.getByRole('heading', { name: '2 Controls' })).toBeInTheDocument();
  });
});
