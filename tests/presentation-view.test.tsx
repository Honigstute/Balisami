import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  BoardIdSchema,
  CONTROL_TYPES,
  EMPTY_ELEMENT_ROW_DATA,
  ElementIdSchema,
  PROJECT_DOCUMENT_SCHEMA_VERSION,
  ProjectIdSchema,
  createElementRowId,
  createInitialControlRowState,
  getControlSpec,
  parseProjectDocument,
  type ProjectDocument,
} from '../src/domain';
import { createBoardPresentationProjection } from '../src/renderer/projects/board-presentation-projection';
import { PresentationView } from '../src/renderer/projects/PresentationView';
import type { ControlTextMeasurementService } from '../src/renderer/controls/control-text-measurement';

const HOME_ID = BoardIdSchema.parse('board_presenthome');
const HOME_ALTERNATE_ID = BoardIdSchema.parse('board_presenthomealt');
const DETAILS_ID = BoardIdSchema.parse('board_presentdetails');
const OFFICIAL_ELEMENT_ID = ElementIdSchema.parse('element_presentofficial');
const HOME_LINK_ID = ElementIdSchema.parse('element_presenthomelink');
const EXTERNAL_LINK_ID = ElementIdSchema.parse('element_presentexternal');
const ROW_LINK_ID = ElementIdSchema.parse('element_presentrows');

