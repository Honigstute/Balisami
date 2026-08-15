import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  ProjectIdSchema,
  createEmptyProjectDocument,
  containsControlHitPoint,
  dispatchDocumentCommand,
  getControlAccessibleName,
  getControlSpec,
  listPaletteControlSpecs,
} from '../src/domain';
import { decodeProjectFileEnvelope, encodeProjectFileEnvelope } from '../src/persistence';
import {
  createControlSceneMarkPath,
  createControlSceneOutlinePath,
} from '../src/renderer/controls/control-scene-geometry';
import { createControlSceneProjection } from '../src/renderer/controls/control-scene-projection';
import type { ControlTextMeasurementService } from '../src/renderer/controls/control-text-measurement';
import { createControlThumbnailProjection } from '../src/renderer/controls/control-thumbnail-projection';
import { createControlInsertionCommand } from '../src/renderer/controls/control-insertion';
import { createWorldPoint, createWorldRect } from '../src/renderer/editor/viewport-transform';

const measurementService: ControlTextMeasurementService = {
  measure: ({ fontSize, text }) => ({
    baselineOffsets: [fontSize],
    height: fontSize * 1.2,
    lineCount: 1,
    lineHeight: fontSize * 1.2,
    lines: [text.replace(/\r\n?|\n/gu, ' ')],
    width: text.length * fontSize * 0.5,
  }),
};

describe('control definition conformance harness', () => {
  it('inserts, validates, serializes, reopens, and redraws every palette definition', () => {
    const boardId = BoardIdSchema.parse('board_conformance');
    const created = createEmptyProjectDocument({
      boardId,
      projectId: ProjectIdSchema.parse('project_conformance'),
    });
    if (!created.ok) {
      throw new Error('Control conformance fixture is invalid.');
    }
    let document = created.value;
    const elementIds: ReturnType<typeof ElementIdSchema.parse>[] = [];

    for (const [index, definition] of listPaletteControlSpecs().entries()) {
      const elementId = ElementIdSchema.parse(`element_conformance${String(index)}`);
      const command = createControlInsertionCommand({
        boardId,
        center: createWorldPoint(200 + index * 40, 180 + index * 30),
        controlType: definition.type,
        document,
        elementId,
      });
      const result = dispatchDocumentCommand(document, command);
      if (!result.ok || !result.changed) {
        throw new Error(`Conformance insertion failed for '${definition.type}'.`);
      }
      document = result.document;
      if (definition.type === CONTROL_TYPES.checkbox) {
        const checked = dispatchDocumentCommand(document, {
          type: DOCUMENT_COMMAND_TYPES.setElementProperties,
          elementId,
          properties: { checked: true, text: 'Remember me' },
        });
        if (!checked.ok || !checked.changed) {
          throw new Error('Checkbox conformance state could not be applied.');
        }
        document = checked.document;
      }
      elementIds.push(elementId);
    }

    const encoded = encodeProjectFileEnvelope(document, {});
    if (!encoded.ok) {
      throw new Error('Conformance document could not be encoded.');
    }
    const decoded = decodeProjectFileEnvelope(encoded.value);
    if (!decoded.ok) {
      throw new Error('Conformance document could not be reopened.');
    }
    expect(decoded.value.document).toEqual(document);

    for (const elementId of elementIds) {
      const before = document.elementsById[elementId];
      const after = decoded.value.document.elementsById[elementId];
      if (before === undefined || after === undefined) {
        throw new Error('Conformance element is missing after reopen.');
      }
      const beforeBounds = createWorldRect(
        before.frame.x,
        before.frame.y,
        before.frame.width,
        before.frame.height,
      );
      const afterBounds = createWorldRect(
        after.frame.x,
        after.frame.y,
        after.frame.width,
        after.frame.height,
      );
      const definition = getControlSpec(before.controlType);
      if (definition === undefined) {
        throw new Error('Conformance control definition is missing after reopen.');
      }
      expect(
        containsControlHitPoint(
          definition,
          beforeBounds,
          before.properties,
          createWorldPoint(
            beforeBounds.x + beforeBounds.width / 2,
            beforeBounds.y + beforeBounds.height / 2,
          ),
        ),
      ).toBe(true);
      expect(getControlAccessibleName(definition, before.properties)).not.toBe('');
      expect(definition.export.kind).toBe('scene');
      expect(createControlThumbnailProjection(definition, measurementService)).toEqual(
        createControlThumbnailProjection(definition, measurementService),
      );
      expect(
        createControlSceneProjection({
          bounds: beforeBounds,
          definition,
          identity: before.id,
          properties: before.properties,
          textMeasurementService: measurementService,
        }),
      ).toEqual(
        createControlSceneProjection({
          bounds: afterBounds,
          definition,
          identity: after.id,
          properties: after.properties,
          textMeasurementService: measurementService,
        }),
      );
      expect(createControlSceneOutlinePath(before.controlType, beforeBounds, before.id)).toBe(
        createControlSceneOutlinePath(after.controlType, afterBounds, after.id),
      );
      expect(
        createControlSceneMarkPath(before.controlType, beforeBounds, before.id, before.properties),
      ).toBe(
        createControlSceneMarkPath(after.controlType, afterBounds, after.id, after.properties),
      );
      if (before.controlType === CONTROL_TYPES.checkbox) {
        expect(getControlAccessibleName(definition, before.properties)).toBe('Remember me');
        expect(
          createControlSceneMarkPath(
            before.controlType,
            beforeBounds,
            before.id,
            before.properties,
          ),
        ).not.toBe('');
      }
    }
  });
});
