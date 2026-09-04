import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BoardIdSchema, ElementIdSchema } from '../src/domain';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { ExportMenu } from '../src/renderer/projects/ExportMenu';

describe('export menu', () => {
  it('offers current output immediately and selection output only for live selection', () => {
    const selectionStore = new SelectionStore();
    const onExport = vi.fn();
    const firstBoardId = BoardIdSchema.parse('board_first00001');
    const secondBoardId = BoardIdSchema.parse('board_second0001');
    render(
      <ExportMenu
        boards={[
          { id: firstBoardId, name: 'First' },
          { id: secondBoardId, name: 'Second' },
        ]}
        currentBoardId={firstBoardId}
        onExport={onExport}
        selectionStore={selectionStore}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export wireframe' }));
    let dialog = screen.getByRole('dialog', { name: 'Export wireframe' });
    expect(within(dialog).getByRole('button', { name: /Selection as PNG/ })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: /SVG image/ }));
    expect(onExport).toHaveBeenCalledExactlyOnceWith('svg', 'current');

    fireEvent.click(screen.getByRole('button', { name: 'Export wireframe' }));
    dialog = screen.getByRole('dialog', { name: 'Export wireframe' });
    fireEvent.click(within(dialog).getByRole('button', { name: /All wireframes as PDF/ }));
    expect(onExport).toHaveBeenLastCalledWith('pdf', 'all');

    fireEvent.click(screen.getByRole('button', { name: 'Export wireframe' }));
    dialog = screen.getByRole('dialog', { name: 'Export wireframe' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Second' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Chosen wireframes as PDF/ }));
    expect(onExport).toHaveBeenLastCalledWith('pdf', 'boards', [firstBoardId, secondBoardId]);

    selectionStore.selectOnly(ElementIdSchema.parse('element_selected1'));
    fireEvent.click(screen.getByRole('button', { name: 'Export wireframe' }));
    dialog = screen.getByRole('dialog', { name: 'Export wireframe' });
    const selectionPng = within(dialog).getByRole('button', { name: /Selection as PNG/ });
    expect(selectionPng).toBeEnabled();
    fireEvent.click(selectionPng);
    expect(onExport).toHaveBeenLastCalledWith('png', 'selection');
  });
});
