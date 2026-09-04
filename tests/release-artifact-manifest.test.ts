// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertReleaseSigningEnvironment,
  assertTaggedReleaseSource,
  createTraceableArtifactManifests,
} from '../scripts/release-artifact-manifest';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('release artifact manifests', () => {
  it('fails release packaging before work begins when platform signing credentials are absent', () => {
    expect(() => assertReleaseSigningEnvironment('darwin', {})).toThrow('MACOS_SIGN_IDENTITY');
    expect(() =>
      assertReleaseSigningEnvironment('win32', {
        WINDOWS_CERTIFICATE_FILE: 'certificate.pfx',
      }),
    ).toThrow('WINDOWS_CERTIFICATE_PASSWORD');
    expect(() =>
      assertReleaseSigningEnvironment('darwin', { MACOS_SIGN_IDENTITY: 'Developer ID' }),
    ).not.toThrow();
    expect(() =>
      assertReleaseSigningEnvironment('win32', {
        WINDOWS_CERTIFICATE_FILE: 'certificate.pfx',
        WINDOWS_CERTIFICATE_PASSWORD: 'secret',
      }),
    ).not.toThrow();
  });

  it('requires an exact clean version tag in release mode', () => {
    expect(() =>
      assertTaggedReleaseSource({ commit: 'a'.repeat(40), dirty: true, tag: 'v0.1.0' }, '0.1.0'),
    ).toThrow('clean source tree');
    expect(() =>
      assertTaggedReleaseSource({ commit: 'a'.repeat(40), dirty: false, tag: 'v0.2.0' }, '0.1.0'),
    ).toThrow('exact tag v0.1.0');
    expect(() =>
      assertTaggedReleaseSource({ commit: 'a'.repeat(40), dirty: false, tag: 'v0.1.0' }, '0.1.0'),
    ).not.toThrow();
  });

  it('writes deterministic artifact hashes and source identity beside make outputs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'balsamic-artifact-manifest-'));
    roots.push(root);
    await writeFile(path.join(root, '.gitignore'), 'out/\n');
    execFileSync('git', ['init'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'release-test@balsamic.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Balsamic Release Test'], { cwd: root });
    execFileSync('git', ['add', '.gitignore'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root });
    execFileSync('git', ['tag', 'v0.1.0'], { cwd: root });
    const artifactPath = path.join(root, 'out', 'make', 'Balsamic.zip');
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, 'artifact bytes');

    const results = await createTraceableArtifactManifests(
      [
        {
          arch: 'arm64',
          artifacts: [artifactPath],
          packageJSON: { version: '0.1.0' },
          platform: 'darwin',
        },
      ],
      root,
      true,
    );

    const manifestPath = results[0]?.artifacts[1];
    expect(manifestPath).toBeDefined();
    expect(manifestPath).toContain('Balsamic-0.1.0-darwin-arm64-native.manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath as string, 'utf8')) as unknown;
    expect(manifest).toMatchObject({
      app: 'Balsamic',
      arch: 'arm64',
      artifacts: [
        {
          bytes: 14,
          path: 'out/make/Balsamic.zip',
          sha256: '4659fc0570122b0e0aa14f4ff7c261b1fe51795a01ba79963f462ebf40d7520d',
        },
      ],
      platform: 'darwin',
      source: {
        dirty: false,
        tag: 'v0.1.0',
      },
      version: '0.1.0',
    });
    const commit = (manifest as { source: { commit: unknown } }).source.commit;
    expect(commit).toEqual(expect.stringMatching(/^[a-f0-9]{40}$/u));
  });
});
