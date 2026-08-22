import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  CONTROL_TYPES,
  ElementIdSchema,
  ProjectIdSchema,
  createEmptyProjectDocument,
  dispatchDocumentCommand,
  listPaletteControlSpecs,
} from '../src/domain';
import { createControlInsertionCommand } from '../src/renderer/controls/control-insertion';
import { createWorldPoint, createWorldRect } from '../src/renderer/editor/viewport-transform';

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
      expect(document.elementsById[elementId]).toMatchObject({
        controlType: spec.type,
        frame: {
          height: spec.defaultSize.height,
          width: spec.defaultSize.width,
        },
        properties: spec.defaultProperties,
      });
    }

    expect(document.boardsById[boardId]?.childIds).toHaveLength(22);
    expect(
      document.boardsById[boardId]?.childIds.map((id) => document.elementsById[id]?.controlType),
    ).toEqual([
      CONTROL_TYPES.rectangle,
      CONTROL_TYPES.textLabel,
      CONTROL_TYPES.button,
      CONTROL_TYPES.textInput,
      CONTROL_TYPES.checkbox,
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
    ]);
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
