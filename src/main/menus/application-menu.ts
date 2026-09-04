import { app, BrowserWindow, dialog, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';

import { DESKTOP_CHANNELS, type ProjectCommand } from '../../shared/desktop-api';

export interface ApplicationMenuActions {
  readonly appName: string;
  readonly openDiagnosticsFolder: () => void;
  readonly openThirdPartyNotices: () => void;
  readonly platform: NodeJS.Platform;
  readonly showAbout: () => void;
  readonly showPrivacyStatement: () => void;
}

export interface InstallApplicationMenuOptions {
  readonly diagnosticsDirectory: string;
  readonly reportFailure?: (scope: string, error: unknown) => void;
}

const sendProjectCommand = (command: ProjectCommand): void => {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow !== null && !focusedWindow.isDestroyed()) {
    focusedWindow.webContents.send(DESKTOP_CHANNELS.projectCommand, command);
  }
};

const createInformationItems = (
  actions: ApplicationMenuActions,
): readonly MenuItemConstructorOptions[] => [
  {
    label: 'Privacy & Offline Use…',
    click: actions.showPrivacyStatement,
  },
  {
    label: 'Third-Party Notices…',
    click: actions.openThirdPartyNotices,
  },
  {
    label: 'Open Diagnostics Folder',
    click: actions.openDiagnosticsFolder,
  },
];

/**
 * Keeps the menu truthful: native file/window/help actions are exposed here,
 * while canvas editing remains with the renderer's validated command owners.
 */
export const createApplicationMenuTemplate = (
  actions: ApplicationMenuActions,
): readonly MenuItemConstructorOptions[] => {
  const informationItems = createInformationItems(actions);
  return [
    ...(actions.platform === 'darwin'
      ? ([
          {
            label: actions.appName,
            submenu: [
              { label: `About ${actions.appName}`, click: actions.showAbout },
              { type: 'separator' },
              ...informationItems,
              { type: 'separator' },
              { role: 'services', submenu: [] },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] satisfies MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendProjectCommand('open'),
        },
        {
          label: 'Open Recent…',
          click: () => sendProjectCommand('open-recent'),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendProjectCommand('save'),
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendProjectCommand('save-as'),
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'View',
      submenu: [{ role: 'togglefullscreen' }],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(actions.platform === 'darwin'
          ? ([{ type: 'separator' }, { role: 'front' }] satisfies MenuItemConstructorOptions[])
          : ([{ role: 'close' }] satisfies MenuItemConstructorOptions[])),
      ],
    },
    {
      role: 'help',
      submenu: [
        ...informationItems,
        ...(actions.platform === 'darwin'
          ? []
          : ([
              { type: 'separator' },
              { label: `About ${actions.appName}`, click: actions.showAbout },
            ] satisfies MenuItemConstructorOptions[])),
      ],
    },
  ];
};

const resolveNoticesDirectory = (): string =>
  app.isPackaged
    ? path.join(process.resourcesPath, 'licenses')
    : path.resolve(__dirname, '..', '..', 'licenses');

/** Native accelerators and operating-system information surfaces stay in main. */
export const installApplicationMenu = ({
  diagnosticsDirectory,
  reportFailure,
}: InstallApplicationMenuOptions): void => {
  app.setAboutPanelOptions({
    applicationName: 'Balsamic',
    applicationVersion: app.getVersion(),
    copyright: 'Copyright © 2026 Balsamic contributors',
    version: `${process.platform} ${process.arch}`,
  });

  const openPath = (scope: string, targetPath: string): void => {
    void shell
      .openPath(targetPath)
      .then((errorMessage) => {
        if (errorMessage.length > 0) throw new Error(errorMessage);
      })
      .catch((error: unknown) => {
        reportFailure?.(scope, error);
        dialog.showErrorBox(
          'Could not open this location',
          'Balsamic kept your project unchanged. Please try again.',
        );
      });
  };

  const template = createApplicationMenuTemplate({
    appName: app.name,
    openDiagnosticsFolder: () => openPath('diagnostics-folder', diagnosticsDirectory),
    openThirdPartyNotices: () => openPath('third-party-notices', resolveNoticesDirectory()),
    platform: process.platform,
    showAbout: () => app.showAboutPanel(),
    showPrivacyStatement: () => {
      void dialog.showMessageBox({
        type: 'info',
        title: 'Balsamic Privacy & Offline Use',
        message: 'Your projects stay on this computer.',
        detail:
          "Balsamic does not collect analytics or telemetry. Project files, recovery data, and diagnostics remain local. Packaged builds contact Electron's public update service only to check for signed Balsamic releases. Opening a web link from a wireframe sends only that link to your default browser.",
        buttons: ['OK'],
        defaultId: 0,
        noLink: true,
      });
    },
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([...template]));
};
