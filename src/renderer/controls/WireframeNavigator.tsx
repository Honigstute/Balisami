import type { BoardId, ProjectDocument } from '../../domain';

interface WireframeNavigatorProps {
  readonly activeBoardId: BoardId | undefined;
  readonly document: ProjectDocument;
}

export const WireframeNavigator = ({ activeBoardId, document }: WireframeNavigatorProps) => (
  <div aria-label="Project wireframes" className="wireframe-list" role="listbox">
    {document.boardIds.map((boardId) => {
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
          role="option"
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
