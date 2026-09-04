// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({ showSaveDialog: vi.fn() }));

vi.mock('electron', () => ({ dialog: { showSaveDialog: electron.showSaveDialog } }));

import { saveDesktopExportFile } from '../src/main/export-file';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  electron.showSaveDialog.mockReset();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('desktop export file service', () => {
  it('writes exact bytes atomically to the path selected by the native dialog', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'balsamic-export-'));
    temporaryDirectories.push(directory);
    const targetPath = path.join(directory, 'Checkout.png');
    electron.showSaveDialog.mockResolvedValue({ canceled: false, filePath: targetPath });
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

    await expect(
      saveDesktopExportFile({ bytes, format: 'png', suggestedBaseName: 'Checkout' }),
    ).resolves.toEqual({
      status: 'completed',
      value: { displayName: 'Checkout.png' },
      warnings: [],
    });
    expect(new Uint8Array(await readFile(targetPath))).toEqual(bytes);
  });

  it('does not write when the dialog is cancelled', async () => {
    electron.showSaveDialog.mockResolvedValue({ canceled: true });
    await expect(
      saveDesktopExportFile({
        bytes: Uint8Array.from([1]),
        format: 'svg',
        suggestedBaseName: 'Wireframe',
      }),
    ).resolves.toEqual({ status: 'cancelled' });
  });
});
