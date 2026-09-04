import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  ProjectIdSchema,
  createInitialControlRowState,
  createEmptyProjectDocument,
  dispatchDocumentCommand,
  getControlSpec,
  listPaletteControlSpecs,
} from '../src/domain';
import { createControlInsertionCommand } from '../src/renderer/controls/control-insertion';
import { createWorldPoint, createWorldRect } from '../src/renderer/editor/viewport-transform';
import { decodeProjectFileEnvelope, encodeProjectFileEnvelope } from '../src/persistence';

describe('registry-backed control insertion', () => {
  it('creates every palette control through the canonical command boundary', () => {
    const boardId = BoardIdSchema.parse('board_controlinsert');
    const created = createEmptyProjectDocument({
      boardId,
      projectId: ProjectIdSchema.parse('project_controlinsert'),
    });
    if (!created.ok) {
      throw new Error('Insertion fixture is invalid.');
    }
    let document = created.value;

    for (const [index, spec] of listPaletteControlSpecs().entries()) {
      const elementId = ElementIdSchema.parse(`element_controlinsert${String(index)}`);
      const command = createControlInsertionCommand({
        boardId,
        center: createWorldPoint(400, 300),
        controlType: spec.type,
        document,
        elementId,
      });
      expect(command).toBeDefined();
      const result = dispatchDocumentCommand(document, command);
      expect(result).toMatchObject({ changed: true, ok: true });
      if (!result.ok || !result.changed) {
        throw new Error('Control insertion did not commit.');
      }
      document = result.document;
      const initialRowState = createInitialControlRowState(spec, elementId, spec.defaultProperties);
      if (initialRowState === undefined) {
        throw new Error(`Control '${spec.type}' has invalid registry row defaults.`);
      }
      expect(document.elementsById[elementId]).toMatchObject({
        controlType: spec.type,
        frame: {
          height: spec.defaultSize.height,
          width: spec.defaultSize.width,
        },
        properties: initialRowState.properties,
        rowData: initialRowState.rowData,
      });
    }

    expect(document.boardsById[boardId]?.childIds).toHaveLength(48);
    expect(
      document.boardsById[boardId]?.childIds.map((id) => document.elementsById[id]?.controlType),
    ).toEqual([
      CONTROL_TYPES.rectangle,
      CONTROL_TYPES.textLabel,
      CONTROL_TYPES.textSubtitle,
      CONTROL_TYPES.textTitle,
      CONTROL_TYPES.button,
      CONTROL_TYPES.textInput,
      CONTROL_TYPES.checkbox,
      CONTROL_TYPES.checkboxGroup,
      CONTROL_TYPES.radioButton,
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

  it('applies a preset through the shared schema without changing persisted control type', () => {
    const boardId = BoardIdSchema.parse('board_controlpreset');
    const created = createEmptyProjectDocument({
      boardId,
      projectId: ProjectIdSchema.parse('project_controlpreset'),
    });
    if (!created.ok) throw new Error('Preset insertion fixture is invalid.');
    const request = {
      boardId,
      center: createWorldPoint(200, 160),
      controlType: CONTROL_TYPES.textInput,
      document: created.value,
      elementId: ElementIdSchema.parse('element_controlpreset'),
    } as const;

    const command = createControlInsertionCommand({ ...request, presetId: 'underline' });
    expect(command?.element).toMatchObject({
      controlType: CONTROL_TYPES.textInput,
      properties: { borderMode: 'underline' },
    });
    expect(createControlInsertionCommand({ ...request, presetId: 'unknown' })).toBeUndefined();

    const searchId = ElementIdSchema.parse('element_searchpreset');
    const searchCommand = createControlInsertionCommand({
      ...request,
      controlType: CONTROL_TYPES.searchBox,
      elementId: searchId,
      presetId: 'rectangular-microphone',
    });
    expect(searchCommand?.element).toMatchObject({
      controlType: CONTROL_TYPES.searchBox,
      properties: { microphoneIcon: true, searchIcon: true, shape: 'rectangular' },
    });
    const inserted = dispatchDocumentCommand(created.value, searchCommand);
    if (!inserted.ok || !inserted.changed) throw new Error('Search Box preset did not insert.');
    const encoded = encodeProjectFileEnvelope(inserted.document, {});
    if (!encoded.ok) throw new Error('Search Box preset did not encode.');
    const reopened = decodeProjectFileEnvelope(encoded.value);
    if (!reopened.ok) throw new Error('Search Box preset did not reopen.');
    expect(reopened.value.document.elementsById[searchId]).toEqual(
      inserted.document.elementsById[searchId],
    );
  });

  it('round-trips an edited linked Text Area through the current project format', () => {
    const boardId = BoardIdSchema.parse('board_textarea_codec');
    const elementId = ElementIdSchema.parse('element_textarea_codec');
    const created = createEmptyProjectDocument({
      boardId,
      projectId: ProjectIdSchema.parse('project_textarea_codec'),
    });
    const definition = getControlSpec(CONTROL_TYPES.textArea);
    if (!created.ok || definition === undefined) {
      throw new Error('Text Area codec fixture is incomplete.');
    }
    const inserted = dispatchDocumentCommand(
      created.value,
      createControlInsertionCommand({
        boardId,
        center: createWorldPoint(300, 240),
        controlType: definition.type,
        document: created.value,
        elementId,
      }),
    );
    if (!inserted.ok || !inserted.changed) throw new Error('Text Area did not insert.');
    const styled = dispatchDocumentCommand(inserted.document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId,
      properties: {
        ...definition.defaultProperties,
        bold: true,
        borderColor: '#112233',
        color: '#445566',
        fontSize: 18,
        italic: true,
        opacity: 0.65,
        scrollbar: true,
        state: 'disabled',
        text: 'First line\nSecond line',
        textAlignment: 'end',
        textColor: '#778899',
        underline: true,
      },
    });
    if (!styled.ok || !styled.changed) throw new Error('Text Area style did not commit.');
    const linked = dispatchDocumentCommand(styled.document, {
      type: DOCUMENT_COMMAND_TYPES.setElementLink,
      elementId,
      link: { kind: 'external', url: 'https://example.com/notes' },
    });
    if (!linked.ok || !linked.changed) throw new Error('Text Area link did not commit.');

    const encoded = encodeProjectFileEnvelope(linked.document, {});
    if (!encoded.ok) throw new Error('Text Area project did not encode.');
    const reopened = decodeProjectFileEnvelope(encoded.value);
    if (!reopened.ok) throw new Error('Text Area project did not reopen.');
    expect(reopened.value.document.elementsById[elementId]).toEqual(
      linked.document.elementsById[elementId],
    );
  });

  it('round-trips an edited Tooltip direction and text style through the current project format', () => {
    const boardId = BoardIdSchema.parse('board_tooltip_codec');
    const elementId = ElementIdSchema.parse('element_tooltip_codec');
    const created = createEmptyProjectDocument({
      boardId,
      projectId: ProjectIdSchema.parse('project_tooltip_codec'),
    });
    const definition = getControlSpec(CONTROL_TYPES.tooltip);
    if (!created.ok || definition === undefined) {
      throw new Error('Tooltip codec fixture is incomplete.');
    }
    const inserted = dispatchDocumentCommand(
      created.value,
      createControlInsertionCommand({
        boardId,
        center: createWorldPoint(300, 240),
        controlType: definition.type,
        document: created.value,
        elementId,
      }),
    );
    if (!inserted.ok || !inserted.changed) throw new Error('Tooltip did not insert.');
    const styled = dispatchDocumentCommand(inserted.document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId,
      properties: {
        ...definition.defaultProperties,
        bold: true,
        direction: 'NW',
        fontSize: 18,
        italic: true,
        text: 'More details',
        textAlignment: 'end',
        underline: true,
      },
    });
    if (!styled.ok || !styled.changed) throw new Error('Tooltip style did not commit.');

    const encoded = encodeProjectFileEnvelope(styled.document, {});
    if (!encoded.ok) throw new Error('Tooltip project did not encode.');
    const reopened = decodeProjectFileEnvelope(encoded.value);
    if (!reopened.ok) throw new Error('Tooltip project did not reopen.');
    expect(reopened.value.document.elementsById[elementId]).toEqual(
      styled.document.elementsById[elementId],
    );
  });

  it.each([
    ['subtitle', CONTROL_TYPES.textSubtitle],
    ['title', CONTROL_TYPES.textTitle],
  ] as const)(
    'round-trips an edited linked Text %s through the current project format',
    (name, controlType) => {
      const boardId = BoardIdSchema.parse(`board_text${name}_codec`);
      const elementId = ElementIdSchema.parse(`element_text${name}_codec`);
      const created = createEmptyProjectDocument({
        boardId,
        projectId: ProjectIdSchema.parse(`project_text${name}_codec`),
      });
      const definition = getControlSpec(controlType);
      if (!created.ok || definition === undefined) {
        throw new Error(`Text ${name} codec fixture is incomplete.`);
      }
      const inserted = dispatchDocumentCommand(
        created.value,
        createControlInsertionCommand({
          boardId,
          center: createWorldPoint(300, 240),
          controlType,
          document: created.value,
          elementId,
        }),
      );
      if (!inserted.ok || !inserted.changed) throw new Error(`Text ${name} did not insert.`);
      const styled = dispatchDocumentCommand(inserted.document, {
        type: DOCUMENT_COMMAND_TYPES.setElementProperties,
        elementId,
        properties: {
          ...definition.defaultProperties,
          bold: true,
          fontSize: name === 'title' ? 44 : 26,
          italic: true,
          text: `Edited ${name}`,
          textAlignment: 'end',
          textColor: '#336699',
          underline: true,
        },
      });
      if (!styled.ok || !styled.changed) throw new Error(`Text ${name} style did not commit.`);
      const linked = dispatchDocumentCommand(styled.document, {
        type: DOCUMENT_COMMAND_TYPES.setElementLink,
        elementId,
        link: { kind: 'external', url: `https://example.com/${name}` },
      });
      if (!linked.ok || !linked.changed) throw new Error(`Text ${name} link did not commit.`);

      const encoded = encodeProjectFileEnvelope(linked.document, {});
      if (!encoded.ok) throw new Error(`Text ${name} project did not encode.`);
      const reopened = decodeProjectFileEnvelope(encoded.value);
      if (!reopened.ok) throw new Error(`Text ${name} project did not reopen.`);
      expect(reopened.value.document.elementsById[elementId]).toEqual(
        linked.document.elementsById[elementId],
      );
    },
  );

  it('round-trips an edited multiline Callout through the current project format', () => {
    const boardId = BoardIdSchema.parse('board_callout_codec');
    const elementId = ElementIdSchema.parse('element_callout_codec');
    const created = createEmptyProjectDocument({
      boardId,
      projectId: ProjectIdSchema.parse('project_callout_codec'),
    });
    const definition = getControlSpec(CONTROL_TYPES.callout);
    if (!created.ok || definition === undefined) {
      throw new Error('Callout codec fixture is incomplete.');
    }
    const inserted = dispatchDocumentCommand(
      created.value,
      createControlInsertionCommand({
        boardId,
        center: createWorldPoint(300, 240),
        controlType: CONTROL_TYPES.callout,
        document: created.value,
        elementId,
      }),
    );
    if (!inserted.ok || !inserted.changed) throw new Error('Callout did not insert.');
    const styled = dispatchDocumentCommand(inserted.document, {
      type: DOCUMENT_COMMAND_TYPES.setElementProperties,
      elementId,
      properties: {
        ...definition.defaultProperties,
        bold: true,
        color: '#ffcc00',
        fontSize: 18,
        italic: true,
        opacity: 0.55,
        text: 'Review this\nflow',
        underline: true,
      },
    });
    if (!styled.ok || !styled.changed) throw new Error('Callout style did not commit.');
    const encoded = encodeProjectFileEnvelope(styled.document, {});
    if (!encoded.ok) throw new Error('Callout project did not encode.');
    const reopened = decodeProjectFileEnvelope(encoded.value);
    if (!reopened.ok) throw new Error('Callout project did not reopen.');
    expect(reopened.value.document.elementsById[elementId]).toEqual(
      styled.document.elementsById[elementId],
    );
  });

  it('centers exact drag placement without the click-insertion cascade', () => {
    const boardId = BoardIdSchema.parse('board_controldrag');
    const created = createEmptyProjectDocument({
      boardId,
      projectId: ProjectIdSchema.parse('project_controldrag'),
    });
    if (!created.ok) {
      throw new Error('Drag insertion fixture is invalid.');
    }
    const firstId = ElementIdSchema.parse('element_controldrag_first');
    const first = createControlInsertionCommand({
      boardId,
      center: createWorldPoint(100, 100),
      controlType: CONTROL_TYPES.rectangle,
      document: created.value,
      elementId: firstId,
    });
    const inserted = dispatchDocumentCommand(created.value, first);
    if (!inserted.ok || !inserted.changed) {
      throw new Error('First drag insertion fixture control could not be inserted.');
    }
    const draggedId = ElementIdSchema.parse('element_controldrag_exact');
    const dragged = createControlInsertionCommand({
      boardId,
      center: createWorldPoint(400, 300),
      controlType: CONTROL_TYPES.button,
      document: inserted.document,
      elementId: draggedId,
      placement: 'exact',
    });

    expect(dragged?.element.frame).toEqual({ height: 40, width: 120, x: 340, y: 280 });
  });

  it('preserves an exact registry-constrained draw frame in the single create command', () => {
    const boardId = BoardIdSchema.parse('board_controldraw');
    const created = createEmptyProjectDocument({
      boardId,
      projectId: ProjectIdSchema.parse('project_controldraw'),
    });
    if (!created.ok) {
      throw new Error('Draw insertion fixture is invalid.');
    }
    const frame = createWorldRect(40, 50, 260, 180);
    const command = createControlInsertionCommand({
      boardId,
      center: createWorldPoint(170, 140),
      controlType: CONTROL_TYPES.rectangle,
      document: created.value,
      elementId: ElementIdSchema.parse('element_drawncontrol'),
      frame,
      placement: 'exact',
    });

    expect(command?.element.frame).toBe(frame);
    expect(command?.element.controlType).toBe(CONTROL_TYPES.rectangle);
    expect(
      createControlInsertionCommand({
        boardId,
        center: createWorldPoint(0, 0),
        controlType: CONTROL_TYPES.rectangle,
        document: created.value,
        elementId: ElementIdSchema.parse('element_invaliddraw'),
        frame: createWorldRect(0, 0, 1, 1),
        placement: 'exact',
      }),
    ).toBeUndefined();
  });
});