const createPresentationDocument = (
  homeLinkState: 'disabled' | 'normal' = 'normal',
): ProjectDocument => {
  const button = getControlSpec(CONTROL_TYPES.button);
  if (button === undefined) {
    throw new Error('Presentation fixture requires the Button control.');
  }
  const parsed = parseProjectDocument({
    schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
    id: ProjectIdSchema.parse('project_presentation'),
    name: 'Presentation fixture',
    boardIds: [HOME_ID, DETAILS_ID],
    componentIds: [],
    trashedBoardIds: [],
    boardsById: {
      [HOME_ID]: {
        id: HOME_ID,
        name: 'Home',
        note: { text: '' },
        childIds: [OFFICIAL_ELEMENT_ID],
        alternateIds: [HOME_ALTERNATE_ID],
        selectedAlternateId: HOME_ALTERNATE_ID,
      },
      [HOME_ALTERNATE_ID]: {
        id: HOME_ALTERNATE_ID,
        name: 'Concept',
        note: { text: '' },
        childIds: [HOME_LINK_ID],
        alternateIds: [],
        selectedAlternateId: null,
      },
      [DETAILS_ID]: {
        id: DETAILS_ID,
        name: 'Details',
        note: { text: '' },
        childIds: [EXTERNAL_LINK_ID],
        alternateIds: [],
        selectedAlternateId: null,
      },
    },
    componentsById: {},
    elementsById: {
      [OFFICIAL_ELEMENT_ID]: {
        id: OFFICIAL_ELEMENT_ID,
        controlType: button.type,
        controlVersion: button.fileVersion,
        frame: { x: 30, y: 30, width: 180, height: 48 },
        locked: false,
        properties: { ...button.defaultProperties, text: 'Official content' },
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
      [HOME_LINK_ID]: {
        id: HOME_LINK_ID,
        controlType: button.type,
        controlVersion: button.fileVersion,
        frame: { x: 80, y: 70, width: 180, height: 48 },
        locked: false,
        properties: {
          ...button.defaultProperties,
          bold: true,
          color: '#445566',
          iconId: 'arrow-right',
          italic: true,
          state: homeLinkState,
          text: 'Open details',
          underline: true,
        },
        childIds: [],
        assetIds: [],
        link: { kind: 'board', boardId: DETAILS_ID },
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
      [EXTERNAL_LINK_ID]: {
        id: EXTERNAL_LINK_ID,
        controlType: button.type,
        controlVersion: button.fileVersion,
        frame: { x: 120, y: 90, width: 160, height: 48 },
        locked: false,
        properties: { ...button.defaultProperties, text: 'Open website' },
        childIds: [],
        assetIds: [],
        link: { kind: 'external', url: 'https://example.com/demo' },
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
    },
    assetsById: {},
  });
  if (!parsed.ok) {
    throw new Error(`Presentation fixture is invalid: ${JSON.stringify(parsed.issues)}`);
  }
  return parsed.value;
};

const createRowPresentationDocument = (): ProjectDocument => {
  const breadcrumbs = getControlSpec(CONTROL_TYPES.breadcrumbs);
  if (breadcrumbs === undefined) throw new Error('Breadcrumbs definition is missing.');
  const properties = { ...breadcrumbs.defaultProperties, items: 'Home › Products › Details' };
  const initialRows = createInitialControlRowState(breadcrumbs, ROW_LINK_ID, properties)?.rowData;
  if (initialRows === undefined) throw new Error('Breadcrumb rows could not be created.');
  const parsed = parseProjectDocument({
    schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
    id: ProjectIdSchema.parse('project_rowpresentation'),
    name: 'Row presentation fixture',
    boardIds: [HOME_ID, DETAILS_ID],
    componentIds: [],
    trashedBoardIds: [],
    boardsById: {
      [HOME_ID]: {
        id: HOME_ID,
        name: 'Home',
        note: { text: '' },
        childIds: [ROW_LINK_ID],
        alternateIds: [],
        selectedAlternateId: null,
      },
      [DETAILS_ID]: {
        id: DETAILS_ID,
        name: 'Details',
        note: { text: '' },
        childIds: [],
        alternateIds: [],
        selectedAlternateId: null,
      },
    },
    componentsById: {},
    elementsById: {
      [ROW_LINK_ID]: {
        id: ROW_LINK_ID,
        controlType: breadcrumbs.type,
        controlVersion: breadcrumbs.fileVersion,
        frame: { x: 30, y: 30, width: 240, height: 28 },
        locked: false,
        properties,
        childIds: [],
        assetIds: [],
        link: null,
        rowData: {
          ...initialRows,
          bindings: initialRows.bindings.map((binding, index) => ({
            ...binding,
            link:
              index === 0
                ? { kind: 'board', boardId: DETAILS_ID }
                : index === 1
                  ? { kind: 'external', url: 'https://example.com/products' }
                  : null,
          })),
        },
      },
    },
    assetsById: {},
  });
  if (!parsed.ok) throw new Error(`Row presentation fixture is invalid.`);
  return parsed.value;
};

const createSelectedRowPresentationDocument = (): ProjectDocument => {
  const buttonBar = getControlSpec(CONTROL_TYPES.buttonBar);
  if (buttonBar === undefined) throw new Error('Button Bar definition is missing.');
  const initial = createInitialControlRowState(buttonBar, ROW_LINK_ID, buttonBar.defaultProperties);
  if (initial === undefined) throw new Error('Button Bar rows could not be created.');
  const selectedId = initial.rowData.bindings[0]!.id;
  const input = {
    schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
    id: ProjectIdSchema.parse('project_selectedrowpresentation'),
    name: 'Selected row presentation fixture',
    boardIds: [HOME_ID],
    componentIds: [],
    trashedBoardIds: [],
    boardsById: {
      [HOME_ID]: {
        id: HOME_ID,
        name: 'Home',
        note: { text: '' },
        childIds: [ROW_LINK_ID],
        alternateIds: [],
        selectedAlternateId: null,
      },
    },
    componentsById: {},
    elementsById: {
      [ROW_LINK_ID]: {
        id: ROW_LINK_ID,
        controlType: buttonBar.type,
        controlVersion: buttonBar.fileVersion,
        frame: { x: 30, y: 30, width: 180, height: 28 },
        locked: false,
        properties: initial.properties,
        childIds: [],
        assetIds: [],
        link: null,
        rowData: {
          ...initial.rowData,
          bindings: initial.rowData.bindings.map((binding) => ({
            ...binding,
            link: { kind: 'external' as const, url: `https://example.com/${binding.generation}` },
          })),
        },
      },
    },
    assetsById: {},
  };
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) throw new Error('Selected row presentation fixture is invalid.');
  expect(parsed.value.elementsById[ROW_LINK_ID]?.properties.selectedRowId).toBe(selectedId);
  return parsed.value;
};

const rowTextMeasurementService: ControlTextMeasurementService = {
  measure: ({ fontSize, text }) => ({
    baselineOffsets: [fontSize],
    height: fontSize * 1.2,
    lineCount: 1,
    lineHeight: fontSize * 1.2,
    lines: [text],
    width: [...text].reduce((width, character) => width + (character === 'W' ? 9 : 4), 0),
  }),
};

describe('board presentation', () => {
  it('projects the selected alternate rather than stale official content', () => {
    const projection = createBoardPresentationProjection(createPresentationDocument(), HOME_ID);
    expect(projection).toMatchObject({
      canonicalBoardId: HOME_ID,
      presentationBoardId: HOME_ALTERNATE_ID,
      versionName: 'Concept',
    });
    expect(projection?.items.map((item) => item.id)).toEqual([HOME_LINK_ID]);
    expect(projection?.items[0]?.icon).toMatchObject({
      definition: { id: 'arrow-right' },
      kind: 'catalog',
    });
    expect(projection?.items[0]).toMatchObject({ fillColor: '#445566', strokeColor: undefined });
  });

  it('navigates linked boards, supports back/forward, opens external links, and exits', () => {
    const onExit = vi.fn();
    const onOpenExternal = vi.fn().mockResolvedValue(true);
    render(
      <PresentationView
        document={createPresentationDocument()}
        initialBoardId={HOME_ID}
        onExit={onExit}
        onOpenExternal={onOpenExternal}
      />,
    );

    expect(screen.getByText('Home · Concept')).toBeInTheDocument();
    expect(document.querySelector('[data-icon-id="arrow-right"]')).toBeInTheDocument();
    const presentationControl = document.querySelector(
      `[data-presentation-element-id='${HOME_LINK_ID}']`,
    );
    expect(presentationControl?.querySelector('.scene-control__fill')).toHaveStyle({
      fill: '#445566',
    });
    const homeLink = screen.getByRole('link', { name: 'Open details' });
    const exit = screen.getByRole('button', { name: 'Exit presentation' });
    expect(exit).toHaveFocus();
    fireEvent.keyDown(exit, { key: 'Tab', shiftKey: true });
    expect(homeLink).toHaveFocus();
    fireEvent.keyDown(homeLink, { key: 'Tab' });
    expect(exit).toHaveFocus();

    fireEvent.keyDown(homeLink, { key: 'Enter' });
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();

    fireEvent.click(screen.getByRole('link', { name: 'Open website' }));
    expect(onOpenExternal).toHaveBeenCalledWith('https://example.com/demo');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Home · Concept')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    expect(screen.getByText('Details')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Wireframe presentation' }), {
      key: 'Escape',
    });
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('keeps a disabled control link persisted but removes activation and tab focus', () => {
    const onOpenExternal = vi.fn().mockResolvedValue(true);
    const view = render(
      <PresentationView
        document={createPresentationDocument('disabled')}
        initialBoardId={HOME_ID}
        onExit={vi.fn()}
        onOpenExternal={onOpenExternal}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Open details' })).not.toBeInTheDocument();
    const disabledControl = screen.getByRole('button', { name: 'Open details' });
    expect(disabledControl).toHaveAttribute('aria-disabled', 'true');
    expect(disabledControl).not.toHaveAttribute('tabindex');
    fireEvent.click(disabledControl);
    fireEvent.keyDown(disabledControl, { key: 'Enter' });
    fireEvent.keyDown(disabledControl, { key: ' ' });
    expect(screen.getByText('Home · Concept')).toBeInTheDocument();
    expect(onOpenExternal).not.toHaveBeenCalled();

    view.rerender(
      <PresentationView
        document={createPresentationDocument('normal')}
        initialBoardId={HOME_ID}
        onExit={vi.fn()}
        onOpenExternal={onOpenExternal}
      />,
    );
    const restoredLink = screen.getByRole('link', { name: 'Open details' });
    expect(restoredLink).toHaveAttribute('tabindex', '0');
    fireEvent.click(restoredLink);
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('places row targets above painted text and activates the exact linked row', () => {
    const onOpenExternal = vi.fn().mockResolvedValue(true);
    render(
      <PresentationView
        document={createRowPresentationDocument()}
        initialBoardId={HOME_ID}
        onExit={vi.fn()}
        onOpenExternal={onOpenExternal}
        textMeasurementService={rowTextMeasurementService}
      />,
    );

    const external = screen.getByRole('link', { name: 'Products' });
    expect(external).toHaveAttribute(
      'data-presentation-row-id',
      createElementRowId(ROW_LINK_ID, 1),
    );
    const paintedText = document.querySelector(
      `[data-presentation-element-id='${ROW_LINK_ID}'] .scene-control__text`,
    );
    if (paintedText === null) throw new Error('Painted breadcrumb text is missing.');
    expect(paintedText.compareDocumentPosition(external) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    fireEvent.keyDown(external, { key: 'Enter' });
    expect(onOpenExternal).toHaveBeenCalledWith('https://example.com/products');

    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('exposes the stable selected row as the current linked segment', () => {
    render(
      <PresentationView
        document={createSelectedRowPresentationDocument()}
        initialBoardId={HOME_ID}
        onExit={vi.fn()}
        onOpenExternal={vi.fn().mockResolvedValue(true)}
        textMeasurementService={rowTextMeasurementService}
      />,
    );

    expect(screen.getByRole('link', { name: 'One' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Two' })).not.toHaveAttribute('aria-current');
  });
});
