import { useRef, type KeyboardEvent } from 'react';

import type { BoardId, ProjectDocument } from '../../domain';

interface WireframeNavigatorProps {
  readonly activeBoardId: BoardId | undefined;
  readonly document: ProjectDocument;
  readonly onSelectBoard: (boardId: BoardId) => void;
}

export const WireframeNavigator = ({
  activeBoardId,
  document,
  onSelectBoard,
}: WireframeNavigatorProps) => {
  const rowRefs = useRef(new Map<BoardId, HTMLButtonElement>());
  const selectAt = (index: number): void => {
    const boardId = document.boardIds[index];
    if (boardId === undefined) {
      return;
    }
    onSelectBoard(boardId);
    rowRefs.current.get(boardId)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const lastIndex = document.boardIds.length - 1;
    const targetIndex =
      event.key === 'ArrowDown'
        ? Math.min(index + 1, lastIndex)
        : event.key === 'ArrowUp'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? lastIndex
              : undefined;
    if (targetIndex === undefined) {
      return;
    }
    event.preventDefault();
    selectAt(targetIndex);
  };

  return (
    <div aria-label="Project wireframes" className="wireframe-list" role="listbox">
      {document.boardIds.map((boardId, index) => {
        const board = document.boardsById[boardId];
        if (board === undefined) {
          return null;
        }
        const active = boardId === activeBoardId;
        return (
          <button
            aria-selected={active}
            className="wireframe-list__row"
            key={boardId}
            onClick={() => onSelectBoard(boardId)}
            onKeyDown={(event) => onKeyDown(event, index)}
            ref={(node) => {
              if (node === null) {
                rowRefs.current.delete(boardId);
              } else {
                rowRefs.current.set(boardId, node);
              }
            }}
            role="option"
            tabIndex={active ? 0 : -1}
            type="button"
          >
            <span aria-hidden="true" className="wireframe-list__thumbnail">
              <span />
              <span />
              <span />
            </span>
            <span className="wireframe-list__name">{board.name}</span>
          </button>
        );
      })}
    </div>
  );
};
