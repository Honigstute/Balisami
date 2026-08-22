import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BoardIdSchema, BoardSchema } from '../src/domain';
import { BoardTrashDialog } from '../src/renderer/projects/BoardTrashDialog';

describe('board trash confirmation', () => {
  it('explains recovery, defaults focus to cancel, and confirms explicitly', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <BoardTrashDialog
        board={BoardSchema.parse({
          id: BoardIdSchema.parse('board_dialogtrash'),
          name: 'Checkout',
          note: { text: '' },
          childIds: [],
        })}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole('alertdialog', { name: 'Move “Checkout” to Trash?' });
    expect(dialog).toHaveAccessibleDescription(/restore the board from the navigator’s Trash/i);
    expect(globalThis.document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
