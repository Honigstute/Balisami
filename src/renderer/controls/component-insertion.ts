import {
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  EMPTY_ELEMENT_ROW_DATA,
  getControlSpec,
  type BoardId,
  type ComponentId,
  type CreateElementCommand,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import type { WorldPoint } from '../editor/viewport-transform';

/** Creates a lightweight instance using its definition root as canonical initial size. */
export const createComponentInstanceInsertionCommand = (
  document: ProjectDocument,
  boardId: BoardId,
  componentId: ComponentId,
  elementId: ElementId,
  center: WorldPoint,
): CreateElementCommand | undefined => {
  const board = document.boardsById[boardId];
  const component = document.componentsById[componentId];
  const root = component === undefined ? undefined : document.elementsById[component.rootElementId];
  const instanceDefinition = getControlSpec(CONTROL_TYPES.componentInstance);
  if (
    board === undefined ||
    component === undefined ||
    root === undefined ||
    instanceDefinition === undefined
  ) {
    return undefined;
  }
  const cascadeOffset = (board.childIds.length % 8) * 12;
  return Object.freeze({
    type: DOCUMENT_COMMAND_TYPES.createElement,
    element: Object.freeze({
      assetIds: Object.freeze([]),
      childIds: Object.freeze([]),
      controlType: CONTROL_TYPES.componentInstance,
      controlVersion: instanceDefinition.fileVersion,
      frame: Object.freeze({
        height: root.frame.height,
        width: root.frame.width,
        x: center.x - root.frame.width / 2 + cascadeOffset,
        y: center.y - root.frame.height / 2 + cascadeOffset,
      }),
      id: elementId,
      link: null,
      locked: false,
      properties: Object.freeze({ componentId, overrides: Object.freeze({}) }),
      rowData: EMPTY_ELEMENT_ROW_DATA,
    }),
    index: board.childIds.length,
    owner: Object.freeze({ boardId: board.id, kind: 'board' }),
  });
};
