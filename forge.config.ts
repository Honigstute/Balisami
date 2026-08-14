import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';
import path from 'node:path';

const resolvePackagedExecutable = (outputPath: string, platform: string): string => {
  if (platform === 'darwin') {
    return path.join(outputPath, 'Balsamic.app', 'Contents', 'MacOS', 'Balsamic');
  }
  if (platform === 'win32') {
    return path.join(outputPath, 'Balsamic.exe');
  }

  throw new Error(`Unsupported packaging platform: ${platform}`);
};

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: 'app.balsamic.desktop',
    asar: true,
    executableName: 'Balsamic',
    name: 'Balsamic',
  },
  rebuildConfig: {},
  hooks: {
    postPackage: async (_forgeConfig, { arch, outputPaths, platform }) => {
      await Promise.all(
        outputPaths.map((outputPath) =>
          flipFuses(resolvePackagedExecutable(outputPath, platform), {
            version: FuseVersion.V1,
            resetAdHocDarwinSignature: platform === 'darwin' && arch === 'arm64',
            strictlyRequireAllFuses: true,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
            // Packager ships only the shared snapshot; enabling this without the
            // browser-specific file makes Electron fail before main starts.
            [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
            [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
            [FuseV1Options.WasmTrapHandlers]: true,
          }),
        ),
      );
    },
  },
  makers: [
    new MakerSquirrel({
      authors: 'Balsamic contributors',
      description: 'An offline-first desktop wireframing editor.',
      name: 'Balsamic',
    }),
    new MakerZIP({}, ['darwin']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
  ],
};

export default config;
