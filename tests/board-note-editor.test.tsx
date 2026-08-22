import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BoardIdSchema, BoardSchema } from '../src/domain';
import { BoardNoteEditor } from '../src/renderer/projects/BoardNoteEditor';

const FIRST_BOARD = BoardSchema.parse({
  id: BoardIdSchema.parse('board_notefirst001'),
  name: 'Checkout',
  note: { text: 'Initial decision' },
  childIds: [],
});
const SECOND_BOARD = BoardSchema.parse({
  id: BoardIdSchema.parse('board_notesecond01'),
  name: 'Confirmation',
  note: { text: 'Second note' },
  childIds: [],
});

describe('board note editor', () => {
  it('keeps drafting transient and commits once on blur or primary Enter', () => {
    const onCommit = vi.fn(() => true);
    const { rerender } = render(<BoardNoteEditor board={FIRST_BOARD} onCommit={onCommit} />);
    const note = screen.getByRole('textbox', { name: 'Notes for Checkout' });

    fireEvent.change(note, { target: { value: 'Updated decision' } });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
    fireEvent.blur(note);
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(FIRST_BOARD.id, 'Updated decision');

    rerender(
      <BoardNoteEditor
        board={BoardSchema.parse({ ...FIRST_BOARD, note: { text: 'Updated decision' } })}
        onCommit={onCommit}
      />,
    );
    const updatedNote = screen.getByRole('textbox', { name: 'Notes for Checkout' });
    updatedNote.focus();
    fireEvent.change(updatedNote, { target: { value: 'Keyboard commit' } });
    fireEvent.keyDown(updatedNote, { key: 'Enter', metaKey: true });
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenLastCalledWith(FIRST_BOARD.id, 'Keyboard commit');
  });

  it('cancels with Escape, reports rejected commits, and resets for another board', () => {
    const onCommit = vi.fn(() => false);
    const { rerender } = render(<BoardNoteEditor board={FIRST_BOARD} onCommit={onCommit} />);
    const note = screen.getByRole('textbox', { name: 'Notes for Checkout' });

    note.focus();
    fireEvent.change(note, { target: { value: 'Discard me' } });
    fireEvent.keyDown(note, { key: 'Escape' });
    expect(note).toHaveValue('Initial decision');
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.change(note, { target: { value: 'Rejected note' } });
    fireEvent.blur(note);
    expect(screen.getByText('The board note could not be saved.')).toBeInTheDocument();
    expect(note).toHaveValue('Rejected note');

    rerender(<BoardNoteEditor board={SECOND_BOARD} onCommit={onCommit} />);
    expect(screen.getByRole('textbox', { name: 'Notes for Confirmation' })).toHaveValue(
      'Second note',
    );
    expect(screen.queryByText('The board note could not be saved.')).not.toBeInTheDocument();
  });
});
