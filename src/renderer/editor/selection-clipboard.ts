import { z } from 'zod';

import {
  CreateElementCommandSchema,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  ElementNodeSchema,
  ElementOwnerSchema,
  MAX_HISTORY_TRANSACTION_COMMANDS,
  ProjectIdSchema,
  createElementLocationIndex,
  selectElementLockState,
  getControlSpec,
  selectOwnerChildIds,
  type CreateElementCommand,
  type ElementId,
  type ElementNode,
  type ElementOwner,
  type ProjectDocument,
} from '../../domain';
import { deleteSelectedElements, type SelectionDeleteSource } from './selection-delete';
import type { SelectionDuplicateIdAllocator } from './selection-duplicate';
import type { SelectionStore } from './selection-store';

export const SELECTION_CLIPBOARD_FORMAT_VERSION = 1 as const;
export const SELECTION_CLIPBOARD_POLICY = Object.freeze({
  offsetWorldUnits: 10,
});

const ChildlessClipboardElementSchema = ElementNodeSchema.refine(
  (element) => element.childIds.length === 0,
  { message: 'Clipboard elements must not contain child IDs.', path: ['childIds'] },
);

export const SelectionClipboardEntrySchema = z
  .strictObject({
    element: ChildlessClipboardElementSchema,
    owner: ElementOwnerSchema,
    sourceIndex: z.number().int().nonnegative(),
  })
  .readonly();

export const SelectionClipboardPayloadSchema = z
  .strictObject({
    formatVersion: z.literal(SELECTION_CLIPBOARD_FORMAT_VERSION),
    kind: z.enum(['copy', 'cut']),
    projectId: ProjectIdSchema,
    primarySourceId: ElementIdSchema,
    entries: z
      .array(SelectionClipboardEntrySchema)
      .min(1)
      .max(MAX_HISTORY_TRANSACTION_COMMANDS)
      .readonly(),
  })
  .refine(
    (payload) =>
      new Set(payload.entries.map((entry) => entry.element.id)).size === payload.entries.length,
    { message: 'Clipboard source element IDs must be unique.', path: ['entries'] },
  )
  .refine(
    (payload) => payload.entries.some((entry) => entry.element.id === payload.primarySourceId),
    { message: 'Clipboard primary ID must identify one payload entry.', path: ['primarySourceId'] },
  )
  .readonly();

export type SelectionClipboardPayload = z.infer<typeof SelectionClipboardPayloadSchema>;

export interface SelectionClipboardSnapshot {
  readonly pasteCount: number;
  readonly payload: SelectionClipboardPayload | undefined;
  readonly revision: number;
}

const createClipboardSnapshot = (
  revision: number,
  payload: SelectionClipboardPayload | undefined,
  pasteCount: number,
): SelectionClipboardSnapshot => Object.freeze({ pasteCount, payload, revision });

/** Session-only clipboard authority. It is never part of the project document or history. */
export class SelectionClipboardStore {
  #snapshot = createClipboardSnapshot(0, undefined, 0);

  getSnapshot = (): SelectionClipboardSnapshot => this.#snapshot;

  clear(): void {
    if (this.#snapshot.payload !== undefined) {
      this.#snapshot = createClipboardSnapshot(this.#snapshot.revision + 1, undefined, 0);
    }
  }

  write(payload: SelectionClipboardPayload): void {
    this.#snapshot = createClipboardSnapshot(this.#snapshot.revision + 1, payload, 0);
  }

  recordAcceptedPaste(payload: SelectionClipboardPayload): void {
    if (this.#snapshot.payload !== payload) {
      return;
    }
    this.#snapshot = createClipboardSnapshot(
      this.#snapshot.revision + 1,
      payload,
      this.#snapshot.pasteCount + 1,
    );
  }
}

const ownersEqual = (first: ElementOwner, second: ElementOwner): boolean =>
  first.kind === second.kind &&
  (first.kind === 'board'
    ? first.boardId === (second.kind === 'board' ? second.boardId : undefined)
    : first.elementId === (second.kind === 'element' ? second.elementId : undefined));

const getOwnerKey = (owner: ElementOwner): string =>
  owner.kind === 'board' ? `board:${owner.boardId}` : `element:${owner.elementId}`;

const isOwnerAvailable = (document: ProjectDocument, owner: ElementOwner): boolean => {
  if (owner.kind === 'board') {
    return document.boardsById[owner.boardId] !== undefined;
  }
  const ownerElement = document.elementsById[owner.elementId];
  return (
    ownerElement !== undefined &&
    getControlSpec(ownerElement.controlType)?.capabilities.canOwnChildren === true
  );
};

