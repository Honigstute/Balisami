import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BrowserWindow } from 'electron';

import { afterEach, describe, expect, it } from 'vitest';

import recoveryProbeContract from '../recovery-probe-contract.json';
import {
  preparePackagedRecoveryProbe,
  verifyPackagedRecoveryProbe,
  verifyPackagedRecoveryThroughRenderer,
} from '../src/main/recovery/recovery-packaged-probe';
import { discoverRecoverySnapshots } from '../src/main/recovery/recovery-journal';
import {
  authorizeRecoveryProbeRoot,
  parseRecoveryProbeInvocation,
} from '../src/main/recovery/recovery-probe-contract';

const temporaryDirectories: string[] = [];

const createProbeRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'balsamic-recovery-probe-test-'));
  temporaryDirectories.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('packaged recovery probe', () => {
  it('accepts exactly one probe mode and one isolated absolute root', () => {
    const root = path.join(tmpdir(), 'balsamic-recovery-parser-root');
    expect(parseRecoveryProbeInvocation(['Balsamic'], recoveryProbeContract)).toEqual({
      kind: 'none',
    });
    expect(
      parseRecoveryProbeInvocation(
        [
          'Balsamic',
          recoveryProbeContract.writeArgument,
          `${recoveryProbeContract.rootArgumentPrefix}${root}`,
        ],
        recoveryProbeContract,
      ),
    ).toMatchObject({ kind: 'probe', mode: 'write', root });
    expect(
      parseRecoveryProbeInvocation(
        [
          recoveryProbeContract.writeArgument,
          recoveryProbeContract.verifyArgument,
          `${recoveryProbeContract.rootArgumentPrefix}${root}`,
        ],
        recoveryProbeContract,
      ),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      parseRecoveryProbeInvocation(
        [
          recoveryProbeContract.verifyArgument,
          `${recoveryProbeContract.rootArgumentPrefix}relative`,
        ],
        recoveryProbeContract,
      ),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      parseRecoveryProbeInvocation(
        [
          recoveryProbeContract.verifyArgument,
          `${recoveryProbeContract.rootArgumentPrefix}${root}`,
          `${recoveryProbeContract.rootArgumentPrefix}${root}`,
        ],
        recoveryProbeContract,
      ),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('authorizes only the expected fresh directory beneath the real OS temp root', async () => {
    const root = await createProbeRoot();
    const canonicalRoot = await realpath(root);
    const authorizedFreshRoot = authorizeRecoveryProbeRoot(
      root,
      tmpdir(),
      'balsamic-recovery-probe-test-',
      true,
    );
    expect(authorizedFreshRoot).toBeDefined();
    await expect(realpath(authorizedFreshRoot ?? '')).resolves.toBe(canonicalRoot);
    expect(authorizeRecoveryProbeRoot(root, root, 'balsamic-recovery-probe-test-', true)).toBe(
      undefined,
    );

    await writeFile(path.join(root, 'unexpected.txt'), 'occupied');
    expect(
      authorizeRecoveryProbeRoot(root, tmpdir(), 'balsamic-recovery-probe-test-', true),
    ).toBeUndefined();
    const authorizedExistingRoot = authorizeRecoveryProbeRoot(
      root,
      tmpdir(),
      'balsamic-recovery-probe-test-',
      false,
    );
    expect(authorizedExistingRoot).toBeDefined();
    await expect(realpath(authorizedExistingRoot ?? '')).resolves.toBe(canonicalRoot);
  });

  it('restores the exact accepted edit while preserving the prior user file byte-for-byte', async () => {
    const root = await createProbeRoot();
    const userFilePath = path.join(root, recoveryProbeContract.userFileName);

    await preparePackagedRecoveryProbe(root, recoveryProbeContract.userFileName);
    const beforeRecovery = await readFile(userFilePath);
    await verifyPackagedRecoveryProbe(root, recoveryProbeContract.userFileName);
    const afterRecovery = await readFile(userFilePath);

    expect(afterRecovery).toEqual(beforeRecovery);
    await expect(discoverRecoverySnapshots(root)).resolves.toMatchObject({
      ok: true,
      value: { issues: [], omittedIssueCount: 0, snapshots: [{ pointer: { stateId: 1 } }] },
    });
  });

  it('accepts ordinary renderer recovery only when it is ready, dirty, and recovery-sourced', async () => {
    const root = await createProbeRoot();
    await preparePackagedRecoveryProbe(root, recoveryProbeContract.userFileName);
    const executeJavaScript = (): Promise<string> =>
      Promise.resolve(
        JSON.stringify({
          isDirty: true,
          isReady: true,
          note: 'This accepted edit existed only in recovery when the process was killed.',
          source: 'recovery',
        }),
      );
    const window = { webContents: { executeJavaScript } };

    await expect(
      verifyPackagedRecoveryThroughRenderer(
        window as unknown as BrowserWindow,
        root,
        recoveryProbeContract.userFileName,
        recoveryProbeContract,
      ),
    ).resolves.toBeUndefined();
  });

  it('refuses to report recovery when the killed process left no durable evidence', async () => {
    const root = await createProbeRoot();
    await expect(
      verifyPackagedRecoveryProbe(root, recoveryProbeContract.userFileName),
    ).rejects.toThrow('prior user project');
    await expect(discoverRecoverySnapshots(root)).resolves.toEqual({
      ok: true,
      value: { issues: [], omittedIssueCount: 0, snapshots: [] },
    });
  });
});
