// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  DESKTOP_ACKNOWLEDGEMENT,
  isDesktopAcknowledgement,
  isProjectCloseOutcome,
  isProjectCloseResponse,
  isProjectHistorySnapshotRequest,
  isProjectOpenedResult,
  isProjectRecoveryScheduledResult,
  isRuntimeInfo,
} from '../src/shared/desktop-api';
import { createAssetFreeProjectDocument } from './fixtures/project-file';

describe('desktop API boundary validation', () => {
  it('accepts only the exact acknowledgement shape', () => {
    expect(isDesktopAcknowledgement(DESKTOP_ACKNOWLEDGEMENT)).toBe(true);
    expect(isDesktopAcknowledgement({ accepted: false })).toBe(false);
    expect(isDesktopAcknowledgement(null)).toBe(false);
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
});
