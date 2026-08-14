import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  openProjectFile,
  saveProjectFile,
  saveProjectHistorySnapshot,
} from '../src/main/files/project-file-service';
import {
  DOCUMENT_COMMAND_TYPES,
  beginDocumentHistorySave,
  completeDocumentHistorySave,
  createDocumentHistory,
  dispatchHistoryCommand,
  isDocumentHistoryDirty,
} from '../src/domain';
import {
  createAssetFreeProjectDocument,
  createProjectDocumentWithAsset,
  PROJECT_FILE_FIXTURE_ASSET_BYTES,
} from './fixtures/project-file';
import { DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const temporaryDirectories: string[] = [];

const createProjectPath = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'balsamic-project-service-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'project.test');
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('main-process project file service', () => {
  it('saves and reopens one validated document with its assets', async () => {
    const filePath = await createProjectPath();
    const document = createProjectDocumentWithAsset();

    const saved = await saveProjectFile(filePath, document, {
      [DOCUMENT_FIXTURE_IDS.asset]: PROJECT_FILE_FIXTURE_ASSET_BYTES,
    });
    expect(saved).toMatchObject({ ok: true });
    if (!saved.ok) {
      throw new Error('Expected project file save to succeed.');
    }
    expect(saved.value.archiveByteLength).toBeGreaterThan(0);
    expect(saved.value.archiveSha256).toMatch(/^[a-f0-9]{64}$/u);
    const opened = await openProjectFile(filePath);
    expect(opened).toMatchObject({ ok: true });
    if (!opened.ok) {
      throw new Error('Expected the saved project to reopen.');
    }
    expect(opened.value.document).toEqual(document);
    expect(Array.from(opened.value.assetsById[DOCUMENT_FIXTURE_IDS.asset] ?? [])).toEqual(
      Array.from(PROJECT_FILE_FIXTURE_ASSET_BYTES),
    );
  });

  it('returns archive corruption as a typed open failure', async () => {
    const filePath = await createProjectPath();
    await writeFile(filePath, Uint8Array.from([1, 2, 3, 4]));

    await expect(openProjectFile(filePath)).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-archive' },
    });
  });

  it('validates a save completely before touching the prior file', async () => {
    const filePath = await createProjectPath();
    const priorBytes = Uint8Array.from([9, 8, 7, 6]);
    await writeFile(filePath, priorBytes);
    const invalidDocument = {
      ...createAssetFreeProjectDocument(),
      name: '',
    } as unknown as ReturnType<typeof createAssetFreeProjectDocument>;

    await expect(saveProjectFile(filePath, invalidDocument)).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-document' },
    });
    expect(Array.from(await readFile(filePath))).toEqual(Array.from(priorBytes));
  });

  it('returns the exact saved history identity while edits made during save remain dirty', async () => {
    const filePath = await createProjectPath();
    const initial = createDocumentHistory(createAssetFreeProjectDocument(), {
      initiallySaved: false,
    });
    const started = beginDocumentHistorySave(initial);
    if (!started.ok) {
      throw new Error('Expected the history save to start.');
    }

    const saving = saveProjectHistorySnapshot(filePath, started.snapshot);
    const edited = dispatchHistoryCommand(started.history, {
      type: DOCUMENT_COMMAND_TYPES.setBoardNote,
      boardId: DOCUMENT_FIXTURE_IDS.board,
      note: { text: 'Edited while the file write was in flight' },
    });
    if (!edited.ok || !edited.changed) {
      throw new Error('Expected an edit during the save.');
    }
    const saved = await saving;
    expect(saved).toMatchObject({
      ok: true,
      value: {
        stateId: started.snapshot.stateId,
        tokenId: started.snapshot.tokenId,
      },
    });
    expect(saved.ok && Object.isFrozen(saved.value)).toBe(true);

    const completed = completeDocumentHistorySave(edited.history, started.snapshot);
    if (!completed.ok) {
      throw new Error('Expected the matching save token to resolve.');
    }
    expect(completed.history.savedStateId).toBe(started.snapshot.stateId);
    expect(completed.history.currentStateId).not.toBe(started.snapshot.stateId);
    expect(isDocumentHistoryDirty(completed.history)).toBe(true);

    const reopened = await openProjectFile(filePath);
    if (!reopened.ok) {
      throw new Error('Expected the saved snapshot to reopen.');
    }
    expect(reopened.value.document).toEqual(started.snapshot.document);
    expect(reopened.value.document).not.toEqual(edited.history.document);
  });
});
