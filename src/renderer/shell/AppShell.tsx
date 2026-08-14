import { useState, type CSSProperties, type ReactNode } from 'react';

import { DESIGN_TOKENS } from '../../shared/design-tokens';
import {
  SHELL_LAYOUT_ATTRIBUTES,
  SHELL_REGION_ATTRIBUTE,
  SHELL_REGIONS,
  type ShellRegion,
} from '../../shared/shell-layout';
import { AppNoticeCenter } from '../design/AppNoticeCenter';
import { NoticeCenterStore } from '../design/notice-center';
import { RegionErrorBoundary } from '../design/RegionErrorBoundary';
import { FoundationMark, Icon, type IconName } from './Icon';
import { PaneResizeHandle } from './PaneResizeHandle';
import { useShellPreferences } from './use-shell-preferences';

export type StatusTone = 'problem' | 'quiet' | 'ready';

export interface AppShellRegionContent {
  readonly canvas?: ReactNode;
  readonly inspector?: ReactNode;
  readonly navigator?: ReactNode;
  readonly shelf?: ReactNode;
}

interface AppShellProps {
  readonly projectName?: string;
  readonly projectOverlay?: ReactNode;
  readonly projectProbeState?: { readonly attributeName: string; readonly value: string };
  readonly quickAddShortcut: string;
  readonly regionContent?: AppShellRegionContent;
  readonly statusLabel: string;
  readonly statusScope?: string;
  readonly statusTone: StatusTone;
}

const categories = [
  'All',
  'Common',
  'Forms',
  'Buttons',
  'Containers',
  'Layout',
  'Text',
  'Markup',
] as const;

const toolbarActions: ReadonlyArray<{ readonly label: string; readonly icon: IconName }> = [
  { label: 'Undo', icon: 'undo' },
  { label: 'Redo', icon: 'redo' },
  { label: 'Zoom out', icon: 'zoomOut' },
  { label: 'Zoom in', icon: 'zoomIn' },
  { label: 'Present', icon: 'presentation' },
];

const shellRegion = (region: ShellRegion): Readonly<Record<string, string>> =>
  Object.freeze({ [SHELL_REGION_ATTRIBUTE]: region });

type ShellGridStyle = CSSProperties & {
  readonly '--inspector-current-width': string;
  readonly '--navigator-current-width': string;
};

const LibraryPlaceholders = () => (
  <div aria-label="Control library is loading" className="library-placeholders" role="status">
    {Array.from({ length: 10 }, (_, index) => (
      <div className="library-placeholder" key={index}>
        <span className="library-placeholder__preview" />
        <span className="library-placeholder__label" />
      </div>
    ))}
    <span className="visually-hidden">Control definitions are not available yet.</span>
  </div>
);

