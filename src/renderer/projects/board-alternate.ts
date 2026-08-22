import {
  BoardSchema,
  CreateAlternateCommandSchema,
  DOCUMENT_COMMAND_TYPES,
  selectBoardPresentationId,
  type BoardId,
  type DocumentCommand,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import {
  planBoardContentClone,
  type BoardContentCloneElementIdAllocator,
} from './board-content-clone';

export type BoardAlternateElementIdAllocator = BoardContentCloneElementIdAllocator;
export type BoardAlternateCloneMode = 'create' | 'duplicate';

export interface BoardAlternateClonePlan {
  readonly alternateBoardId: BoardId;
  readonly cloneElementIds: readonly ElementId[];
  readonly commands: readonly DocumentCommand[];
  readonly canonicalBoardId: BoardId;
  readonly sourceElementIds: readonly ElementId[];
  readonly sourceVersionId: BoardId;
}

const getUniqueName = (
  document: ProjectDocument,
  canonicalBoardId: BoardId,
  sourceName: string,
  mode: BoardAlternateCloneMode,
): string | undefined => {
  const canonicalBoard = document.boardsById[canonicalBoardId];
  if (canonicalBoard === undefined) {
    return undefined;
  }
  const existingNames = new Set(
    canonicalBoard.alternateIds.flatMap((alternateId) => {
      const alternate = document.boardsById[alternateId];
      return alternate === undefined ? [] : [alternate.name];
    }),
  );
  let sequence = 1;
  while (true) {
    const suffix = sequence === 1 ? ' copy' : ` copy ${String(sequence)}`;
    const candidate =
      mode === 'create'
        ? `Alternate ${String(sequence)}`
        : `${sourceName.slice(0, 120 - suffix.length).trimEnd()}${suffix}`;
    if (!existingNames.has(candidate)) {
      return candidate;
    }
    sequence += 1;
  }
};

/** Plans an alternate clone of the canonical family's currently selected version. */
export const planBoardAlternateClone = (
  document: ProjectDocument,
  canonicalBoardId: BoardId,
  alternateBoardId: BoardId,
  allocateElementId: BoardAlternateElementIdAllocator,
  mode: BoardAlternateCloneMode,
): BoardAlternateClonePlan | undefined => {
  const canonicalBoard = document.boardsById[canonicalBoardId];
  const sourceVersionId = selectBoardPresentationId(document, canonicalBoardId);
  if (
    canonicalBoard === undefined ||
    sourceVersionId === undefined ||
    !document.boardIds.includes(canonicalBoardId) ||
    document.boardsById[alternateBoardId] !== undefined
  ) {
    return undefined;
  }
  const sourceVersion = document.boardsById[sourceVersionId];
  if (sourceVersion === undefined) {
    return undefined;
  }

  const name = getUniqueName(document, canonicalBoardId, sourceVersion.name, mode);
  const alternate = BoardSchema.safeParse({
    ...sourceVersion,
    alternateIds: [],
    childIds: [],
    id: alternateBoardId,
    name,
    selectedAlternateId: null,
  });
  const createAlternate = CreateAlternateCommandSchema.safeParse({
    type: DOCUMENT_COMMAND_TYPES.createAlternate,
    canonicalBoardId,
    alternate: alternate.success ? alternate.data : undefined,
    index: canonicalBoard.alternateIds.length,
    selectAfterCreate: alternateBoardId,
  });
  if (!createAlternate.success) {
    return undefined;
  }

  const content = planBoardContentClone(
    document,
    sourceVersionId,
    alternateBoardId,
    allocateElementId,
  );
  if (content === undefined) {
    return undefined;
  }

  return Object.freeze({
    alternateBoardId,
    cloneElementIds: content.cloneElementIds,
    commands: Object.freeze([createAlternate.data, ...content.commands]),
    canonicalBoardId,
    sourceElementIds: content.sourceElementIds,
    sourceVersionId,
  });
};
