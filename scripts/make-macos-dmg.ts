import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  assertReleaseSigningEnvironment,
  assertTaggedReleaseSource,
  createTraceableArtifactManifests,
  readReleaseSourceIdentity,
} from './release-artifact-manifest.ts';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '..');
const releaseMode = process.env.BALSAMIC_RELEASE === '1';

const parseArchitecture = (): 'arm64' | 'x64' => {
  const argument = process.argv.find((value) => value.startsWith('--arch='));
  const architecture = argument?.slice('--arch='.length);
  if (architecture === 'arm64' || architecture === 'x64') return architecture;
  throw new Error('macOS DMG creation requires --arch=arm64 or --arch=x64.');
};

const readPackageVersion = async (): Promise<string> => {
  const parsed: unknown = JSON.parse(
    await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
  );
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    typeof parsed.version !== 'string' ||
    parsed.version.length === 0
  ) {
    throw new Error('package.json has no valid release version.');
  }
  return parsed.version;
};

const requireReleaseValue = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`macOS notarization requires ${name}.`);
  return value;
};

const architecture = parseArchitecture();
const version = await readPackageVersion();
const appPath = path.join(repositoryRoot, 'out', `Balsamic-darwin-${architecture}`, 'Balsamic.app');
const outputDirectory = path.join(repositoryRoot, 'out', 'make', 'dmg', 'darwin', architecture);
const dmgPath = path.join(outputDirectory, `Balsamic-darwin-${architecture}-${version}.dmg`);

if (releaseMode) {
  assertTaggedReleaseSource(readReleaseSourceIdentity(repositoryRoot), version);
  assertReleaseSigningEnvironment('darwin', process.env);
}

await execFileAsync('codesign', ['--verify', '--deep', '--strict', appPath]);
await mkdir(outputDirectory, { recursive: true });
const stagingDirectory = await mkdtemp(path.join(tmpdir(), 'balsamic-dmg-'));
try {
  await execFileAsync('ditto', [appPath, path.join(stagingDirectory, 'Balsamic.app')]);
  await symlink('/Applications', path.join(stagingDirectory, 'Applications'));
  await execFileAsync('hdiutil', [
    'create',
    '-volname',
    'Balsamic',
    '-srcfolder',
    stagingDirectory,
    '-ov',
    '-format',
    'UDZO',
    dmgPath,
  ]);
} finally {
  await rm(stagingDirectory, { force: true, recursive: true });
}

if (releaseMode) {
  const identity = requireReleaseValue('MACOS_SIGN_IDENTITY');
  await execFileAsync('codesign', ['--force', '--sign', identity, '--timestamp', dmgPath]);
  await execFileAsync('xcrun', [
    'notarytool',
    'submit',
    dmgPath,
    '--apple-id',
    requireReleaseValue('APPLE_ID'),
    '--password',
    requireReleaseValue('APPLE_APP_SPECIFIC_PASSWORD'),
    '--team-id',
    requireReleaseValue('APPLE_TEAM_ID'),
    '--wait',
  ]);
  await execFileAsync('xcrun', ['stapler', 'staple', dmgPath]);
  await execFileAsync('xcrun', ['stapler', 'validate', dmgPath]);
} else {
  await execFileAsync('codesign', ['--force', '--sign', '-', dmgPath]);
}
await execFileAsync('codesign', ['--verify', '--strict', dmgPath]);

await createTraceableArtifactManifests(
  [
    {
      arch: architecture,
      artifacts: [dmgPath],
      packageJSON: { version },
      platform: 'darwin',
    },
  ],
  repositoryRoot,
  releaseMode,
  'dmg',
);

process.stdout.write(`macOS DMG created with checksum manifest: ${dmgPath}\n`);
