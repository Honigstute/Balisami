import { useRef, useState, type KeyboardEvent } from 'react';

import type { BoardId, ProjectDocument } from '../../domain';
import { AppButton } from '../design/AppButton';
import { BoardThumbnail } from '../projects/BoardThumbnail';
import { BoardVersionPanel } from '../projects/BoardVersionPanel';
import type { BoardThumbnailStore } from '../projects/board-thumbnail-store';

interface WireframeNavigatorProps {
  readonly activeBoardId: BoardId | undefined;
  readonly document: ProjectDocument;
  readonly onCreateAlternate: (boardId: BoardId) => boolean;
  readonly onDuplicateBoard: (boardId: BoardId) => boolean;
  readonly onDuplicateAlternate: (boardId: BoardId) => boolean;
  readonly onMergeAlternate: (boardId: BoardId, alternateId: BoardId) => boolean;
  readonly onPromoteAlternate: (boardId: BoardId, alternateId: BoardId) => boolean;
  readonly onRenameAlternate: (boardId: BoardId, name: string) => boolean;
  readonly onRequestDiscardAlternate: (boardId: BoardId, alternateId: BoardId) => void;
  readonly onRenameBoard: (boardId: BoardId, name: string) => boolean;
  readonly onRequestTrashBoard: (boardId: BoardId) => void;
  readonly onReorderBoard: (boardId: BoardId, toIndex: number) => boolean;
  readonly onRestoreBoard: (boardId: BoardId) => boolean;
  readonly onSelectBoard: (boardId: BoardId) => void;
  readonly onSelectVersion: (boardId: BoardId, alternateId: BoardId | null) => boolean;
  readonly shortcutPlatform: 'darwin' | 'win32';
  readonly thumbnailStore?: BoardThumbnailStore;
}

