import {
  DOCUMENT_COMMAND_TYPES,
  getControlSpec,
  type BoardId,
  type ControlTypeId,
  type CreateElementCommand,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import type { WorldPoint } from '../editor/viewport-transform';

export interface ControlInsertionRequest {
  readonly boardId: BoardId;
  readonly center: WorldPoint;
  readonly controlType: ControlTypeId;
  readonly document: ProjectDocument;
  readonly elementId: ElementId;
}

/**
 * Builds one registry-backed insertion command. The board remains the sole
 * stacking authority; application code owns ID allocation and commit/selection.
 */
export const createControlInsertionCommand = (
  request: ControlInsertionRequest,
): CreateElementCommand | undefined => {
  const board = request.document.boardsById[request.boardId];
  const spec = getControlSpec(request.controlType);
  if (board === undefined || spec?.palette === null || spec === undefined) {
    return undefined;
  }

  const cascadeOffset = (board.childIds.length % 8) * 12;
  return Object.freeze({
    type: DOCUMENT_COMMAND_TYPES.createElement,
    element: Object.freeze({
      assetIds: Object.freeze([]),
      childIds: Object.freeze([]),
      controlType: spec.type,
      frame: Object.freeze({
        height: spec.defaultSize.height,
        width: spec.defaultSize.width,
        x: request.center.x - spec.defaultSize.width / 2 + cascadeOffset,
        y: request.center.y - spec.defaultSize.height / 2 + cascadeOffset,
      }),
      id: request.elementId,
      link: null,
      locked: false,
      properties: spec.defaultProperties,
    }),
    index: board.childIds.length,
    owner: Object.freeze({ boardId: board.id, kind: 'board' }),
  });
};
