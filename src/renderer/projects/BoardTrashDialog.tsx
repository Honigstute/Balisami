import type { Board } from '../../domain';
import { AppButton } from '../design/AppButton';
import { AppModal, AppModalActions, AppModalHeading } from '../design/AppModal';

interface BoardTrashDialogProps {
  readonly board: Board;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export const BoardTrashDialog = ({ board, onCancel, onConfirm }: BoardTrashDialogProps) => (
  <AppModal
    describedBy="board-trash-copy"
    labelledBy="board-trash-title"
    onDismiss={onCancel}
    role="alertdialog"
  >
    <AppModalHeading
      description="Its controls, note, assets, and links will stay in this project. You can restore the board from the navigator’s Trash section."
      descriptionId="board-trash-copy"
      eyebrow="Recoverable delete"
      title={`Move “${board.name}” to Trash?`}
      titleId="board-trash-title"
    />
    <AppModalActions split>
      <AppButton initialFocus onClick={onCancel}>
        Cancel
      </AppButton>
      <AppButton onClick={onConfirm} tone="danger">
        Move to Trash
      </AppButton>
    </AppModalActions>
  </AppModal>
);