export const AppShell = ({
  projectName = 'Untitled project',
  projectOverlay,
  projectProbeState,
  quickAddShortcut,
  regionContent = {},
  statusLabel,
  statusScope = 'Foundation · local-first',
  statusTone,
}: AppShellProps) => {
  const [noticeStore] = useState(() => new NoticeCenterStore());
  const shell = useShellPreferences();
  const navigatorTrackWidth = shell.preferences.navigator.collapsed
    ? DESIGN_TOKENS.shell.collapsedPaneWidth
    : shell.preferences.navigator.width;
  const inspectorTrackWidth = shell.preferences.inspector.collapsed
    ? DESIGN_TOKENS.shell.collapsedPaneWidth
    : shell.preferences.inspector.width;
  const gridStyle: ShellGridStyle = {
    '--inspector-current-width': `${String(inspectorTrackWidth)}px`,
    '--navigator-current-width': `${String(navigatorTrackWidth)}px`,
  };

  return (
    <div
      {...(projectProbeState === undefined
        ? {}
        : { [projectProbeState.attributeName]: projectProbeState.value })}
      {...shellRegion(SHELL_REGIONS.root)}
      className="app-shell"
      {...{
        [SHELL_LAYOUT_ATTRIBUTES.inspectorWidth]: String(inspectorTrackWidth),
        [SHELL_LAYOUT_ATTRIBUTES.navigatorWidth]: String(navigatorTrackWidth),
      }}
      data-testid="app-shell"
      style={gridStyle}
    >
      <header {...shellRegion(SHELL_REGIONS.command)} className="command-bar">
        <div className="project-identity">
          <FoundationMark />
          <div className="project-identity__copy">
            <span className="project-identity__app">Balsamic</span>
            <span className="project-identity__project">{projectName}</span>
          </div>
        </div>

        <div aria-label="Editor actions" className="command-bar__actions" role="toolbar">
          {toolbarActions.map(({ icon, label }) => (
            <button
              aria-label={label}
              className="icon-button icon-button--dark"
              disabled
              key={label}
            >
              <Icon name={icon} />
            </button>
          ))}
        </div>

        <div className="quick-add" role="search">
          <Icon name="search" />
          <input aria-label="Quick add" disabled placeholder="Quick add" type="search" />
          <kbd>{quickAddShortcut}</kbd>
        </div>
      </header>

      <div
        {...shellRegion(SHELL_REGIONS.status)}
        className={`status-bar status-bar--${statusTone}`}
        role="status"
      >
        <span className="status-bar__indicator" />
        <span className="status-bar__label">{statusLabel}</span>
        <span className="status-bar__scope">{statusScope}</span>
      </div>

      <nav
        {...shellRegion(SHELL_REGIONS.categories)}
        aria-label="Control categories"
        className="category-bar"
      >
        {categories.map((category, index) => (
          <button
            aria-current={index === 0 ? 'page' : undefined}
            className="category-tab"
            disabled
            key={category}
          >
            {category}
          </button>
        ))}
      </nav>

      <section
        {...shellRegion(SHELL_REGIONS.shelf)}
        aria-label="Control library"
        className="control-shelf"
      >
        <RegionErrorBoundary
          noticeStore={noticeStore}
          regionKey="shelf"
          regionName="Control library"
        >
          {regionContent.shelf ?? (
            <>
              <LibraryPlaceholders />
              <button aria-label="More controls" className="icon-button" disabled>
                <Icon name="more" />
              </button>
            </>
          )}
        </RegionErrorBoundary>
      </section>

      <aside
        {...shellRegion(SHELL_REGIONS.navigator)}
        aria-label="Wireframes"
        className={`navigator-panel${shell.preferences.navigator.collapsed ? ' pane--collapsed' : ''}`}
      >
        <div className="panel-header">
          <h2>Wireframes</h2>
          <div className="panel-header__actions">
            <button
              aria-label="Wireframe options"
              className="icon-button panel-action--optional"
              disabled
            >
              <Icon name="more" />
            </button>
            <button
              aria-expanded={!shell.preferences.navigator.collapsed}
              aria-label={
                shell.preferences.navigator.collapsed
                  ? 'Expand Wireframes navigator'
                  : 'Collapse Wireframes navigator'
              }
              className={`icon-button pane-toggle pane-toggle--navigator${shell.preferences.navigator.collapsed ? ' pane-toggle--collapsed' : ''}`}
              onClick={() =>
                shell.setPaneCollapsed('navigator', !shell.preferences.navigator.collapsed)
              }
            >
              <Icon name="chevron" />
            </button>
          </div>
        </div>
        <RegionErrorBoundary
          noticeStore={noticeStore}
          regionKey="navigator"
          regionName="Wireframes navigator"
        >
          {regionContent.navigator ?? (
            <div className="panel-empty panel-empty--navigator">
              <div aria-hidden="true" className="empty-thumbnail">
                <span />
                <span />
                <span />
              </div>
              <strong>No wireframes yet</strong>
              <p>The document model will create and order them here.</p>
            </div>
          )}
        </RegionErrorBoundary>
      </aside>

      <main
        {...shellRegion(SHELL_REGIONS.canvas)}
        aria-label="Canvas viewport"
        className="canvas-viewport"
        data-testid="canvas-viewport"
      >
        <RegionErrorBoundary noticeStore={noticeStore} regionKey="canvas" regionName="Canvas">
          {regionContent.canvas ?? (
            <div className="canvas-empty">
              <div aria-hidden="true" className="canvas-empty__frame">
                <span className="canvas-empty__handle canvas-empty__handle--top-left" />
                <span className="canvas-empty__handle canvas-empty__handle--top-right" />
                <span className="canvas-empty__handle canvas-empty__handle--bottom-left" />
                <span className="canvas-empty__handle canvas-empty__handle--bottom-right" />
                <span className="canvas-empty__line" />
                <span className="canvas-empty__button" />
              </div>
              <h1>Built for quick thinking</h1>
              <p>
                The canvas, selection model, and smart guides attach here without changing the
                shell.
              </p>
            </div>
          )}
        </RegionErrorBoundary>
      </main>

      <aside
        {...shellRegion(SHELL_REGIONS.inspector)}
        aria-label="Inspector"
        className={`inspector-panel${shell.preferences.inspector.collapsed ? ' pane--collapsed' : ''}`}
      >
        <div className="panel-header panel-header--inspector">
          <h2>Inspector</h2>
          <button
            aria-expanded={!shell.preferences.inspector.collapsed}
            aria-label={
              shell.preferences.inspector.collapsed ? 'Expand Inspector' : 'Collapse Inspector'
            }
            className={`icon-button pane-toggle pane-toggle--inspector${shell.preferences.inspector.collapsed ? ' pane-toggle--collapsed' : ''}`}
            onClick={() =>
              shell.setPaneCollapsed('inspector', !shell.preferences.inspector.collapsed)
            }
          >
            <Icon name="chevron" />
          </button>
        </div>
        <RegionErrorBoundary noticeStore={noticeStore} regionKey="inspector" regionName="Inspector">
          {regionContent.inspector ?? (
            <>
              <div className="inspector-scroll">
                <section className="inspector-section">
                  <h3>Nothing selected</h3>
                  <p>Select an element on the canvas to edit its position, size, and appearance.</p>
                </section>
                <section className="inspector-section inspector-section--notes">
                  <div className="inspector-section__heading">
                    <h3>Notes</h3>
                    <span>Board</span>
                  </div>
                  <div className="notes-placeholder">
                    Notes will stay with the active wireframe.
                  </div>
                </section>
              </div>
              <div className="inspector-footer">
                <span>Alternate versions</span>
                <button aria-label="Add alternate version" className="icon-button" disabled>
                  <span aria-hidden="true">+</span>
                </button>
              </div>
            </>
          )}
        </RegionErrorBoundary>
      </aside>

      <PaneResizeHandle
        collapsed={shell.preferences.navigator.collapsed}
        currentWidth={shell.preferences.navigator.width}
        onCancel={(originalWidth) => shell.cancelPaneWidthPreview('navigator', originalWidth)}
        onCommit={(width) => shell.commitPaneWidth('navigator', width)}
        onPreview={(width) => shell.previewPaneWidth('navigator', width)}
        pane="navigator"
      />
      <PaneResizeHandle
        collapsed={shell.preferences.inspector.collapsed}
        currentWidth={shell.preferences.inspector.width}
        onCancel={(originalWidth) => shell.cancelPaneWidthPreview('inspector', originalWidth)}
        onCommit={(width) => shell.commitPaneWidth('inspector', width)}
        onPreview={(width) => shell.previewPaneWidth('inspector', width)}
        pane="inspector"
      />

      <div className="overlay-root" id="overlay-root">
        <AppNoticeCenter store={noticeStore} />
        {projectOverlay}
      </div>
    </div>
  );
};
