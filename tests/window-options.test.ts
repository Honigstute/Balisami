// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { DESIGN_TOKENS } from '../src/shared/design-tokens';
import { createMainWindowOptions } from '../src/main/window-options';

describe('main window security options', () => {
  it('keeps renderer privileges disabled', () => {
    const options = createMainWindowOptions('/application/preload.js', true);

    expect(options.backgroundColor).toBe(DESIGN_TOKENS.color.chrome);
    expect(options.width).toBe(DESIGN_TOKENS.shell.initialWindowWidth);
    expect(options.height).toBe(DESIGN_TOKENS.shell.initialWindowHeight);
    expect(options.minWidth).toBe(DESIGN_TOKENS.shell.minWindowWidth);
    expect(options.webPreferences).toMatchObject({
      allowRunningInsecureContent: false,
      contextIsolation: true,
      devTools: false,
      experimentalFeatures: false,
      nodeIntegration: false,
      preload: '/application/preload.js',
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    });
  });

  it('allows developer tools only in development builds', () => {
    const options = createMainWindowOptions('/application/preload.js', false);
    expect(options.webPreferences?.devTools).toBe(true);
  });
});
