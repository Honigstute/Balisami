import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  BoardIdSchema,
  CONTROL_TYPES,
  EMPTY_ELEMENT_ROW_DATA,
  ElementIdSchema,
  PROJECT_DOCUMENT_SCHEMA_VERSION,
  ProjectIdSchema,
  getControlSpec,
  parseProjectDocument,
  type ProjectDocument,
} from '../src/domain';
import { createBoardPresentationProjection } from '../src/renderer/projects/board-presentation-projection';
import { PresentationView } from '../src/renderer/projects/PresentationView';

const HOME_ID = BoardIdSchema.parse('board_presenthome');
const HOME_ALTERNATE_ID = BoardIdSchema.parse('board_presenthomealt');
const DETAILS_ID = BoardIdSchema.parse('board_presentdetails');
const OFFICIAL_ELEMENT_ID = ElementIdSchema.parse('element_presentofficial');
const HOME_LINK_ID = ElementIdSchema.parse('element_presenthomelink');
const EXTERNAL_LINK_ID = ElementIdSchema.parse('element_presentexternal');

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
});
