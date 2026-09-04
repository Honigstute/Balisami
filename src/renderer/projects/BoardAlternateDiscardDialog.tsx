import type { Board } from '../../domain';
import { AppButton } from '../design/AppButton';
import { AppModal, AppModalActions, AppModalHeading } from '../design/AppModal';

interface BoardAlternateDiscardDialogProps {
  readonly alternate: Board;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export const BoardAlternateDiscardDialog = ({
  alternate,
  onCancel,
  onConfirm,
}: BoardAlternateDiscardDialogProps) => (
  <AppModal
    describedBy="board-alternate-discard-copy"
    labelledBy="board-alternate-discard-title"
    onDismiss={onCancel}
    role="alertdialog"
  >
    <AppModalHeading
      description="This removes the alternate and its controls from the project. You can restore the complete version with Undo."
      descriptionId="board-alternate-discard-copy"
      eyebrow="Undoable discard"
      title={`Discard “${alternate.name}”?`}
      titleId="board-alternate-discard-title"
    />
    <AppModalActions split>
      <AppButton initialFocus onClick={onCancel}>
        Cancel
      </AppButton>
      <AppButton onClick={onConfirm} tone="danger">
        Discard Alternate
      </AppButton>
    </AppModalActions>
  </AppModal>
);
