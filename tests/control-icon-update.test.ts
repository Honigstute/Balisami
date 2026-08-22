import { describe, expect, it } from 'vitest';

import {
  AssetIdSchema,
  CONTROL_TYPES,
  createCustomIconReference,
  createDocumentHistory,
  dispatchHistoryTransaction,
  getControlSpec,
  parseProjectDocument,
  undoDocumentHistory,
} from '../src/domain';
import { planControlIconUpdates } from '../src/renderer/controls/control-icon-update';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const SECOND_ASSET_ID = AssetIdSchema.parse('asset_image0002');

const createCustomIconDocument = () => {
  const input = createValidProjectDocumentInput();
  const button = getControlSpec(CONTROL_TYPES.button);
  const element = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
  const firstAsset = input.assetsById[DOCUMENT_FIXTURE_IDS.asset];
  if (button === undefined || element === undefined || firstAsset === undefined) {
    throw new Error('Custom-icon fixture is incomplete.');
  }
  input.assetsById[SECOND_ASSET_ID] = {
    ...firstAsset,
    id: SECOND_ASSET_ID,
    originalName: 'replacement.png',
  };
  element.controlType = button.type;
  element.controlVersion = button.fileVersion;
  element.properties = {
    iconId: createCustomIconReference(DOCUMENT_FIXTURE_IDS.asset),
    text: 'Continue',
  };
  element.assetIds = [DOCUMENT_FIXTURE_IDS.asset];
  const parsed = parseProjectDocument(input);
  if (!parsed.ok)
    throw new Error(`Custom-icon fixture is invalid: ${JSON.stringify(parsed.issues)}`);
  return parsed.value;
};

describe('control custom-icon updates', () => {
  it('switches project images in one exactly reversible history entry and cleans the old asset', () => {
    const document = createCustomIconDocument();
    const commands = planControlIconUpdates(document, [
      {
        elementId: DOCUMENT_FIXTURE_IDS.child,
        iconId: createCustomIconReference(SECOND_ASSET_ID),
        property: 'iconId',
      },
    ]);

    expect(commands?.map((command) => command.type)).toEqual([
      'element.set-assets',
      'element.set-properties',
      'element.set-assets',
      'asset.delete',
    ]);
    const changed = dispatchHistoryTransaction(createDocumentHistory(document), commands ?? [], {
      label: 'Change icon',
    });
    expect(changed).toMatchObject({ ok: true, changed: true });
    if (!changed.ok || !changed.changed) throw new Error('Custom-icon change failed.');
    expect(changed.history.undoEntries).toHaveLength(1);
    expect(changed.history.document.elementsById[DOCUMENT_FIXTURE_IDS.child]).toMatchObject({
      assetIds: [SECOND_ASSET_ID],
      properties: { iconId: createCustomIconReference(SECOND_ASSET_ID), text: 'Continue' },
    });
    expect(changed.history.document.assetsById[DOCUMENT_FIXTURE_IDS.asset]).toBeUndefined();

    const undone = undoDocumentHistory(changed.history);
    expect(undone).toMatchObject({ ok: true, changed: true });
    if (!undone.ok || !undone.changed) throw new Error('Custom-icon undo failed.');
    expect(undone.history.document).toEqual(document);
  });

  it('rejects unknown icon properties and custom assets without document damage', () => {
    const document = createCustomIconDocument();
    expect(
      planControlIconUpdates(document, [
        {
          elementId: DOCUMENT_FIXTURE_IDS.child,
          iconId: createCustomIconReference(SECOND_ASSET_ID),
          property: 'missingIcon',
        },
      ]),
    ).toBeUndefined();
    expect(document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.assetIds).toEqual([
      DOCUMENT_FIXTURE_IDS.asset,
    ]);
  });
});
