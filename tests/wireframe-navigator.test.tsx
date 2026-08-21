import { fireEvent, render, screen } from '@testing-library/react';
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
        onSelectBoard={onSelectBoard}
      />,
    );
    const first = screen.getByRole('option', { name: 'Wireframe 1' });
    const second = screen.getByRole('option', { name: 'Second board' });

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
});
