// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { isTrustedRendererUrl } from '../src/main/navigation-policy';

describe('renderer navigation policy', () => {
  it('allows only the application protocol in production', () => {
    expect(isTrustedRendererUrl('balsamic://app/index.html')).toBe(true);
    expect(isTrustedRendererUrl('balsamic://other/index.html')).toBe(false);
    expect(isTrustedRendererUrl('https://example.com')).toBe(false);
    expect(isTrustedRendererUrl('file:///tmp/project.html')).toBe(false);
  });

  it('allows only the configured development origin', () => {
    const developmentServer = 'http://localhost:5173';
    expect(isTrustedRendererUrl('http://localhost:5173/index.html', developmentServer)).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:5174/index.html', developmentServer)).toBe(false);
    expect(isTrustedRendererUrl('https://localhost:5173/index.html', developmentServer)).toBe(
      false,
    );
  });

  it('rejects malformed URLs', () => {
    expect(isTrustedRendererUrl('not a URL')).toBe(false);
  });
});
