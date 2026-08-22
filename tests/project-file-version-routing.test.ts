import { describe, expect, it } from 'vitest';

import { PROJECT_FILE_FORMAT_VERSION, routeProjectFileVersion } from '../src/persistence';

describe('project file version routing', () => {
  it('routes the current v3 format without redundant migration work', () => {
    const result = routeProjectFileVersion(PROJECT_FILE_FORMAT_VERSION);

    expect(result).toEqual({
      ok: true,
      sourceVersion: 3,
      targetVersion: 3,
      steps: [],
    });
    if (!result.ok) {
      throw new Error('Expected current version routing to succeed.');
    }
    expect(Object.isFrozen(result.steps)).toBe(true);
  });

  it('routes every released format through a complete sequential path', () => {
    const result = routeProjectFileVersion(1);
    expect(result).toMatchObject({ ok: true, sourceVersion: 1, targetVersion: 3 });
    if (!result.ok) {
      throw new Error('Expected v1 routing to succeed.');
    }
    expect(result.steps.map(({ fromVersion, toVersion }) => ({ fromVersion, toVersion }))).toEqual([
      { fromVersion: 1, toVersion: 2 },
      { fromVersion: 2, toVersion: 3 },
    ]);
    expect(result.steps[0]?.migrateDocument).toBeTypeOf('function');

    const v2 = routeProjectFileVersion(2);
    expect(v2).toMatchObject({ ok: true, sourceVersion: 2, targetVersion: 3 });
    if (!v2.ok) {
      throw new Error('Expected v2 routing to succeed.');
    }
    expect(v2.steps.map(({ fromVersion, toVersion }) => ({ fromVersion, toVersion }))).toEqual([
      { fromVersion: 2, toVersion: 3 },
    ]);
  });

  it('rejects versions without a complete sequential migration path', () => {
    expect(routeProjectFileVersion(0)).toEqual({
      ok: false,
      error: {
        code: 'unsupported-version',
        message: 'Project file format version 0 has no complete migration path.',
        foundVersion: 0,
      },
    });
  });

  it('distinguishes newer versions from malformed manifest versions', () => {
    expect(routeProjectFileVersion(PROJECT_FILE_FORMAT_VERSION + 1)).toMatchObject({
      ok: false,
      error: { code: 'newer-version', foundVersion: PROJECT_FILE_FORMAT_VERSION + 1 },
    });
    for (const version of [-1, 1.5, '1', null, Number.NaN]) {
      expect(routeProjectFileVersion(version)).toMatchObject({
        ok: false,
        error: { code: 'invalid-manifest' },
      });
    }
  });
});
