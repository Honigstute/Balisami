import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { BoardId, ProjectDocument } from '../../domain';
import { AppButton } from '../design/AppButton';
import { AppChoicePopover } from '../design/AppChoicePopover';
import { AppInput } from '../design/AppInput';

const OFFICIAL_VERSION_VALUE = 'official';

interface BoardVersionPanelProps {
  readonly canonicalBoardId: BoardId;
  readonly document: ProjectDocument;
  readonly onCreateAlternate: (canonicalBoardId: BoardId) => boolean;
  readonly onDuplicateAlternate: (canonicalBoardId: BoardId) => boolean;
  readonly onMergeAlternate: (canonicalBoardId: BoardId, alternateId: BoardId) => boolean;
  readonly onPromoteAlternate: (canonicalBoardId: BoardId, alternateId: BoardId) => boolean;
  readonly onRenameAlternate: (alternateId: BoardId, name: string) => boolean;
  readonly onRequestDiscardAlternate: (canonicalBoardId: BoardId, alternateId: BoardId) => void;
  readonly onSelectVersion: (canonicalBoardId: BoardId, alternateId: BoardId | null) => boolean;
}

/** Stable navigator surface for the persisted version selected by canvas and presentation. */
export const BoardVersionPanel = ({
  canonicalBoardId,
  document,
  onCreateAlternate,
  onDuplicateAlternate,
  onMergeAlternate,
  onPromoteAlternate,
  onRenameAlternate,
  onRequestDiscardAlternate,
  onSelectVersion,
}: BoardVersionPanelProps) => {
  const renameInputRef = useRef<HTMLInputElement>(null);
  const canonicalBoard = document.boardsById[canonicalBoardId];
  const selectedAlternate =
    canonicalBoard?.selectedAlternateId === null || canonicalBoard === undefined
      ? undefined
      : document.boardsById[canonicalBoard.selectedAlternateId];
  const [renameDraft, setRenameDraft] = useState(selectedAlternate?.name ?? '');

  useEffect(() => {
    setRenameDraft(selectedAlternate?.name ?? '');
  }, [selectedAlternate?.id, selectedAlternate?.name]);

  if (canonicalBoard === undefined) {
    return null;
  }

  const restoreRenameDraft = (): void => {
    setRenameDraft(selectedAlternate?.name ?? '');
  };
  const commitRename = (): boolean => {
    if (selectedAlternate === undefined) {
      return false;
    }
    const name = renameDraft.trim();
    if (name.length === 0) {
      restoreRenameDraft();
      return false;
    }
    if (name === selectedAlternate.name) {
      setRenameDraft(name);
      return true;
    }
    if (!onRenameAlternate(selectedAlternate.id, name)) {
      queueMicrotask(() => renameInputRef.current?.focus());
      return false;
    }
    setRenameDraft(name);
    return true;
  };
  const onRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      restoreRenameDraft();
      event.currentTarget.select();
    }
  };
  const options = [
    { label: 'Official', value: OFFICIAL_VERSION_VALUE },
    ...canonicalBoard.alternateIds.flatMap((alternateId) => {
      const alternate = document.boardsById[alternateId];
      return alternate === undefined ? [] : [{ label: alternate.name, value: alternate.id }];
    }),
  ];

  return (
    <section aria-label={`${canonicalBoard.name} versions`} className="wireframe-list__versions">
      <h3>Version</h3>
      <AppChoicePopover
        label="Current"
        onChange={(value) => {
          const alternateId = canonicalBoard.alternateIds.find((candidate) => candidate === value);
          if (value === OFFICIAL_VERSION_VALUE || alternateId !== undefined) {
            onSelectVersion(canonicalBoard.id, alternateId ?? null);
          }
        }}
        options={options}
        value={canonicalBoard.selectedAlternateId ?? OFFICIAL_VERSION_VALUE}
      />
      {selectedAlternate === undefined ? null : (
        <AppInput
          inputRef={renameInputRef}
          label="Alternate name"
          maxLength={120}
          onBlur={commitRename}
          onChange={(event) => setRenameDraft(event.currentTarget.value)}
          onKeyDown={onRenameKeyDown}
          value={renameDraft}
        />
      )}
      <div className="wireframe-list__version-actions">
        <AppButton onClick={() => onCreateAlternate(canonicalBoard.id)}>New Alternate</AppButton>
        <AppButton onClick={() => onDuplicateAlternate(canonicalBoard.id)}>
          Duplicate Version
        </AppButton>
        {selectedAlternate === undefined ? null : (
          <>
            <AppButton onClick={() => onPromoteAlternate(canonicalBoard.id, selectedAlternate.id)}>
              Promote to Official
            </AppButton>
            <AppButton onClick={() => onMergeAlternate(canonicalBoard.id, selectedAlternate.id)}>
              Merge into Official
            </AppButton>
            <AppButton
              onClick={() => onRequestDiscardAlternate(canonicalBoard.id, selectedAlternate.id)}
              tone="danger"
            >
              Discard Alternate
            </AppButton>
          </>
        )}
      </div>
    </section>
  );
};
