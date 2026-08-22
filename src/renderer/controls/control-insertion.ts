import {
  DOCUMENT_COMMAND_TYPES,
  getControlPaletteEntry,
  getControlSpec,
  type AssetId,
  type BoardId,
  type ControlTypeId,
  type CreateElementCommand,
  type ElementId,
  type ProjectDocument,
  type WorldRect,
} from '../../domain';
import type { WorldPoint } from '../editor/viewport-transform';

export interface ControlInsertionRequest {
  readonly assetIds?: readonly AssetId[];
  readonly boardId: BoardId;
  readonly center: WorldPoint;
  readonly controlType: ControlTypeId;
  readonly document: ProjectDocument;
  readonly elementId: ElementId;
  /** Exact registry-constrained frame supplied by a completed draw gesture. */
  readonly frame?: WorldRect;
  readonly placement?: 'cascade' | 'exact';
  readonly presetId?: string;
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
  const paletteEntry = getControlPaletteEntry(request.controlType, request.presetId ?? null);
  if (
    board === undefined ||
    spec?.palette === null ||
    spec === undefined ||
    paletteEntry === undefined
  ) {
    return undefined;
  }
  const maximumSize = spec.maximumSize;
  if (
    request.frame !== undefined &&
    (request.placement !== 'exact' ||
      request.frame.width < spec.minimumSize.width ||
      request.frame.height < spec.minimumSize.height ||
      (maximumSize !== null && request.frame.width > maximumSize.width) ||
      (maximumSize !== null && request.frame.height > maximumSize.height))
  ) {
    return undefined;
  }

  const cascadeOffset = request.placement === 'exact' ? 0 : (board.childIds.length % 8) * 12;
  const frame =
    request.frame ??
    Object.freeze({
      height: spec.defaultSize.height,
      width: spec.defaultSize.width,
      x: request.center.x - spec.defaultSize.width / 2 + cascadeOffset,
      y: request.center.y - spec.defaultSize.height / 2 + cascadeOffset,
    });
  return Object.freeze({
    type: DOCUMENT_COMMAND_TYPES.createElement,
    element: Object.freeze({
      assetIds: Object.freeze([...(request.assetIds ?? [])]),
      childIds: Object.freeze([]),
      controlType: spec.type,
      controlVersion: spec.fileVersion,
      frame,
      id: request.elementId,
      link: null,
      locked: false,
      properties: paletteEntry.properties,
    }),
    index: board.childIds.length,
    owner: Object.freeze({ boardId: board.id, kind: 'board' }),
  });
};
