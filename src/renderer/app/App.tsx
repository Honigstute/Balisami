import { useEffect, useMemo, useState } from 'react';

import projectWorkflowProbeContract from '../../../project-workflow-probe-contract.json';
import recoveryProbeContract from '../../../recovery-probe-contract.json';
import { getRequestedVisualFixture } from '../../shared/visual-fixture';
import { VisualConformanceFixture } from '../design/VisualConformanceFixture';
import { AppShell } from '../shell/AppShell';
import { ProjectDecisionDialog } from '../projects/ProjectDecisionDialog';
import { useProjectSession } from '../projects/use-project-session';
import { DocumentScene } from '../editor/DocumentScene';
import { countRenderableBoardElements } from '../editor/document-scene-model';
import { ViewportEmptyState, ViewportScene } from '../editor/ViewportScene';
import { useViewportCameraStore } from '../editor/use-viewport-camera-store';
import { waitForRendererPresentation } from './renderer-readiness';
import { useRuntimeInfo } from './use-runtime-info';

const getPlatformLabel = (platform: 'darwin' | 'win32'): string =>
  platform === 'darwin' ? 'macOS' : 'Windows';

interface ProjectWorkspaceProps {
  readonly quickAddShortcut: string;
  readonly runtimeLabel: string;
}

const ProjectWorkspace = ({ quickAddShortcut, runtimeLabel }: ProjectWorkspaceProps) => {
  const camera = useViewportCameraStore();
  const query = new URLSearchParams(window.location.search);
  const packagedProbeEnabled =
    query.get(projectWorkflowProbeContract.queryKey) === projectWorkflowProbeContract.queryValue;
  const packagedRecoveryRestore =
    query.get(recoveryProbeContract.rendererQueryKey) === recoveryProbeContract.rendererQueryValue;
  const project = useProjectSession(window.balsamicDesktop, {
    ...(packagedProbeEnabled ? { packagedProbeNote: projectWorkflowProbeContract.note } : {}),
    ...(packagedRecoveryRestore ? { packagedRecoveryRestore: true } : {}),
  });
  const { session, view } = project;
  const firstBoardId = view.history?.document.boardIds[0];
  const document = view.history?.document;
  const hasRenderableElements = useMemo(
    () => document !== undefined && countRenderableBoardElements(document, firstBoardId) > 0,
    [document, firstBoardId],
  );
  const firstBoardNote =
    firstBoardId === undefined
      ? undefined
      : view.history?.document.boardsById[firstBoardId]?.note.text;
  return (
    <AppShell
      projectName={view.displayName}
      projectOverlay={
        view.dialog === undefined ? undefined : (
          <ProjectDecisionDialog
            busy={view.isTransitioning}
            dialog={view.dialog}
            onDismiss={() => session.dismissDialog()}
            onDiscardRecovery={(recoveryId) => void session.discardRecovery(recoveryId)}
            onOpenFile={() => void session.openProject()}
            onOpenRecent={(recentProjectId) => void session.openRecentProject(recentProjectId)}
            onRestoreRecovery={(recoveryId) => void session.restoreRecovery(recoveryId)}
            onStartNew={() => void session.startNewProject()}
          />
        )
      }
      {...(packagedRecoveryRestore
        ? {
            projectProbeState: {
              attributeName: recoveryProbeContract.rendererStateAttribute,
              value: JSON.stringify({
                isDirty: view.isDirty,
                isReady: view.isReady,
                note: firstBoardNote,
                source: view.source,
              }),
            },
          }
        : {})}
      quickAddShortcut={quickAddShortcut}
      regionContent={{
        canvas: (
          <ViewportScene
            camera={camera}
            {...(!hasRenderableElements ? { domChildren: <ViewportEmptyState /> } : {})}
            {...(document !== undefined
              ? {
                  worldChildren: (
                    <DocumentScene
                      activeBoardId={firstBoardId}
                      camera={camera}
                      document={document}
                    />
                  ),
                }
              : {})}
          />
        ),
      }}
      statusLabel={view.statusLabel}
      statusScope={runtimeLabel}
      statusTone={view.statusTone}
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
  const quickAddShortcut = platform === 'darwin' ? '⌘ K' : 'Ctrl K';
  const runtimeLabel = `${getPlatformLabel(platform)} · ${arch} · v${appVersion} · ${mode}`;
  const visualFixture = getRequestedVisualFixture(window.location.search);

  if (visualFixture !== undefined) {
    return (
      <VisualConformanceFixture
        fixture={visualFixture}
        quickAddShortcut={quickAddShortcut}
        runtimeLabel={runtimeLabel}
      />
    );
  }

  return <ProjectWorkspace quickAddShortcut={quickAddShortcut} runtimeLabel={runtimeLabel} />;
};
