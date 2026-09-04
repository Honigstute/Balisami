import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  AssetIdSchema,
  BoardIdSchema,
  ComponentIdSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  ProjectIdSchema,
  createCustomIconReference,
  createEmptyProjectDocument,
  dispatchDocumentCommand,
  getControlSpec,
  parseProjectDocument,
  type ControlTypeId,
} from '../src/domain';
import {
  ControlInspector,
  ControlInspectorTitle,
  type ControlInspectorFrameUpdate,
  type ControlInspectorIconUpdate,
  type ControlInspectorPropertiesUpdate,
} from '../src/renderer/controls/ControlInspector';
import type { ControlInspectorLinkUpdate } from '../src/renderer/controls/ControlLinkInspector';
import { ControlLinkFields } from '../src/renderer/controls/ControlLinkFields';
import { ControlShelf } from '../src/renderer/controls/ControlShelf';
import {
  COMPONENT_DRAG_MIME_TYPE,
  CONTROL_DRAG_MIME_TYPE,
} from '../src/renderer/controls/control-drag-transfer';
import { planComponentCreationFromGroup } from '../src/renderer/controls/component-creation';
import { planComponentDuplicate } from '../src/renderer/controls/component-duplicate';
import { createControlInsertionCommand } from '../src/renderer/controls/control-insertion';
import type { ControlTextMeasurementService } from '../src/renderer/controls/control-text-measurement';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { createWorldPoint } from '../src/renderer/editor/viewport-transform';
import { DESIGN_TOKENS } from '../src/shared/design-tokens';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const createControlDocument = (controlType = CONTROL_TYPES.button) => {
  const boardId = BoardIdSchema.parse('board_controlui');
  const elementId = ElementIdSchema.parse('element_controlui');
  const created = createEmptyProjectDocument({
    boardId,
    projectId: ProjectIdSchema.parse('project_controlui'),
  });
  if (!created.ok) {
    throw new Error('Control UI fixture is invalid.');
  }
  const command = createControlInsertionCommand({
    boardId,
    center: createWorldPoint(300, 240),
    controlType,
    document: created.value,
    elementId,
  });
  const result = dispatchDocumentCommand(created.value, command);
  if (!result.ok || !result.changed) {
    throw new Error('Control UI fixture button could not be inserted.');
  }
  return Object.freeze({ document: result.document, elementId });
};

const thumbnailTextMeasurementService: ControlTextMeasurementService = {
  measure: ({ fontSize, text }) => ({
    baselineOffsets: [fontSize],
    height: fontSize * 1.2,
    lineCount: 1,
    lineHeight: fontSize * 1.2,
    lines: [text],
    width: text.length * fontSize * 0.5,
  }),
};

const createReusableComponentDocument = () => {
  const parsed = parseProjectDocument(createValidProjectDocumentInput());
  if (!parsed.ok) {
    throw new Error('Reusable component UI fixture is invalid.');
  }
  const componentId = ComponentIdSchema.parse('component_controlui1');
  const instanceId = ElementIdSchema.parse('element_controlinst1');
  const definitionIds = [
    ElementIdSchema.parse('element_controlroot1'),
    ElementIdSchema.parse('element_controlchild'),
  ] as const;
  const plan = planComponentCreationFromGroup(
    parsed.value,
    DOCUMENT_FIXTURE_IDS.group,
    componentId,
    instanceId,
    'Reusable card',
    (_sourceId, index) => definitionIds[index],
  );
  if (plan === undefined) {
    throw new Error('Reusable component UI fixture could not be planned.');
  }
  const converted = dispatchDocumentCommand(parsed.value, plan.commands[0]);
  if (!converted.ok || !converted.changed) {
    throw new Error('Reusable component UI fixture could not be created.');
  }
  return Object.freeze({ componentId, document: converted.document, instanceId });
};

