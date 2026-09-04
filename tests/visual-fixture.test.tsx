import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import visualFixtureContract from '../visual-fixture-contract.json';
import { VisualConformanceFixture } from '../src/renderer/design/VisualConformanceFixture';
import { DESIGN_TOKENS } from '../src/shared/design-tokens';
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
    expect(getRequestedVisualFixture('?visualFixture=equalGaps')).toBe('equalGaps');
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
    expect(getRequestedVisualFixture('?visualFixture=mvpAlpha')).toBe('mvpAlpha');
    expect(getRequestedVisualFixture('?visualFixture=components')).toBe('components');
    expect(getRequestedVisualFixture('?visualFixture=searchBox')).toBe('searchBox');
    expect(getRequestedVisualFixture('?visualFixture=textArea')).toBe('textArea');
    expect(getRequestedVisualFixture('?visualFixture=textHeadings')).toBe('textHeadings');
    expect(getRequestedVisualFixture('?visualFixture=circleButton')).toBe('circleButton');
    expect(getRequestedVisualFixture('?visualFixture=comment')).toBe('comment');
    expect(getRequestedVisualFixture('?visualFixture=catalogTooltip')).toBe('catalogTooltip');
    expect(getRequestedVisualFixture('?visualFixture=catalogCallout')).toBe('catalogCallout');
    expect(getRequestedVisualFixture('?visualFixture=catalogPopover')).toBe('catalogPopover');
    expect(getRequestedVisualFixture('?visualFixture=catalogCurlyBraces')).toBe(
      'catalogCurlyBraces',
    );
    expect(getRequestedVisualFixture('?visualFixture=radioButton')).toBe('radioButton');
    expect(getRequestedVisualFixture('?visualFixture=dateChooser')).toBe('dateChooser');
    expect(getRequestedVisualFixture('?visualFixture=numericStepper')).toBe('numericStepper');
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

  it('renders the representative alpha workflow across every fixed shell region', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('mvpAlpha');

    expect(screen.getByRole('button', { name: 'Insert Rectangle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Text Label' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Button' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Text Input' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scene' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Button' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('Alpha button');
    expect(screen.getByRole('button', { name: 'Icon' })).toHaveTextContent('Arrow Right');
    await waitFor(() => {
      expect(view.container.querySelector('[data-control-visual="text"]')).not.toBeNull();
      expect(view.container.querySelector('[data-control-visual="input"]')).not.toBeNull();
      expect(view.container.querySelector('[data-control-visual="button"]')).not.toBeNull();
      expect(
        view.container.querySelector('.scene-control__catalog-icon[data-icon-id="arrow-right"]'),
      ).not.toBeNull();
    });
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders the searchable icon picker as a portal without replacing shell regions', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('iconPicker');

    expect(await screen.findByRole('dialog', { name: 'Icon library' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search icons' })).toHaveFocus();
    expect(screen.getByText('Project images')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imported brand mark' })).toBeInTheDocument();
    expect(document.querySelectorAll('.app-icon-popover__option')).toHaveLength(73);
    await waitFor(() => {
      expect(
        [...view.container.querySelectorAll<SVGGElement>('[data-icon-id]')].map(
          (element) => element.dataset.iconId,
        ),
      ).toContain(`project-image:asset_registryimage`);
    });
    expect(view.container.querySelector('[data-shell-region="root"]')).toBeInTheDocument();
    expect(document.querySelector('.app-popover')?.parentElement).not.toBe(
      view.container.querySelector('[data-shell-region="inspector"]'),
    );
  });

  it('renders reusable instances, overrides, component shelf, and inspector in one stable shell', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('components');

    expect(screen.getByRole('heading', { name: 'Reusable Card' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Definition name' })).toHaveValue('Reusable Card');
    expect(screen.getByRole('button', { name: 'Break Apart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Definition' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Insert Reusable Card' })).toBeInTheDocument();
    await waitFor(() => {
      expect(view.container.querySelectorAll('[data-control-visual="button"]')).toHaveLength(3);
    });
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders the registry-backed Tree Pane editor, hierarchy adornments, and linked-row hints', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('registryControl');

    expect(screen.getByRole('button', { name: 'Insert Checkbox' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Browser Window' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Arrow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Playback' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Video Player' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Volume Slider' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Webcam' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Breadcrumbs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Button Bar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Tree Pane' })).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-inspector-control="wireframe.tree-pane"]'),
    ).not.toBeNull();
    const rowEditor = view.container.querySelector('[data-control-rows-inspector="true"]');
    expect(rowEditor).not.toBeNull();
    expect(rowEditor?.querySelector('input[value="f Use f for closed folders"]')).not.toBeNull();
    expect(rowEditor?.querySelector('input[value="https://example.com/tree-file"]')).not.toBeNull();
    await waitFor(() => {
      const checkbox = view.container.querySelector('[data-control-visual="checkbox"]');
      const image = view.container.querySelector('[data-control-visual="image"]');
      const browser = view.container.querySelector('[data-control-visual="browser"]');
      const arrow = view.container.querySelector('[data-control-visual="arrow"]');
      const playback = view.container.querySelector('[data-control-visual="playback"]');
      const videoPlayer = view.container.querySelector('[data-control-visual="video-player"]');
      const volumeSlider = view.container.querySelector('[data-control-visual="volume-slider"]');
      const webcam = view.container.querySelector('[data-control-visual="webcam"]');
      const linkedRowHint = view.container.querySelector(
        '.scene-control__row-link-hint[data-link-target="https://example.com/tree-file"]',
      );
      const buttonBar = view.container.querySelector('[data-control-type="wireframe.button-bar"]');
      const treePane = view.container.querySelector(
        '[data-scene-element-id="element_registrytreepane"]',
      );
      expect(checkbox).not.toBeNull();
      expect(image).not.toBeNull();
      expect(browser).not.toBeNull();
      expect(arrow).not.toBeNull();
      expect(playback).not.toBeNull();
      expect(videoPlayer).not.toBeNull();
      expect(volumeSlider).not.toBeNull();
      expect(webcam).not.toBeNull();
      if (document.fonts !== undefined) {
        expect(treePane?.querySelectorAll('[data-control-row-adornment]')).toHaveLength(13);
        expect(linkedRowHint).not.toBeNull();
        expect(Number(linkedRowHint?.getAttribute('width'))).toBeGreaterThan(0);
      }
      expect(treePane?.querySelector('.scene-control__row-selection')).not.toBeNull();
      expect(buttonBar?.querySelector('.scene-control__row-selection')).not.toBeNull();
      for (const mediaControl of [playback, videoPlayer, volumeSlider, webcam]) {
        expect(mediaControl?.querySelector('.scene-control__mark')).not.toHaveAttribute(
          'display',
          'none',
        );
      }
      expect(arrow).toHaveAttribute('data-control-stroke-style', 'dashed');
      expect(checkbox).toHaveAttribute('aria-checked', 'true');
      expect(checkbox).toHaveAttribute('aria-label', 'Remember me');
      expect(checkbox).toHaveAttribute('role', 'checkbox');
      expect(checkbox?.querySelector('.scene-control__mark')).not.toHaveAttribute(
        'display',
        'none',
      );
      expect(image?.querySelector('.scene-control__image')).toHaveAttribute(
        'href',
        expect.stringContaining('data:image/svg+xml'),
      );
      expect(image?.querySelector('.scene-control__mark')).toHaveAttribute('display', 'none');
    });
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders both Search Box palette identities and the alternate inspector state', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('searchBox');

    expect(screen.getByRole('button', { name: 'Insert Search Box' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Insert Search Box (Rectangular + Microphone)' }),
    ).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-inspector-control="wireframe.search-box"]'),
    ).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Search Box' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link type' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'State' })).toHaveTextContent('Normal');
    expect(screen.getByRole('button', { name: 'Choose Text Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rectangular' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('group', { name: 'Search Icon' }).querySelector('[aria-pressed="true"]'),
    ).not.toBeNull();
    expect(
      screen.getByRole('group', { name: 'Microphone Icon' }).querySelector('[aria-pressed="true"]'),
    ).not.toBeNull();

    await waitFor(() => {
      const controls = view.container.querySelectorAll('[data-control-visual="search-box"]');
      expect(controls).toHaveLength(2);
      for (const control of controls) {
        expect(control.querySelector('.scene-control__mark')).not.toHaveAttribute(
          'display',
          'none',
        );
      }
    });
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders the selected Text Area, multiline text, scrollbar, link hint, and exact inspector', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('textArea');

    expect(screen.getByRole('button', { name: 'Insert Text Area' })).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-inspector-control="wireframe.text-area"]'),
    ).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Text Area' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '↔ Auto-Size' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Border' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Border Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Text Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link type' })).toHaveTextContent('Web address');
    expect(screen.getByRole('button', { name: 'State' })).toHaveTextContent('Normal');
    expect(
      screen.getByRole('group', { name: 'Scrollbar' }).querySelector('[aria-pressed="true"]'),
    ).not.toBeNull();

    await waitFor(() => {
      const textArea = view.container.querySelector(
        '[data-scene-element-id="element_registrytextarea"]',
      );
      expect(textArea).not.toBeNull();
      expect(textArea).toHaveAttribute('aria-label', 'First line\nSecond line');
      expect(textArea).toHaveAttribute('role', 'textbox');
      if (document.fonts !== undefined) {
        expect(textArea?.querySelectorAll('.scene-control__text tspan')).toHaveLength(2);
      }
      expect(textArea?.querySelector('.scene-control__mark')).not.toHaveAttribute(
        'display',
        'none',
      );
      expect(
        textArea?.querySelector(
          '.scene-control__link-hint[data-link-target="https://example.com/notes"]',
        ),
      ).not.toBeNull();
    });
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
    expect(screen.getByTestId('canvas-viewport')).toBeInTheDocument();
  });

  it('renders distinct Text Subtitle and Text Title controls with the isolated Title inspector', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('textHeadings');

    expect(screen.getByRole('button', { name: 'Insert Text Subtitle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Text Title' })).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-inspector-control="wireframe.text-title"]'),
    ).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Text Title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '↔ Auto-Size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Text Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link type' })).toHaveTextContent('Web address');
    expect(screen.queryByRole('button', { name: 'State' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Orientation' })).not.toBeInTheDocument();

    await waitFor(() => {
      const subtitle = view.container.querySelector(
        '[data-scene-element-id="element_registrytextsubtitle"]',
      );
      const title = view.container.querySelector(
        '[data-scene-element-id="element_registrytexttitle"]',
      );
      expect(subtitle).toHaveAttribute('aria-label', 'A Subtitle');
      expect(title).toHaveAttribute('aria-label', 'A Big Title');
      expect(
        title?.querySelector(
          '.scene-control__link-hint[data-link-target="https://example.com/title"]',
        ),
      ).not.toBeNull();
    });
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
  });

  it('renders exact Circle Button variants with the complete selected inspector', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('circleButton');

    expect(screen.getByRole('button', { name: 'Insert Circle Button' })).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-inspector-control="wireframe.circle-button"]'),
    ).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Circle Button' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '↔ Auto-Size' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Show Border' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Icon' })).toHaveTextContent('Arrow Right');
    expect(screen.getByRole('button', { name: 'Icon Size' })).toHaveTextContent('L');
    expect(screen.getByRole('button', { name: 'Icon Right' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Link type' })).toHaveTextContent('Web address');
    expect(screen.getByRole('button', { name: 'State' })).toHaveTextContent('Normal');

    await waitFor(() => {
      const controls = view.container.querySelectorAll('[data-control-visual="circle-button"]');
      expect(controls).toHaveLength(4);
      expect(
        view.container.querySelector(
          '[data-scene-element-id="element_registrycirclebuttonright"] .scene-control__link-hint[data-link-target="https://example.com/go"]',
        ),
      ).not.toBeNull();
    });
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
  });

  it('renders the exact Comment default and an edited multiline sticky-note state', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('comment');

    expect(screen.getByRole('button', { name: 'Insert Comment' })).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-inspector-control="wireframe.comment"]'),
    ).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Comment' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '↔ Auto-Size' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Center' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Link type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'State' })).not.toBeInTheDocument();

    await waitFor(() => {
      const controls = view.container.querySelectorAll('[data-control-visual="comment"]');
      expect(controls).toHaveLength(2);
      const defaultComment = view.container.querySelector(
        '[data-scene-element-id="element_registrycommentdefault"]',
      );
      const editedComment = view.container.querySelector(
        '[data-scene-element-id="element_registrycommentedited"]',
      );
      expect(defaultComment).toHaveAttribute('aria-label', 'A comment');
      expect(defaultComment?.querySelector('.scene-control__fill')).toHaveStyle({
        fill: DESIGN_TOKENS.color.wireframeCommentFill,
      });
      expect(defaultComment?.querySelector('.scene-control__mark')).toHaveStyle({
        fill: DESIGN_TOKENS.color.wireframeCommentTape,
        stroke: DESIGN_TOKENS.color.wireframeCommentTape,
      });
      expect(editedComment).toHaveAttribute('aria-label', 'Review this\nflow');
      if (document.fonts !== undefined) {
        expect(editedComment?.querySelectorAll('.scene-control__text tspan')).toHaveLength(2);
      }
    });
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
  });

  it('renders all four Tooltip compass directions with the selected text inspector', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('catalogTooltip');

    expect(screen.getByRole('button', { name: 'Insert Tooltip' })).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-inspector-control="wireframe.tooltip"]'),
    ).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Tooltip' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '↔ Auto-Size' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'NW' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Center' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Choose Color' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'State' })).not.toBeInTheDocument();

    await waitFor(() => {
      const controls = view.container.querySelectorAll('[data-control-visual="tooltip"]');
      expect(controls).toHaveLength(4);
      expect(
        view.container.querySelector(
          '[data-scene-element-id="element_registrytooltipse"] .scene-control__mark',
        ),
      ).toHaveAttribute('d', expect.stringContaining('Z'));
      expect(
        view.container.querySelector('[data-scene-element-id="element_registrytooltipnw"]'),
      ).toHaveAttribute('aria-label', 'NW tooltip');
    });
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
  });

  it('renders default and multiline Callouts with the exact selected inspector', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('catalogCallout');

    expect(screen.getByRole('button', { name: 'Insert Callout' })).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-inspector-control="wireframe.callout"]'),
    ).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Callout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '↔ Auto-Size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Color' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Opacity' })).toHaveValue('0.72');
    expect(screen.queryByRole('button', { name: 'Center' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'State' })).not.toBeInTheDocument();

    await waitFor(() => {
      const controls = view.container.querySelectorAll('[data-control-visual="callout"]');
      expect(controls).toHaveLength(2);
      const defaultCallout = view.container.querySelector(
        '[data-scene-element-id="element_registrycalloutdefault"]',
      );
      const editedCallout = view.container.querySelector(
        '[data-scene-element-id="element_registrycalloutedited"]',
      );
      expect(defaultCallout).toHaveAttribute('aria-label', '1');
      expect(defaultCallout?.querySelector('.scene-control__fill')).toHaveStyle({
        fill: DESIGN_TOKENS.color.wireframeCalloutFill,
      });
      expect(defaultCallout?.querySelector('.scene-control__outline')).toHaveAttribute(
        'd',
        expect.stringContaining('C'),
      );
      expect(editedCallout).toHaveAttribute('aria-label', 'Review this\nflow');
      if (document.fonts !== undefined) {
        expect(editedCallout?.querySelectorAll('.scene-control__text tspan')).toHaveLength(2);
      }
    });
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
  });

  it('renders every Popover side with the selected discrete position inspector', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('catalogPopover');

    expect(screen.getByRole('button', { name: 'Insert Popover' })).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-inspector-control="wireframe.popover"]'),
    ).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Popover' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '↔ Auto-Size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Left' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'End' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Link type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'State' })).not.toBeInTheDocument();

    await waitFor(() => {
      const controls = view.container.querySelectorAll('[data-control-visual="popover"]');
      expect(controls).toHaveLength(4);
      const selected = view.container.querySelector(
        '[data-scene-element-id="element_registrypopoverleft"]',
      );
      expect(selected).toHaveAttribute('aria-label', 'Name: Thor');
      expect(selected?.querySelector('.scene-control__mark')).toHaveStyle({
        fill: DESIGN_TOKENS.color.accent,
        stroke: DESIGN_TOKENS.color.ink,
      });
    });
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
  });

  it('renders both Curly Brace orientations and their exact direction inspector', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('catalogCurlyBraces');

    expect(screen.getByRole('button', { name: 'Insert H.Curly Brace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert V.Curly Brace' })).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-inspector-control="wireframe.v-curly-brace"]'),
    ).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'V.Curly Brace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Text Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Right' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: '↔ Auto-Size' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'State' })).not.toBeInTheDocument();

    await waitFor(() => {
      const controls = view.container.querySelectorAll('[data-control-visual="curly-brace"]');
      expect(controls).toHaveLength(4);
      const selected = view.container.querySelector(
        '[data-scene-element-id="element_registryvcurlyright"]',
      );
      expect(selected).toHaveAttribute('aria-label', 'Related settings\nand behavior');
      expect(selected?.querySelector('.scene-control__mark')).toHaveStyle({
        stroke: DESIGN_TOKENS.color.ink,
      });
      if (document.fonts !== undefined) {
        expect(selected?.querySelectorAll('.scene-control__text tspan')).toHaveLength(2);
      }
    });
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
  });

  it('renders unselected, selected, and disabled Radio Buttons with the exact inspector', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('radioButton');

    expect(screen.getByRole('button', { name: 'Insert Radio Button' })).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-inspector-control="wireframe.radio-button"]'),
    ).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Radio Button' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '↔ Auto-Size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Text Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Icon' })).toHaveTextContent('Star');
    expect(screen.getByRole('button', { name: 'State' })).toHaveTextContent('Selected');
    expect(screen.getByRole('button', { name: 'Link type' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Label' })).not.toBeInTheDocument();

    await waitFor(() => {
      const controls = view.container.querySelectorAll('[data-control-visual="radio-button"]');
      expect(controls).toHaveLength(3);
      const defaultRadio = view.container.querySelector(
        '[data-scene-element-id="element_registryradiodefault"]',
      );
      const selectedRadio = view.container.querySelector(
        '[data-scene-element-id="element_registryradioselected"]',
      );
      const disabledRadio = view.container.querySelector(
        '[data-scene-element-id="element_registryradiodisabled"]',
      );
      expect(defaultRadio).toHaveAttribute('role', 'radio');
      expect(defaultRadio).toHaveAttribute('aria-checked', 'false');
      expect(defaultRadio?.querySelector('.scene-control__mark')).toHaveAttribute(
        'display',
        'none',
      );
      expect(selectedRadio).toHaveAttribute('aria-label', 'Preferred option');
      expect(selectedRadio).toHaveAttribute('aria-checked', 'true');
      expect(selectedRadio?.querySelector('.scene-control__mark')).not.toHaveAttribute(
        'display',
        'none',
      );
      expect(selectedRadio?.querySelector('.scene-control__catalog-icon')).not.toHaveAttribute(
        'display',
        'none',
      );
      expect(
        selectedRadio?.querySelector(
          '.scene-control__link-hint[data-link-target="https://example.com/preferred"]',
        ),
      ).not.toBeNull();
      expect(disabledRadio).toHaveStyle({ opacity: '0.45' });
    });
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
  });

  it('renders default and edited Date Choosers with the exact trailing calendar inspector', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('dateChooser');

    expect(screen.getByRole('button', { name: 'Insert Date Chooser' })).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-inspector-control="wireframe.date-chooser"]'),
    ).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Date Chooser' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '↔ Auto-Size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Border Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'State' })).toHaveTextContent('Disabled');
    expect(screen.queryByRole('button', { name: 'Icon' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Content' })).not.toBeInTheDocument();

    await waitFor(() => {
      const controls = view.container.querySelectorAll(
        '[data-control-type="wireframe.date-chooser"]',
      );
      expect(controls).toHaveLength(2);
      const defaultChooser = view.container.querySelector(
        '[data-scene-element-id="element_registrydatechooserdefault"]',
      );
      const editedChooser = view.container.querySelector(
        '[data-scene-element-id="element_registrydatechooseredited"]',
      );
      expect(defaultChooser).toHaveAttribute('role', 'textbox');
      expect(defaultChooser).toHaveAttribute('aria-label', '  /  /    ');
      expect(defaultChooser).toHaveAttribute('aria-disabled', 'false');
      expect(defaultChooser?.querySelector('.scene-control__fill')).toHaveAttribute('width', '57');
      expect(defaultChooser?.querySelector('.scene-control__mark')).not.toHaveAttribute(
        'display',
        'none',
      );
      expect(editedChooser).toHaveAttribute('aria-label', '20/01/2010');
      expect(editedChooser).toHaveAttribute('aria-disabled', 'true');
      expect(editedChooser).toHaveStyle({ opacity: '0.45' });
      expect(editedChooser?.querySelector('.scene-control__outline')).toHaveStyle({
        stroke: DESIGN_TOKENS.color.accent,
      });
    });
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
  });

  it('renders default and edited Num. Steppers with fixed buttons and the exact inspector', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const view = renderFixture('numericStepper');

    expect(screen.getByRole('button', { name: 'Insert Num. Stepper' })).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-inspector-control="wireframe.numeric-stepper"]'),
    ).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Num. Stepper' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '↔ Auto-Size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Border Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'State' })).toHaveTextContent('Disabled');
    expect(screen.queryByRole('button', { name: 'Icon' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Content' })).not.toBeInTheDocument();

    await waitFor(() => {
      const controls = view.container.querySelectorAll(
        '[data-control-type="wireframe.numeric-stepper"]',
      );
      expect(controls).toHaveLength(2);
      const defaultStepper = view.container.querySelector(
        '[data-scene-element-id="element_registrynumericstepperdefault"]',
      );
      const editedStepper = view.container.querySelector(
        '[data-scene-element-id="element_registrynumericstepperedited"]',
      );
      expect(defaultStepper).toHaveAttribute('role', 'textbox');
      expect(defaultStepper).toHaveAttribute('aria-label', '3');
      expect(defaultStepper).toHaveAttribute('aria-disabled', 'false');
      expect(defaultStepper?.querySelector('.scene-control__fill')).toHaveAttribute('width', '26');
      expect(defaultStepper?.querySelector('.scene-control__mark')).not.toHaveAttribute(
        'display',
        'none',
      );
      expect(editedStepper).toHaveAttribute('aria-label', '12:35');
      expect(editedStepper).toHaveAttribute('aria-disabled', 'true');
      expect(editedStepper).toHaveStyle({ opacity: '0.45' });
      expect(editedStepper?.querySelector('.scene-control__outline')).toHaveStyle({
        stroke: DESIGN_TOKENS.color.accent,
      });
      expect(editedStepper?.querySelector('.scene-control__mark')).toHaveStyle({
        fill: DESIGN_TOKENS.color.ink,
        stroke: DESIGN_TOKENS.color.accent,
      });
    });
    expect(view.container.querySelector('[data-selection-overlay="bounds"]')).toHaveAttribute(
      'data-selection-count',
      '1',
    );
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

  it('renders equal-gap dimensions through the shared move and guide overlays', () => {
    const view = renderFixture('equalGaps');

    const guides = view.container.querySelector('[data-snap-guide-overlay="gesture-guides"]');
    const overlay = view.container.querySelector('[data-selection-overlay="bounds"]');
    const spacingPath = guides?.querySelector('[data-guide-spacing-axis="y"]');
    const outline = overlay?.querySelector('.selection-overlay__outline');
    expect(guides).not.toHaveAttribute('display', 'none');
    expect(guides).toHaveAttribute('data-guide-count', '2');
    expect(spacingPath).not.toHaveAttribute('display', 'none');
    expect(spacingPath).toHaveAttribute('data-guide-kind', 'equalGap');
    expect(spacingPath).toHaveAttribute('data-guide-gap', '40');
    expect(spacingPath?.getAttribute('d')).toContain('M 496 156 L 496 196');
    expect(spacingPath?.getAttribute('d')).toContain('M 496 244 L 496 284');
    expect(outline).toHaveAttribute('x', '188');
    expect(outline).toHaveAttribute('y', '284');
    expect(screen.getByText('Visual fixture · equalGaps')).toBeInTheDocument();
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
    expect(outline).toHaveAttribute('x', '16');
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
