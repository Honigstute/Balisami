import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import type { Board, BoardId } from '../../domain';

interface BoardNoteEditorProps {
  readonly board: Board;
  readonly onCommit: (boardId: BoardId, text: string) => boolean;
}

export const BoardNoteEditor = ({ board, onCommit }: BoardNoteEditorProps) => {
  const descriptionId = `board-note-description-${useId()}`;
  const validationId = `board-note-validation-${useId()}`;
  const cancelBlurRef = useRef(false);
  const [draft, setDraft] = useState(board.note.text);
  const [validation, setValidation] = useState<string>();

  useEffect(() => {
    setDraft(board.note.text);
    setValidation(undefined);
  }, [board.id, board.note.text]);

  const commit = (): boolean => {
    if (draft === board.note.text) {
      setValidation(undefined);
      return true;
    }
    if (!onCommit(board.id, draft)) {
      setValidation('The board note could not be saved.');
      return false;
    }
    setValidation(undefined);
    return true;
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelBlurRef.current = true;
      setDraft(board.note.text);
      setValidation(undefined);
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <>
      <section className="inspector-section">
        <h3>Board</h3>
        <p id={descriptionId}>
          Notes stay with “{board.name}” and are included in the project file.
        </p>
      </section>
      <section className="inspector-section inspector-section--notes">
        <div className="inspector-section__heading">
          <h3>Notes</h3>
          <span>{draft === board.note.text ? 'Saved' : 'Unsaved'}</span>
        </div>
        <textarea
          aria-describedby={`${descriptionId}${validation === undefined ? '' : ` ${validationId}`}`}
          aria-label={`Notes for ${board.name}`}
          className="board-note-editor"
          maxLength={100_000}
          onBlur={() => {
            if (cancelBlurRef.current) {
              cancelBlurRef.current = false;
              return;
            }
            commit();
          }}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setValidation(undefined);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Add decisions, context, or review notes for this board."
          spellCheck
          value={draft}
        />
        <span aria-live="polite" className="board-note-editor__validation" id={validationId}>
          {validation ?? ''}
        </span>
      </section>
    </>
  );
};
