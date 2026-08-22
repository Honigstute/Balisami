import { useMemo } from 'react';

import {
  CONTROL_TYPES,
  EMPTY_ELEMENT_ROW_DATA,
  getControlSpec,
  type BoardId,
  type ComponentDefinition,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import { ThumbnailSceneSvg } from '../projects/BoardThumbnail';
import { createBoardThumbnailProjection } from '../projects/board-thumbnail-projection';
import type { ControlTextMeasurementService } from './control-text-measurement';

interface ComponentThumbnailProps {
  readonly assetUrls?: Readonly<Record<string, string>>;
  readonly component: ComponentDefinition;
  readonly document: ProjectDocument;
  readonly textMeasurementService?: ControlTextMeasurementService;
}

const createProjection = (
  document: ProjectDocument,
  component: ComponentDefinition,
  textMeasurementService?: ControlTextMeasurementService,
) => {
  const root = document.elementsById[component.rootElementId];
  const instanceDefinition = getControlSpec(CONTROL_TYPES.componentInstance);
  if (root === undefined || instanceDefinition === undefined) {
    return undefined;
  }
  // These IDs exist only in the disposable projection and cannot pass the
  // persisted stable-ID schema or leak into commands.
  const boardId = `board_component-preview:${component.id}` as BoardId;
  const instanceId = `element_component-preview:${component.id}` as ElementId;
  const projectionDocument = Object.freeze({
    ...document,
    boardIds: Object.freeze([...document.boardIds, boardId]),
    boardsById: Object.freeze({
      ...document.boardsById,
      [boardId]: Object.freeze({
        alternateIds: Object.freeze([]),
        childIds: Object.freeze([instanceId]),
        id: boardId,
        name: component.name,
        note: Object.freeze({ text: '' }),
        selectedAlternateId: null,
      }),
    }),
    elementsById: Object.freeze({
      ...document.elementsById,
      [instanceId]: Object.freeze({
        assetIds: Object.freeze([]),
        childIds: Object.freeze([]),
        controlType: CONTROL_TYPES.componentInstance,
        controlVersion: instanceDefinition.fileVersion,
        frame: Object.freeze({ height: root.frame.height, width: root.frame.width, x: 0, y: 0 }),
        id: instanceId,
        link: null,
        locked: false,
        properties: Object.freeze({ componentId: component.id, overrides: Object.freeze({}) }),
        rowData: EMPTY_ELEMENT_ROW_DATA,
      }),
    }),
  }) as ProjectDocument;
  return createBoardThumbnailProjection(projectionDocument, boardId, textMeasurementService);
};

export const ComponentThumbnail = ({
  assetUrls = {},
  component,
  document,
  textMeasurementService,
}: ComponentThumbnailProps) => {
  const projection = useMemo(
    () => createProjection(document, component, textMeasurementService),
    [component, document, textMeasurementService],
  );
  return projection === undefined ? null : (
    <ThumbnailSceneSvg
      assetUrls={assetUrls}
      className="control-library__preview"
      data-component-thumbnail={component.id}
      items={projection.items}
      viewBox={projection.viewBox}
    />
  );
};
