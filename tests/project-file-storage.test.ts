import { mkdtemp, readdir, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  readProjectArchiveFile,
  writeProjectArchiveFileAtomically,
} from '../src/main/files/project-file-storage';
import { MAX_PROJECT_ARCHIVE_BYTES } from '../src/persistence';

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'balsamic-project-storage-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('project archive file storage', () => {
  it('writes, flushes, replaces, and reads exact bytes without sibling debris', async () => {
    const directory = await createTemporaryDirectory();
    const targetPath = path.join(directory, 'project.test');
    const initial = Uint8Array.from([1, 2, 3]);
    const replacement = Uint8Array.from([4, 5, 6, 7]);

    await expect(writeProjectArchiveFileAtomically(targetPath, initial)).resolves.toEqual({
      ok: true,
      value: {},
    });
    await expect(writeProjectArchiveFileAtomically(targetPath, replacement)).resolves.toEqual({
      ok: true,
      value: {},
    });
    const read = await readProjectArchiveFile(targetPath);
    expect(read).toMatchObject({ ok: true });
    if (!read.ok) {
      throw new Error('Expected stored project bytes to be readable.');
    }
    expect(Array.from(read.value)).toEqual(Array.from(replacement));
    expect(await readdir(directory)).toEqual(['project.test']);
  });

  it('rejects invalid, missing, and non-file paths with typed errors', async () => {
    const directory = await createTemporaryDirectory();

    await expect(readProjectArchiveFile('relative.project')).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-file-path' },
    });
    await expect(readProjectArchiveFile(path.join(directory, 'missing'))).resolves.toMatchObject({
      ok: false,
      error: { code: 'file-not-found' },
    });
    await expect(readProjectArchiveFile(directory)).resolves.toMatchObject({
      ok: false,
      error: { code: 'not-a-file' },
    });
    await expect(
      writeProjectArchiveFileAtomically(directory, new Uint8Array()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'not-a-file' },
    });
  });

  it('rejects oversized files from metadata without allocating their contents', async () => {
    const directory = await createTemporaryDirectory();
    const targetPath = path.join(directory, 'oversized.project');
    await writeFile(targetPath, new Uint8Array());
    await truncate(targetPath, MAX_PROJECT_ARCHIVE_BYTES + 1);

    await expect(readProjectArchiveFile(targetPath)).resolves.toMatchObject({
      ok: false,
      error: { code: 'file-too-large' },
    });
  });

  it('copies caller bytes before the asynchronous write starts', async () => {
    const directory = await createTemporaryDirectory();
    const targetPath = path.join(directory, 'copied.project');
    const callerBytes = Uint8Array.from([9, 8, 7]);
    const writing = writeProjectArchiveFileAtomically(targetPath, callerBytes);
    callerBytes.fill(0);
    await expect(writing).resolves.toMatchObject({ ok: true });

    const read = await readProjectArchiveFile(targetPath);
    if (!read.ok) {
      throw new Error('Expected stored project bytes to be readable.');
    }
    expect(Array.from(read.value)).toEqual([9, 8, 7]);
  });
});