const referencesAreAvailable = (
  document: ProjectDocument,
  element: SelectionClipboardPayload['entries'][number]['element'],
): boolean =>
  element.assetIds.every((assetId) => document.assetsById[assetId] !== undefined) &&
  (element.link?.kind !== 'board' || document.boardsById[element.link.boardId] !== undefined);

/** Captures a canonical, validated snapshot without changing clipboard or document state. */
export const captureSelectionClipboardPayload = (
  document: ProjectDocument,
  selectedIds: readonly ElementId[],
  primaryId: ElementId | undefined,
  canonicalElementIds: readonly ElementId[],
  kind: SelectionClipboardPayload['kind'],
): SelectionClipboardPayload | undefined => {
  const uniqueSelectedIds = [...new Set(selectedIds)];
  if (uniqueSelectedIds.length === 0 || primaryId === undefined) {
    return undefined;
  }
  const selectedSet = new Set(uniqueSelectedIds);
  const sourceIds = canonicalElementIds.filter((id) => selectedSet.has(id));
  if (
    new Set(canonicalElementIds).size !== canonicalElementIds.length ||
    sourceIds.length !== uniqueSelectedIds.length
  ) {
    return undefined;
  }

  const locationIndex = createElementLocationIndex(document);
  const entries: Array<{
    readonly element: ElementNode;
    readonly owner: ElementOwner;
    readonly sourceIndex: number;
  }> = [];
  for (const sourceId of sourceIds) {
    const element = document.elementsById[sourceId];
    const location = locationIndex.get(sourceId);
    if (
      element === undefined ||
      location === undefined ||
      selectElementLockState(document, sourceId, locationIndex)?.effectivelyLocked !== false ||
      element.childIds.length > 0
    ) {
      return undefined;
    }
    entries.push({ element, owner: location.owner, sourceIndex: location.index });
  }
  const result = SelectionClipboardPayloadSchema.safeParse({
    formatVersion: SELECTION_CLIPBOARD_FORMAT_VERSION,
    kind,
    projectId: document.id,
    primarySourceId: primaryId,
    entries,
  });
  return result.success ? result.data : undefined;
};

export const copySelectedElements = (
  document: ProjectDocument,
  selection: SelectionStore,
  canonicalElementIds: readonly ElementId[],
  clipboard: SelectionClipboardStore,
): boolean => {
  const snapshot = selection.getSnapshot();
  const payload = captureSelectionClipboardPayload(
    document,
    snapshot.selectedIds,
    snapshot.primaryId,
    canonicalElementIds,
    'copy',
  );
  if (payload === undefined) {
    return false;
  }
  clipboard.write(payload);
  return true;
};

export const cutSelectedElements = (
  document: ProjectDocument,
  selection: SelectionStore,
  canonicalElementIds: readonly ElementId[],
  clipboard: SelectionClipboardStore,
  source: SelectionDeleteSource,
): boolean => {
  const snapshot = selection.getSnapshot();
  const payload = captureSelectionClipboardPayload(
    document,
    snapshot.selectedIds,
    snapshot.primaryId,
    canonicalElementIds,
    'cut',
  );
  if (
    payload === undefined ||
    !deleteSelectedElements(document, selection, canonicalElementIds, source)
  ) {
    return false;
  }
  clipboard.write(payload);
  return true;
};

export interface SelectionPastePlan {
  readonly cloneIds: readonly ElementId[];
  readonly commands: readonly CreateElementCommand[];
  readonly primaryCloneId: ElementId;
}

export interface SelectionPasteSource {
  /** Returns the accepted document, or undefined when the transaction did not commit. */
  readonly commit: (commands: readonly CreateElementCommand[]) => ProjectDocument | undefined;
}

