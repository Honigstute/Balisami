import {
  BoardSchema,
  CreateAlternateCommandSchema,
  DeleteAlternateCommandSchema,
  DOCUMENT_COMMAND_TYPES,
  SetBoardNoteCommandSchema,
  SetElementFrameCommandSchema,
  WorldRectSchema,
  createElementLocationIndex,
  selectBoardElementIds,
  selectSelectionWorldBounds,
  type BoardId,
  type DocumentCommand,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import { planBoardContentClone, planBoardContentDelete } from './board-content-clone';
import { planCommandsWithUnusedAssetCleanup } from './unused-asset-cleanup';

export const BOARD_ALTERNATE_MERGE_GAP = 80;

export type BoardAlternateLifecycleElementIdAllocator = (
  sourceElementId: ElementId,
  allocationIndex: number,
) => ElementId | undefined;

export interface BoardAlternateLifecyclePlan {
  readonly alternateId: BoardId;
  readonly canonicalBoardId: BoardId;
  readonly commands: readonly DocumentCommand[];
}

export interface BoardAlternatePromotePlan extends BoardAlternateLifecyclePlan {
  readonly formerOfficialId: BoardId;
}

const getSelectedAlternate = (
  document: ProjectDocument,
  canonicalBoardId: BoardId,
  alternateId: BoardId,
) => {
  const canonicalBoard = document.boardsById[canonicalBoardId];
  const alternate = document.boardsById[alternateId];
  return canonicalBoard !== undefined &&
    alternate !== undefined &&
    document.boardIds.includes(canonicalBoardId) &&
    canonicalBoard.selectedAlternateId === alternateId &&
    canonicalBoard.alternateIds.includes(alternateId)
    ? { alternate, canonicalBoard }
    : undefined;
};

const getUniqueFormerOfficialName = (
  document: ProjectDocument,
  canonicalBoardId: BoardId,
): string | undefined => {
  const canonicalBoard = document.boardsById[canonicalBoardId];
  if (canonicalBoard === undefined) {
    return undefined;
  }
  const names = new Set(
    canonicalBoard.alternateIds.flatMap((alternateId) => {
      const alternate = document.boardsById[alternateId];
      return alternate === undefined ? [] : [alternate.name];
    }),
  );
  let sequence = 1;
  while (true) {
    const candidate = sequence === 1 ? 'Former Official' : `Former Official ${String(sequence)}`;
    if (!names.has(candidate)) {
      return candidate;
    }
    sequence += 1;
  }
};

const createTrackedAllocator = (
  document: ProjectDocument,
  allocateElementId: BoardAlternateLifecycleElementIdAllocator,
) => {
  const allocatedIds = new Set<ElementId>();
  let allocationIndex = 0;
  return (sourceElementId: ElementId): ElementId | undefined => {
    const elementId = allocateElementId(sourceElementId, allocationIndex);
    allocationIndex += 1;
    if (
      elementId === undefined ||
      document.elementsById[elementId] !== undefined ||
      allocatedIds.has(elementId)
    ) {
      return undefined;
    }
    allocatedIds.add(elementId);
    return elementId;
  };
};

export const planBoardAlternatePromote = (
  document: ProjectDocument,
  canonicalBoardId: BoardId,
  alternateId: BoardId,
  formerOfficialId: BoardId,
  allocateElementId: BoardAlternateLifecycleElementIdAllocator,
): BoardAlternatePromotePlan | undefined => {
  const family = getSelectedAlternate(document, canonicalBoardId, alternateId);
  if (family === undefined || document.boardsById[formerOfficialId] !== undefined) {
    return undefined;
  }
  const formerOfficialName = getUniqueFormerOfficialName(document, canonicalBoardId);
  const formerOfficial = BoardSchema.safeParse({
    ...family.canonicalBoard,
    alternateIds: [],
    childIds: [],
    id: formerOfficialId,
    name: formerOfficialName,
    selectedAlternateId: null,
  });
  const createFormerOfficial = CreateAlternateCommandSchema.safeParse({
    type: DOCUMENT_COMMAND_TYPES.createAlternate,
    alternate: formerOfficial.success ? formerOfficial.data : undefined,
    canonicalBoardId,
    index: family.canonicalBoard.alternateIds.length,
    selectAfterCreate: alternateId,
  });
  if (!createFormerOfficial.success) {
    return undefined;
  }

  const allocateTrackedId = createTrackedAllocator(document, allocateElementId);
  const cloneFormerOfficial = planBoardContentClone(
    document,
    canonicalBoardId,
    formerOfficialId,
    allocateTrackedId,
  );
  const deleteOfficial = planBoardContentDelete(document, canonicalBoardId);
  const clonePromotedContent = planBoardContentClone(
    document,
    alternateId,
    canonicalBoardId,
    allocateTrackedId,
  );
  const setOfficialNote = SetBoardNoteCommandSchema.safeParse({
    type: DOCUMENT_COMMAND_TYPES.setBoardNote,
    boardId: canonicalBoardId,
    note: family.alternate.note,
  });
  if (
    cloneFormerOfficial === undefined ||
    deleteOfficial === undefined ||
    clonePromotedContent === undefined ||
    !setOfficialNote.success
  ) {
    return undefined;
  }

  const commands = planCommandsWithUnusedAssetCleanup(
    document,
    Object.freeze([
      createFormerOfficial.data,
      ...cloneFormerOfficial.commands,
      ...deleteOfficial,
      setOfficialNote.data,
      ...clonePromotedContent.commands,
      {
        type: DOCUMENT_COMMAND_TYPES.selectBoardVersion,
        canonicalBoardId,
        alternateId: null,
      },
    ]),
  );
  if (commands === undefined) {
    return undefined;
  }

  return Object.freeze({
    alternateId,
    canonicalBoardId,
    commands,
    formerOfficialId,
  });
};

const getBoardBounds = (document: ProjectDocument, boardId: BoardId) => {
  const elementIds = selectBoardElementIds(document, boardId);
  return elementIds === undefined ? undefined : selectSelectionWorldBounds(document, elementIds);
};

export const planBoardAlternateMerge = (
  document: ProjectDocument,
  canonicalBoardId: BoardId,
  alternateId: BoardId,
  allocateElementId: BoardAlternateLifecycleElementIdAllocator,
): BoardAlternateLifecyclePlan | undefined => {
  const family = getSelectedAlternate(document, canonicalBoardId, alternateId);
  if (family === undefined) {
    return undefined;
  }
  const allocateTrackedId = createTrackedAllocator(document, allocateElementId);
  const content = planBoardContentClone(
    document,
    alternateId,
    canonicalBoardId,
    allocateTrackedId,
    { targetRootIndexOffset: family.canonicalBoard.childIds.length },
  );
  if (content === undefined) {
    return undefined;
  }

  const officialBounds = getBoardBounds(document, canonicalBoardId);
  const alternateBounds = getBoardBounds(document, alternateId);
  const deltaX =
    officialBounds === undefined || alternateBounds === undefined
      ? 0
      : officialBounds.x + officialBounds.width + BOARD_ALTERNATE_MERGE_GAP - alternateBounds.x;
  const sourceIdByCloneId = new Map(
    content.cloneElementIds.map((cloneId, index) => [cloneId, content.sourceElementIds[index]]),
  );
  const locationIndex = createElementLocationIndex(document);
  const moveRootCommands: DocumentCommand[] = [];
  for (const cloneElementId of content.cloneElementIds) {
    const sourceElementId = sourceIdByCloneId.get(cloneElementId);
    const sourceElement =
      sourceElementId === undefined ? undefined : document.elementsById[sourceElementId];
    const location = sourceElementId === undefined ? undefined : locationIndex.get(sourceElementId);
    if (sourceElement === undefined || location === undefined) {
      return undefined;
    }
    if (location.owner.kind !== 'board' || location.owner.boardId !== alternateId) {
      continue;
    }
    const frame = WorldRectSchema.safeParse({
      x: sourceElement.frame.x + deltaX,
      y: sourceElement.frame.y,
      width: sourceElement.frame.width,
      height: sourceElement.frame.height,
    });
    if (!frame.success) {
      return undefined;
    }
    const command = SetElementFrameCommandSchema.safeParse({
      type: DOCUMENT_COMMAND_TYPES.setElementFrame,
      elementId: cloneElementId,
      frame: frame.data,
    });
    if (!command.success) {
      return undefined;
    }
    moveRootCommands.push(command.data);
  }

  const noteText =
    family.canonicalBoard.note.text === family.alternate.note.text
      ? family.canonicalBoard.note.text
      : `${family.canonicalBoard.note.text}\n\n---\n\n${family.alternate.note.text}`;
  const setOfficialNote = SetBoardNoteCommandSchema.safeParse({
    type: DOCUMENT_COMMAND_TYPES.setBoardNote,
    boardId: canonicalBoardId,
    note: { text: noteText },
  });
  if (!setOfficialNote.success) {
    return undefined;
  }

  return Object.freeze({
    alternateId,
    canonicalBoardId,
    commands: Object.freeze([
      ...content.commands,
      ...moveRootCommands,
      setOfficialNote.data,
      {
        type: DOCUMENT_COMMAND_TYPES.selectBoardVersion,
        canonicalBoardId,
        alternateId: null,
      },
    ]),
  });
};

export const planBoardAlternateDiscard = (
  document: ProjectDocument,
  canonicalBoardId: BoardId,
  alternateId: BoardId,
): BoardAlternateLifecyclePlan | undefined => {
  if (getSelectedAlternate(document, canonicalBoardId, alternateId) === undefined) {
    return undefined;
  }
  const deleteContent = planBoardContentDelete(document, alternateId);
  const deleteAlternate = DeleteAlternateCommandSchema.safeParse({
    type: DOCUMENT_COMMAND_TYPES.deleteAlternate,
    alternateId,
    canonicalBoardId,
    selectAfterDelete: null,
  });
  if (deleteContent === undefined || !deleteAlternate.success) {
    return undefined;
  }
  const commands = planCommandsWithUnusedAssetCleanup(
    document,
    Object.freeze([...deleteContent, deleteAlternate.data]),
  );
  if (commands === undefined) {
    return undefined;
  }
  return Object.freeze({
    alternateId,
    canonicalBoardId,
    commands,
  });
};
