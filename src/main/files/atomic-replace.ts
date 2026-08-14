export interface AtomicReplaceOperations {
  readonly isRegularFile: (filePath: string) => Promise<boolean>;
  readonly rename: (sourcePath: string, targetPath: string) => Promise<void>;
  readonly unlink: (filePath: string) => Promise<void>;
}

export interface AtomicReplaceWarning {
  readonly code: 'backup-cleanup-failed';
  readonly message: string;
  readonly recoveryPath: string;
}

export type AtomicReplaceErrorCode = 'replace-failed' | 'restore-failed';

export interface AtomicReplaceError {
  readonly code: AtomicReplaceErrorCode;
  readonly message: string;
  readonly preserveSource: boolean;
  readonly recoveryPaths?: readonly string[];
}

export type AtomicReplaceResult =
  | { readonly ok: true; readonly warning?: AtomicReplaceWarning }
  | { readonly ok: false; readonly error: AtomicReplaceError };

const isWindowsReplaceConflict = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = (error as { readonly code?: unknown }).code;
  return code === 'EACCES' || code === 'EEXIST' || code === 'EPERM';
};

/**
 * POSIX takes the first atomic rename path. Windows may reject replacing an
 * existing file, so the fallback keeps the prior file in a sibling backup and
 * restores it if promoting the new file fails.
 */
export const replaceFileSafely = async (
  sourcePath: string,
  targetPath: string,
  backupPath: string,
  operations: AtomicReplaceOperations,
): Promise<AtomicReplaceResult> => {
  try {
    await operations.rename(sourcePath, targetPath);
    return { ok: true };
  } catch (error) {
    if (!isWindowsReplaceConflict(error)) {
      return {
        ok: false,
        error: {
          code: 'replace-failed',
          message: 'The temporary project file could not replace the destination.',
          preserveSource: false,
        },
      };
    }
  }

  try {
    if (!(await operations.isRegularFile(targetPath))) {
      return {
        ok: false,
        error: {
          code: 'replace-failed',
          message: 'The existing project destination is not a regular file.',
          preserveSource: false,
        },
      };
    }
  } catch {
    return {
      ok: false,
      error: {
        code: 'replace-failed',
        message: 'The existing project destination could not be checked safely.',
        preserveSource: false,
      },
    };
  }

  try {
    await operations.rename(targetPath, backupPath);
  } catch {
    return {
      ok: false,
      error: {
        code: 'replace-failed',
        message: 'The existing project file could not be prepared for safe replacement.',
        preserveSource: false,
      },
    };
  }

  try {
    await operations.rename(sourcePath, targetPath);
  } catch {
    try {
      await operations.rename(backupPath, targetPath);
    } catch {
      return {
        ok: false,
        error: {
          code: 'restore-failed',
          message: 'The prior project file could not be restored after replacement failed.',
          preserveSource: true,
          recoveryPaths: Object.freeze([sourcePath, backupPath]),
        },
      };
    }
    return {
      ok: false,
      error: {
        code: 'replace-failed',
        message:
          'The new project file could not replace the destination; the prior file was restored.',
        preserveSource: false,
      },
    };
  }

  try {
    await operations.unlink(backupPath);
    return { ok: true };
  } catch {
    return {
      ok: true,
      warning: {
        code: 'backup-cleanup-failed',
        message: 'The project was saved, but its temporary replacement backup remains.',
        recoveryPath: backupPath,
      },
    };
  }
};
