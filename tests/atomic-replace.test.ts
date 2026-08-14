import { describe, expect, it, vi } from 'vitest';

import { replaceFileSafely, type AtomicReplaceOperations } from '../src/main/files/atomic-replace';

const conflict = (): NodeJS.ErrnoException =>
  Object.assign(new Error('conflict'), { code: 'EPERM' });

describe('safe file replacement orchestration', () => {
  it('uses one atomic rename when the platform supports replacement', async () => {
    const operations: AtomicReplaceOperations = {
      isRegularFile: vi.fn().mockResolvedValue(true),
      rename: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    };

    await expect(replaceFileSafely('new', 'target', 'backup', operations)).resolves.toEqual({
      ok: true,
    });
    expect(operations.rename).toHaveBeenCalledTimes(1);
    expect(operations.rename).toHaveBeenCalledWith('new', 'target');
    expect(operations.unlink).not.toHaveBeenCalled();
  });

  it('uses a backup for Windows replacement conflicts and removes it after success', async () => {
    const rename = vi
      .fn<AtomicReplaceOperations['rename']>()
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const unlink = vi.fn<AtomicReplaceOperations['unlink']>().mockResolvedValue(undefined);

    await expect(
      replaceFileSafely('new', 'target', 'backup', {
        isRegularFile: vi.fn().mockResolvedValue(true),
        rename,
        unlink,
      }),
    ).resolves.toEqual({
      ok: true,
    });
    expect(rename.mock.calls).toEqual([
      ['new', 'target'],
      ['target', 'backup'],
      ['new', 'target'],
    ]);
    expect(unlink).toHaveBeenCalledWith('backup');
  });

  it('restores the prior file when promoting the new file fails', async () => {
    const rename = vi
      .fn<AtomicReplaceOperations['rename']>()
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('promotion failed'))
      .mockResolvedValueOnce(undefined);

    await expect(
      replaceFileSafely('new', 'target', 'backup', {
        isRegularFile: vi.fn().mockResolvedValue(true),
        rename,
        unlink: vi.fn(),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'replace-failed', preserveSource: false },
    });
    expect(rename).toHaveBeenLastCalledWith('backup', 'target');
  });

  it('preserves both recovery paths when restoration itself fails', async () => {
    const rename = vi
      .fn<AtomicReplaceOperations['rename']>()
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('promotion failed'))
      .mockRejectedValueOnce(new Error('restore failed'));

    await expect(
      replaceFileSafely('new', 'target', 'backup', {
        isRegularFile: vi.fn().mockResolvedValue(true),
        rename,
        unlink: vi.fn(),
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'restore-failed',
        message: 'The prior project file could not be restored after replacement failed.',
        preserveSource: true,
        recoveryPaths: ['new', 'backup'],
      },
    });
  });

  it('reports a leftover backup as a successful-save warning', async () => {
    const rename = vi
      .fn<AtomicReplaceOperations['rename']>()
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(
      replaceFileSafely('new', 'target', 'backup', {
        isRegularFile: vi.fn().mockResolvedValue(true),
        rename,
        unlink: vi.fn().mockRejectedValue(new Error('busy')),
      }),
    ).resolves.toEqual({
      ok: true,
      warning: {
        code: 'backup-cleanup-failed',
        message: 'The project was saved, but its temporary replacement backup remains.',
        recoveryPath: 'backup',
      },
    });
  });

  it('never moves a non-file destination during the Windows fallback', async () => {
    const rename = vi.fn<AtomicReplaceOperations['rename']>().mockRejectedValue(conflict());

    await expect(
      replaceFileSafely('new', 'target', 'backup', {
        isRegularFile: vi.fn().mockResolvedValue(false),
        rename,
        unlink: vi.fn(),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'replace-failed', preserveSource: false },
    });
    expect(rename).toHaveBeenCalledTimes(1);
  });
});
