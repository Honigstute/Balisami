// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  createDocumentHistory,
  dispatchHistoryTransaction,
  parseProjectDocument,
  undoDocumentHistory,
  type DocumentCommand,
} from '../src/domain';
import { planCommandsWithUnusedAssetCleanup } from '../src/renderer/projects/unused-asset-cleanup';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const SECOND_ELEMENT_ID = ElementIdSchema.parse('element_assetcleanup2');

const createFixture = (shareAsset: boolean) => {
  const input = createValidProjectDocumentInput();
  const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
  const group = input.elementsById[DOCUMENT_FIXTURE_IDS.group];
  if (child === undefined || group === undefined) {
    throw new Error('Unused-asset fixture elements are missing.');
  }
  input.elementsById[SECOND_ELEMENT_ID] = {
    ...structuredClone(child),
    assetIds: shareAsset ? [...child.assetIds] : [],
    frame: { ...child.frame, x: child.frame.x + 180 },
    id: SECOND_ELEMENT_ID,
  };
  group.childIds.push(SECOND_ELEMENT_ID);
  const parsed = parseProjectDocument(input);
  if (!parsed.ok) {
    throw new Error('Unused-asset fixture is invalid.');
  }
  return parsed.value;
};

describe('unused asset cleanup planning', () => {
  it('appends a stable delete only when a transaction removes the final reference', () => {
    const document = createFixture(false);
    const commands = planCommandsWithUnusedAssetCleanup(document, [
      { type: DOCUMENT_COMMAND_TYPES.deleteElement, elementId: DOCUMENT_FIXTURE_IDS.child },
    ]);

    expect(commands).toEqual([
      { type: DOCUMENT_COMMAND_TYPES.deleteElement, elementId: DOCUMENT_FIXTURE_IDS.child },
      { type: DOCUMENT_COMMAND_TYPES.deleteAsset, assetId: DOCUMENT_FIXTURE_IDS.asset },
    ]);
    expect(Object.isFrozen(commands)).toBe(true);

    const deleted = dispatchHistoryTransaction(createDocumentHistory(document), commands ?? [], {
      label: 'Delete image',
    });
    if (!deleted.ok || !deleted.changed) {
      throw new Error('Unused-asset cleanup transaction failed.');
    }
    expect(deleted.history.document.assetsById[DOCUMENT_FIXTURE_IDS.asset]).toBeUndefined();
    expect(deleted.entry.inverseCommands.map((command) => command.type)).toEqual([
      DOCUMENT_COMMAND_TYPES.createAsset,
      DOCUMENT_COMMAND_TYPES.createElement,
    ]);
    expect(undoDocumentHistory(deleted.history)).toMatchObject({
      changed: true,
      history: { document },
      ok: true,
    });
  });

  it('preserves shared assets and unrelated pre-existing unused metadata', () => {
    const shared = createFixture(true);
    expect(
      planCommandsWithUnusedAssetCleanup(shared, [
        { type: DOCUMENT_COMMAND_TYPES.deleteElement, elementId: DOCUMENT_FIXTURE_IDS.child },
      ]),
    ).toEqual([
      { type: DOCUMENT_COMMAND_TYPES.deleteElement, elementId: DOCUMENT_FIXTURE_IDS.child },
    ]);

    const unusedInput = createValidProjectDocumentInput();
    unusedInput.elementsById[DOCUMENT_FIXTURE_IDS.child]!.assetIds = [];
    const unused = parseProjectDocument(unusedInput);
    if (!unused.ok) {
      throw new Error('Pre-existing unused-asset fixture is invalid.');
    }
    expect(
      planCommandsWithUnusedAssetCleanup(unused.value, [
        {
          type: DOCUMENT_COMMAND_TYPES.setElementLocked,
          elementId: DOCUMENT_FIXTURE_IDS.child,
          locked: true,
        },
      ]),
    ).toEqual([
      {
        type: DOCUMENT_COMMAND_TYPES.setElementLocked,
        elementId: DOCUMENT_FIXTURE_IDS.child,
        locked: true,
      },
    ]);
  });

  it('returns no plan when the proposed transaction is invalid', () => {
    const document = createFixture(false);
    const invalid = {
      type: DOCUMENT_COMMAND_TYPES.deleteElement,
      elementId: DOCUMENT_FIXTURE_IDS.group,
    } satisfies DocumentCommand;
    expect(planCommandsWithUnusedAssetCleanup(document, [invalid])).toBeUndefined();
  });
});
