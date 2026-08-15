import { fireEvent, render, screen } from '@testing-library/react';
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
import { ControlInspector } from '../src/renderer/controls/ControlInspector';
import { ControlShelf } from '../src/renderer/controls/ControlShelf';
import { createControlInsertionCommand } from '../src/renderer/controls/control-insertion';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { createWorldPoint } from '../src/renderer/editor/viewport-transform';

const createButtonDocument = () => {
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
    controlType: CONTROL_TYPES.button,
    document: created.value,
    elementId,
  });
  const result = dispatchDocumentCommand(created.value, command);
  if (!result.ok || !result.changed) {
    throw new Error('Control UI fixture button could not be inserted.');
  }
  return Object.freeze({ document: result.document, elementId });
};

describe('alpha control authoring UI', () => {
  it('exposes every representative control as a stable insert action', () => {
    const onInsert = vi.fn<(controlType: ControlTypeId) => boolean>(() => true);
    render(<ControlShelf onInsert={onInsert} />);

    for (const label of ['Rectangle', 'Text Label', 'Button', 'Text Input']) {
      fireEvent.click(screen.getByRole('button', { name: `Insert ${label}` }));
    }
    expect(onInsert.mock.calls.map(([type]) => type)).toEqual([
      CONTROL_TYPES.rectangle,
      CONTROL_TYPES.textLabel,
      CONTROL_TYPES.button,
      CONTROL_TYPES.textInput,
    ]);
  });

  it('edits selected geometry and text while reserving validation space', () => {
    const { document, elementId } = createButtonDocument();
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetFrame = vi.fn<(id: typeof elementId, frame: WorldRect) => boolean>(() => true);
    const onSetProperties = vi.fn<(id: typeof elementId, properties: ElementProperties) => boolean>(
      () => true,
    );
    render(
      <ControlInspector
        document={document}
        onSetFrame={onSetFrame}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Button' })).toBeInTheDocument();
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
});
