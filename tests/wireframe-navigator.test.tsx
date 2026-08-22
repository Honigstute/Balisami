import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  BoardIdSchema,
  BoardSchema,
  DOCUMENT_COMMAND_TYPES,
  ProjectIdSchema,
  createEmptyProjectDocument,
  dispatchDocumentCommand,
} from '../src/domain';
import { WireframeNavigator } from '../src/renderer/controls/WireframeNavigator';

const FIRST_BOARD_ID = BoardIdSchema.parse('board_navigator01');
const SECOND_BOARD_ID = BoardIdSchema.parse('board_navigator02');

const createTwoBoardDocument = () => {
  const initial = createEmptyProjectDocument({
    boardId: FIRST_BOARD_ID,
    projectId: ProjectIdSchema.parse('project_navigator01'),
  });
  if (!initial.ok) {
    throw new Error('Navigator fixture could not create its first board.');
  }
  const result = dispatchDocumentCommand(initial.value, {
    type: DOCUMENT_COMMAND_TYPES.createBoard,
    board: BoardSchema.parse({
      childIds: [],
      id: SECOND_BOARD_ID,
      name: 'Second board',
      note: { text: '' },
    }),
    index: 1,
  });
  if (!result.ok || !result.changed) {
    throw new Error('Navigator fixture could not create its second board.');
  }
  return result.document;
};

describe('wireframe navigator', () => {
  it('selects boards by click and supports roving Arrow/Home/End navigation', () => {
    const onSelectBoard = vi.fn();
    render(
      <WireframeNavigator
        activeBoardId={FIRST_BOARD_ID}
        document={createTwoBoardDocument()}
        onDuplicateBoard={() => true}
        onRenameBoard={() => true}
        onReorderBoard={() => true}
        onSelectBoard={onSelectBoard}
        shortcutPlatform="darwin"
      />,
    );
    const first = screen.getByRole('button', { name: 'Wireframe 1' });
    const second = screen.getByRole('button', { name: 'Second board' });

    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    fireEvent.click(second);
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(onSelectBoard).toHaveBeenNthCalledWith(1, SECOND_BOARD_ID);
    expect(onSelectBoard).toHaveBeenNthCalledWith(2, SECOND_BOARD_ID);
    expect(globalThis.document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: 'Home' });
    fireEvent.keyDown(first, { key: 'End' });
    expect(onSelectBoard).toHaveBeenNthCalledWith(3, FIRST_BOARD_ID);
    expect(onSelectBoard).toHaveBeenNthCalledWith(4, SECOND_BOARD_ID);
  });

  it('renames with F2, Enter, blur, and Escape without leaving the fixed row', async () => {
    const onRenameBoard = vi.fn(() => true);
    render(
      <WireframeNavigator
        activeBoardId={FIRST_BOARD_ID}
        document={createTwoBoardDocument()}
        onDuplicateBoard={() => true}
        onRenameBoard={onRenameBoard}
        onReorderBoard={() => true}
        onSelectBoard={() => undefined}
        shortcutPlatform="darwin"
      />,
    );
    const first = screen.getByRole('button', { name: 'Wireframe 1' });

    fireEvent.keyDown(first, { key: 'F2' });
    const input = screen.getByRole('textbox', { name: 'Rename Wireframe 1' });
    expect(globalThis.document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: '  Checkout flow  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameBoard).toHaveBeenCalledWith(FIRST_BOARD_ID, 'Checkout flow');
    expect(screen.queryByRole('textbox')).toBeNull();

    const restoredFirst = screen.getByRole('button', { name: 'Wireframe 1' });
    fireEvent.keyDown(restoredFirst, { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onRenameBoard).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(globalThis.document.activeElement).toBe(
        screen.getByRole('button', { name: 'Wireframe 1' }),
      ),
    );

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Wireframe 1' }));
    const blankInput = screen.getByRole('textbox');
    fireEvent.change(blankInput, { target: { value: '   ' } });
    fireEvent.blur(blankInput);
    expect(onRenameBoard).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('routes exact duplicate/reorder shortcuts and pointer reorder', () => {
    const onDuplicateBoard = vi.fn(() => true);
    const onReorderBoard = vi.fn(() => true);
    render(
      <WireframeNavigator
        activeBoardId={FIRST_BOARD_ID}
        document={createTwoBoardDocument()}
        onDuplicateBoard={onDuplicateBoard}
        onRenameBoard={() => true}
        onReorderBoard={onReorderBoard}
        onSelectBoard={() => undefined}
        shortcutPlatform="darwin"
      />,
    );
    const first = screen.getByRole('button', { name: 'Wireframe 1' });
    const second = screen.getByRole('button', { name: 'Second board' });

    fireEvent.keyDown(first, { ctrlKey: true, key: 'd' });
    fireEvent.keyDown(first, { key: 'd', metaKey: true, repeat: true });
    expect(onDuplicateBoard).not.toHaveBeenCalled();
    fireEvent.keyDown(first, { key: 'd', metaKey: true });
    expect(onDuplicateBoard).toHaveBeenCalledWith(FIRST_BOARD_ID);

    fireEvent.keyDown(second, { altKey: true, key: 'ArrowUp' });
    expect(onReorderBoard).toHaveBeenCalledWith(SECOND_BOARD_ID, 0);

    const dataTransfer = { effectAllowed: 'none', dropEffect: 'none' } as DataTransfer;
    fireEvent.dragStart(second, { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe('move');
    fireEvent.dragOver(first, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('move');
    fireEvent.drop(first, { dataTransfer });
    expect(onReorderBoard).toHaveBeenLastCalledWith(SECOND_BOARD_ID, 0);
  });
});
