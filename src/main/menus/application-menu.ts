import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';

import { DESKTOP_CHANNELS, type ProjectCommand } from '../../shared/desktop-api';

const sendProjectCommand = (command: ProjectCommand): void => {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow !== null && !focusedWindow.isDestroyed()) {
    focusedWindow.webContents.send(DESKTOP_CHANNELS.projectCommand, command);
  }
};

/** Native accelerators stay in main; the renderer receives semantic commands only. */
export const installApplicationMenu = (): void => {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? ([{ role: 'appMenu' as const }] satisfies MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
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
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};
