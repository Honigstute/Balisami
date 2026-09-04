// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  AssetIdSchema,
  ElementIdSchema,
  ProjectIdSchema,
  createDocumentHistory,
  dispatchHistoryTransaction,
  parseProjectDocument,
  undoDocumentHistory,
  type DocumentHistoryState,
  type ElementId,
} from '../src/domain';
import {
  SELECTION_CLIPBOARD_FORMAT_VERSION,
  SelectionClipboardPayloadSchema,
  SelectionClipboardStore,
  captureSelectionClipboardPayload,
  createSelectionClipboardPlainText,
  copySelectedElements,
  cutSelectedElements,
  parseSerializedSelectionClipboardPayload,
  pasteClipboardElements,
  planSelectionPaste,
  serializeSelectionClipboardPayload,
} from '../src/renderer/editor/selection-clipboard';
import { SelectionStore } from '../src/renderer/editor/selection-store';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const SECOND_ID = ElementIdSchema.parse('element_clipsecond1');
const THIRD_ID = ElementIdSchema.parse('element_clipthird01');
const FIRST_CLONE_ID = ElementIdSchema.parse('element_clipclone001');
const SECOND_CLONE_ID = ElementIdSchema.parse('element_clipclone002');
const NEXT_FIRST_CLONE_ID = ElementIdSchema.parse('element_clipclone003');
const NEXT_SECOND_CLONE_ID = ElementIdSchema.parse('element_clipclone004');
const STALE_ID = ElementIdSchema.parse('element_clipstale001');

const createClipboardFixture = () => {
  const input = createValidProjectDocumentInput();
  const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
  const group = input.elementsById[DOCUMENT_FIXTURE_IDS.group];
  if (child === undefined || group === undefined) {
    throw new Error('Selection clipboard fixture elements are missing.');
  }
  input.elementsById[SECOND_ID] = {
    ...structuredClone(child),
    id: SECOND_ID,
    frame: { ...child.frame, x: 180 },
    assetIds: [],
    link: null,
  };
  input.elementsById[THIRD_ID] = {
    ...structuredClone(child),
    id: THIRD_ID,
    frame: { ...child.frame, x: 340 },
    assetIds: [],
    link: null,
  };
  group.childIds = [DOCUMENT_FIXTURE_IDS.child, SECOND_ID, THIRD_ID];
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) {
    throw new Error('Selection clipboard fixture is invalid.');
  }
  return parsed.value;
};

const CANONICAL_IDS: readonly ElementId[] = Object.freeze([
  DOCUMENT_FIXTURE_IDS.group,
  DOCUMENT_FIXTURE_IDS.child,
  SECOND_ID,
  THIRD_ID,
]);

const createAllocator = (ids: readonly ElementId[]) =>
  vi.fn((_sourceId: ElementId, index: number) => ids[index]);

