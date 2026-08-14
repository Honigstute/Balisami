import type { BrowserWindowConstructorOptions } from 'electron';

import { DESIGN_TOKENS } from '../shared/design-tokens';

export const createMainWindowOptions = (
  preloadPath: string,
  isPackaged: boolean,
): BrowserWindowConstructorOptions => ({
  width: DESIGN_TOKENS.shell.initialWindowWidth,
  height: DESIGN_TOKENS.shell.initialWindowHeight,
  minWidth: DESIGN_TOKENS.shell.minWindowWidth,
  minHeight: DESIGN_TOKENS.shell.minWindowHeight,
  backgroundColor: DESIGN_TOKENS.color.chrome,
  show: false,
  title: 'Balsamic',
  webPreferences: {
    allowRunningInsecureContent: false,
    contextIsolation: true,
    devTools: !isPackaged,
    experimentalFeatures: false,
    navigateOnDragDrop: false,
    nodeIntegration: false,
    preload: preloadPath,
    safeDialogs: true,
    sandbox: true,
    spellcheck: false,
    webSecurity: true,
    webviewTag: false,
  },
});
