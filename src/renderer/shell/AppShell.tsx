import { FoundationMark, Icon, type IconName } from './Icon';

export type StatusTone = 'problem' | 'quiet' | 'ready';

interface AppShellProps {
  readonly projectName?: string;
  readonly quickAddShortcut: string;
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
  quickAddShortcut,
  statusLabel,
  statusScope = 'Foundation · local-first',
  statusTone,
}: AppShellProps) => (
  <div className="app-shell" data-testid="app-shell">
    <header className="command-bar">
      <div className="project-identity">
        <FoundationMark />
        <div className="project-identity__copy">
          <span className="project-identity__app">Balsamic</span>
          <span className="project-identity__project">{projectName}</span>
        </div>
      </div>

      <div aria-label="Editor actions" className="command-bar__actions" role="toolbar">
        {toolbarActions.map(({ icon, label }) => (
          <button aria-label={label} className="icon-button icon-button--dark" disabled key={label}>
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

    <div className={`status-bar status-bar--${statusTone}`} role="status">
      <span className="status-bar__indicator" />
      <span className="status-bar__label">{statusLabel}</span>
      <span className="status-bar__scope">{statusScope}</span>
    </div>

    <nav aria-label="Control categories" className="category-bar">
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

    <section aria-label="Control library" className="control-shelf">
      <LibraryPlaceholders />
      <button aria-label="More controls" className="icon-button" disabled>
        <Icon name="more" />
      </button>
    </section>

    <aside aria-label="Wireframes" className="navigator-panel">
      <div className="panel-header">
        <h2>Wireframes</h2>
        <button aria-label="Wireframe options" className="icon-button" disabled>
          <Icon name="more" />
        </button>
      </div>
      <div className="panel-empty panel-empty--navigator">
        <div aria-hidden="true" className="empty-thumbnail">
          <span />
          <span />
          <span />
        </div>
        <strong>No wireframes yet</strong>
        <p>The document model will create and order them here.</p>
      </div>
    </aside>

    <main aria-label="Canvas viewport" className="canvas-viewport" data-testid="canvas-viewport">
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
        <p>The canvas, selection model, and smart guides attach here without changing the shell.</p>
      </div>
    </main>

    <aside aria-label="Inspector" className="inspector-panel">
      <div className="panel-header panel-header--inspector">
        <h2>Inspector</h2>
        <Icon name="chevron" />
      </div>
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
          <div className="notes-placeholder">Notes will stay with the active wireframe.</div>
        </section>
      </div>
      <div className="inspector-footer">
        <span>Alternate versions</span>
        <button aria-label="Add alternate version" className="icon-button" disabled>
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </aside>

    <div aria-live="polite" className="overlay-root" id="overlay-root" />
  </div>
);
