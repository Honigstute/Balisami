import { readdir } from 'node:fs/promises';
import path from 'node:path';

export const findPackagedExecutable = async (directory, platform) => {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nestedResult = await findPackagedExecutable(entryPath, platform);
      if (nestedResult !== null) {
        return nestedResult;
      }
      continue;
    }

    if (platform === 'darwin') {
      const expectedSuffix = path.join('Balsamic.app', 'Contents', 'MacOS', 'Balsamic');
      if (entryPath.endsWith(expectedSuffix)) {
        return entryPath;
      }
    }

    if (platform === 'win32' && entry.name === 'Balsamic.exe') {
      return entryPath;
    }
  }

  return null;
};