describe('selection clipboard payload', () => {
  it('captures one frozen, canonical, versioned childless selection snapshot', () => {
    const document = createClipboardFixture();
    const documentJson = JSON.stringify(document);
    const payload = captureSelectionClipboardPayload(
      document,
      [THIRD_ID, DOCUMENT_FIXTURE_IDS.child, THIRD_ID],
      DOCUMENT_FIXTURE_IDS.child,
      CANONICAL_IDS,
      'copy',
    );

    expect(payload).toMatchObject({
      formatVersion: SELECTION_CLIPBOARD_FORMAT_VERSION,
      kind: 'copy',
      primarySourceId: DOCUMENT_FIXTURE_IDS.child,
      projectId: document.id,
    });
    expect(
      payload?.entries.map((entry) => ({
        id: entry.element.id,
        owner: entry.owner,
        sourceIndex: entry.sourceIndex,
      })),
    ).toEqual([
      {
        id: DOCUMENT_FIXTURE_IDS.child,
        owner: { kind: 'element', elementId: DOCUMENT_FIXTURE_IDS.group },
        sourceIndex: 0,
      },
      {
        id: THIRD_ID,
        owner: { kind: 'element', elementId: DOCUMENT_FIXTURE_IDS.group },
        sourceIndex: 2,
      },
    ]);
    expect(Object.isFrozen(payload)).toBe(true);
    expect(Object.isFrozen(payload?.entries)).toBe(true);
    expect(JSON.stringify(document)).toBe(documentJson);
    expect(createSelectionClipboardPlainText(payload!)).toBe('Rectangle\nRectangle');
    expect(
      parseSerializedSelectionClipboardPayload(serializeSelectionClipboardPayload(payload!)),
    ).toEqual(payload);
  });

  it('rejects invalid capture input and malformed runtime payloads', () => {
    const document = createClipboardFixture();
    const lockedInput = createValidProjectDocumentInput();
    lockedInput.elementsById[DOCUMENT_FIXTURE_IDS.child]!.locked = true;
    const locked = parseProjectDocument(lockedInput);
    if (!locked.ok) {
      throw new Error('Locked selection clipboard fixture is invalid.');
    }
    const ancestorLockedInput = createValidProjectDocumentInput();
    ancestorLockedInput.elementsById[DOCUMENT_FIXTURE_IDS.group]!.locked = true;
    const ancestorLocked = parseProjectDocument(ancestorLockedInput);
    if (!ancestorLocked.ok) {
      throw new Error('Ancestor-locked selection clipboard fixture is invalid.');
    }

    expect(
      captureSelectionClipboardPayload(document, [], undefined, CANONICAL_IDS, 'copy'),
    ).toBeUndefined();
    expect(
      captureSelectionClipboardPayload(document, [STALE_ID], STALE_ID, CANONICAL_IDS, 'copy'),
    ).toBeUndefined();
    expect(
      captureSelectionClipboardPayload(
        document,
        [DOCUMENT_FIXTURE_IDS.group],
        DOCUMENT_FIXTURE_IDS.group,
        CANONICAL_IDS,
        'copy',
      ),
    ).toBeUndefined();
    expect(
      captureSelectionClipboardPayload(
        locked.value,
        [DOCUMENT_FIXTURE_IDS.child],
        DOCUMENT_FIXTURE_IDS.child,
        [DOCUMENT_FIXTURE_IDS.child],
        'copy',
      ),
    ).toBeUndefined();
    expect(
      captureSelectionClipboardPayload(
        ancestorLocked.value,
        [DOCUMENT_FIXTURE_IDS.child],
        DOCUMENT_FIXTURE_IDS.child,
        [DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child],
        'copy',
      ),
    ).toBeUndefined();
    expect(
      captureSelectionClipboardPayload(
        document,
        [DOCUMENT_FIXTURE_IDS.child],
        SECOND_ID,
        CANONICAL_IDS,
        'copy',
      ),
    ).toBeUndefined();
    expect(
      captureSelectionClipboardPayload(
        document,
        [DOCUMENT_FIXTURE_IDS.child],
        DOCUMENT_FIXTURE_IDS.child,
        [DOCUMENT_FIXTURE_IDS.child, DOCUMENT_FIXTURE_IDS.child],
        'copy',
      ),
    ).toBeUndefined();

    const valid = captureSelectionClipboardPayload(
      document,
      [DOCUMENT_FIXTURE_IDS.child],
      DOCUMENT_FIXTURE_IDS.child,
      CANONICAL_IDS,
      'copy',
    );
    expect(valid).toBeDefined();
    expect(SelectionClipboardPayloadSchema.safeParse({ ...valid, formatVersion: 2 }).success).toBe(
      false,
    );
    expect(
      SelectionClipboardPayloadSchema.safeParse({
        ...valid,
        entries: [...(valid?.entries ?? []), ...(valid?.entries ?? [])],
      }).success,
    ).toBe(false);
    expect(parseSerializedSelectionClipboardPayload('{')).toBeUndefined();
    expect(parseSerializedSelectionClipboardPayload('')).toBeUndefined();
  });

  it('keeps clipboard and paste count as session state outside selection and document history', () => {
    const document = createClipboardFixture();
    const selection = new SelectionStore();
    const clipboard = new SelectionClipboardStore();
    selection.selectOnly(DOCUMENT_FIXTURE_IDS.child);
    const selectionBefore = selection.getSnapshot();

    expect(copySelectedElements(document, selection, CANONICAL_IDS, clipboard)).toBe(true);
    const copied = clipboard.getSnapshot();
    expect(copied).toMatchObject({ pasteCount: 0, revision: 1 });
    expect(copied.payload?.kind).toBe('copy');
    expect(selection.getSnapshot()).toBe(selectionBefore);
    expect(document.elementsById[DOCUMENT_FIXTURE_IDS.child]).toBeDefined();

    if (copied.payload === undefined) {
      throw new Error('Clipboard copy did not publish its payload.');
    }
    clipboard.recordAcceptedPaste(copied.payload);
    expect(clipboard.getSnapshot()).toMatchObject({ pasteCount: 1, revision: 2 });
    clipboard.clear();
    expect(clipboard.getSnapshot()).toEqual({ pasteCount: 0, payload: undefined, revision: 3 });
  });
});

