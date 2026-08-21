import { AppButton } from '../design/AppButton';
import {
  AppModal,
  AppModalActions,
  AppModalHeading,
  AppModalList,
  AppModalNotice,
  AppModalRow,
} from '../design/AppModal';
import type { ProjectSessionDialog } from './project-session';
import type { UserOperationProblem } from '../../shared/user-operation';

interface ProjectDecisionDialogProps {
  readonly busy: boolean;
  readonly dialog: ProjectSessionDialog;
  readonly onDismiss: () => void;
  readonly onDiscardRecovery: (recoveryId: string) => void;
  readonly onOpenFile: () => void;
  readonly onOpenRecent: (recentProjectId: string) => void;
  readonly onRestoreRecovery: (recoveryId: string) => void;
  readonly onStartNew: () => void;
  readonly problem?: UserOperationProblem;
}

const formatCaptureTime = (capturedAtEpochMs: number): string => {
  const capturedAt = new Date(capturedAtEpochMs);
  if (Number.isNaN(capturedAt.getTime())) {
    return 'Time unavailable';
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(capturedAt);
  } catch {
    return 'Time unavailable';
  }
};

export const ProjectDecisionDialog = ({
  busy,
  dialog,
  onDismiss,
  onDiscardRecovery,
  onOpenFile,
  onOpenRecent,
  onRestoreRecovery,
  onStartNew,
  problem,
}: ProjectDecisionDialogProps) => {
  if (dialog.kind === 'startup-problem') {
    return (
      <AppModal
        describedBy="project-startup-problem-copy"
        labelledBy="project-startup-problem-title"
        role="alertdialog"
      >
        <AppModalHeading
          description={dialog.problem.message}
          descriptionId="project-startup-problem-copy"
          eyebrow="Project safety"
          title={dialog.problem.title}
          titleId="project-startup-problem-title"
        />
        <AppModalActions>
          <AppButton disabled={busy} initialFocus onClick={onStartNew} tone="primary">
            Start New
          </AppButton>
        </AppModalActions>
      </AppModal>
    );
  }

  if (dialog.kind === 'recent-projects') {
    return (
      <AppModal
        describedBy="recent-projects-copy"
        labelledBy="recent-projects-title"
        onDismiss={onDismiss}
      >
        <AppModalHeading
          description="The selected file is checked before your current project is asked to close."
          descriptionId="recent-projects-copy"
          eyebrow="Open project"
          title="Recent projects"
          titleId="recent-projects-title"
        />
        {problem === undefined ? null : (
          <AppModalNotice>
            {problem.title}: {problem.message}
          </AppModalNotice>
        )}
        {dialog.projects.length === 0 ? (
          <p className="app-modal__empty">No recent projects are available yet.</p>
        ) : (
          <AppModalList>
            {dialog.projects.map((project) => (
              <AppModalRow
                actions={
                  <AppButton disabled={busy} onClick={() => onOpenRecent(project.id)}>
                    Open
                  </AppButton>
                }
                key={project.id}
                primary={project.displayName}
                secondary={formatCaptureTime(project.lastOpenedAtEpochMs)}
              />
            ))}
          </AppModalList>
        )}
        <AppModalActions split>
          <AppButton disabled={busy} initialFocus onClick={onDismiss}>
            Cancel
          </AppButton>
          <AppButton disabled={busy} onClick={onOpenFile} tone="primary">
            Open Another File…
          </AppButton>
        </AppModalActions>
      </AppModal>
    );
  }

  return (
    <AppModal
      describedBy="project-recovery-copy"
      labelledBy="project-recovery-title"
      role="alertdialog"
    >
      <AppModalHeading
        description="Restore a recovery point, discard it explicitly, or start a new project while keeping it for later."
        descriptionId="project-recovery-copy"
        eyebrow="Crash recovery"
        title="Unsaved work is available"
        titleId="project-recovery-title"
      />
      {problem === undefined ? null : (
        <AppModalNotice>
          {problem.title}: {problem.message}
        </AppModalNotice>
      )}
      {dialog.ignoredEvidenceCount > 0 ? (
        <AppModalNotice>
          {dialog.ignoredEvidenceCount} damaged recovery item
          {dialog.ignoredEvidenceCount === 1 ? ' was' : 's were'} kept for diagnostics and ignored.
        </AppModalNotice>
      ) : null}
      <AppModalList>
        {dialog.recoveries.map((recovery, index) => (
          <AppModalRow
            actions={
              <>
                <AppButton disabled={busy} onClick={() => onDiscardRecovery(recovery.id)}>
                  Discard
                </AppButton>
                <AppButton
                  disabled={busy}
                  initialFocus={index === 0}
                  onClick={() => onRestoreRecovery(recovery.id)}
                  tone="primary"
                >
                  Restore
                </AppButton>
              </>
            }
            key={recovery.id}
            primary={recovery.displayName}
            secondary={formatCaptureTime(recovery.capturedAtEpochMs)}
          />
        ))}
      </AppModalList>
      <AppModalActions>
        <AppButton disabled={busy} onClick={onStartNew}>
          Start New and Keep Recovery
        </AppButton>
      </AppModalActions>
    </AppModal>
  );
};
