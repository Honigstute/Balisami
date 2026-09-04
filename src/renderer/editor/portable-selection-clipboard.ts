import { z } from 'zod';

import {
  AssetIdSchema,
  AssetReferenceSchema,
  BoardIdSchema,
  CONTROL_TYPES,
  CreateAssetCommandSchema,
  CreateElementCommandSchema,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  MAX_HISTORY_TRANSACTION_COMMANDS,
  createCustomIconReference,
  createElementLocationIndex,
  getControlSpec,
  parseCustomIconReference,
  rekeyControlRowState,
  selectElementWorldBounds,
  type AssetId,
  type BoardId,
  type CreateAssetCommand,
  type CreateElementCommand,
  type DocumentCommand,
  type ElementId,
  type ElementLink,
  type ElementNode,
  type ElementOwner,
  type ProjectDocument,
} from '../../domain';
import { DESKTOP_CLIPBOARD_LIMITS, type ProjectAssetBytes } from '../../shared/desktop-api';
import {
  SELECTION_CLIPBOARD_POLICY,
  SelectionClipboardPayloadSchema,
  type SelectionClipboardPayload,
} from './selection-clipboard';
import type { SelectionDuplicateIdAllocator } from './selection-duplicate';

export const PORTABLE_SELECTION_CLIPBOARD_FORMAT_VERSION = 2 as const;

const PortableAssetSchema = z
  .strictObject({
    bytesBase64: z.string().min(1).max(DESKTOP_CLIPBOARD_LIMITS.payloadCharacters),
    reference: AssetReferenceSchema,
  })
  .readonly();

export const PortableSelectionClipboardPayloadSchema = z
  .strictObject({
    assets: z.array(PortableAssetSchema).readonly(),
    formatVersion: z.literal(PORTABLE_SELECTION_CLIPBOARD_FORMAT_VERSION),
    selection: SelectionClipboardPayloadSchema,
    sourceBoardId: BoardIdSchema,
  })
  .superRefine((payload, context) => {
    const referencedAssetIds = new Set(
      payload.selection.entries.flatMap((entry) => entry.element.assetIds),
    );
    const payloadAssetIds = payload.assets.map((asset) => asset.reference.id);
    if (
      new Set(payloadAssetIds).size !== payloadAssetIds.length ||
      referencedAssetIds.size !== payloadAssetIds.length ||
      payloadAssetIds.some((assetId) => !referencedAssetIds.has(assetId))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Portable clipboard assets must exactly match the selected element references.',
        path: ['assets'],
      });
    }
  })
  .readonly();

export type PortableSelectionClipboardPayload = z.infer<
  typeof PortableSelectionClipboardPayloadSchema
>;

const encodeBytes = (bytes: Uint8Array): string => {
  const chunkSize = 24 * 1_024;
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    encoded += globalThis.btoa(String.fromCharCode(...chunk));
  }
  return encoded;
};

const decodeBytes = (value: string): Uint8Array | undefined => {
  try {
    const decoded = globalThis.atob(value);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
};

const resolveOwnerBoardId = (
  document: ProjectDocument,
  owner: ElementOwner,
): BoardId | undefined => {
  if (owner.kind === 'board') return owner.boardId;
  const locations = createElementLocationIndex(document);
  const visited = new Set<ElementId>();
  let currentId = owner.elementId;
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const location = locations.get(currentId);
    if (location === undefined) return undefined;
    if (location.owner.kind === 'board') return location.owner.boardId;
    currentId = location.owner.elementId;
  }
  return undefined;
};

export const createPortableSelectionClipboardPayload = (
  document: ProjectDocument,
  selection: SelectionClipboardPayload,
  readAssetBytes: (assetId: AssetId) => Uint8Array | undefined,
): PortableSelectionClipboardPayload | undefined => {
  const sourceBoardIds = new Set(
    selection.entries.map((entry) => resolveOwnerBoardId(document, entry.owner)),
  );
  const sourceBoardId = [...sourceBoardIds][0];
  if (
    selection.projectId !== document.id ||
    sourceBoardIds.size !== 1 ||
    sourceBoardId === undefined ||
    document.boardsById[sourceBoardId] === undefined ||
    selection.entries.some(
      (entry) =>
        entry.element.childIds.length > 0 ||
        entry.element.controlType === CONTROL_TYPES.componentInstance,
    )
  ) {
    return undefined;
  }

  // A portable leaf is imported at board scope, so persist its board-relative
  // world frame rather than leaking coordinates from an unavailable source parent.
  const normalizedEntries = selection.entries.map((entry) => {
    const frame = selectElementWorldBounds(document, entry.element.id);
    return frame === undefined
      ? undefined
      : Object.freeze({
          ...entry,
          element: Object.freeze({ ...entry.element, frame }),
          owner: Object.freeze({ boardId: sourceBoardId, kind: 'board' as const }),
        });
  });
  if (normalizedEntries.some((entry) => entry === undefined)) return undefined;
  const normalizedSelection = SelectionClipboardPayloadSchema.safeParse({
    ...selection,
    entries: normalizedEntries,
  });
  if (!normalizedSelection.success) return undefined;

  const assetIds = [
    ...new Set(normalizedSelection.data.entries.flatMap((entry) => entry.element.assetIds)),
  ];
  const maximumRawAssetBytes = Math.floor((DESKTOP_CLIPBOARD_LIMITS.payloadCharacters * 3) / 4);
  const rawAssetBytes = assetIds.reduce(
    (total, assetId) =>
      total + (document.assetsById[assetId]?.byteLength ?? maximumRawAssetBytes + 1),
    0,
  );
  if (!Number.isSafeInteger(rawAssetBytes) || rawAssetBytes > maximumRawAssetBytes)
    return undefined;
  const assets = assetIds.map((assetId) => {
    const reference = document.assetsById[assetId];
    const bytes = readAssetBytes(assetId);
    return reference === undefined ||
      bytes === undefined ||
      bytes.byteLength !== reference.byteLength
      ? undefined
      : Object.freeze({ bytesBase64: encodeBytes(bytes), reference });
  });
  if (assets.some((asset) => asset === undefined)) return undefined;

  const parsed = PortableSelectionClipboardPayloadSchema.safeParse({
    assets,
    formatVersion: PORTABLE_SELECTION_CLIPBOARD_FORMAT_VERSION,
    selection: normalizedSelection.data,
    sourceBoardId,
  });
  return parsed.success ? parsed.data : undefined;
};