describe('alpha control authoring UI', () => {
  it('exposes every representative control as a stable insert action', () => {
    const onInsert = vi.fn<(controlType: ControlTypeId) => boolean>(() => true);
    render(<ControlShelf onInsert={onInsert} />);

    for (const label of [
      'Rectangle',
      'Text Label',
      'Text Subtitle',
      'Text Title',
      'Button',
      'Text Input',
      'Checkbox',
      'Checkbox Group',
      'Radio Button Group',
      'Image',
      'Browser Window',
      'Arrow',
      'Calendar',
      'Chart: Bar',
      'Chart: Line',
      'Chart: Pie',
      'Playback',
      'Video Player',
      'Volume Slider',
      'Webcam',
      'iOS Picker',
      'H.Splitter',
      'V.Splitter',
      'Red X',
      'Squiggly Block of Text',
      'Street Map',
      'Toolbar',
      'H.Rule',
      'V.Rule',
      'Scratch-Out',
      'Help Button',
      'Modal Screen',
      'Color Picker',
      'ON/OFF Switch',
      'Breadcrumbs',
      'Button Bar',
      'Link Bar',
      'Tree Pane',
      'Search Box',
      'Text Area',
      'Field Set',
      'Link',
      'Multiline Button',
      'Circle Button',
      'Comment',
      'Tooltip',
      'Callout',
    ]) {
      fireEvent.click(screen.getByRole('button', { name: `Insert ${label}` }));
    }
    expect(onInsert.mock.calls.map(([type]) => type)).toEqual([
      CONTROL_TYPES.rectangle,
      CONTROL_TYPES.textLabel,
      CONTROL_TYPES.textSubtitle,
      CONTROL_TYPES.textTitle,
      CONTROL_TYPES.button,
      CONTROL_TYPES.textInput,
      CONTROL_TYPES.checkbox,
      CONTROL_TYPES.checkboxGroup,
      CONTROL_TYPES.radioButtonGroup,
      CONTROL_TYPES.imagePlaceholder,
      CONTROL_TYPES.browser,
      CONTROL_TYPES.arrow,
      CONTROL_TYPES.calendar,
      CONTROL_TYPES.chartBar,
      CONTROL_TYPES.chartLine,
      CONTROL_TYPES.chartPie,
      CONTROL_TYPES.playback,
      CONTROL_TYPES.videoPlayer,
      CONTROL_TYPES.volumeSlider,
      CONTROL_TYPES.webcam,
      CONTROL_TYPES.iosPicker,
      CONTROL_TYPES.hSplitter,
      CONTROL_TYPES.vSplitter,
      CONTROL_TYPES.redX,
      CONTROL_TYPES.squigglyBlock,
      CONTROL_TYPES.streetMap,
      CONTROL_TYPES.toolbar,
      CONTROL_TYPES.hRule,
      CONTROL_TYPES.vRule,
      CONTROL_TYPES.scratchOut,
      CONTROL_TYPES.helpButton,
      CONTROL_TYPES.modalScreen,
      CONTROL_TYPES.colorPicker,
      CONTROL_TYPES.onOffSwitch,
      CONTROL_TYPES.breadcrumbs,
      CONTROL_TYPES.buttonBar,
      CONTROL_TYPES.linkBar,
      CONTROL_TYPES.treePane,
      CONTROL_TYPES.searchBox,
      CONTROL_TYPES.textArea,
      CONTROL_TYPES.fieldSet,
      CONTROL_TYPES.link,
      CONTROL_TYPES.multilineButton,
      CONTROL_TYPES.circleButton,
      CONTROL_TYPES.comment,
      CONTROL_TYPES.tooltip,
      CONTROL_TYPES.callout,
    ]);
  });

  it('renders Multiline Button hierarchy in the normal shelf thumbnail', () => {
    const textMeasurementService: ControlTextMeasurementService = {
      measure: ({ fontSize, mode, text }) => {
        const lines =
          mode === 'multiline'
            ? text.replace(/\r\n?/gu, '\n').split('\n')
            : [text.replace(/\n/gu, ' ')];
        return {
          baselineOffsets: lines.map((_, index) => fontSize + index * fontSize * 1.2),
          height: lines.length * fontSize * 1.2,
          lineCount: lines.length,
          lineHeight: fontSize * 1.2,
          lines,
          width: Math.max(0, ...lines.map((line) => line.length * fontSize * 0.5)),
        };
      },
    };
    render(
      <ControlShelf
        category="Buttons"
        onInsert={() => true}
        textMeasurementService={textMeasurementService}
      />,
    );

    const button = screen.getByRole('button', { name: 'Insert Multiline Button' });
    const lines = button.querySelectorAll('tspan');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveAttribute('font-size', '13');
    expect(lines[0]).toHaveAttribute('font-weight', 'bold');
    expect(lines[1]).toHaveAttribute('font-size', '10');
    expect(lines[1]).toHaveAttribute('font-weight', 'normal');
  });

  it('makes every palette control a typed draggable shelf source', () => {
    render(<ControlShelf onInsert={() => true} />);
    const data = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: 'none',
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
    } as unknown as DataTransfer;
    const button = screen.getByRole('button', { name: 'Insert Button' });

    expect(button).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(button, { dataTransfer });

    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(data.get(CONTROL_DRAG_MIME_TYPE)).toBe(
      JSON.stringify({ controlType: CONTROL_TYPES.button, presetId: null }),
    );
    for (const shelfItem of screen.getAllByRole('button')) {
      expect(shelfItem).toHaveAttribute('draggable', 'true');
    }
  });

  it('opens the image file route when import is available and permits choosing the same file again', () => {
    const onImportImage = vi.fn();
    const onInsert = vi.fn(() => true);
    render(<ControlShelf onImportImage={onImportImage} onInsert={onInsert} />);
    const input = screen.getByLabelText('Choose image file');
    const clickInput = vi.spyOn(input, 'click');
    const file = new File([Uint8Array.from([1, 2, 3])], 'picked.png', { type: 'image/png' });

    fireEvent.click(screen.getByRole('button', { name: 'Insert Image' }));
    expect(clickInput).toHaveBeenCalledOnce();
    expect(onInsert).not.toHaveBeenCalledWith(CONTROL_TYPES.imagePlaceholder);

    fireEvent.change(input, { target: { files: [file] } });
    expect(onImportImage).toHaveBeenCalledWith(file);
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { files: [file] } });
    expect(onImportImage).toHaveBeenCalledTimes(2);
  });

  it('filters the shelf by registry category and the shared alias search path', () => {
    const view = render(<ControlShelf category="Forms" onInsert={() => true} />);

    expect(
      screen.getAllByRole('button').map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Insert Text Input',
      'Insert Text Input (Underline)',
      'Insert Checkbox',
      'Insert Checkbox Group',
      'Insert Radio Button Group',
      'Insert Color Picker',
      'Insert ON/OFF Switch',
      'Insert Search Box',
      'Insert Search Box (Rectangular + Microphone)',
      'Insert Text Area',
    ]);

    view.rerender(<ControlShelf onInsert={() => true} query="cta" />);
    expect(screen.getByRole('button', { name: 'Insert Button' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')[0]).toHaveAccessibleName('Insert Button');

    view.rerender(<ControlShelf onInsert={() => true} query="missing-control" />);
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('No matching controls');
  });

  it('inserts a shared-schema preset with its stable authoring identity', () => {
    const onInsert = vi.fn<(controlType: ControlTypeId, presetId?: string) => boolean>(() => true);
    render(<ControlShelf category="Forms" onInsert={onInsert} />);

    fireEvent.click(screen.getByRole('button', { name: 'Insert Text Input (Underline)' }));

    expect(onInsert).toHaveBeenCalledOnce();
    expect(onInsert).toHaveBeenCalledWith(CONTROL_TYPES.textInput, 'underline');
  });

  it('keeps Search Box base and alternate shelf entries independently insertable and draggable', () => {
    const onInsert = vi.fn<(controlType: ControlTypeId, presetId?: string) => boolean>(() => true);
    render(<ControlShelf category="Forms" onInsert={onInsert} />);
    const base = screen.getByRole('button', { name: 'Insert Search Box' });
    const alternate = screen.getByRole('button', {
      name: 'Insert Search Box (Rectangular + Microphone)',
    });

    fireEvent.click(base);
    fireEvent.click(alternate);
    expect(onInsert.mock.calls).toEqual([
      [CONTROL_TYPES.searchBox, undefined],
      [CONTROL_TYPES.searchBox, 'rectangular-microphone'],
    ]);

    const data = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: 'none',
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
    } as unknown as DataTransfer;
    fireEvent.dragStart(alternate, { dataTransfer });
    expect(data.get(CONTROL_DRAG_MIME_TYPE)).toBe(
      JSON.stringify({
        controlType: CONTROL_TYPES.searchBox,
        presetId: 'rectangular-microphone',
      }),
    );
  });

  it('edits every confirmed Search Box inspector field through generic registry controls', () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.searchBox);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetLinks={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Text Color' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Shape' })).getByRole('button', {
        name: 'Rounded',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Shape' })).getByRole('button', {
        name: 'Rectangular',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Microphone Icon' })).getByRole('button', {
        name: 'Checked',
      }),
    );
    expect(onSetProperties.mock.calls[0]?.[0]?.[0]).toMatchObject({
      elementId,
      properties: { shape: 'rectangular' },
    });
    expect(onSetProperties.mock.calls[1]?.[0]?.[0]).toMatchObject({
      elementId,
      properties: { microphoneIcon: true },
    });
    expect(screen.getByRole('button', { name: 'Link type' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'State' })).toHaveTextContent('Normal');
    expect(screen.queryByRole('textbox', { name: 'Text' })).not.toBeInTheDocument();
  });

  it('exposes only the screenshot-confirmed Text Area inspector contract', () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.textArea);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetLinks={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    expect(screen.queryByRole('button', { name: '↔ Auto-Size' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Border' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Border Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Text Color' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Opacity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link type' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'State' })).toHaveTextContent('Normal');
    expect(screen.queryByRole('textbox', { name: 'Text' })).not.toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Scrollbar' })).getByRole('button', {
        name: 'Checked',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'State' }));
    fireEvent.click(screen.getByRole('option', { name: 'Disabled' }));

    expect(onSetProperties.mock.calls[0]?.[0]?.[0]).toMatchObject({
      elementId,
      properties: { scrollbar: true },
    });
    expect(onSetProperties.mock.calls[1]?.[0]?.[0]).toMatchObject({
      elementId,
      properties: { state: 'disabled' },
    });
  });

  it.each([
    ['Text Subtitle', CONTROL_TYPES.textSubtitle],
    ['Text Title', CONTROL_TYPES.textTitle],
  ] as const)(
    'keeps the %s inspector isolated from unresolved Text Label orientation and state',
    (_label, controlType) => {
      const { document, elementId } = createControlDocument(controlType);
      const selection = new SelectionStore();
      selection.selectOnly(elementId);
      const view = render(
        <ControlInspector
          document={document}
          onAutoSize={() => Promise.resolve(true)}
          onSetFrames={() => true}
          onSetLinks={() => true}
          onSetProperties={() => true}
          selection={selection}
        />,
      );

      expect(
        view.container.querySelector(`[data-inspector-control="${controlType}"]`),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '↔ Auto-Size' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Choose Text Color' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Link type' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Alignment' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'State' })).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Orientation' })).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Text' })).not.toBeInTheDocument();
    },
  );

  it('uses one roving tab stop and reaches either shelf end with the keyboard', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    render(<ControlShelf onInsert={() => true} />);
    const items = screen.getAllByRole('button');
    expect(items[0]).toHaveAttribute('tabindex', '0');
    expect(items.slice(1).every((item) => item.tabIndex === -1)).toBe(true);

    items[0]?.focus();
    fireEvent.keyDown(items[0] as HTMLButtonElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(items[1]);
    expect(items[1]).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(items[1] as HTMLButtonElement, { key: 'End' });
    expect(document.activeElement).toBe(items.at(-1));
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' });

    fireEvent.keyDown(items.at(-1) as HTMLButtonElement, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('renders every palette preview through a definition-derived SVG projection', () => {
    render(
      <ControlShelf
        onInsert={() => true}
        textMeasurementService={thumbnailTextMeasurementService}
      />,
    );

    for (const type of [
      CONTROL_TYPES.rectangle,
      CONTROL_TYPES.textLabel,
      CONTROL_TYPES.button,
      CONTROL_TYPES.textInput,
      CONTROL_TYPES.checkbox,
      CONTROL_TYPES.checkboxGroup,
      CONTROL_TYPES.radioButtonGroup,
      CONTROL_TYPES.imagePlaceholder,
      CONTROL_TYPES.browser,
      CONTROL_TYPES.arrow,
      CONTROL_TYPES.calendar,
      CONTROL_TYPES.chartBar,
      CONTROL_TYPES.chartLine,
      CONTROL_TYPES.chartPie,
      CONTROL_TYPES.playback,
      CONTROL_TYPES.videoPlayer,
      CONTROL_TYPES.volumeSlider,
      CONTROL_TYPES.webcam,
      CONTROL_TYPES.iosPicker,
      CONTROL_TYPES.hSplitter,
      CONTROL_TYPES.vSplitter,
      CONTROL_TYPES.redX,
      CONTROL_TYPES.squigglyBlock,
      CONTROL_TYPES.streetMap,
      CONTROL_TYPES.toolbar,
      CONTROL_TYPES.hRule,
      CONTROL_TYPES.vRule,
      CONTROL_TYPES.scratchOut,
      CONTROL_TYPES.helpButton,
      CONTROL_TYPES.modalScreen,
      CONTROL_TYPES.colorPicker,
      CONTROL_TYPES.onOffSwitch,
      CONTROL_TYPES.breadcrumbs,
      CONTROL_TYPES.buttonBar,
      CONTROL_TYPES.linkBar,
      CONTROL_TYPES.treePane,
      CONTROL_TYPES.searchBox,
    ]) {
      const thumbnail = document.querySelector(`[data-control-thumbnail='${type}']`);
      expect(thumbnail).toBeInstanceOf(SVGSVGElement);
      expect(thumbnail).toHaveAttribute('viewBox');
    }
    expect(document.querySelector('[data-control-preview]')).toBeNull();
    expect(screen.getByText('Text label', { selector: 'tspan' })).toBeInTheDocument();
    expect(screen.getByText('Button', { selector: 'tspan' })).toBeInTheDocument();
    expect(screen.getAllByText('Text input', { selector: 'tspan' })).toHaveLength(2);
    expect(screen.getByText('Checkbox', { selector: 'tspan' })).toBeInTheDocument();
    expect(
      document.querySelector(
        `[data-control-thumbnail='${CONTROL_TYPES.imagePlaceholder}'] .scene-control__outline`,
      ),
    ).toBeNull();
    expect(
      document.querySelector(
        `[data-control-thumbnail='${CONTROL_TYPES.buttonBar}'] .scene-control__row-selection`,
      ),
    ).not.toBeNull();
  });

  it('searches, previews, inserts, and drags reusable components through the shared shelf', () => {
    const { componentId, document } = createReusableComponentDocument();
    const component = document.componentsById[componentId];
    if (component === undefined) {
      throw new Error('Reusable component definition is missing.');
    }
    const onInsertComponent = vi.fn(() => true);
    render(
      <ControlShelf
        category="Components"
        components={[component]}
        onInsert={() => true}
        onInsertComponent={onInsertComponent}
        projectDocument={document}
        query="card"
        textMeasurementService={thumbnailTextMeasurementService}
      />,
    );
    const item = screen.getByRole('button', { name: 'Insert Reusable card' });
    expect(
      globalThis.document.querySelector(`[data-component-thumbnail='${componentId}']`),
    ).toBeInstanceOf(SVGSVGElement);

    fireEvent.click(item);
    expect(onInsertComponent).toHaveBeenCalledWith(componentId);

    const transfer = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: 'none',
      setData: vi.fn((type: string, value: string) => transfer.set(type, value)),
    } as unknown as DataTransfer;
    fireEvent.dragStart(item, { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(transfer.get(COMPONENT_DRAG_MIME_TYPE)).toBe(componentId);
  });

  it('manages component definitions from a portalled shelf menu without resizing the shelf', () => {
    const first = createReusableComponentDocument();
    const secondComponentId = ComponentIdSchema.parse('component_controlui2');
    const duplicate = planComponentDuplicate(
      first.document,
      first.componentId,
      secondComponentId,
      (_sourceId, index) => ElementIdSchema.parse(`element_controlcopy_${String(index)}`),
    );
    if (duplicate === undefined) throw new Error('Second component fixture could not be planned.');
    const duplicated = dispatchDocumentCommand(first.document, duplicate);
    if (!duplicated.ok || !duplicated.changed) {
      throw new Error('Second component fixture could not be created.');
    }
    const components = duplicated.document.componentIds.flatMap((componentId) => {
      const component = duplicated.document.componentsById[componentId];
      return component === undefined ? [] : [component];
    });
    const onDeleteComponent = vi.fn(() => true);
    const onDuplicateComponent = vi.fn(() => true);
    const onRenameComponent = vi.fn(() => true);
    const onReorderComponent = vi.fn(() => true);
    render(
      <ControlShelf
        category="Components"
        components={components}
        onDeleteComponent={onDeleteComponent}
        onDuplicateComponent={onDuplicateComponent}
        onInsert={() => true}
        onInsertComponent={() => true}
        onRenameComponent={onRenameComponent}
        onReorderComponent={onReorderComponent}
        projectDocument={duplicated.document}
        textMeasurementService={thumbnailTextMeasurementService}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Manage Reusable card' }));
    let menu = screen.getByRole('dialog', { name: 'Manage Reusable card' });
    const name = within(menu).getByRole('textbox', { name: 'Component name' });
    fireEvent.change(name, { target: { value: 'Primary card' } });
    fireEvent.click(within(menu).getByRole('button', { name: 'Rename' }));
    expect(onRenameComponent).toHaveBeenCalledWith(first.componentId, 'Primary card');
    expect(screen.queryByRole('dialog', { name: 'Manage Reusable card' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Manage Reusable card' }));
    menu = screen.getByRole('dialog', { name: 'Manage Reusable card' });
    fireEvent.click(within(menu).getByRole('button', { name: 'Move Later' }));
    expect(onReorderComponent).toHaveBeenCalledWith(first.componentId, 1);

    fireEvent.click(screen.getByRole('button', { name: 'Manage Reusable card' }));
    menu = screen.getByRole('dialog', { name: 'Manage Reusable card' });
    fireEvent.click(within(menu).getByRole('button', { name: 'Duplicate' }));
    expect(onDuplicateComponent).toHaveBeenCalledWith(first.componentId);

    fireEvent.click(screen.getByRole('button', { name: 'Manage Reusable card' }));
    menu = screen.getByRole('dialog', { name: 'Manage Reusable card' });
    expect(within(menu).getByText(/Used by 1 instance/u)).toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: /Delete Definition/u })).toBeNull();
    fireEvent.keyDown(menu, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: 'Manage Reusable card Copy' }));
    menu = screen.getByRole('dialog', { name: 'Manage Reusable card Copy' });
    fireEvent.click(within(menu).getByRole('button', { name: 'Delete Definition…' }));
    expect(within(menu).getByRole('alert')).toHaveTextContent('restore it with Undo');
    fireEvent.click(within(menu).getByRole('button', { name: 'Delete Definition' }));
    expect(onDeleteComponent).toHaveBeenCalledWith(secondComponentId);
  });

  it('creates a named component from the selected group through the inspector', () => {
    const parsed = parseProjectDocument(createValidProjectDocumentInput());
    if (!parsed.ok) {
      throw new Error('Group inspector fixture is invalid.');
    }
    const selection = new SelectionStore();
    selection.selectOnly(DOCUMENT_FIXTURE_IDS.group);
    const onCreateComponent = vi.fn(() => true);
    render(
      <ControlInspector
        document={parsed.value}
        onAutoSize={() => Promise.resolve(true)}
        onCreateComponent={onCreateComponent}
        onSetFrames={() => true}
        onSetProperties={() => true}
        selection={selection}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Reusable Component' })).toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: 'Component name' });
    fireEvent.change(name, { target: { value: '  Primary card  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Component' }));
    expect(onCreateComponent).toHaveBeenCalledWith(DOCUMENT_FIXTURE_IDS.group, 'Primary card');
  });

  it('edits selected geometry and text while reserving validation space', () => {
    const { document, elementId } = createControlDocument();
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetFrames = vi.fn<(updates: readonly ControlInspectorFrameUpdate[]) => boolean>(
      () => true,
    );
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={onSetFrames}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    expect(screen.queryByText('Selected control')).not.toBeInTheDocument();
    const x = screen.getByRole('spinbutton', { name: 'X' });
    fireEvent.change(x, { target: { value: '260' } });
    fireEvent.blur(x);
    expect(onSetFrames.mock.calls[0]?.[0]?.[0]).toMatchObject({ elementId, frame: { x: 260 } });

    const width = screen.getByRole('spinbutton', { name: 'Width' });
    fireEvent.change(width, { target: { value: '2' } });
    fireEvent.blur(width);
    expect(screen.getByText('Minimum 48.')).toBeInTheDocument();

    const content = screen.getByRole('textbox', { name: 'Text' });
    fireEvent.change(content, { target: { value: 'Continue' } });
    fireEvent.blur(content);
    expect(onSetProperties.mock.calls[0]?.[0]?.[0]).toMatchObject({
      elementId,
      properties: { iconId: null, text: 'Continue' },
    });
  });

  it('edits capability-backed board and HTTP(S) links through the common inspector module', () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.button);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetLinks = vi.fn<(updates: readonly ControlInspectorLinkUpdate[]) => boolean>(
      () => true,
    );
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetLinks={onSetLinks}
        onSetProperties={() => true}
        selection={selection}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Link type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Wireframe' }));
    expect(onSetLinks.mock.calls[0]?.[0]?.[0]).toEqual({
      elementId,
      link: { kind: 'board', boardId: document.boardIds[0] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Link type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Web address' }));
    const url = screen.getByRole('textbox', { name: 'Web address' });
    fireEvent.blur(url);
    expect(screen.getByText('Enter a complete HTTP or HTTPS address.')).toBeInTheDocument();
    fireEvent.change(url, { target: { value: 'https://example.com/flow' } });
    fireEvent.keyDown(url, { key: 'Enter' });
    expect(onSetLinks.mock.calls[1]?.[0]?.[0]).toEqual({
      elementId,
      link: { kind: 'external', url: 'https://example.com/flow' },
    });
  });

  it('edits parsed-row web links through the shared draft lifecycle and cancels with Escape', () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.breadcrumbs);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    const openFirstRowExternal = () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Link type' })[0]!);
      fireEvent.click(screen.getByRole('option', { name: 'Web address' }));
      return screen.getByRole('textbox', { name: 'Web address' });
    };
    const cancelled = openFirstRowExternal();
    expect(cancelled).toHaveValue('https://');
    fireEvent.change(cancelled, { target: { value: 'https://cancel.example' } });
    fireEvent.keyDown(cancelled, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Web address' })).toBeNull();
    expect(onSetProperties).not.toHaveBeenCalled();

    const committed = openFirstRowExternal();
    fireEvent.change(committed, { target: { value: 'https://example.com/first' } });
    fireEvent.keyDown(committed, { key: 'Enter' });
    expect(onSetProperties).toHaveBeenCalledOnce();
    expect(onSetProperties.mock.calls[0]?.[0]?.[0]).toMatchObject({
      elementId,
      rowData: {
        bindings: [
          { link: { kind: 'external', url: 'https://example.com/first' } },
          { link: null },
          { link: null },
          { link: null },
        ],
      },
    });
  });

  it('edits marker syntax through the generic stable-row inspector in one atomic update', () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.checkboxGroup);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    const labels = screen.getAllByRole<HTMLInputElement>('textbox', { name: 'Label' });
    expect(labels[0]).toHaveValue('[ ] not selected');
    expect(labels[3]).toHaveValue('[ ] -disabled-');
    fireEvent.change(labels[0]!, { target: { value: '[x] -Renamed and disabled-' } });
    fireEvent.blur(labels[0]!);

    expect(onSetProperties).toHaveBeenCalledOnce();
    const update = onSetProperties.mock.calls[0]?.[0]?.[0];
    expect(update).toMatchObject({
      elementId,
      rowData: document.elementsById[elementId]?.rowData,
    });
    expect(update?.properties.items).toContain('[x] -Renamed and disabled-');
    expect(screen.getByRole('heading', { name: 'Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Text Color' })).toBeInTheDocument();
  });

  it('edits Tree Pane hierarchy syntax and optional stable selection through the generic inspector', () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.treePane);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    const labels = screen.getAllByRole<HTMLInputElement>('textbox', { name: 'Label' });
    expect(labels[0]).toHaveValue('f Use f for closed folders');
    fireEvent.change(labels[0]!, { target: { value: '..- Nested file' } });
    fireEvent.blur(labels[0]!);
    expect(onSetProperties).toHaveBeenCalledOnce();
    const firstUpdate = onSetProperties.mock.calls[0]?.[0]?.[0];
    expect(firstUpdate).toMatchObject({
      elementId,
      rowData: document.elementsById[elementId]?.rowData,
    });
    expect(firstUpdate?.properties.items).toContain('..- Nested file');
    fireEvent.click(screen.getByRole('button', { name: 'Selection' }));
    expect(screen.getByRole('option', { name: 'None' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Show Border' })).getByRole('button', {
        name: 'Checked',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(screen.getByRole('group', { name: 'Scrollbar' })).getByRole('button', {
        name: 'Unchecked',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Choose Color' })).toBeInTheDocument();
  });

  it('edits stable row selection generically and exposes None only when the registry allows it', () => {
    const buttonBar = createControlDocument(CONTROL_TYPES.buttonBar);
    const selection = new SelectionStore();
    selection.selectOnly(buttonBar.elementId);
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    const view = render(
      <ControlInspector
        document={buttonBar.document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Selection' }));
    expect(screen.queryByRole('option', { name: 'None' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Two' }));
    const secondRowId =
      buttonBar.document.elementsById[buttonBar.elementId]?.rowData.bindings[1]?.id;
    expect(onSetProperties.mock.calls[0]?.[0]?.[0]).toMatchObject({
      elementId: buttonBar.elementId,
      properties: { selectedRowId: secondRowId },
      rowData: buttonBar.document.elementsById[buttonBar.elementId]?.rowData,
    });

    const linkBar = createControlDocument(CONTROL_TYPES.linkBar);
    selection.selectOnly(linkBar.elementId);
    view.rerender(
      <ControlInspector
        document={linkBar.document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Selection' }));
    expect(screen.getByRole('option', { name: 'None' })).toBeInTheDocument();
  });

  it('keeps a linked Trash target visible in the shared row/control link editor', () => {
    const input = createValidProjectDocumentInput();
    const trashBoardId = BoardIdSchema.parse('board_controlui_trash');
    input.trashedBoardIds = [trashBoardId];
    input.boardsById[trashBoardId] = {
      id: trashBoardId,
      name: 'Archived target',
      note: { text: '' },
      childIds: [],
      alternateIds: [],
      selectedAlternateId: null,
    };
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) throw new Error('Trash link field fixture is invalid.');
    render(
      <ControlLinkFields
        document={parsed.value}
        link={{ kind: 'board', boardId: trashBoardId }}
        onCommit={() => true}
        revisionKey="trash-target"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Wireframe' }));
    expect(screen.getByRole('option', { name: 'Archived target (In Trash)' })).toBeInTheDocument();
  });

  it('searches the portalled catalog and emits one canonical icon property update', async () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.button);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Icon' }));
    const search = await screen.findByRole('textbox', { name: 'Search icons' });
    fireEvent.change(search, { target: { value: 'trash' } });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Trash' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Trash' }));

    expect(onSetProperties.mock.calls[0]?.[0]?.[0]).toMatchObject({
      elementId,
      properties: { iconId: 'trash', text: 'Button' },
    });
    expect(screen.queryByRole('dialog', { name: 'Icon library' })).not.toBeInTheDocument();
  });

  it('offers imported project images and emits one asset-aware icon update', async () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.button);
    const selection = new SelectionStore();
    const assetId = AssetIdSchema.parse('asset_controlui_icon');
    selection.selectOnly(elementId);
    const onSetIcons = vi.fn<(updates: readonly ControlInspectorIconUpdate[]) => boolean>(
      () => true,
    );
    render(
      <ControlInspector
        customIcons={[{ assetId, label: 'brand-mark.png', url: 'blob:project-image-icon' }]}
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetIcons={onSetIcons}
        onSetProperties={() => true}
        selection={selection}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Icon' }));
    expect(await screen.findByText('Project images')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'brand-mark.png' }));

    expect(onSetIcons).toHaveBeenCalledWith([
      { elementId, iconId: createCustomIconReference(assetId), property: 'iconId' },
    ]);
  });

  it('shows mixed values and emits one complete batch for shared multi-selection edits', () => {
    const first = createControlDocument(CONTROL_TYPES.button);
    const secondId = ElementIdSchema.parse('element_controlui_batch_second');
    const inserted = dispatchDocumentCommand(
      first.document,
      createControlInsertionCommand({
        boardId: first.document.boardIds[0]!,
        center: createWorldPoint(500, 240),
        controlType: CONTROL_TYPES.button,
        document: first.document,
        elementId: secondId,
      }),
    );
    if (!inserted.ok || !inserted.changed) {
      throw new Error('Multi-inspector fixture control could not be inserted.');
    }
    const edited = dispatchDocumentCommand(inserted.document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: secondId,
      properties: {
        ...getControlSpec(CONTROL_TYPES.button)!.defaultProperties,
        text: 'Secondary',
      },
    });
    if (!edited.ok || !edited.changed) {
      throw new Error('Multi-inspector fixture control could not be edited.');
    }
    const selection = new SelectionStore();
    selection.replace([first.elementId, secondId], secondId);
    const onSetFrames = vi.fn<(updates: readonly ControlInspectorFrameUpdate[]) => boolean>(
      () => true,
    );
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    const onSetLinks = vi.fn<(updates: readonly ControlInspectorLinkUpdate[]) => boolean>(
      () => true,
    );
    render(
      <ControlInspector
        document={edited.document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={onSetFrames}
        onSetLinks={onSetLinks}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    const x = screen.getByRole('spinbutton', { name: /X\s*Mixed/u });
    const content = screen.getByRole('textbox', { name: /Text\s*Mixed/u });
    expect(x).toHaveValue(null);
    expect(content).toHaveValue('');
    fireEvent.blur(x);
    fireEvent.blur(content);
    expect(onSetFrames).not.toHaveBeenCalled();
    expect(onSetProperties).not.toHaveBeenCalled();

    fireEvent.change(x, { target: { value: '128' } });
    fireEvent.blur(x);
    const frameUpdates = onSetFrames.mock.calls[0]?.[0];
    expect(frameUpdates).toHaveLength(2);
    expect(frameUpdates?.[0]).toMatchObject({ elementId: first.elementId, frame: { x: 128 } });
    expect(frameUpdates?.[1]).toMatchObject({ elementId: secondId, frame: { x: 128 } });

    fireEvent.change(content, { target: { value: 'Shared' } });
    fireEvent.blur(content);
    const propertyUpdates = onSetProperties.mock.calls[0]?.[0];
    expect(propertyUpdates).toHaveLength(2);
    expect(propertyUpdates?.[0]).toMatchObject({
      elementId: first.elementId,
      properties: { iconId: null, text: 'Shared' },
    });
    expect(propertyUpdates?.[1]).toMatchObject({
      elementId: secondId,
      properties: { iconId: null, text: 'Shared' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Link type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Wireframe' }));
    expect(onSetLinks.mock.calls[0]?.[0]).toHaveLength(2);
    expect(onSetLinks.mock.calls[0]?.[0].map((update) => update.elementId)).toEqual([
      first.elementId,
      secondId,
    ]);
  });

  it('steps numeric drafts predictably and commits or cancels them from the keyboard', () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.button);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetFrames = vi.fn<(updates: readonly ControlInspectorFrameUpdate[]) => boolean>(
      () => true,
    );
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={onSetFrames}
        onSetProperties={() => true}
        selection={selection}
      />,
    );

    const x = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'X' });
    const startingX = Number(x.value);
    x.focus();
    fireEvent.keyDown(x, { key: 'ArrowUp' });
    expect(x).toHaveValue(startingX + 1);
    fireEvent.keyDown(x, { key: 'ArrowUp', shiftKey: true });
    expect(x).toHaveValue(startingX + 11);
    expect(onSetFrames).not.toHaveBeenCalled();
    fireEvent.keyDown(x, { key: 'Enter' });
    expect(onSetFrames.mock.calls[0]?.[0]?.[0]).toMatchObject({
      elementId,
      frame: { x: startingX + 11 },
    });

    onSetFrames.mockClear();
    x.focus();
    fireEvent.change(x, { target: { value: String(startingX + 50) } });
    fireEvent.keyDown(x, { key: 'Escape' });
    expect(x).toHaveValue(startingX);
    expect(onSetFrames).not.toHaveBeenCalled();
  });

  it('omits property fields that are not shared by every selected registry schema', () => {
    const first = createControlDocument(CONTROL_TYPES.button);
    const secondId = ElementIdSchema.parse('element_controlui_mixed_schema');
    const inserted = dispatchDocumentCommand(
      first.document,
      createControlInsertionCommand({
        boardId: first.document.boardIds[0]!,
        center: createWorldPoint(500, 240),
        controlType: CONTROL_TYPES.checkbox,
        document: first.document,
        elementId: secondId,
      }),
    );
    if (!inserted.ok || !inserted.changed) {
      throw new Error('Mixed-schema inspector fixture could not be inserted.');
    }
    const selection = new SelectionStore();
    selection.replace([first.elementId, secondId], secondId);
    render(
      <ControlInspector
        document={inserted.document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetProperties={() => true}
        selection={selection}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Position' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Size' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Checked' })).not.toBeInTheDocument();
  });

  it('renders registry boolean fields without a checkbox-specific inspector branch', () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.checkbox);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Checked' })).getByRole('button', {
        name: 'Checked',
      }),
    );
    expect(onSetProperties.mock.calls[0]?.[0]?.[0]).toMatchObject({
      elementId,
      properties: { checked: true, text: 'Checkbox' },
    });
  });

  it('edits Image content through its registry-owned Text section', () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.imagePlaceholder);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );
    const content = screen.getByRole('textbox', { name: 'Content' });
    fireEvent.change(content, { target: { value: 'Product photo' } });
    fireEvent.blur(content);
    expect(onSetProperties.mock.calls[0]?.[0]?.[0]).toMatchObject({
      elementId,
      properties: { text: 'Product photo' },
    });
  });

  it('renders Arrow choice and number fields through the generic inspector vocabulary', () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.arrow);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    expect(screen.getAllByRole('heading', { name: 'Arrow' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Visual 2' }));
    expect(onSetProperties.mock.calls[0]?.[0]?.[0]).toMatchObject({
      elementId,
      properties: { routing: 'visual-2' },
    });
    const labelPosition = screen.getByRole('spinbutton', { name: 'Label Position' });
    fireEvent.change(labelPosition, { target: { value: '0.75' } });
    fireEvent.blur(labelPosition);
    expect(onSetProperties.mock.calls[1]?.[0]?.[0]).toMatchObject({
      elementId,
      properties: { labelPosition: 0.75 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Choose Color' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accent' }));
    expect(onSetProperties.mock.calls[2]?.[0]?.[0]).toMatchObject({
      elementId,
      properties: { color: DESIGN_TOKENS.color.accentStrong },
    });
  });

  it('commits a bounded range field once when its pointer gesture completes', () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.hRule);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    const opacity = screen.getByRole('slider', { name: 'Opacity' });
    fireEvent.change(opacity, { target: { value: '0.7' } });
    fireEvent.change(opacity, { target: { value: '0.5' } });
    expect(onSetProperties).not.toHaveBeenCalled();
    fireEvent.pointerUp(opacity, { target: { value: '0.5' } });
    expect(onSetProperties).toHaveBeenCalledOnce();
    expect(onSetProperties.mock.calls[0]?.[0]?.[0]).toMatchObject({
      elementId,
      properties: { opacity: 0.5 },
    });
    fireEvent.blur(opacity);
    expect(onSetProperties).toHaveBeenCalledOnce();
  });

  it('commits a cancelled range gesture once even when blur follows', () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.hRule);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    render(
      <ControlInspector
        document={document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    const opacity = screen.getByRole('slider', { name: 'Opacity' });
    fireEvent.change(opacity, { target: { value: '0.4' } });
    fireEvent.pointerCancel(opacity, { target: { value: '0.4' } });
    fireEvent.blur(opacity);

    expect(onSetProperties).toHaveBeenCalledOnce();
    expect(onSetProperties.mock.calls[0]?.[0]?.[0]).toMatchObject({
      elementId,
      properties: { opacity: 0.4 },
    });
  });

  it('unifies a mixed range selection to its minimum exactly once', () => {
    const first = createControlDocument(CONTROL_TYPES.hRule);
    const secondId = ElementIdSchema.parse('element_controlui_mixed_range');
    const inserted = dispatchDocumentCommand(
      first.document,
      createControlInsertionCommand({
        boardId: first.document.boardIds[0]!,
        center: createWorldPoint(500, 240),
        controlType: CONTROL_TYPES.hRule,
        document: first.document,
        elementId: secondId,
      }),
    );
    if (!inserted.ok || !inserted.changed) {
      throw new Error('Mixed range fixture control could not be inserted.');
    }
    const edited = dispatchDocumentCommand(inserted.document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId: secondId,
      properties: {
        ...inserted.document.elementsById[secondId]!.properties,
        opacity: 0.5,
      },
    });
    if (!edited.ok || !edited.changed) {
      throw new Error('Mixed range fixture control could not be edited.');
    }
    const selection = new SelectionStore();
    selection.replace([first.elementId, secondId], secondId);
    const onSetProperties = vi.fn<
      (updates: readonly ControlInspectorPropertiesUpdate[]) => boolean
    >(() => true);
    render(
      <ControlInspector
        document={edited.document}
        onAutoSize={() => Promise.resolve(true)}
        onSetFrames={() => true}
        onSetProperties={onSetProperties}
        selection={selection}
      />,
    );

    const opacity = screen.getByRole('slider', { name: 'Opacity' });
    expect(within(opacity.parentElement!).getByText('Mixed')).toBeInTheDocument();
    fireEvent.pointerUp(opacity, { target: { value: '0' } });
    fireEvent.blur(opacity);

    expect(onSetProperties).toHaveBeenCalledOnce();
    const updates = onSetProperties.mock.calls[0]?.[0];
    expect(updates).toHaveLength(2);
    expect(updates?.[0]).toMatchObject({
      elementId: first.elementId,
      properties: { opacity: 0 },
    });
    expect(updates?.[1]).toMatchObject({
      elementId: secondId,
      properties: { opacity: 0 },
    });
  });

  it('exposes the definition-owned Auto-Size action without a control-type branch', async () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.button);
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    const onAutoSize = vi.fn<(id: typeof elementId) => Promise<boolean>>(() =>
      Promise.resolve(true),
    );
    render(
      <ControlInspector
        document={document}
        onAutoSize={onAutoSize}
        onSetFrames={() => true}
        onSetProperties={() => true}
        selection={selection}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '↔ Auto-Size' }));
    await waitFor(() => expect(onAutoSize).toHaveBeenCalledOnce());
    expect(onAutoSize).toHaveBeenCalledWith(elementId);
  });

  it('puts the selected control identity in the fixed inspector header title', async () => {
    const { document, elementId } = createControlDocument(CONTROL_TYPES.button);
    const secondId = ElementIdSchema.parse('element_controlui_second');
    const secondCommand = createControlInsertionCommand({
      boardId: document.boardIds[0]!,
      center: createWorldPoint(500, 240),
      controlType: CONTROL_TYPES.rectangle,
      document,
      elementId: secondId,
    });
    const withSecond = dispatchDocumentCommand(document, secondCommand);
    if (!withSecond.ok || !withSecond.changed) {
      throw new Error('Second inspector-title fixture control could not be inserted.');
    }
    const selection = new SelectionStore();
    selection.selectOnly(elementId);
    render(
      <h2>
        <ControlInspectorTitle document={withSecond.document} selection={selection} />
      </h2>,
    );

    expect(screen.getByRole('heading', { name: 'Button' })).toBeInTheDocument();
    await act(() => selection.replace([elementId, secondId], secondId));
    expect(screen.getByRole('heading', { name: '2 Controls' })).toBeInTheDocument();
  });
});
