import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openProjectFile, saveProjectFile } from '../src/main/files/project-file-service';
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

    await expect(
      saveProjectFile(filePath, document, {
        [DOCUMENT_FIXTURE_IDS.asset]: PROJECT_FILE_FIXTURE_ASSET_BYTES,
      }),
    ).resolves.toEqual({ ok: true, value: {} });
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
});
