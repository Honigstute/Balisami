import type { ReactNode } from 'react';

import {
  PROJECT_HOME_ACTION_ATTRIBUTE,
  PROJECT_HOME_ACTIONS,
  PROJECT_HOME_REGION_ATTRIBUTE,
  PROJECT_HOME_REGIONS,
} from '../../shared/project-home';
import type { RecentProjectSummary, UserOperationProblem } from '../../shared/user-operation';
import { AppButton } from '../design/AppButton';
import { FoundationMark } from '../shell/Icon';

interface ProjectHomeProps {
  readonly busy: boolean;
  readonly overlay?: ReactNode;
  readonly problem?: UserOperationProblem;
  readonly recentProjects?: readonly RecentProjectSummary[];
  readonly onNewProject: () => void;
  readonly onOpenProject: () => void;
  readonly onOpenRecent: (recentProjectId: string) => void;
}

const formatLastUsed = (timestamp: number): string => {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    return 'Last used time unavailable';
  }
  try {
    return `Last used ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value)}`;
  } catch {
    return 'Last used time unavailable';
  }
};

const WireframeSheet = ({ compact = false }: { readonly compact?: boolean }) => (
  <svg
    aria-hidden="true"
    className={compact ? 'project-home__sheet project-home__sheet--compact' : 'project-home__sheet'}
    viewBox="0 0 160 116"
  >
    <rect className="project-home__sheet-paper" height="104" rx="4" width="144" x="8" y="4" />
    <path className="project-home__sheet-line" d="M28 30h66M28 44h104M28 58h86" />
    <rect className="project-home__sheet-button" height="22" rx="5" width="54" x="28" y="72" />
    <path className="project-home__sheet-accent" d="M17 4v12M8 13h18M143 96v12m-9-9h18" />
  </svg>
);

/** Startup project chooser. No document or editor shell exists until the user makes a choice. */
export const ProjectHome = ({
  busy,
  onNewProject,
  onOpenProject,
  onOpenRecent,
  overlay,
  problem,
  recentProjects,
}: ProjectHomeProps) => {
  const loading = recentProjects === undefined;
  const disabled = busy || loading;

  return (
    <div
      aria-busy={busy || loading}
      className="project-home"
      {...{ [PROJECT_HOME_REGION_ATTRIBUTE]: PROJECT_HOME_REGIONS.root }}
    >
      <header className="project-home__header">
        <div className="project-home__brand">
          <FoundationMark />
          <span>Balsamic</span>
        </div>
        <span className="project-home__local">Local workspace</span>
      </header>

      <main
        aria-label="Balsamic home"
        className="project-home__main"
        {...{ [PROJECT_HOME_REGION_ATTRIBUTE]: PROJECT_HOME_REGIONS.main }}
      >
        <section
          aria-labelledby="project-home-title"
          className="project-home__start"
          {...{ [PROJECT_HOME_REGION_ATTRIBUTE]: PROJECT_HOME_REGIONS.start }}
        >
          <div className="project-home__illustration">
            <WireframeSheet />
          </div>
          <p className="project-home__eyebrow">Start</p>
          <h1 id="project-home-title">What will you sketch?</h1>
          <p className="project-home__intro">
            Begin with a clean wireframe or open a project already on this device.
          </p>
          <div className="project-home__actions">
            <AppButton
              disabled={disabled}
              onClick={onNewProject}
              tone="primary"
              {...{ [PROJECT_HOME_ACTION_ATTRIBUTE]: PROJECT_HOME_ACTIONS.newProject }}
            >
              New project
            </AppButton>
            <AppButton
              disabled={disabled}
              onClick={onOpenProject}
              {...{ [PROJECT_HOME_ACTION_ATTRIBUTE]: PROJECT_HOME_ACTIONS.openProject }}
            >
              Open project…
            </AppButton>
          </div>
        </section>

        <section
          aria-labelledby="recent-projects-heading"
          className="project-home__recent-section"
          {...{ [PROJECT_HOME_REGION_ATTRIBUTE]: PROJECT_HOME_REGIONS.recent }}
        >
          <div className="project-home__section-heading">
            <div>
              <p className="project-home__eyebrow">Continue</p>
              <h2 id="recent-projects-heading">Recent projects</h2>
            </div>
            {!loading && recentProjects.length > 0 ? (
              <span>{recentProjects.length} available</span>
            ) : null}
          </div>

          <div aria-live="polite" className="project-home__feedback">
            {problem === undefined ? null : (
              <div className="project-home__problem" role="alert">
                <strong>{problem.title}</strong>
                <span>{problem.message}</span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="project-home__loading" role="status">
              <span className="project-home__loading-row" />
              <span className="project-home__loading-row" />
              <span className="visually-hidden">Loading recent projects…</span>
            </div>
          ) : recentProjects.length === 0 ? (
            <div className="project-home__empty">
              <WireframeSheet compact />
              <h3>No recent projects yet</h3>
              <p>Projects appear here after you save or open them.</p>
            </div>
          ) : (
            <div className="project-home__recent-list">
              {recentProjects.map((project, index) => (
                <button
                  aria-label={`Open ${project.displayName}`}
                  className="project-home__recent-project"
                  disabled={busy}
                  key={project.id}
                  onClick={() => onOpenRecent(project.id)}
                  title={project.displayName}
                  type="button"
                >
                  <span aria-hidden="true" className="project-home__file-mark">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="project-home__recent-copy">
                    <strong>{project.displayName}</strong>
                    <span>{formatLastUsed(project.lastOpenedAtEpochMs)}</span>
                  </span>
                  {index === 0 ? (
                    <span className="project-home__last-badge">Last project</span>
                  ) : null}
                  <svg aria-hidden="true" className="project-home__open-arrow" viewBox="0 0 16 16">
                    <path d="m6 3 5 5-5 5M3 8h8" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="project-home__footer">
        <span>Projects stay on this device.</span>
        <span>Recovery stays active while you work.</span>
      </footer>
      {overlay}
    </div>
  );
};
