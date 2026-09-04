import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { PROJECT_FILE_IDENTITY } from './src/shared/project-file-identity';
import {
  assertReleaseSigningEnvironment,
  assertTaggedReleaseSource,
  createTraceableArtifactManifests,
  readReleaseSourceIdentity,
} from './scripts/release-artifact-manifest';

const appIconPath = path.resolve(__dirname, 'resources', 'app-icon');
const execFileAsync = promisify(execFile);
const macSigningIdentity = process.env.MACOS_SIGN_IDENTITY?.trim();
const windowsCertificateFile = process.env.WINDOWS_CERTIFICATE_FILE?.trim();
const windowsCertificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD?.trim();
const releaseMode = process.env.BALSAMIC_RELEASE === '1';
const packageVersion = (() => {
  const parsed: unknown = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    typeof parsed.version !== 'string'
  ) {
    throw new Error('package.json has no valid release version.');
  }
  return parsed.version;
})();

const resolveExtractedExecutable = (buildPath: string, platform: string): string => {
  if (platform === 'darwin') {
    return path.join(buildPath, 'Electron.app', 'Contents', 'MacOS', 'Electron');
  }
  if (platform === 'win32') {
    return path.join(buildPath, 'electron.exe');
  }

  throw new Error(`Unsupported packaging platform: ${platform}`);
};

const config: ForgeConfig = {
  packagerConfig: {
    afterExtract: [
      (buildPath, _electronVersion, platform, _arch, callback) => {
        void flipFuses(resolveExtractedExecutable(buildPath, platform), {
          version: FuseVersion.V1,
          resetAdHocDarwinSignature: platform === 'darwin',
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
        }).then(() => callback(), callback);
      },
    ],
    appBundleId: 'app.balsamic.desktop',
    appCategoryType: 'public.app-category.developer-tools',
    appCopyright: 'Copyright © 2026 Balsamic contributors',
    asar: true,
    executableName: 'Balsamic',
    extendInfo: {
      CFBundleDocumentTypes: [
        {
          CFBundleTypeExtensions: [PROJECT_FILE_IDENTITY.extension],
          CFBundleTypeName: PROJECT_FILE_IDENTITY.displayName,
          CFBundleTypeRole: 'Editor',
          LSHandlerRank: 'Owner',
          LSItemContentTypes: [PROJECT_FILE_IDENTITY.uniformTypeIdentifier],
        },
      ],
      UTExportedTypeDeclarations: [
        {
          UTTypeConformsTo: ['public.archive', 'public.data'],
          UTTypeDescription: PROJECT_FILE_IDENTITY.displayName,
          UTTypeIdentifier: PROJECT_FILE_IDENTITY.uniformTypeIdentifier,
          UTTypeTagSpecification: {
            'public.filename-extension': [PROJECT_FILE_IDENTITY.extension],
            'public.mime-type': PROJECT_FILE_IDENTITY.mimeType,
          },
        },
      ],
    },
    extraResource: ['licenses'],
    icon: appIconPath,
    name: 'Balsamic',
    ...(macSigningIdentity === undefined || macSigningIdentity.length === 0
      ? {}
      : { osxSign: { identity: macSigningIdentity } }),
    ...(windowsCertificateFile === undefined ||
    windowsCertificateFile.length === 0 ||
    windowsCertificatePassword === undefined ||
    windowsCertificatePassword.length === 0
      ? {}
      : {
          windowsSign: {
            certificateFile: windowsCertificateFile,
            certificatePassword: windowsCertificatePassword,
            description: 'Balsamic desktop wireframing editor',
          },
        }),
  },
  rebuildConfig: {},
  hooks: {
    prePackage: (_forgeConfig, platform) => {
      if (releaseMode) {
        assertTaggedReleaseSource(readReleaseSourceIdentity(__dirname), packageVersion);
        assertReleaseSigningEnvironment(platform, process.env);
      }
      return Promise.resolve();
    },
    postMake: async (_forgeConfig, makeResults) =>
      createTraceableArtifactManifests(makeResults, __dirname, releaseMode),
    postPackage: async (_forgeConfig, { outputPaths, platform }) => {
      if (platform !== 'darwin') {
        return;
      }
      await Promise.all(
        outputPaths.map(async (outputPath) => {
          const appPath = path.join(outputPath, 'Balsamic.app');
          if (macSigningIdentity === undefined || macSigningIdentity.length === 0) {
            // Packager rewrites plist/name data after Electron's embedded signature.
            // Keep local packages launchable without replacing a release signature.
            await execFileAsync('codesign', ['--force', '--deep', '--sign', '-', appPath]);
          }
          // Packager treats signing discovery errors as warnings; the release gate does not.
          await execFileAsync('codesign', ['--verify', '--deep', '--strict', appPath]);
        }),
      );
    },
  },
  makers: [
    new MakerSquirrel({
      authors: 'Balsamic contributors',
      ...(windowsCertificateFile === undefined ||
      windowsCertificateFile.length === 0 ||
      windowsCertificatePassword === undefined ||
      windowsCertificatePassword.length === 0
        ? {}
        : {
            certificateFile: windowsCertificateFile,
            certificatePassword: windowsCertificatePassword,
          }),
      description: 'An offline-first desktop wireframing editor.',
      name: 'Balsamic',
      setupIcon: `${appIconPath}.ico`,
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
