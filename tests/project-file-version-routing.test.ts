import { describe, expect, it } from 'vitest';

import { PROJECT_FILE_FORMAT_VERSION, routeProjectFileVersion } from '../src/persistence';

describe('project file version routing', () => {
  it('routes the current immutable v1 format without inventing a migration', () => {
    const result = routeProjectFileVersion(PROJECT_FILE_FORMAT_VERSION);

    expect(result).toEqual({
      ok: true,
      sourceVersion: 1,
      targetVersion: 1,
      steps: [],
    });
    if (!result.ok) {
      throw new Error('Expected current version routing to succeed.');
    }
    expect(Object.isFrozen(result.steps)).toBe(true);
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
      error: { code: 'newer-version', foundVersion: 2 },
    });
    for (const version of [-1, 1.5, '1', null, Number.NaN]) {
      expect(routeProjectFileVersion(version)).toMatchObject({
        ok: false,
        error: { code: 'invalid-manifest' },
      });
    }
  });
});
