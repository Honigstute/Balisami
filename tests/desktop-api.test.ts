// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  DESKTOP_ACKNOWLEDGEMENT,
  isDesktopAcknowledgement,
  isExternalUrlRequest,
  isProjectCloseOutcome,
  isProjectCloseResponse,
  isProjectHistorySnapshotRequest,
  isProjectOpenRecentRequest,
  isProjectOpenedResult,
  isProjectRecoveryChoiceRequest,
  isProjectRecoveryDiscardedResult,
  isProjectRecoveryScheduledResult,
  isProjectReplacementRequest,
  isProjectStartupOptionsResult,
  isRecentProjectsResult,
  isRuntimeInfo,
} from '../src/shared/desktop-api';
import { createAssetFreeProjectDocument } from './fixtures/project-file';

describe('desktop API boundary validation', () => {
  it('accepts only the exact acknowledgement shape', () => {
    expect(isDesktopAcknowledgement(DESKTOP_ACKNOWLEDGEMENT)).toBe(true);
    expect(isDesktopAcknowledgement({ accepted: false })).toBe(false);
    expect(isDesktopAcknowledgement(null)).toBe(false);
  });

  it('allows only bounded HTTP(S) external URLs', () => {
    expect(isExternalUrlRequest({ url: 'https://example.com/path?item=1' })).toBe(true);
    expect(isExternalUrlRequest({ url: 'http://localhost:3000/demo' })).toBe(true);
    expect(isExternalUrlRequest({ url: 'file:///private/project' })).toBe(false);
    expect(isExternalUrlRequest({ url: 'https://user:secret@example.com' })).toBe(true);
    expect(isExternalUrlRequest({ url: 'https://example.com', extra: true })).toBe(false);
  });

  it('rejects unsupported runtime platforms and malformed values', () => {
    expect(
      isRuntimeInfo({ appVersion: '0.1.0', arch: 'arm64', isPackaged: true, platform: 'darwin' }),
    ).toBe(true);
    expect(
      isRuntimeInfo({ appVersion: '0.1.0', arch: 'x64', isPackaged: true, platform: 'linux' }),
    ).toBe(false);
    expect(isRuntimeInfo({ appVersion: 1 })).toBe(false);
  });

  it('validates exact path-free project results and immutable snapshot identities', () => {
    const document = createAssetFreeProjectDocument();
    const snapshot = { assetsById: {}, document, stateId: 4, tokenId: 2 };
    expect(isProjectHistorySnapshotRequest(snapshot)).toBe(true);
    expect(isProjectHistorySnapshotRequest({ ...snapshot, filePath: '/private/project' })).toBe(
      false,
    );
    expect(isProjectHistorySnapshotRequest({ ...snapshot, tokenId: 0 })).toBe(false);

    expect(
      isProjectOpenedResult({
        status: 'completed',
        value: { assetsById: {}, displayName: 'Project', document, source: 'new' },
        warnings: [],
      }),
    ).toBe(true);
    expect(
      isProjectOpenedResult({
        status: 'failed',
        problem: {
          code: 'open-failed',
          title: 'Could not open',
          message: 'Retry.',
          path: '/private/project',
        },
      }),
    ).toBe(false);
    expect(
      isProjectRecoveryScheduledResult({
        status: 'completed',
        value: { scheduled: true, stateId: 4 },
        warnings: [],
      }),
    ).toBe(true);
  });

  it('requires an exact close handshake and rejects contradictory dirty state', () => {
    const document = createAssetFreeProjectDocument();
    const requestId = 'close-123';
    const saveSnapshot = { assetsById: {}, document, stateId: 1, tokenId: 1 };
    expect(
      isProjectCloseResponse({
        dirty: true,
        projectDisplayName: 'Project',
        requestId,
        saveSnapshot,
        status: 'prepared',
      }),
    ).toBe(true);
    expect(
      isProjectCloseResponse({
        dirty: true,
        projectDisplayName: 'Project',
        requestId,
        status: 'prepared',
      }),
    ).toBe(false);
    expect(isProjectCloseResponse({ requestId, status: 'rejected' })).toBe(true);
    expect(isProjectCloseOutcome({ requestId, result: { status: 'cancelled' } })).toBe(true);
  });

  it('keeps recovery, recent, and replacement choices exact and path-free', () => {
    const document = createAssetFreeProjectDocument();
    const recoveryId = '87ac2625-0f03-44f7-a194-935b87d7a7d1';
    const recentProjectId = 'a'.repeat(64);
    const cleanCurrent = { dirty: false, projectDisplayName: 'Current project' } as const;
    const dirtyCurrent = {
      dirty: true,
      projectDisplayName: 'Current project',
      saveSnapshot: { assetsById: {}, document, stateId: 2, tokenId: 1 },
    } as const;

    expect(isProjectRecoveryChoiceRequest({ recoveryId })).toBe(true);
    expect(isProjectRecoveryChoiceRequest({ recoveryId, path: '/private/recovery' })).toBe(false);
    expect(isProjectReplacementRequest(cleanCurrent)).toBe(true);
    expect(isProjectReplacementRequest(dirtyCurrent)).toBe(true);
    expect(
      isProjectReplacementRequest({ ...cleanCurrent, saveSnapshot: dirtyCurrent.saveSnapshot }),
    ).toBe(false);
    expect(isProjectOpenRecentRequest({ currentProject: dirtyCurrent, recentProjectId })).toBe(
      true,
    );
    expect(
      isProjectOpenRecentRequest({ currentProject: dirtyCurrent, recentProjectId: 'project_1' }),
    ).toBe(false);

    expect(
      isProjectStartupOptionsResult({
        status: 'completed',
        value: {
          ignoredRecoveryEvidenceCount: 1,
          recentProjects: [{ displayName: 'Recent', id: recentProjectId, lastOpenedAtEpochMs: 10 }],
          recoveries: [{ capturedAtEpochMs: 20, displayName: 'Recovered', id: recoveryId }],
        },
        warnings: [],
      }),
    ).toBe(true);
    expect(
      isProjectStartupOptionsResult({
        status: 'completed',
        value: {
          ignoredRecoveryEvidenceCount: 0,
          recentProjects: [],
          recoveries: [
            { capturedAtEpochMs: 20, displayName: 'Recovered', id: recoveryId, path: '/private' },
          ],
        },
        warnings: [],
      }),
    ).toBe(false);
    expect(
      isProjectRecoveryDiscardedResult({
        status: 'completed',
        value: { discarded: true, recoveryId },
        warnings: [],
      }),
    ).toBe(true);
    expect(
      isRecentProjectsResult({
        status: 'completed',
        value: [{ displayName: 'Recent', id: recentProjectId, lastOpenedAtEpochMs: 10 }],
        warnings: [],
      }),
    ).toBe(true);
  });
});