export const serializePortableSelectionClipboardPayload = (
  payload: PortableSelectionClipboardPayload,
): string | undefined => {
  const serialized = JSON.stringify(payload);
  return serialized.length <= DESKTOP_CLIPBOARD_LIMITS.payloadCharacters ? serialized : undefined;
};

export const parsePortableSelectionClipboardPayload = (
  serialized: unknown,
): PortableSelectionClipboardPayload | undefined => {
  if (
    typeof serialized !== 'string' ||
    serialized.length === 0 ||
    serialized.length > DESKTOP_CLIPBOARD_LIMITS.payloadCharacters
  ) {
    return undefined;
  }
  try {
    const parsed = PortableSelectionClipboardPayloadSchema.safeParse(JSON.parse(serialized));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export type PortableAssetIdAllocator = (
  sourceAssetId: AssetId,
  sourceIndex: number,
) => AssetId | undefined;

export interface PortableSelectionPastePlan {
  readonly additions: ProjectAssetBytes;
  readonly cloneIds: readonly ElementId[];
  readonly commands: readonly DocumentCommand[];
  readonly primaryCloneId: ElementId;
  readonly selection: SelectionClipboardPayload;
}

const assetContentKey = (reference: {
  readonly byteLength: number;
  readonly mediaType: string;
  readonly sha256: string;
}): string => `${reference.sha256}:${reference.mediaType}:${String(reference.byteLength)}`;

const remapLink = (
  link: ElementLink | null,
  sourceBoardId: BoardId,
  targetBoardId: BoardId,
): ElementLink | null => {
  if (link === null || link.kind === 'external') return link;
  return link.boardId === sourceBoardId
    ? Object.freeze({ boardId: targetBoardId, kind: 'board' as const })
    : null;
};

const remapElement = (
  source: ElementNode,
  cloneId: ElementId,
  assetIdBySource: ReadonlyMap<AssetId, AssetId>,
  sourceBoardId: BoardId,
  targetBoardId: BoardId,
): ElementNode | undefined => {
  const definition = getControlSpec(source.controlType);
  if (definition === undefined) return undefined;
  const properties = { ...source.properties };
  for (const section of definition.inspector) {
    for (const field of section.fields) {
      if (field.kind !== 'icon') continue;
      const sourceAssetId = parseCustomIconReference(properties[field.property]);
      const targetAssetId =
        sourceAssetId === undefined ? undefined : assetIdBySource.get(sourceAssetId);
      if (sourceAssetId !== undefined && targetAssetId === undefined) return undefined;
      if (targetAssetId !== undefined) {
        properties[field.property] = createCustomIconReference(targetAssetId);
      }
    }
  }
  if (source.assetIds.some((assetId) => !assetIdBySource.has(assetId))) return undefined;
  const assetIds = Object.freeze([
    ...new Set(
      [...new Set(source.assetIds)].flatMap((assetId) => {
        const targetAssetId = assetIdBySource.get(assetId);
        return targetAssetId === undefined ? [] : [targetAssetId];
      }),
    ),
  ]);
  const rowData = Object.freeze({
    ...source.rowData,
    bindings: Object.freeze(
      source.rowData.bindings.map((binding) =>
        Object.freeze({
          ...binding,
          link: remapLink(binding.link, sourceBoardId, targetBoardId),
        }),
      ),
    ),
  });
  const rowState = rekeyControlRowState(definition, properties, rowData, cloneId);
  if (rowState === undefined) return undefined;
  return Object.freeze({
    ...source,
    assetIds,
    childIds: Object.freeze([]),
    id: cloneId,
    link: remapLink(source.link, sourceBoardId, targetBoardId),
    properties: rowState.properties,
    rowData: rowState.rowData,
  });
};

/** Plans a fully validated leaf-control import into another project. */
export const planPortableSelectionPaste = (
  document: ProjectDocument,
  payloadInput: unknown,
  targetBoardId: BoardId,
  pasteCount: number,
  allocateElementId: SelectionDuplicateIdAllocator,
  allocateAssetId: PortableAssetIdAllocator,
): PortableSelectionPastePlan | undefined => {
  const parsed = PortableSelectionClipboardPayloadSchema.safeParse(payloadInput);
  const targetBoard = document.boardsById[targetBoardId];
  if (
    !parsed.success ||
    parsed.data.selection.projectId === document.id ||
    targetBoard === undefined ||
    !Number.isSafeInteger(pasteCount) ||
    pasteCount < 0
  ) {
    return undefined;
  }
  const payload = parsed.data;

  const targetAssetByContent = new Map(
    Object.values(document.assetsById).map((reference) => [
      assetContentKey(reference),
      reference.id,
    ]),
  );
  const assetIdBySource = new Map<AssetId, AssetId>();
  const allocatedAssetIds = new Set<AssetId>();
  const additions: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  const assetCommands: CreateAssetCommand[] = [];
  for (const [index, portableAsset] of payload.assets.entries()) {
    const sourceId = portableAsset.reference.id;
    const contentKey = assetContentKey(portableAsset.reference);
    const reusableId = targetAssetByContent.get(contentKey);
    if (reusableId !== undefined) {
      assetIdBySource.set(sourceId, reusableId);
      continue;
    }
    const targetIdInput = allocateAssetId(sourceId, index);
    const targetId = AssetIdSchema.safeParse(targetIdInput);
    const bytes = decodeBytes(portableAsset.bytesBase64);
    if (
      !targetId.success ||
      document.assetsById[targetId.data] !== undefined ||
      allocatedAssetIds.has(targetId.data) ||
      bytes === undefined ||
      bytes.byteLength !== portableAsset.reference.byteLength
    ) {
      return undefined;
    }
    const command = CreateAssetCommandSchema.safeParse({
      type: DOCUMENT_COMMAND_TYPES.createAsset,
      asset: { ...portableAsset.reference, id: targetId.data },
    });
    if (!command.success) return undefined;
    allocatedAssetIds.add(targetId.data);
    targetAssetByContent.set(contentKey, targetId.data);
    assetIdBySource.set(sourceId, targetId.data);
    additions[targetId.data] = bytes;
    assetCommands.push(command.data);
  }

  const cloneIds: ElementId[] = [];
  const allocatedElementIds = new Set<ElementId>();
  for (const [index, entry] of payload.selection.entries.entries()) {
    const cloneId = ElementIdSchema.safeParse(allocateElementId(entry.element.id, index));
    if (
      !cloneId.success ||
      document.elementsById[cloneId.data] !== undefined ||
      allocatedElementIds.has(cloneId.data)
    ) {
      return undefined;
    }
    allocatedElementIds.add(cloneId.data);
    cloneIds.push(cloneId.data);
  }

  const offsetMultiplier = pasteCount + (payload.selection.kind === 'copy' ? 1 : 0);
  const offset = offsetMultiplier * SELECTION_CLIPBOARD_POLICY.offsetWorldUnits;
  if (!Number.isSafeInteger(offsetMultiplier) || !Number.isFinite(offset)) return undefined;
  const elementCommands: CreateElementCommand[] = [];
  for (const [index, entry] of payload.selection.entries.entries()) {
    const cloneId = cloneIds[index];
    if (cloneId === undefined) return undefined;
    const remapped = remapElement(
      entry.element,
      cloneId,
      assetIdBySource,
      payload.sourceBoardId,
      targetBoard.id,
    );
    if (remapped === undefined) return undefined;
    const command = CreateElementCommandSchema.safeParse({
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        ...remapped,
        frame: {
          ...remapped.frame,
          x: remapped.frame.x + offset,
          y: remapped.frame.y + offset,
        },
      },
      owner: { boardId: targetBoard.id, kind: 'board' },
      index: targetBoard.childIds.length + index,
    });
    if (!command.success) return undefined;
    elementCommands.push(command.data);
  }
  const primaryIndex = payload.selection.entries.findIndex(
    (entry) => entry.element.id === payload.selection.primarySourceId,
  );
  const primaryCloneId = cloneIds[primaryIndex];
  const commands = [...assetCommands, ...elementCommands];
  if (
    primaryCloneId === undefined ||
    commands.length === 0 ||
    commands.length > MAX_HISTORY_TRANSACTION_COMMANDS
  ) {
    return undefined;
  }
  return Object.freeze({
    additions: Object.freeze(additions),
    cloneIds: Object.freeze(cloneIds),
    commands: Object.freeze(commands),
    primaryCloneId,
    selection: payload.selection,
  });
};
