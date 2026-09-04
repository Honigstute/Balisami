import {
  getControlAccessibleName,
  getControlSpec,
  selectBoardPresentationId,
  type BoardId,
  type AssetId,
  type ControlTypeId,
  type ControlVisualKind,
  type ControlAccessibilityRole,
  type ElementId,
  type ElementLink,
  type ProjectDocument,
} from '../../domain';
import { controlSceneHasFill, controlSceneHasOutline } from '../controls/control-scene-geometry';
import {
  createControlSceneProjection,
  type ControlSceneProjection,
} from '../controls/control-scene-projection';
import type { ControlTextMeasurementService } from '../controls/control-text-measurement';
import { createBoardSceneItems } from '../editor/document-scene-model';
import { createWorldRect, type WorldRect } from '../editor/viewport-transform';

export const BOARD_PRESENTATION_PADDING_RATIO = 0.08;

export interface BoardPresentationItem extends ControlSceneProjection {
  readonly accessibleName: string;
  readonly assetIds: readonly AssetId[];
  readonly checked: boolean | undefined;
  readonly controlType: ControlTypeId;
  readonly hasFill: boolean;
  readonly hasOutline: boolean;
  readonly id: ElementId;
  readonly link: ElementLink | null;
  readonly opacity: number | undefined;
  readonly role: ControlAccessibilityRole;
  readonly rowLinks: readonly BoardPresentationRowLink[];
  readonly strokeStyle: string | undefined;
  readonly visualKind: ControlVisualKind;
}

export interface BoardPresentationRowLink {
  readonly bounds: WorldRect;
  readonly label: string;
  readonly link: ElementLink;
  readonly rowId: string;
  readonly selected: boolean;
}

export interface BoardPresentationProjection {
  readonly canonicalBoardId: BoardId;
  readonly canonicalBoardName: string;
  readonly items: readonly BoardPresentationItem[];
  readonly presentationBoardId: BoardId;
  readonly versionName: string;
  readonly viewBox: WorldRect;
}

const getContentBounds = (
  items: ReturnType<typeof createBoardSceneItems>,
): WorldRect | undefined => {
  const first = items[0];
  if (first === undefined) {
    return undefined;
  }
  let left = first.bounds.x;
  let top = first.bounds.y;
  let right = first.bounds.x + first.bounds.width;
  let bottom = first.bounds.y + first.bounds.height;
  for (const item of items.slice(1)) {
    left = Math.min(left, item.bounds.x);
    top = Math.min(top, item.bounds.y);
    right = Math.max(right, item.bounds.x + item.bounds.width);
    bottom = Math.max(bottom, item.bounds.y + item.bounds.height);
  }
  return createWorldRect(left, top, right - left, bottom - top);
};

/** Registry-backed, uncapped projection shared by live presentation and later export. */
export const createBoardPresentationProjection = (
  document: ProjectDocument,
  canonicalBoardId: BoardId,
  textMeasurementService?: ControlTextMeasurementService,
): BoardPresentationProjection | undefined => {
  if (!document.boardIds.includes(canonicalBoardId)) {
    return undefined;
  }
  const canonicalBoard = document.boardsById[canonicalBoardId];
  const presentationBoardId = selectBoardPresentationId(document, canonicalBoardId);
  const presentationBoard =
    presentationBoardId === undefined ? undefined : document.boardsById[presentationBoardId];
  if (
    canonicalBoard === undefined ||
    presentationBoardId === undefined ||
    presentationBoard === undefined
  ) {
    return undefined;
  }
  const sceneItems = createBoardSceneItems(document, presentationBoardId).filter(
    (item) => item.kind === 'object',
  );
  const contentBounds = getContentBounds(sceneItems);
  const viewBox =
    contentBounds === undefined
      ? createWorldRect(0, 0, 4, 3)
      : (() => {
          const padding =
            Math.max(contentBounds.width, contentBounds.height) * BOARD_PRESENTATION_PADDING_RATIO;
          return createWorldRect(
            contentBounds.x - padding,
            contentBounds.y - padding,
            contentBounds.width + padding * 2,
            contentBounds.height + padding * 2,
          );
        })();
  const items = sceneItems.map((item): BoardPresentationItem => {
    const definition = getControlSpec(item.controlType);
    if (definition === undefined) {
      throw new Error(`Board presentation received unknown control '${item.controlType}'.`);
    }
    const checkedProperty = definition.accessibility.checkedProperty;
    const strokeStyle = item.properties.strokeStyle;
    const projection = createControlSceneProjection({
      bounds: item.bounds,
      definition,
      identity: item.id,
      properties: item.properties,
      rowData: item.rowData,
      textMeasurementService,
    });
    const rowLinks = projection.rows.flatMap((row) =>
      row.link === null || row.disabled
        ? []
        : [
            Object.freeze({
              bounds: row.bounds,
              label: row.label,
              link: row.link,
              rowId: row.id,
              selected: projection.selectedRow?.id === row.id,
            }),
          ],
    );
    return Object.freeze({
      ...projection,
      accessibleName: getControlAccessibleName(definition, item.properties),
      assetIds: item.assetIds,
      checked: checkedProperty === null ? undefined : item.properties[checkedProperty] === true,
      controlType: item.controlType,
      hasFill:
        controlSceneHasFill(definition) &&
        !(definition.scene.kind === 'image' && item.assetIds.length > 0),
      hasOutline: controlSceneHasOutline(definition) && projection.borderVisible,
      id: item.id,
      link: item.link,
      role: definition.accessibility.role,
      rowLinks: Object.freeze(rowLinks),
      strokeStyle: typeof strokeStyle === 'string' ? strokeStyle : undefined,
      visualKind: item.visualKind,
    });
  });
  return Object.freeze({
    canonicalBoardId,
    canonicalBoardName: canonicalBoard.name,
    items: Object.freeze(items),
    presentationBoardId,
    versionName: presentationBoardId === canonicalBoardId ? 'Official' : presentationBoard.name,
    viewBox,
  });
};
