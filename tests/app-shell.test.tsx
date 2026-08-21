import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/renderer/app/App';
import type { DesktopApi } from '../src/shared/desktop-api';
import { SHELL_REGION_ATTRIBUTE, SHELL_REGIONS } from '../src/shared/shell-layout';
import { createAssetFreeProjectDocument } from './fixtures/project-file';

const installDesktopApi = (desktopApi: DesktopApi): void => {
  Object.defineProperty(window, 'balsamicDesktop', {
    configurable: true,
    value: desktopApi,
  });
};

const createDesktopApi = (overrides: Partial<DesktopApi> = {}): DesktopApi => {
  const document = createAssetFreeProjectDocument();
  return {
    discardProjectRecovery: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    getRuntimeInfo: vi.fn().mockResolvedValue({
      appVersion: '0.1.0',
      arch: 'arm64',
      isPackaged: false,
      platform: 'darwin',
    }),
    getProjectStartupOptions: vi.fn().mockResolvedValue({
      status: 'completed',
      value: { ignoredRecoveryEvidenceCount: 0, recentProjects: [], recoveries: [] },
      warnings: [],
    }),
    listRecentProjects: vi.fn().mockResolvedValue({
      status: 'completed',
      value: [],
      warnings: [],
    }),
    onProjectCloseOutcome: () => () => undefined,
    onProjectCloseRequest: () => () => undefined,
    onProjectCommand: () => () => undefined,
    openProject: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    openRecentProject: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    reportRendererReady: vi.fn().mockResolvedValue(undefined),
    respondToProjectClose: () => undefined,
    restoreProjectRecovery: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    saveProject: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    saveProjectAs: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    scheduleProjectRecovery: vi.fn().mockResolvedValue({
      status: 'completed',
      value: { scheduled: true, stateId: 0 },
      warnings: [],
    }),
    startProject: vi.fn().mockResolvedValue({
      status: 'completed',
      value: {
        assetsById: {},
        displayName: document.name,
        document,
        source: 'new',
      },
      warnings: [],
    }),
    ...overrides,
  };
};

