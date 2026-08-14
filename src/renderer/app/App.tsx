import { useEffect, useState } from 'react';

import projectWorkflowProbeContract from '../../../project-workflow-probe-contract.json';
import { AppShell } from '../shell/AppShell';
import { useProjectSession } from '../projects/use-project-session';
import { waitForRendererPresentation } from './renderer-readiness';
import { useRuntimeInfo } from './use-runtime-info';

const getPlatformLabel = (platform: 'darwin' | 'win32'): string =>
  platform === 'darwin' ? 'macOS' : 'Windows';

interface ProjectWorkspaceProps {
  readonly quickAddShortcut: string;
  readonly runtimeLabel: string;
}

const ProjectWorkspace = ({ quickAddShortcut, runtimeLabel }: ProjectWorkspaceProps) => {
  const packagedProbeEnabled =
    new URLSearchParams(window.location.search).get(projectWorkflowProbeContract.queryKey) ===
    projectWorkflowProbeContract.queryValue;
  const project = useProjectSession(window.balsamicDesktop, {
    ...(packagedProbeEnabled ? { packagedProbeNote: projectWorkflowProbeContract.note } : {}),
  });
  return (
    <AppShell
      projectName={project.displayName}
      quickAddShortcut={quickAddShortcut}
      statusLabel={project.statusLabel}
      statusScope={runtimeLabel}
      statusTone={project.statusTone}
    />
  );
};

export const App = () => {
  const runtime = useRuntimeInfo();
  const [readinessFailed, setReadinessFailed] = useState(false);

  useEffect(() => {
    if (runtime.status !== 'ready') {
      return;
    }

    let active = true;
    const reportPresentedRenderer = async (): Promise<void> => {
      try {
        await waitForRendererPresentation();
        if (active) {
          await window.balsamicDesktop.reportRendererReady();
        }
      } catch {
        if (active) {
          setReadinessFailed(true);
        }
      }
    };

    void reportPresentedRenderer();

    return () => {
      active = false;
    };
  }, [runtime]);

  if (runtime.status === 'loading') {
    return (
      <AppShell
        quickAddShortcut="Ctrl/Cmd K"
        statusLabel="Connecting to desktop…"
        statusTone="quiet"
      />
    );
  }

  if (runtime.status === 'unavailable' || readinessFailed) {
    return (
      <AppShell
        quickAddShortcut="Ctrl/Cmd K"
        statusLabel="Desktop bridge unavailable"
        statusTone="problem"
      />
    );
  }

  const { appVersion, arch, isPackaged, platform } = runtime.value;
  const mode = isPackaged ? 'Packaged' : 'Development';

  return (
    <ProjectWorkspace
      quickAddShortcut={platform === 'darwin' ? '⌘ K' : 'Ctrl K'}
      runtimeLabel={`${getPlatformLabel(platform)} · ${arch} · v${appVersion} · ${mode}`}
    />
  );
};