describe('selection clipboard paste', () => {
  it('pastes copied siblings once, maps primary selection, offsets deterministically, and undoes', () => {
    const document = createClipboardFixture();
    let history: DocumentHistoryState = createDocumentHistory(document);
    const selection = new SelectionStore();
    const clipboard = new SelectionClipboardStore();
    selection.replace([THIRD_ID, DOCUMENT_FIXTURE_IDS.child], DOCUMENT_FIXTURE_IDS.child);
    expect(copySelectedElements(document, selection, CANONICAL_IDS, clipboard)).toBe(true);

    expect(
      pasteClipboardElements(
        document,
        selection,
        clipboard,
        createAllocator([FIRST_CLONE_ID, SECOND_CLONE_ID]),
        {
          commit: (commands) => {
            const result = dispatchHistoryTransaction(history, commands, {
              label: 'Paste elements',
            });
            if (!result.ok || !result.changed) {
              return undefined;
            }
            history = result.history;
            return history.document;
          },
        },
      ),
    ).toBe(true);

    expect(history.undoEntries).toHaveLength(1);
    expect(history.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.childIds).toEqual([
      DOCUMENT_FIXTURE_IDS.child,
      FIRST_CLONE_ID,
      SECOND_ID,
      THIRD_ID,
      SECOND_CLONE_ID,
    ]);
    expect(history.document.elementsById[FIRST_CLONE_ID]?.frame).toEqual({
      x: 26,
      y: 34,
      width: 120,
      height: 48,
    });
    expect(selection.getSnapshot()).toMatchObject({
      primaryId: FIRST_CLONE_ID,
      selectedIds: [FIRST_CLONE_ID, SECOND_CLONE_ID],
    });
    expect(clipboard.getSnapshot().pasteCount).toBe(1);

    const secondPlan = planSelectionPaste(
      history.document,
      clipboard.getSnapshot().payload,
      clipboard.getSnapshot().pasteCount,
      createAllocator([NEXT_FIRST_CLONE_ID, NEXT_SECOND_CLONE_ID]),
    );
    expect(secondPlan?.commands.map((command) => command.element.frame)).toEqual([
      { x: 36, y: 44, width: 120, height: 48 },
      { x: 360, y: 44, width: 120, height: 48 },
    ]);

    const undone = undoDocumentHistory(history);
    expect(undone).toMatchObject({ changed: true, ok: true });
    expect(undone.history.document).toEqual(document);
  });

  it('publishes cut payload only after accepted delete and restores cut positions on paste', () => {
    const document = createClipboardFixture();
    let history: DocumentHistoryState = createDocumentHistory(document);
    const selection = new SelectionStore();
    const clipboard = new SelectionClipboardStore();
    selection.replace([DOCUMENT_FIXTURE_IDS.child, THIRD_ID], THIRD_ID);

    expect(
      cutSelectedElements(document, selection, CANONICAL_IDS, clipboard, {
        commit: (commands) => {
          const result = dispatchHistoryTransaction(history, commands, { label: 'Cut elements' });
          if (!result.ok || !result.changed) {
            return undefined;
          }
          history = result.history;
          return history.document;
        },
      }),
    ).toBe(true);
    const cutDocument = history.document;
    expect(cutDocument.elementsById[DOCUMENT_FIXTURE_IDS.group]?.childIds).toEqual([SECOND_ID]);
    expect(cutDocument.assetsById[DOCUMENT_FIXTURE_IDS.asset]).toBe(
      document.assetsById[DOCUMENT_FIXTURE_IDS.asset],
    );
    expect(clipboard.getSnapshot().payload?.kind).toBe('cut');
    expect(selection.getSnapshot().selectedIds).toEqual([]);

    expect(
      pasteClipboardElements(
        cutDocument,
        selection,
        clipboard,
        createAllocator([FIRST_CLONE_ID, SECOND_CLONE_ID]),
        {
          commit: (commands) => {
            const result = dispatchHistoryTransaction(history, commands, {
              label: 'Paste elements',
            });
            if (!result.ok || !result.changed) {
              return undefined;
            }
            history = result.history;
            return history.document;
          },
        },
      ),
    ).toBe(true);
    expect(history.undoEntries).toHaveLength(2);
    expect(history.document.elementsById[DOCUMENT_FIXTURE_IDS.group]?.childIds).toEqual([
      FIRST_CLONE_ID,
      SECOND_ID,
      SECOND_CLONE_ID,
    ]);
    expect(history.document.elementsById[FIRST_CLONE_ID]?.frame).toEqual(
      document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.frame,
    );
    expect(history.document.elementsById[SECOND_CLONE_ID]?.frame).toEqual(
      document.elementsById[THIRD_ID]?.frame,
    );
    expect(selection.getSnapshot()).toMatchObject({
      primaryId: SECOND_CLONE_ID,
      selectedIds: [FIRST_CLONE_ID, SECOND_CLONE_ID],
    });

    const pasteUndone = undoDocumentHistory(history);
    expect(pasteUndone.history.document).toEqual(cutDocument);
    const cutUndone = undoDocumentHistory(pasteUndone.history);
    expect(cutUndone.history.document).toEqual(document);
  });

  it('preserves existing clipboard and selection when cut or paste cannot commit', () => {
    const document = createClipboardFixture();
    const selection = new SelectionStore();
    const clipboard = new SelectionClipboardStore();
    selection.selectOnly(SECOND_ID);
    expect(copySelectedElements(document, selection, CANONICAL_IDS, clipboard)).toBe(true);
    const clipboardBefore = clipboard.getSnapshot();
    selection.selectOnly(DOCUMENT_FIXTURE_IDS.child);
    const selectionBefore = selection.getSnapshot();

    expect(
      cutSelectedElements(document, selection, CANONICAL_IDS, clipboard, {
        commit: () => undefined,
      }),
    ).toBe(false);
    expect(clipboard.getSnapshot()).toBe(clipboardBefore);
    expect(selection.getSnapshot()).toBe(selectionBefore);
    expect(
      pasteClipboardElements(document, selection, clipboard, createAllocator([FIRST_CLONE_ID]), {
        commit: () => undefined,
      }),
    ).toBe(false);
    expect(clipboard.getSnapshot()).toBe(clipboardBefore);
    expect(selection.getSnapshot()).toBe(selectionBefore);
  });

  it('rejects malformed, cross-project, unavailable-reference, owner, and collision input', () => {
    const document = createClipboardFixture();
    const payload = captureSelectionClipboardPayload(
      document,
      [DOCUMENT_FIXTURE_IDS.child],
      DOCUMENT_FIXTURE_IDS.child,
      CANONICAL_IDS,
      'copy',
    );
    if (payload === undefined) {
      throw new Error('Clipboard failure fixture payload was not created.');
    }
    const missingAssetId = AssetIdSchema.parse('asset_missing001');

    expect(planSelectionPaste(document, undefined, 0, () => FIRST_CLONE_ID)).toBeUndefined();
    expect(
      planSelectionPaste(
        document,
        { ...payload, projectId: ProjectIdSchema.parse('project_other001') },
        0,
        () => FIRST_CLONE_ID,
      ),
    ).toBeUndefined();
    expect(
      planSelectionPaste(
        document,
        {
          ...payload,
          entries: payload.entries.map((entry) => ({
            ...entry,
            element: { ...entry.element, assetIds: [missingAssetId] },
          })),
        },
        0,
        () => FIRST_CLONE_ID,
      ),
    ).toBeUndefined();
    expect(
      planSelectionPaste(
        document,
        {
          ...payload,
          entries: payload.entries.map((entry) => ({
            ...entry,
            owner: { kind: 'element', elementId: DOCUMENT_FIXTURE_IDS.child },
          })),
        },
        0,
        () => FIRST_CLONE_ID,
      ),
    ).toBeUndefined();
    expect(
      planSelectionPaste(document, payload, 0, () => DOCUMENT_FIXTURE_IDS.child),
    ).toBeUndefined();
    expect(planSelectionPaste(document, payload, -1, () => FIRST_CLONE_ID)).toBeUndefined();
  });
});
