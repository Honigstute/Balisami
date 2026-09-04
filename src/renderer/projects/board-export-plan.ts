import type { BoardId, ElementId, ProjectDocument } from '../../domain';
import type { ControlTextMeasurementService } from '../controls/control-text-measurement';
import {
  createBoardPresentationProjection,
  filterBoardPresentationProjection,
  type BoardPresentationProjection,
} from './board-presentation-projection';

export type BoardExportScope =
  | Readonly<{ kind: 'all' }>
  | Readonly<{ boardIds: readonly BoardId[]; kind: 'boards' }>
  | Readonly<{ boardId: BoardId; kind: 'current' }>
  | Readonly<{ boardId: BoardId; elementIds: readonly ElementId[]; kind: 'selection' }>;

export interface BoardExportPlan {
  readonly pages: readonly BoardPresentationProjection[];
  readonly scope: BoardExportScope['kind'];
}

export type BoardExportPlanResult =
  | Readonly<{ ok: true; value: BoardExportPlan }>
  | Readonly<{ code: 'empty-selection' | 'invalid-scope'; message: string; ok: false }>;

const collectElementTreeIds = (
  document: ProjectDocument,
  elementId: ElementId,
  result: Set<ElementId>,
): void => {
  if (result.has(elementId)) return;
  const element = document.elementsById[elementId];
  if (element === undefined) return;
  result.add(elementId);
  for (const childId of element.childIds) collectElementTreeIds(document, childId, result);
};

const uniqueCanonicalBoardIds = (
  document: ProjectDocument,
  boardIds: readonly BoardId[],
): readonly BoardId[] | undefined => {
  const requested = new Set(boardIds);
  if (requested.size === 0 || requested.size !== boardIds.length) return undefined;
  if ([...requested].some((boardId) => !document.boardIds.includes(boardId))) return undefined;
  return document.boardIds.filter((boardId) => requested.has(boardId));
};

/** Resolves ordered canonical boards and selected alternates once for every output format. */
export const createBoardExportPlan = (
  document: ProjectDocument,
  scope: BoardExportScope,
  textMeasurementService?: ControlTextMeasurementService,
): BoardExportPlanResult => {
  const boardIds =
    scope.kind === 'all'
      ? document.boardIds
      : scope.kind === 'boards'
        ? uniqueCanonicalBoardIds(document, scope.boardIds)
        : uniqueCanonicalBoardIds(document, [scope.boardId]);
  if (boardIds === undefined || boardIds.length === 0) {
    return {
      code: 'invalid-scope',
      message: 'Choose one or more active wireframes to export.',
      ok: false,
    };
  }
  const pages = boardIds.flatMap((boardId) => {
    const projection = createBoardPresentationProjection(document, boardId, textMeasurementService);
    return projection === undefined ? [] : [projection];
  });
  if (pages.length !== boardIds.length) {
    return {
      code: 'invalid-scope',
      message: 'One or more selected wireframes could not be prepared for export.',
      ok: false,
    };
  }
  if (scope.kind === 'selection') {
    const includedIds = new Set<ElementId>();
    for (const elementId of scope.elementIds)
      collectElementTreeIds(document, elementId, includedIds);
    const filtered = filterBoardPresentationProjection(pages[0]!, includedIds);
    if (filtered === undefined) {
      return {
        code: 'empty-selection',
        message: 'Select one or more controls on the active wireframe.',
        ok: false,
      };
    }
    return {
      ok: true,
      value: Object.freeze({ pages: Object.freeze([filtered]), scope: scope.kind }),
    };
  }
  return {
    ok: true,
    value: Object.freeze({ pages: Object.freeze(pages), scope: scope.kind }),
  };
};
