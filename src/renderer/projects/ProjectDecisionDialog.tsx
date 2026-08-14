import type { ProjectSessionDialog } from './project-session';

interface ProjectDecisionDialogProps {
  readonly busy: boolean;
  readonly dialog: ProjectSessionDialog;
  readonly onDismiss: () => void;
  readonly onDiscardRecovery: (recoveryId: string) => void;
  readonly onOpenFile: () => void;
  readonly onOpenRecent: (recentProjectId: string) => void;
  readonly onRestoreRecovery: (recoveryId: string) => void;
  readonly onStartNew: () => void;
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
}: ProjectDecisionDialogProps) => {
  if (dialog.kind === 'startup-problem') {
    return (
      <div className="project-dialog-backdrop">
        <section
          aria-describedby="project-startup-problem-copy"
          aria-labelledby="project-startup-problem-title"
          aria-modal="true"
          className="project-dialog"
          role="alertdialog"
        >
          <div className="project-dialog__heading">
            <span className="project-dialog__eyebrow">Project safety</span>
            <h2 id="project-startup-problem-title">{dialog.problem.title}</h2>
            <p id="project-startup-problem-copy">{dialog.problem.message}</p>
          </div>
          <div className="project-dialog__actions">
            <button
              className="project-dialog__button project-dialog__button--primary"
              disabled={busy}
              onClick={onStartNew}
            >
              Start New
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (dialog.kind === 'recent-projects') {
    return (
      <div className="project-dialog-backdrop">
        <section
          aria-labelledby="recent-projects-title"
          aria-modal="true"
          className="project-dialog"
          role="dialog"
        >
          <div className="project-dialog__heading">
            <span className="project-dialog__eyebrow">Open project</span>
            <h2 id="recent-projects-title">Recent projects</h2>
            <p>The selected file is checked before your current project is asked to close.</p>
          </div>
          {dialog.projects.length === 0 ? (
            <p className="project-dialog__empty">No recent projects are available yet.</p>
          ) : (
            <ul className="project-dialog__list">
              {dialog.projects.map((project) => (
                <li className="project-dialog__row" key={project.id}>
                  <div className="project-dialog__row-copy">
                    <strong>{project.displayName}</strong>
                    <span>{formatCaptureTime(project.lastOpenedAtEpochMs)}</span>
                  </div>
                  <button disabled={busy} onClick={() => onOpenRecent(project.id)}>
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="project-dialog__actions project-dialog__actions--split">
            <button disabled={busy} onClick={onDismiss}>
              Cancel
            </button>
            <button
              className="project-dialog__button--primary"
              disabled={busy}
              onClick={onOpenFile}
            >
              Open Another File…
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="project-dialog-backdrop">
      <section
        aria-describedby="project-recovery-copy"
        aria-labelledby="project-recovery-title"
        aria-modal="true"
        className="project-dialog"
        role="alertdialog"
      >
        <div className="project-dialog__heading">
          <span className="project-dialog__eyebrow">Crash recovery</span>
          <h2 id="project-recovery-title">Unsaved work is available</h2>
          <p id="project-recovery-copy">
            Restore a recovery point, discard it explicitly, or start a new project while keeping it
            for later.
          </p>
        </div>
        {dialog.ignoredEvidenceCount > 0 ? (
          <p className="project-dialog__evidence-note">
            {dialog.ignoredEvidenceCount} damaged recovery item
            {dialog.ignoredEvidenceCount === 1 ? ' was' : 's were'} kept for diagnostics and
            ignored.
          </p>
        ) : null}
        <ul className="project-dialog__list">
          {dialog.recoveries.map((recovery) => (
            <li className="project-dialog__row" key={recovery.id}>
              <div className="project-dialog__row-copy">
                <strong>{recovery.displayName}</strong>
                <span>{formatCaptureTime(recovery.capturedAtEpochMs)}</span>
              </div>
              <div className="project-dialog__row-actions">
                <button disabled={busy} onClick={() => onDiscardRecovery(recovery.id)}>
                  Discard
                </button>
                <button
                  className="project-dialog__button--primary"
                  disabled={busy}
                  onClick={() => onRestoreRecovery(recovery.id)}
                >
                  Restore
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="project-dialog__actions">
          <button disabled={busy} onClick={onStartNew}>
            Start New and Keep Recovery
          </button>
        </div>
      </section>
    </div>
  );
};
