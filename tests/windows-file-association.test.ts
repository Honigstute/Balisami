// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createWindowsFileAssociationCommands,
  parseWindowsSquirrelEvent,
  WINDOWS_APP_USER_MODEL_ID,
} from '../src/main/windows-file-association';

describe('Windows project-file association', () => {
  it('matches Squirrel package and executable identity for taskbar integration', () => {
    expect(WINDOWS_APP_USER_MODEL_ID).toBe('com.squirrel.Balsamic.Balsamic');
  });

  it('recognizes only association-relevant Squirrel lifecycle events', () => {
    expect(parseWindowsSquirrelEvent(['Balsamic.exe', '--squirrel-install'])).toBe('install');
    expect(parseWindowsSquirrelEvent(['Balsamic.exe', '--squirrel-updated'])).toBe('update');
    expect(parseWindowsSquirrelEvent(['Balsamic.exe', '--squirrel-uninstall'])).toBe('uninstall');
    expect(parseWindowsSquirrelEvent(['Balsamic.exe', '--squirrel-obsolete'])).toBeUndefined();
    expect(parseWindowsSquirrelEvent(['Balsamic.exe', 'Checkout.balsamic'])).toBeUndefined();
  });

  it('registers one current-user project class with an exact path-safe open command', () => {
    expect(
      createWindowsFileAssociationCommands(
        'install',
        'C:\\Users\\Ada Lovelace\\AppData\\Local\\Balsamic\\Balsamic.exe',
      ),
    ).toEqual([
      ['ADD', 'HKCU\\Software\\Classes\\.balsamic', '/ve', '/d', 'Balsamic.Project', '/f'],
      ['ADD', 'HKCU\\Software\\Classes\\Balsamic.Project', '/ve', '/d', 'Balsamic Project', '/f'],
      [
        'ADD',
        'HKCU\\Software\\Classes\\Balsamic.Project\\DefaultIcon',
        '/ve',
        '/d',
        '"C:\\Users\\Ada Lovelace\\AppData\\Local\\Balsamic\\Balsamic.exe",0',
        '/f',
      ],
      [
        'ADD',
        'HKCU\\Software\\Classes\\Balsamic.Project\\shell\\open\\command',
        '/ve',
        '/d',
        '"C:\\Users\\Ada Lovelace\\AppData\\Local\\Balsamic\\Balsamic.exe" "%1"',
        '/f',
      ],
    ]);
  });

  it('removes only Balsamic-owned class keys during uninstall', () => {
    expect(createWindowsFileAssociationCommands('uninstall', 'ignored')).toEqual([
      ['DELETE', 'HKCU\\Software\\Classes\\.balsamic', '/f'],
      ['DELETE', 'HKCU\\Software\\Classes\\Balsamic.Project', '/f'],
    ]);
  });
});
