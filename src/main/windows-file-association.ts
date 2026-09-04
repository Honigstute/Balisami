import { spawnSync } from 'node:child_process';

import { PROJECT_FILE_IDENTITY } from '../shared/project-file-identity';

const WINDOWS_PROJECT_CLASS = 'Balsamic.Project';
const USER_CLASSES_ROOT = 'HKCU\\Software\\Classes';

export type WindowsSquirrelEvent = 'install' | 'update' | 'uninstall';

export const parseWindowsSquirrelEvent = (
  argv: readonly string[],
): WindowsSquirrelEvent | undefined => {
  const event = argv[1];
  if (event === '--squirrel-install') return 'install';
  if (event === '--squirrel-updated') return 'update';
  if (event === '--squirrel-uninstall') return 'uninstall';
  return undefined;
};

export const createWindowsFileAssociationCommands = (
  event: WindowsSquirrelEvent,
  executablePath: string,
): readonly (readonly string[])[] => {
  const extensionKey = `${USER_CLASSES_ROOT}\\.${PROJECT_FILE_IDENTITY.extension}`;
  const classKey = `${USER_CLASSES_ROOT}\\${WINDOWS_PROJECT_CLASS}`;
  if (event === 'uninstall') {
    return Object.freeze([
      Object.freeze(['DELETE', extensionKey, '/f']),
      Object.freeze(['DELETE', classKey, '/f']),
    ]);
  }

  return Object.freeze([
    Object.freeze(['ADD', extensionKey, '/ve', '/d', WINDOWS_PROJECT_CLASS, '/f']),
    Object.freeze(['ADD', classKey, '/ve', '/d', PROJECT_FILE_IDENTITY.displayName, '/f']),
    Object.freeze(['ADD', `${classKey}\\DefaultIcon`, '/ve', '/d', `"${executablePath}",0`, '/f']),
    Object.freeze([
      'ADD',
      `${classKey}\\shell\\open\\command`,
      '/ve',
      '/d',
      `"${executablePath}" "%1"`,
      '/f',
    ]),
  ]);
};

/** Runs only during Squirrel install/update/uninstall, before the normal app starts. */
export const applyWindowsFileAssociation = (
  event: WindowsSquirrelEvent,
  executablePath: string,
): boolean => {
  const results = createWindowsFileAssociationCommands(event, executablePath).map((args) => {
    const result = spawnSync('reg.exe', args, { windowsHide: true });
    return result.status === 0;
  });
  return results.every(Boolean);
};
