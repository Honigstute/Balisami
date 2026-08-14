// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  DESKTOP_ACKNOWLEDGEMENT,
  isDesktopAcknowledgement,
  isRuntimeInfo,
} from '../src/shared/desktop-api';

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
});
