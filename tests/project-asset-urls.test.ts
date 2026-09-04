// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  DOCUMENT_COMMAND_TYPES,
  dispatchDocumentCommand,
  parseProjectDocument,
} from '../src/domain';
import { ProjectAssetUrlStore } from '../src/renderer/projects/project-asset-urls';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const createDocument = () => {
  const parsed = parseProjectDocument(createValidProjectDocumentInput());
  if (!parsed.ok) {
    throw new Error('Asset URL fixture is invalid.');
  }
  return parsed.value;
};

describe('project asset URL store', () => {
  it('reuses derived URLs across unrelated document revisions and revokes them on disposal', () => {
    const create = vi.fn(() => 'blob:asset-1');
    const revoke = vi.fn();
    const store = new ProjectAssetUrlStore({ create, revoke });
    const document = createDocument();
    const bytes = Uint8Array.from([1, 2, 3]);

    store.sync(document, () => bytes);
    const first = store.getSnapshot();
    expect(first[DOCUMENT_FIXTURE_IDS.asset]).toBe('blob:asset-1');
    expect(create).toHaveBeenCalledOnce();

    const renamed = dispatchDocumentCommand(document, {
      type: DOCUMENT_COMMAND_TYPES.renameBoard,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      name: 'Renamed without changing assets',
    });
    if (!renamed.ok || !renamed.changed) {
      throw new Error('Asset URL revision fixture could not be renamed.');
    }
    store.sync(renamed.document, () => bytes);
    expect(store.getSnapshot()).toBe(first);
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();

    store.dispose();
    expect(revoke).toHaveBeenCalledWith('blob:asset-1');
    expect(store.getSnapshot()).toEqual({});
  });

  it('does not publish a URL when exact asset bytes are unavailable', () => {
    const create = vi.fn(() => 'blob:unexpected');
    const store = new ProjectAssetUrlStore({ create, revoke: vi.fn() });
    store.sync(createDocument(), () => undefined);
    expect(store.getSnapshot()).toEqual({});
    expect(create).not.toHaveBeenCalled();
  });
});
