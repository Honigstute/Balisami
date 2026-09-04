import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ForgeMakeResult } from '@electron-forge/shared-types';

export interface ReleaseSourceIdentity {
  readonly commit: string;
  readonly dirty: boolean;
  readonly tag: string | null;
}

export interface ReleaseSigningEnvironment {
  readonly MACOS_SIGN_IDENTITY?: string;
  readonly WINDOWS_CERTIFICATE_FILE?: string;
  readonly WINDOWS_CERTIFICATE_PASSWORD?: string;
}

interface ArtifactIdentity {
  readonly bytes: number;
  readonly path: string;
  readonly sha256: string;
}

const readGit = (repositoryRoot: string, args: readonly string[]): string =>
  execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();

export const readReleaseSourceIdentity = (repositoryRoot: string): ReleaseSourceIdentity => ({
  commit: readGit(repositoryRoot, ['rev-parse', 'HEAD']),
  dirty: readGit(repositoryRoot, ['status', '--porcelain']).length > 0,
  tag: readGit(repositoryRoot, ['tag', '--points-at', 'HEAD']) || null,
});

const hashFile = async (filePath: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const value of createReadStream(filePath)) {
    const chunk: unknown = value;
    if (!Buffer.isBuffer(chunk)) throw new Error(`Artifact stream was not binary: ${filePath}`);
    hash.update(chunk);
  }
  return hash.digest('hex');
};

const identifyArtifact = async (
  repositoryRoot: string,
  artifactPath: string,
): Promise<ArtifactIdentity> => {
  const details = await stat(artifactPath);
  if (!details.isFile()) throw new Error(`Release artifact is not a file: ${artifactPath}`);
  return Object.freeze({
    bytes: details.size,
    path: path.relative(repositoryRoot, artifactPath).split(path.sep).join('/'),
    sha256: await hashFile(artifactPath),
  });
};

export const assertTaggedReleaseSource = (source: ReleaseSourceIdentity, version: string): void => {
  if (source.dirty) throw new Error('Release artifacts require a clean source tree.');
  if (source.tag !== `v${version}`) {
    throw new Error(`Release artifacts require exact tag v${version} at HEAD.`);
  }
};

export const assertReleaseSigningEnvironment = (
  platform: string,
  environment: ReleaseSigningEnvironment,
): void => {
  if (platform === 'darwin' && !environment.MACOS_SIGN_IDENTITY?.trim()) {
    throw new Error('macOS release packaging requires MACOS_SIGN_IDENTITY.');
  }
  if (
    platform === 'win32' &&
    (!environment.WINDOWS_CERTIFICATE_FILE?.trim() ||
      !environment.WINDOWS_CERTIFICATE_PASSWORD?.trim())
  ) {
    throw new Error(
      'Windows release packaging requires WINDOWS_CERTIFICATE_FILE and WINDOWS_CERTIFICATE_PASSWORD.',
    );
  }
};

/** Adds a deterministic, machine-readable checksum/source record to every make result. */
export const createTraceableArtifactManifests = async (
  makeResults: ForgeMakeResult[],
  repositoryRoot: string,
  releaseMode: boolean,
  manifestLabel = 'native',
): Promise<ForgeMakeResult[]> => {
  const source = readReleaseSourceIdentity(repositoryRoot);
  const manifestDirectory = path.join(repositoryRoot, 'out', 'make', 'manifests');
  await mkdir(manifestDirectory, { recursive: true });

  return Promise.all(
    makeResults.map(async (result) => {
      const packageJSON = result.packageJSON as unknown;
      if (
        typeof packageJSON !== 'object' ||
        packageJSON === null ||
        !('version' in packageJSON) ||
        typeof packageJSON.version !== 'string' ||
        packageJSON.version.length === 0
      ) {
        throw new Error('Release artifact package version is unavailable.');
      }
      const version = packageJSON.version;
      if (releaseMode) assertTaggedReleaseSource(source, version);
      const artifacts = await Promise.all(
        [...result.artifacts]
          .sort()
          .map((artifactPath) => identifyArtifact(repositoryRoot, artifactPath)),
      );
      const manifestPath = path.join(
        manifestDirectory,
        `Balsamic-${version}-${result.platform}-${result.arch}-${manifestLabel}.manifest.json`,
      );
      await writeFile(
        manifestPath,
        `${JSON.stringify(
          {
            app: 'Balsamic',
            arch: result.arch,
            artifacts,
            platform: result.platform,
            source,
            version,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
      return { ...result, artifacts: [...result.artifacts, manifestPath] };
    }),
  );
};
