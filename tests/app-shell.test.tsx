import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/renderer/app/App';
import type { DesktopApi } from '../src/shared/desktop-api';

const installDesktopApi = (desktopApi: DesktopApi): void => {
  Object.defineProperty(window, 'balsamicDesktop', {
    configurable: true,
    value: desktopApi,
  });
};

describe('application shell', () => {
  let reportRendererReady: DesktopApi['reportRendererReady'];

  beforeEach(() => {
    reportRendererReady = vi.fn<DesktopApi['reportRendererReady']>().mockResolvedValue(undefined);
    installDesktopApi({
      getRuntimeInfo: vi.fn().mockResolvedValue({
        appVersion: '0.1.0',
        arch: 'arm64',
        isPackaged: false,
        platform: 'darwin',
      }),
      reportRendererReady,
    });
  });

  it('renders every stable shell region', async () => {
    render(<App />);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Control categories' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Wireframes' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Canvas viewport' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Control library is loading' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('macOS · arm64 · v0.1.0 · Development')).toBeInTheDocument();
    });
    expect(screen.getByText('⌘ K')).toBeInTheDocument();
    await waitFor(() => {
      expect(reportRendererReady).toHaveBeenCalledOnce();
    });
  });

  it('uses the Windows shortcut label when the desktop reports Windows', async () => {
    installDesktopApi({
      getRuntimeInfo: vi.fn().mockResolvedValue({
        appVersion: '0.1.0',
        arch: 'x64',
        isPackaged: true,
        platform: 'win32',
      }),
      reportRendererReady: vi.fn().mockResolvedValue(undefined),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Windows · x64 · v0.1.0 · Packaged')).toBeInTheDocument();
    });
    expect(screen.getByText('Ctrl K')).toBeInTheDocument();
    expect(screen.queryByText('⌘ K')).not.toBeInTheDocument();
  });

  it('contains no enabled placeholder actions', () => {
    render(<App />);

    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });

  it('uses the reserved status strip when the bridge fails', async () => {
    reportRendererReady = vi.fn<DesktopApi['reportRendererReady']>().mockResolvedValue(undefined);
    installDesktopApi({
      getRuntimeInfo: vi.fn().mockRejectedValue(new Error('Bridge unavailable')),
      reportRendererReady,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Desktop bridge unavailable')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(reportRendererReady).not.toHaveBeenCalled();
  });

  it('keeps renderer-readiness failure inside the reserved status strip', async () => {
    installDesktopApi({
      getRuntimeInfo: vi.fn().mockResolvedValue({
        appVersion: '0.1.0',
        arch: 'arm64',
        isPackaged: true,
        platform: 'darwin',
      }),
      reportRendererReady: vi.fn().mockRejectedValue(new Error('Readiness rejected')),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Desktop bridge unavailable')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
