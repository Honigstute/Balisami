import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import visualFixtureContract from '../visual-fixture-contract.json';
import { VisualConformanceFixture } from '../src/renderer/design/VisualConformanceFixture';
import {
  VISUAL_FIXTURE_NAMES,
  getRequestedVisualFixture,
  isVisualFixtureContractSynchronized,
  parseVisualFixtureInvocation,
} from '../src/shared/visual-fixture';
import { SHELL_LAYOUT_ATTRIBUTES } from '../src/shared/shell-layout';

const renderFixture = (fixture: (typeof VISUAL_FIXTURE_NAMES)[number]) =>
  render(
    <VisualConformanceFixture
      fixture={fixture}
      platform="win32"
      quickAddShortcut="Ctrl K"
      runtimeLabel="Windows · x64 · v0.1.0 · Packaged"
    />,
  );

describe('visual conformance fixture contract', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps the external harness registry exact and rejects malformed invocations', () => {
    expect(isVisualFixtureContractSynchronized()).toBe(true);
    expect(visualFixtureContract.fixtures).toEqual(VISUAL_FIXTURE_NAMES);
    expect(visualFixtureContract.displayScales).toEqual([1, 1.25, 1.5, 2]);
    expect(parseVisualFixtureInvocation([], visualFixtureContract.argumentPrefix)).toEqual({
      kind: 'none',
    });
    expect(
      parseVisualFixtureInvocation(
        [`${visualFixtureContract.argumentPrefix}controls`],
        visualFixtureContract.argumentPrefix,
      ),
    ).toEqual({ fixture: 'controls', kind: 'fixture' });
    expect(
      parseVisualFixtureInvocation(
        [`${visualFixtureContract.argumentPrefix}unknown`],
        visualFixtureContract.argumentPrefix,
      ),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      parseVisualFixtureInvocation(
        [
          `${visualFixtureContract.argumentPrefix}default`,
          `${visualFixtureContract.argumentPrefix}modal`,
        ],
        visualFixtureContract.argumentPrefix,
      ),
    ).toMatchObject({ kind: 'invalid' });
    expect(getRequestedVisualFixture('?visualFixture=popover')).toBe('popover');
    expect(getRequestedVisualFixture('?visualFixture=scene')).toBe('scene');
    expect(getRequestedVisualFixture('?visualFixture=selection')).toBe('selection');
    expect(getRequestedVisualFixture('?visualFixture=move')).toBe('move');
    expect(getRequestedVisualFixture('?visualFixture=smartGuides')).toBe('smartGuides');
    expect(getRequestedVisualFixture('?visualFixture=resize')).toBe('resize');
    expect(getRequestedVisualFixture('?visualFixture=alignSelection')).toBe('alignSelection');
    expect(getRequestedVisualFixture('?visualFixture=delete')).toBe('delete');
    expect(getRequestedVisualFixture('?visualFixture=duplicate')).toBe('duplicate');
    expect(getRequestedVisualFixture('?visualFixture=paste')).toBe('paste');
    expect(getRequestedVisualFixture('?visualFixture=textEdit')).toBe('textEdit');
    expect(getRequestedVisualFixture('?visualFixture=nudge')).toBe('nudge');
    expect(getRequestedVisualFixture('?visualFixture=marquee')).toBe('marquee');
    expect(getRequestedVisualFixture('?visualFixture=viewportZoom')).toBe('viewportZoom');
    expect(getRequestedVisualFixture('?visualFixture=viewportSelectionZoom')).toBe(
      'viewportSelectionZoom',
    );
    expect(getRequestedVisualFixture('?visualFixture=unknown')).toBeUndefined();
  });

  it('renders the viewport percentage and command overlay without replacing the shell', () => {
    renderFixture('viewportZoom');

    expect(screen.getByRole('button', { name: 'Zoom options, 100 percent' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Zoom options' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fit Board/u })).toBeEnabled();
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders an enabled Fit Selection command without replacing the shell', () => {
    renderFixture('viewportSelectionZoom');

    expect(screen.getByRole('button', { name: /Fit Selection/u })).toBeEnabled();
    expect(screen.getByRole('dialog', { name: 'Zoom options' })).toBeInTheDocument();
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('mounts the deterministic document scene fixture inside the unchanged shell', () => {
    const view = renderFixture('scene');

    expect(view.container.querySelector('[data-scene-content="document-elements"]')).not.toBeNull();
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders fixed-screen selection geometry without replacing the scene or shell', () => {
    const view = renderFixture('selection');

    expect(view.container.querySelector('[data-scene-content="document-elements"]')).not.toBeNull();
    const overlay = view.container.querySelector('[data-selection-overlay="bounds"]');
    expect(overlay).not.toHaveAttribute('display', 'none');
    expect(overlay).toHaveAttribute('data-selection-count', '1');
    expect(overlay?.querySelectorAll('.selection-overlay__handle')).toHaveLength(8);
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders a transient move without changing canonical scene geometry or shell layout', () => {
    const view = renderFixture('move');

    const overlay = view.container.querySelector('[data-selection-overlay="bounds"]');
    const outline = overlay?.querySelector('.selection-overlay__outline');
    expect(overlay).not.toHaveAttribute('display', 'none');
    expect(overlay).toHaveAttribute('data-selection-count', '1');
    expect(outline).toHaveAttribute('x', '308');
    expect(outline).toHaveAttribute('y', '332');
    expect(view.container.querySelector('[data-scene-content="document-elements"]')).not.toBeNull();
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders fixed-screen smart guides without changing the scene or shell layout', () => {
    const view = renderFixture('smartGuides');

    const guides = view.container.querySelector('[data-snap-guide-overlay="gesture-guides"]');
    const overlay = view.container.querySelector('[data-selection-overlay="bounds"]');
    expect(guides).not.toHaveAttribute('display', 'none');
    expect(guides).toHaveAttribute('data-guide-count', '2');
    expect(
      guides?.querySelectorAll('.snap-guide-overlay__line:not([display="none"])'),
    ).toHaveLength(2);
    expect(overlay).not.toHaveAttribute('display', 'none');
    expect(view.container.querySelector('[data-scene-content="document-elements"]')).not.toBeNull();
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders a transient resize with aligned fixed-screen handles and stable shell layout', () => {
    const view = renderFixture('resize');

    const overlay = view.container.querySelector('[data-selection-overlay="bounds"]');
    const guides = view.container.querySelector('[data-snap-guide-overlay="gesture-guides"]');
    const outline = overlay?.querySelector('.selection-overlay__outline');
    expect(overlay).not.toHaveAttribute('display', 'none');
    expect(overlay).toHaveAttribute('data-selection-count', '1');
    expect(outline).toHaveAttribute('x', '188');
    expect(outline).toHaveAttribute('y', '272');
    expect(outline).toHaveAttribute('width', '150');
    expect(outline).toHaveAttribute('height', '160');
    expect(guides).not.toHaveAttribute('display', 'none');
    expect(guides).toHaveAttribute('data-guide-count', '2');
    expect(overlay?.querySelectorAll('.selection-overlay__handle')).toHaveLength(8);
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders an accepted three-element alignment with stable multi-selection geometry', () => {
    const view = renderFixture('alignSelection');

    const overlay = view.container.querySelector('[data-selection-overlay="bounds"]');
    const outline = overlay?.querySelector('.selection-overlay__outline');
    expect(view.container.querySelector('[data-scene-content="document-elements"]')).not.toBeNull();
    expect(overlay).toHaveAttribute('data-selection-count', '3');
    expect(outline).toHaveAttribute('x', '188');
    expect(outline).toHaveAttribute('y', '128');
    expect(outline).toHaveAttribute('width', '300');
    expect(outline).toHaveAttribute('height', '188');
    expect(overlay?.querySelectorAll('.selection-overlay__handle')).toHaveLength(8);
    expect(screen.getByText('Visual fixture · alignSelection')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders a coalesced keyboard nudge through the shared translation preview', () => {
    const view = renderFixture('nudge');

    const overlay = view.container.querySelector('[data-selection-overlay="bounds"]');
    const outline = overlay?.querySelector('.selection-overlay__outline');
    expect(overlay).not.toHaveAttribute('display', 'none');
    expect(overlay).toHaveAttribute('data-selection-count', '1');
    expect(outline).toHaveAttribute('x', '248');
    expect(outline).toHaveAttribute('y', '302');
    expect(view.container.querySelector('[data-scene-content="document-elements"]')).not.toBeNull();
    expect(overlay?.querySelectorAll('.selection-overlay__handle')).toHaveLength(8);
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders an accepted delete result without leaving transient selection UI', () => {
    const view = renderFixture('delete');

    expect(view.container.querySelector('[data-scene-content="document-elements"]')).not.toBeNull();
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toBeNull();
    expect(screen.getByText('Visual fixture · delete')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders an accepted duplicate result with only the clone selected', () => {
    const view = renderFixture('duplicate');

    const overlay = view.container.querySelector('[data-selection-overlay="bounds"]');
    const outline = overlay?.querySelector('.selection-overlay__outline');
    expect(overlay).toHaveAttribute('data-selection-count', '1');
    expect(outline).toHaveAttribute('x', '198');
    expect(outline).toHaveAttribute('y', '282');
    expect(screen.getByText('Visual fixture · duplicate')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders an accepted paste result with the offset clone selected', () => {
    const view = renderFixture('paste');

    const overlay = view.container.querySelector('[data-selection-overlay="bounds"]');
    const outline = overlay?.querySelector('.selection-overlay__outline');
    expect(view.container.querySelector('[data-scene-content="document-elements"]')).not.toBeNull();
    expect(overlay).toHaveAttribute('data-selection-count', '1');
    expect(outline).toHaveAttribute('x', '198');
    expect(outline).toHaveAttribute('y', '282');
    expect(screen.getByText('Visual fixture · paste')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders an active fixed-screen text editor without replacing selection or shell geometry', () => {
    const view = renderFixture('textEdit');

    const editor = screen.getByRole('textbox', { name: 'Edit button label' });
    expect(editor).toHaveValue('Edit this label');
    expect(editor).toHaveAttribute('data-text-edit-state', 'editing');
    expect(editor).not.toHaveAttribute('hidden');
    expect(view.container.querySelector('.editor-viewport')).toHaveAttribute(
      'data-selection-state',
      'editingText',
    );
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
    expect(screen.getByText('Visual fixture · textEdit')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
  });

  it('renders a fixed-screen directional marquee without replacing the scene or shell', () => {
    const view = renderFixture('marquee');

    const overlay = view.container.querySelector('[data-marquee-overlay="selection-region"]');
    expect(overlay).not.toHaveAttribute('display', 'none');
    expect(overlay).toHaveAttribute('data-marquee-mode', 'intersecting');
    const rectangle = overlay?.querySelector('.marquee-overlay__rectangle');
    expect(rectangle).toHaveAttribute('height', '300');
    expect(rectangle).toHaveAttribute('width', '180');
    expect(rectangle).toHaveAttribute('x', '260');
    expect(rectangle).toHaveAttribute('y', '60');
    expect(view.container.querySelector('[data-scene-content="document-elements"]')).not.toBeNull();
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders the default/loading fixture with deterministic default pane widths', () => {
    window.localStorage.setItem(
      'balsamic.shell-preferences.v1',
      JSON.stringify({
        formatVersion: 1,
        inspector: { collapsed: true, width: 320 },
        navigator: { collapsed: true, width: 224 },
      }),
    );
    renderFixture('default');

    expect(screen.getByRole('status', { name: 'Control library is loading' })).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      SHELL_LAYOUT_ATTRIBUTES.navigatorWidth,
      '224',
    );
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      SHELL_LAYOUT_ATTRIBUTES.inspectorWidth,
      '320',
    );
  });

  it('renders compact selected, mixed, invalid, and disabled control states', () => {
    renderFixture('controls');

    expect(screen.getByText('Control states')).toBeInTheDocument();
    expect(screen.getByText('Mixed')).toBeInTheDocument();
    expect(screen.getByLabelText('Width')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Disabled field')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Left' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders bounded failure, tooltip, popover, and modal overlay fixtures', () => {
    const feedback = renderFixture('feedback');
    expect(screen.getByText('Canvas unavailable')).toBeInTheDocument();
    expect(screen.getByText('Canvas was isolated')).toBeInTheDocument();
    feedback.unmount();

    const tooltip = renderFixture('tooltip');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Full control name');
    tooltip.unmount();

    const popover = renderFixture('popover');
    expect(screen.getByRole('dialog', { name: 'Color options' })).toBeInTheDocument();
    popover.unmount();

    renderFixture('modal');
    expect(screen.getByRole('dialog', { name: 'Confirm a stable decision' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
  });
});