export const WireframeNavigator = ({
  activeBoardId,
  document,
  onCreateAlternate,
  onDuplicateBoard,
  onDuplicateAlternate,
  onMergeAlternate,
  onPromoteAlternate,
  onRenameAlternate,
  onRequestDiscardAlternate,
  onRenameBoard,
  onRequestTrashBoard,
  onReorderBoard,
  onRestoreBoard,
  onSelectBoard,
  onSelectVersion,
  shortcutPlatform,
  thumbnailStore,
}: WireframeNavigatorProps) => {
  const draggedBoardIdRef = useRef<BoardId | undefined>(undefined);
  const rowRefs = useRef(new Map<BoardId, HTMLButtonElement>());
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renamingBoardId, setRenamingBoardId] = useState<BoardId>();
  const cancelRename = (): void => {
    const boardId = renamingBoardId;
    setRenamingBoardId(undefined);
    setRenameDraft('');
    if (boardId !== undefined) {
      globalThis.queueMicrotask(() => rowRefs.current.get(boardId)?.focus());
    }
  };
  const beginRename = (boardId: BoardId): void => {
    const board = document.boardsById[boardId];
    if (board === undefined) {
      return;
    }
    setRenamingBoardId(boardId);
    setRenameDraft(board.name);
  };
  const commitRename = (): void => {
    if (renamingBoardId === undefined) {
      return;
    }
    const name = renameDraft.trim();
    if (name.length === 0 || !onRenameBoard(renamingBoardId, name)) {
      globalThis.queueMicrotask(() => renameInputRef.current?.focus());
      return;
    }
    setRenamingBoardId(undefined);
    setRenameDraft('');
  };
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
    if (event.key === 'F2' || event.key === 'Enter') {
      event.preventDefault();
      const boardId = document.boardIds[index];
      if (boardId !== undefined) {
        beginRename(boardId);
      }
      return;
    }
    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.repeat
    ) {
      event.preventDefault();
      const boardId = document.boardIds[index];
      if (boardId !== undefined && document.boardIds.length > 1) {
        onRequestTrashBoard(boardId);
      }
      return;
    }
    const exactPrimary =
      shortcutPlatform === 'darwin'
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;
    if (
      event.key.toLowerCase() === 'd' &&
      exactPrimary &&
      !event.altKey &&
      !event.shiftKey &&
      !event.repeat
    ) {
      event.preventDefault();
      const boardId = document.boardIds[index];
      if (boardId !== undefined) {
        onDuplicateBoard(boardId);
      }
      return;
    }
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    ) {
      event.preventDefault();
      const boardId = document.boardIds[index];
      const toIndex =
        event.key === 'ArrowUp' ? Math.max(index - 1, 0) : Math.min(index + 1, lastIndex);
      if (boardId !== undefined) {
        onReorderBoard(boardId, toIndex);
      }
      return;
    }
    if (targetIndex === undefined) {
      return;
    }
    event.preventDefault();
    selectAt(targetIndex);
  };
  const activeBoard = activeBoardId === undefined ? undefined : document.boardsById[activeBoardId];
  const canTrashActive =
    activeBoardId !== undefined &&
    activeBoard !== undefined &&
    document.boardIds.includes(activeBoardId) &&
    document.boardIds.length > 1;

  return (
    <div aria-label="Project wireframes" className="wireframe-list">
      {document.boardIds.map((boardId, index) => {
        const board = document.boardsById[boardId];
        if (board === undefined) {
          return null;
        }
        const active = boardId === activeBoardId;
        const renaming = boardId === renamingBoardId;
        if (renaming) {
          return (
            <div className="wireframe-list__row" key={boardId}>
              <BoardThumbnail
                boardId={boardId}
                {...(thumbnailStore === undefined ? {} : { store: thumbnailStore })}
              />
              <input
                aria-label={`Rename ${board.name}`}
                autoFocus
                className="app-control wireframe-list__name-input"
                maxLength={120}
                onBlur={() => (renameDraft.trim().length === 0 ? cancelRename() : commitRename())}
                onChange={(event) => setRenameDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitRename();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelRename();
                  }
                }}
                ref={renameInputRef}
                value={renameDraft}
              />
            </div>
          );
        }
        return (
          <button
            aria-current={active ? 'page' : undefined}
            className="wireframe-list__row"
            draggable
            key={boardId}
            onClick={() => onSelectBoard(boardId)}
            onDoubleClick={() => beginRename(boardId)}
            onDragEnd={() => {
              draggedBoardIdRef.current = undefined;
            }}
            onDragOver={(event) => {
              if (draggedBoardIdRef.current !== undefined) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }
            }}
            onDragStart={(event) => {
              draggedBoardIdRef.current = boardId;
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDrop={(event) => {
              const draggedBoardId = draggedBoardIdRef.current;
              draggedBoardIdRef.current = undefined;
              if (draggedBoardId !== undefined) {
                event.preventDefault();
                onReorderBoard(draggedBoardId, index);
              }
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            ref={(node) => {
              if (node === null) {
                rowRefs.current.delete(boardId);
              } else {
                rowRefs.current.set(boardId, node);
              }
            }}
            tabIndex={active ? 0 : -1}
            type="button"
          >
            <BoardThumbnail
              boardId={boardId}
              {...(thumbnailStore === undefined ? {} : { store: thumbnailStore })}
            />
            <span className="wireframe-list__name">{board.name}</span>
          </button>
        );
      })}
      {activeBoardId === undefined || activeBoard === undefined ? null : (
        <BoardVersionPanel
          canonicalBoardId={activeBoardId}
          document={document}
          onCreateAlternate={onCreateAlternate}
          onDuplicateAlternate={onDuplicateAlternate}
          onMergeAlternate={onMergeAlternate}
          onPromoteAlternate={onPromoteAlternate}
          onRenameAlternate={onRenameAlternate}
          onRequestDiscardAlternate={onRequestDiscardAlternate}
          onSelectVersion={onSelectVersion}
        />
      )}
      <div className="wireframe-list__actions">
        <AppButton
          disabled={!canTrashActive}
          onClick={() => {
            if (canTrashActive) {
              onRequestTrashBoard(activeBoardId);
            }
          }}
          tone="danger"
        >
          {activeBoard === undefined
            ? 'Move Board to Trash'
            : `Move “${activeBoard.name}” to Trash`}
        </AppButton>
      </div>
      {document.trashedBoardIds.length === 0 ? null : (
        <section aria-label="Trashed wireframes" className="wireframe-list__trash">
          <h3>Trash ({document.trashedBoardIds.length})</h3>
          {document.trashedBoardIds.map((boardId) => {
            const board = document.boardsById[boardId];
            return board === undefined ? null : (
              <div className="wireframe-list__trash-row" key={boardId}>
                <span title={board.name}>{board.name}</span>
                <AppButton onClick={() => onRestoreBoard(boardId)}>Restore</AppButton>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
};