describe('application shell', () => {
  let reportRendererReady: DesktopApi['reportRendererReady'];

  beforeEach(() => {
    window.localStorage.clear();
    reportRendererReady = vi.fn<DesktopApi['reportRendererReady']>().mockResolvedValue(undefined);
    installDesktopApi(createDesktopApi({ reportRendererReady }));
  });

  it('shows the project home before mounting the editor and starts new explicitly', async () => {
    const fixtureDocument = createAssetFreeProjectDocument();
    const startProject = vi.fn<DesktopApi['startProject']>().mockResolvedValue({
      status: 'completed',
      value: {
        assetsById: {},
        displayName: fixtureDocument.name,
        document: fixtureDocument,
        source: 'new',
      },
      warnings: [],
    });
    installDesktopApi(createDesktopApi({ reportRendererReady, startProject }));
    render(<App />);

    expect(await screen.findByText('No recent projects yet')).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Balsamic home' })).toBeInTheDocument();
    expect(screen.queryByRole('main', { name: 'Canvas viewport' })).not.toBeInTheDocument();
    expect(screen.queryByText('Built for quick thinking')).not.toBeInTheDocument();
    expect(startProject).not.toHaveBeenCalled();

    const newProject = screen.getByRole('button', { name: 'New project' });
    await waitFor(() => expect(newProject).toBeEnabled());
    fireEvent.click(newProject);

    expect(await screen.findByRole('main', { name: 'Canvas viewport' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Control categories' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Wireframes' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(startProject).toHaveBeenCalledOnce();
    for (const region of Object.values(SHELL_REGIONS)) {
      expect(document.querySelectorAll(`[${SHELL_REGION_ATTRIBUTE}="${region}"]`)).toHaveLength(1);
    }

    await waitFor(() => {
      expect(screen.getByText('macOS · arm64 · v0.1.0 · Development')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Unsaved changes · Recovery active')).toBeInTheDocument();
    });
    expect(screen.getByText('Foundation fixture')).toBeInTheDocument();
    expect(screen.getByText('⌘ K')).toBeInTheDocument();
    await waitFor(() => {
      expect(reportRendererReady).toHaveBeenCalledOnce();
    });
  });

  it('uses the Windows shortcut label after a project is opened', async () => {
    installDesktopApi(
      createDesktopApi({
        getRuntimeInfo: vi.fn().mockResolvedValue({
          appVersion: '0.1.0',
          arch: 'x64',
          isPackaged: true,
          platform: 'win32',
        }),
        reportRendererReady: vi.fn().mockResolvedValue(undefined),
      }),
    );

    render(<App />);

    await screen.findByText('No recent projects yet');
    const newProject = screen.getByRole('button', { name: 'New project' });
    expect(newProject).toBeEnabled();
    fireEvent.click(newProject);

    expect(await screen.findByText('Windows · x64 · v0.1.0 · Packaged')).toBeInTheDocument();
    expect(screen.getByText('Ctrl K')).toBeInTheDocument();
    expect(screen.queryByText('⌘ K')).not.toBeInTheDocument();
  });

  it('quick-adds one registry control as one undoable history entry', async () => {
    render(<App />);
    await screen.findByText('No recent projects yet');
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    await screen.findByRole('main', { name: 'Canvas viewport' });

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const search = screen.getByRole('combobox', { name: 'Find a control' });
    fireEvent.change(search, { target: { value: 'cta' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    const undo = await screen.findByRole('button', { name: 'Undo Insert Button' });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo Insert Button' })).toBeEnabled();
  });

  it('keeps the project home behind one explicit startup recovery decision', async () => {
    const startProject = vi.fn<DesktopApi['startProject']>().mockResolvedValue({
      status: 'cancelled',
    });
    installDesktopApi(
      createDesktopApi({
        getProjectStartupOptions: vi.fn().mockResolvedValue({
          status: 'completed',
          value: {
            ignoredRecoveryEvidenceCount: 1,
            recentProjects: [],
            recoveries: [
              {
                capturedAtEpochMs: 1_787_000_000_000,
                displayName: 'Recovered Project.test',
                id: 'b443818e-2a04-4349-8bdc-9280a0d469f2',
              },
            ],
          },
          warnings: [],
        }),
        startProject,
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole('alertdialog', { name: 'Unsaved work is available' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Balsamic home' })).toBeInTheDocument();
    expect(screen.queryByRole('main', { name: 'Canvas viewport' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Start New and Keep Recovery' })).toBeEnabled();
    expect(screen.getByText(/damaged recovery item/u)).toBeInTheDocument();
    expect(startProject).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Restore' })).toHaveFocus();
    });
  });

  it('keeps the project home behind one bounded startup error overlay', async () => {
    installDesktopApi(
      createDesktopApi({
        getProjectStartupOptions: vi.fn().mockResolvedValue({
          status: 'failed',
          problem: {
            code: 'recovery-failed',
            title: 'Recovery could not be checked',
            message: 'Existing recovery files were not changed.',
          },
        }),
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole('alertdialog', { name: 'Recovery could not be checked' }),
    ).toHaveAccessibleDescription('Existing recovery files were not changed.');
    expect(screen.getByRole('main', { name: 'Balsamic home' })).toBeInTheDocument();
    expect(screen.queryByRole('main', { name: 'Canvas viewport' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Start New' })).toHaveFocus();
  });

  it('opens the latest recent project directly from the home screen', async () => {
    const document = createAssetFreeProjectDocument();
    const recentProjectId = 'a'.repeat(64);
    const openRecentProject = vi.fn<DesktopApi['openRecentProject']>().mockResolvedValue({
      status: 'completed',
      value: {
        assetsById: {},
        displayName: 'Launch plan',
        document,
        source: 'project-file',
      },
      warnings: [],
    });
    installDesktopApi(
      createDesktopApi({
        getProjectStartupOptions: vi.fn().mockResolvedValue({
          status: 'completed',
          value: {
            ignoredRecoveryEvidenceCount: 0,
            recentProjects: [
              {
                displayName: 'Launch plan',
                id: recentProjectId,
                lastOpenedAtEpochMs: 1_787_000_000_000,
              },
            ],
            recoveries: [],
          },
          warnings: [],
        }),
        openRecentProject,
      }),
    );
    render(<App />);

    const recentProject = await screen.findByRole('button', { name: 'Open Launch plan' });
    expect(screen.getByText('Last project')).toBeInTheDocument();
    fireEvent.click(recentProject);

    expect(await screen.findByRole('main', { name: 'Canvas viewport' })).toBeInTheDocument();
    expect(openRecentProject).toHaveBeenCalledWith({
      currentProject: { dirty: false, projectDisplayName: 'No project open' },
      recentProjectId,
    });
    expect(screen.getByText('Launch plan')).toBeInTheDocument();
  });

  it('keeps a failed desktop bridge inside the project home', async () => {
    reportRendererReady = vi.fn<DesktopApi['reportRendererReady']>().mockResolvedValue(undefined);
    installDesktopApi(
      createDesktopApi({
        getRuntimeInfo: vi.fn().mockRejectedValue(new Error('Bridge unavailable')),
        reportRendererReady,
      }),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Desktop bridge unavailable')).toBeInTheDocument();
    });
    expect(screen.getByRole('main', { name: 'Balsamic home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New project' })).toBeDisabled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(reportRendererReady).not.toHaveBeenCalled();
  });

  it('keeps renderer-readiness failure inside the project home', async () => {
    installDesktopApi(
      createDesktopApi({
        getRuntimeInfo: vi.fn().mockResolvedValue({
          appVersion: '0.1.0',
          arch: 'arm64',
          isPackaged: true,
          platform: 'darwin',
        }),
        reportRendererReady: vi.fn().mockRejectedValue(new Error('Readiness rejected')),
      }),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Desktop bridge unavailable')).toBeInTheDocument();
    });
    expect(screen.getByRole('main', { name: 'Balsamic home' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
