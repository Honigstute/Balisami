import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { BoardId } from '../../domain';
import { AppPopover } from '../design/AppPopover';
import { Icon } from '../shell/Icon';
import type { SelectionStore } from '../editor/selection-store';

export type BoardExportFormat = 'pdf' | 'png' | 'svg';
export type BoardExportMenuScope = 'all' | 'boards' | 'current' | 'selection';

export interface ExportMenuBoard {
  readonly id: BoardId;
  readonly name: string;
}

interface ExportMenuProps {
  readonly boards: readonly ExportMenuBoard[];
  readonly currentBoardId: BoardId;
  readonly disabled?: boolean;
  readonly onExport: (
    format: BoardExportFormat,
    scope: BoardExportMenuScope,
    boardIds?: readonly BoardId[],
  ) => void;
  readonly selectionStore: SelectionStore;
}

export const ExportMenu = ({
  boards,
  currentBoardId,
  disabled = false,
  onExport,
  selectionStore,
}: ExportMenuProps) => {
  const [open, setOpen] = useState(false);
  const firstActionRef = useRef<HTMLButtonElement | null>(null);
  const selection = useSyncExternalStore(
    selectionStore.subscribe,
    selectionStore.getSnapshot,
    selectionStore.getSnapshot,
  );
  const hasSelection = selection.selectedIds.length > 0;
  const [chosenBoardIds, setChosenBoardIds] = useState<readonly BoardId[]>([currentBoardId]);

  useEffect(() => {
    if (open) firstActionRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    const available = new Set(boards.map((board) => board.id));
    setChosenBoardIds((current) => {
      const retained = current.filter((boardId) => available.has(boardId));
      return retained.length > 0 ? retained : [currentBoardId];
    });
  }, [boards, currentBoardId]);

  const choose = (
    format: BoardExportFormat,
    scope: BoardExportMenuScope,
    boardIds?: readonly BoardId[],
  ): void => {
    setOpen(false);
    if (boardIds === undefined) onExport(format, scope);
    else onExport(format, scope, boardIds);
  };

  return (
    <AppPopover
      label="Export wireframe"
      onOpenChange={setOpen}
      open={open}
      trigger={(triggerProps) => (
        <button
          {...triggerProps}
          aria-label="Export wireframe"
          className="icon-button icon-button--dark"
          disabled={disabled}
          title="Export"
          type="button"
        >
          <Icon name="export" />
        </button>
      )}
    >
      <div className="export-menu">
        <strong>Export wireframe</strong>
        <span>Uses the selected alternate and exact canvas bounds.</span>
        <div className="export-menu__actions">
          <button onClick={() => choose('png', 'current')} ref={firstActionRef} type="button">
            <span>PNG image</span>
            <small>Current wireframe · 2×</small>
          </button>
          <button onClick={() => choose('svg', 'current')} type="button">
            <span>SVG image</span>
            <small>Current wireframe · editable vector</small>
          </button>
          <button onClick={() => choose('pdf', 'current')} type="button">
            <span>Current as PDF</span>
            <small>One print-ready page with links</small>
          </button>
          <button onClick={() => choose('pdf', 'all')} type="button">
            <span>All wireframes as PDF</span>
            <small>One ordered page per selected alternate</small>
          </button>
          {boards.length > 1 ? (
            <fieldset className="export-menu__boards">
              <legend>Choose PDF pages</legend>
              {boards.map((board) => (
                <label key={board.id}>
                  <input
                    checked={chosenBoardIds.includes(board.id)}
                    onChange={(event) =>
                      setChosenBoardIds((current) =>
                        event.currentTarget.checked
                          ? [...current, board.id]
                          : current.filter((boardId) => boardId !== board.id),
                      )
                    }
                    type="checkbox"
                  />
                  <span>{board.name}</span>
                </label>
              ))}
              <button
                disabled={chosenBoardIds.length === 0}
                onClick={() => choose('pdf', 'boards', chosenBoardIds)}
                type="button"
              >
                <span>Chosen wireframes as PDF</span>
                <small>{String(chosenBoardIds.length)} pages in navigator order</small>
              </button>
            </fieldset>
          ) : null}
          <button disabled={!hasSelection} onClick={() => choose('png', 'selection')} type="button">
            <span>Selection as PNG</span>
            <small>{hasSelection ? 'Selected controls · 2×' : 'Select controls first'}</small>
          </button>
          <button disabled={!hasSelection} onClick={() => choose('svg', 'selection')} type="button">
            <span>Selection as SVG</span>
            <small>{hasSelection ? 'Selected controls · vector' : 'Select controls first'}</small>
          </button>
        </div>
      </div>
    </AppPopover>
  );
};
