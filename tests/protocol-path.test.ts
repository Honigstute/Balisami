// @vitest-environment node

import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveProtocolAssetPath } from '../src/main/protocol-path';

describe('application protocol path resolution', () => {
  const rendererRoot = path.resolve('/application/renderer');

  it('maps application URLs into the renderer root', () => {
    expect(resolveProtocolAssetPath(rendererRoot, 'balsamic://app/')).toBe(
      path.join(rendererRoot, 'index.html'),
    );
    expect(resolveProtocolAssetPath(rendererRoot, 'balsamic://app/assets/main.js')).toBe(
      path.join(rendererRoot, 'assets', 'main.js'),
    );
  });

  it('rejects other protocols and hosts', () => {
    expect(resolveProtocolAssetPath(rendererRoot, 'https://app/index.html')).toBeNull();
    expect(resolveProtocolAssetPath(rendererRoot, 'balsamic://other/index.html')).toBeNull();
  });

  it('rejects encoded path traversal', () => {
    expect(resolveProtocolAssetPath(rendererRoot, 'balsamic://app/%2e%2e/secret.txt')).toBeNull();
    expect(resolveProtocolAssetPath(rendererRoot, 'balsamic://app/%00secret.txt')).toBeNull();
  });
});
