// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  createApplicationMenuTemplate,
  type ApplicationMenuActions,
} from '../src/main/menus/application-menu';

const createActions = (platform: NodeJS.Platform): ApplicationMenuActions => ({
  appName: 'Balsamic',
  openDiagnosticsFolder: vi.fn(),
  openThirdPartyNotices: vi.fn(),
  platform,
  showAbout: vi.fn(),
  showPrivacyStatement: vi.fn(),
});

const topLevelLabels = (platform: NodeJS.Platform): readonly (string | undefined)[] =>
  createApplicationMenuTemplate(createActions(platform)).map((item) => item.label ?? item.role);

describe('native application menu', () => {
  it('uses platform-conventional top-level menus without intercepting canvas Edit shortcuts', () => {
    expect(topLevelLabels('darwin')).toEqual(['Balsamic', 'File', 'View', 'Window', 'help']);
    expect(topLevelLabels('win32')).toEqual(['File', 'View', 'Window', 'help']);
    expect(topLevelLabels('darwin')).not.toContain('Edit');
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
