import { FuseV1Options, FuseVersion, getCurrentFuseWire } from '@electron/fuses';
import path from 'node:path';
import process from 'node:process';

import { findPackagedExecutable } from './find-packaged-executable.mjs';

const packageRoot = path.resolve(process.cwd(), 'out');
const requestedPlatform = process.argv[2] ?? process.platform;
if (requestedPlatform !== 'darwin' && requestedPlatform !== 'win32') {
  throw new Error(`Unsupported fuse-verification platform: ${requestedPlatform}.`);
}

const executable = await findPackagedExecutable(packageRoot, requestedPlatform);
if (executable === null) {
  throw new Error(`No packaged Balsamic executable was found under ${packageRoot}.`);
}

const expectedFuses = new Map([
  [FuseV1Options.RunAsNode, false],
  [FuseV1Options.EnableCookieEncryption, true],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, false],
  [FuseV1Options.EnableNodeCliInspectArguments, false],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, true],
  [FuseV1Options.OnlyLoadAppFromAsar, true],
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, false],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, false],
  [FuseV1Options.WasmTrapHandlers, true],
]);

const fuseWire = await getCurrentFuseWire(executable);
if (fuseWire.version !== FuseVersion.V1) {
  throw new Error(`Expected fuse version ${FuseVersion.V1}, received ${fuseWire.version}.`);
}

const fuseState = {
  disabled: '0'.codePointAt(0),
  enabled: '1'.codePointAt(0),
};

const failures = [];
for (const [fuse, shouldBeEnabled] of expectedFuses) {
  const expectedState = shouldBeEnabled ? fuseState.enabled : fuseState.disabled;
  if (fuseWire[fuse] !== expectedState) {
    failures.push(`${FuseV1Options[fuse]} should be ${shouldBeEnabled ? 'enabled' : 'disabled'}`);
  }
}

if (failures.length > 0) {
  throw new Error(`Packaged Electron fuse verification failed:\n${failures.join('\n')}`);
}

process.stdout.write(`Packaged Electron fuses verified: ${executable}\n`);
