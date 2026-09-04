// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  createApplicationMenuTemplate,
  type ApplicationMenuActions,
} from '../src/main/menus/application-menu';

const createActions = (platform: NodeJS.Platform): ApplicationMenuActions => ({
  appName: 'Balsamic',
  executeEditCommand: vi.fn(),
  openDiagnosticsFolder: vi.fn(),
  openThirdPartyNotices: vi.fn(),
  platform,
  showAbout: vi.fn(),
  showPrivacyStatement: vi.fn(),
});

const topLevelLabels = (platform: NodeJS.Platform): readonly (string | undefined)[] =>
  createApplicationMenuTemplate(createActions(platform)).map((item) => item.label ?? item.role);

describe('native application menu', () => {
  it('uses platform-conventional top-level menus with renderer-routed Edit shortcuts', () => {
    expect(topLevelLabels('darwin')).toEqual([
      'Balsamic',
      'File',
      'Edit',
      'View',
      'Window',
      'help',
    ]);
    expect(topLevelLabels('win32')).toEqual(['File', 'Edit', 'View', 'Window', 'help']);
  });

  it('routes Edit commands semantically instead of installing Electron edit roles', () => {
    const actions = createActions('darwin');
    const editMenu = createApplicationMenuTemplate(actions).find((item) => item.label === 'Edit');
    const items = Array.isArray(editMenu?.submenu) ? editMenu.submenu : [];
    const commandItems = items.filter((item) => 'label' in item && item.label !== undefined);
    expect(commandItems.map((item) => ('label' in item ? item.label : undefined))).toEqual([
      'Undo',
      'Redo',
      'Cut',
      'Copy',
      'Paste',
      'Delete',
      'Duplicate',
      'Select All',
    ]);
    expect(commandItems.every((item) => !('role' in item) || item.role === undefined)).toBe(true);
    const copy = commandItems.find((item) => 'label' in item && item.label === 'Copy');
    (copy?.click as (() => void) | undefined)?.();
    expect(actions.executeEditCommand).toHaveBeenCalledExactlyOnceWith('copy');
  });

  it('exposes privacy, notices, diagnostics, and About in the macOS app menu', () => {
    const appMenu = createApplicationMenuTemplate(createActions('darwin'))[0];
    const items = Array.isArray(appMenu?.submenu) ? appMenu.submenu : [];
    expect(items.map((item) => ('label' in item ? item.label : undefined))).toEqual(
      expect.arrayContaining([
        'About Balsamic',
        'Privacy & Offline Use…',
        'Third-Party Notices…',
        'Open Diagnostics Folder',
      ]),
    );
  });

  it('places the same information surfaces in Windows Help', () => {
    const helpMenu = createApplicationMenuTemplate(createActions('win32')).find(
      (item) => item.role === 'help',
    );
    const items = Array.isArray(helpMenu?.submenu) ? helpMenu.submenu : [];
    expect(items.map((item) => ('label' in item ? item.label : undefined))).toEqual([
      'Privacy & Offline Use…',
      'Third-Party Notices…',
      'Open Diagnostics Folder',
      undefined,
      'About Balsamic',
    ]);
  });
});