export const planSelectionPaste = (
  document: ProjectDocument,
  payloadInput: unknown,
  pasteCount: number,
  allocateId: SelectionDuplicateIdAllocator,
): SelectionPastePlan | undefined => {
  const parsedPayload = SelectionClipboardPayloadSchema.safeParse(payloadInput);
  if (
    !parsedPayload.success ||
    parsedPayload.data.projectId !== document.id ||
    !Number.isSafeInteger(pasteCount) ||
    pasteCount < 0
  ) {
    return undefined;
  }
  const payload = parsedPayload.data;
  const locationIndex = createElementLocationIndex(document);
  for (const entry of payload.entries) {
    const liveElement = document.elementsById[entry.element.id];
    const liveLocation = locationIndex.get(entry.element.id);
    if (
      entry.element.locked ||
      !isOwnerAvailable(document, entry.owner) ||
      !referencesAreAvailable(document, entry.element) ||
      (liveElement !== undefined &&
        (liveLocation === undefined || !ownersEqual(liveLocation.owner, entry.owner)))
    ) {
      return undefined;
    }
  }

  const cloneIds: ElementId[] = [];
  const allocatedIds = new Set<ElementId>();
  for (const [sourceIndex, entry] of payload.entries.entries()) {
    const parsedId = ElementIdSchema.safeParse(allocateId(entry.element.id, sourceIndex));
    if (
      !parsedId.success ||
      document.elementsById[parsedId.data] !== undefined ||
      allocatedIds.has(parsedId.data)
    ) {
      return undefined;
    }
    allocatedIds.add(parsedId.data);
    cloneIds.push(parsedId.data);
  }

  const offsetMultiplier = pasteCount + (payload.kind === 'copy' ? 1 : 0);
  const offsetWorldUnits = offsetMultiplier * SELECTION_CLIPBOARD_POLICY.offsetWorldUnits;
  if (!Number.isSafeInteger(offsetMultiplier) || !Number.isFinite(offsetWorldUnits)) {
    return undefined;
  }
  const simulatedChildrenByOwner = new Map<string, ElementId[]>();
  const commands: CreateElementCommand[] = [];
  for (const [sourceIndex, entry] of payload.entries.entries()) {
    const ownerKey = getOwnerKey(entry.owner);
    let simulatedChildren = simulatedChildrenByOwner.get(ownerKey);
    if (simulatedChildren === undefined) {
      const ownerChildren = selectOwnerChildIds(document, entry.owner);
      if (ownerChildren === undefined) {
        return undefined;
      }
      simulatedChildren = [...ownerChildren];
      simulatedChildrenByOwner.set(ownerKey, simulatedChildren);
    }
    const liveSourceIndex = simulatedChildren.indexOf(entry.element.id);
    const insertionIndex =
      liveSourceIndex >= 0
        ? liveSourceIndex + 1
        : Math.min(entry.sourceIndex, simulatedChildren.length);
    const cloneId = cloneIds[sourceIndex];
    if (cloneId === undefined) {
      return undefined;
    }
    const cloneX = entry.element.frame.x + offsetWorldUnits;
    const cloneY = entry.element.frame.y + offsetWorldUnits;
    if (
      !Number.isFinite(cloneX) ||
      !Number.isFinite(cloneY) ||
      cloneX - entry.element.frame.x !== offsetWorldUnits ||
      cloneY - entry.element.frame.y !== offsetWorldUnits
    ) {
      return undefined;
    }
    const command = CreateElementCommandSchema.safeParse({
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        ...entry.element,
        id: cloneId,
        frame: { ...entry.element.frame, x: cloneX, y: cloneY },
        childIds: [],
      },
      owner: entry.owner,
      index: insertionIndex,
    });
    if (!command.success) {
      return undefined;
    }
    commands.push(command.data);
    simulatedChildren.splice(insertionIndex, 0, cloneId);
  }

  const primaryIndex = payload.entries.findIndex(
    (entry) => entry.element.id === payload.primarySourceId,
  );
  const primaryCloneId = cloneIds[primaryIndex];
  if (primaryCloneId === undefined) {
    return undefined;
  }
  return Object.freeze({
    cloneIds: Object.freeze(cloneIds),
    commands: Object.freeze(commands),
    primaryCloneId,
  });
};

export const pasteClipboardElements = (
  document: ProjectDocument,
  selection: SelectionStore,
  clipboard: SelectionClipboardStore,
  allocateId: SelectionDuplicateIdAllocator,
  source: SelectionPasteSource,
): boolean => {
  const clipboardSnapshot = clipboard.getSnapshot();
  const payload = clipboardSnapshot.payload;
  if (payload === undefined) {
    return false;
  }
  const plan = planSelectionPaste(document, payload, clipboardSnapshot.pasteCount, allocateId);
  if (plan === undefined) {
    return false;
  }
  const acceptedDocument = source.commit(plan.commands);
  if (
    acceptedDocument === undefined ||
    plan.cloneIds.some((id) => acceptedDocument.elementsById[id] === undefined)
  ) {
    return false;
  }
  clipboard.recordAcceptedPaste(payload);
  selection.replace(plan.cloneIds, plan.primaryCloneId);
  return true;
};
