import { useEffect, useMemo, useState } from 'react';

import projectWorkflowProbeContract from '../../../project-workflow-probe-contract.json';
import recoveryProbeContract from '../../../recovery-probe-contract.json';
import { ElementIdSchema } from '../../domain';
import { getRequestedVisualFixture } from '../../shared/visual-fixture';
import { isViewportPerformanceProbeRequested } from '../../shared/viewport-performance';
import { VisualConformanceFixture } from '../design/VisualConformanceFixture';
import { ViewportPerformanceFixture } from '../editor/ViewportPerformanceFixture';
import { AppShell } from '../shell/AppShell';
import { ProjectDecisionDialog } from '../projects/ProjectDecisionDialog';
import { useProjectSession } from '../projects/use-project-session';
import { DocumentScene } from '../editor/DocumentScene';
import {
  countRenderableBoardElements,
  DocumentSceneModel,
  getRenderableBoardWorldBounds,
} from '../editor/document-scene-model';
import { KeyboardNudgeInteraction } from '../editor/keyboard-nudge-interaction';
import { captureMoveTargets } from '../editor/move-geometry';
import { MoveInteraction } from '../editor/move-interaction';
import { captureResizeTarget, hitTestResizeHandle } from '../editor/resize-geometry';
import { ResizeInteraction } from '../editor/resize-interaction';
import { getResizeSnapProfile, resolveResizeSnap } from '../editor/resize-snapping';
import { createSceneSnapCandidates } from '../editor/scene-snap-candidates';
import {
  SelectionClipboardStore,
  copySelectedElements,
  cutSelectedElements,
  pasteClipboardElements,
  type SelectionPasteSource,
} from '../editor/selection-clipboard';
import { deleteSelectedElements, type SelectionDeleteSource } from '../editor/selection-delete';
import {
  duplicateSelectedElements,
  type SelectionDuplicateSource,
} from '../editor/selection-duplicate';
import {
  groupSelectedElements,
  ungroupSelectedElement,
  type SelectionGroupingSource,
} from '../editor/selection-grouping';
import {
  SELECTION_LAYER_ACTIONS,
  layerSelectedElements,
  type SelectionLayerAction,
  type SelectionLayeringSource,
} from '../editor/selection-layering';
import {
  lockSelectedElements,
  unlockAllBoardElements,
  type SelectionLockingSource,
} from '../editor/selection-locking';
import { SelectionInteraction } from '../editor/selection-interaction';
import { MarqueeOverlay } from '../editor/MarqueeOverlay';
import { SelectionOverlay } from '../editor/SelectionOverlay';
import { SelectionStore } from '../editor/selection-store';
import { resolveSnap } from '../editor/snap-engine';
import { SnapGuideOverlay } from '../editor/SnapGuideOverlay';
import { ViewportEmptyState, ViewportScene } from '../editor/ViewportScene';
import { useViewportCameraStore } from '../editor/use-viewport-camera-store';
import { ViewportZoomControls } from '../editor/ViewportZoomControls';
import { createBrowserAnimationFrameScheduler } from '../editor/viewport-camera-store';
import { createWorldVector, worldRectToViewport } from '../editor/viewport-transform';
import { waitForRendererPresentation } from './renderer-readiness';
import { useRuntimeInfo } from './use-runtime-info';

const getPlatformLabel = (platform: 'darwin' | 'win32'): string =>
  platform === 'darwin' ? 'macOS' : 'Windows';

const allocateEditorElementId = () => {
  const result = ElementIdSchema.safeParse(
    `element_${globalThis.crypto.randomUUID().replaceAll('-', '').toLowerCase()}`,
  );
  return result.success ? result.data : undefined;
};

interface ProjectWorkspaceProps {
  readonly platform: 'darwin' | 'win32';
  readonly quickAddShortcut: string;
  readonly runtimeLabel: string;
}

const ProjectWorkspace = ({ platform, quickAddShortcut, runtimeLabel }: ProjectWorkspaceProps) => {
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
  const [editor] = useState(() => {
    const clipboard = new SelectionClipboardStore();
    const model = new DocumentSceneModel();
    const selection = new SelectionStore();
    const captureTranslationTargets = (targetIds: Parameters<typeof captureMoveTargets>[1]) => {
      const currentDocument = session.getSnapshot().history?.document;
      return currentDocument === undefined
        ? undefined
        : captureMoveTargets(currentDocument, targetIds);
    };
    const moveInteraction = new MoveInteraction(
      {
        capture: captureTranslationTargets,
        commit: (commands) => {
          const result = session.dispatchTransaction(commands, {
            label: commands.length === 1 ? 'Move element' : 'Move elements',
          });
          return result?.ok === true && result.changed;
        },
        resolveSnap: ({ activeAxes, capture, previousLocks, rawDelta, snapBypassed }) => {
          const zoom = camera.getTransformSnapshot().zoom;
          return resolveSnap({
            activeAxes,
            bypass: snapBypassed,
            candidates: createSceneSnapCandidates(model, {
              activeAxes,
              excludedIds: capture.affectedIds,
              movingBounds: capture.worldBounds,
              rawDelta,
              zoom,
            }),
            movingBounds: capture.worldBounds,
            previousLocks,
            rawDelta,
            zoom,
          });
        },
      },
      createBrowserAnimationFrameScheduler(),
    );
    const keyboardNudgeInteraction = new KeyboardNudgeInteraction(
      {
        capture: captureTranslationTargets,
        commit: (commands) => {
          const result = session.dispatchTransaction(commands, {
            label: commands.length === 1 ? 'Nudge element' : 'Nudge elements',
          });
          return result?.ok === true && result.changed;
        },
      },
      createBrowserAnimationFrameScheduler(),
    );
    const resizeInteraction = new ResizeInteraction(
      {
        capture: (elementId) => {
          const currentDocument = session.getSnapshot().history?.document;
          return currentDocument === undefined
            ? undefined
            : captureResizeTarget(currentDocument, elementId);
        },
        commit: (command) => {
          const result = session.dispatchTransaction([command], { label: 'Resize element' });
          return result?.ok === true && result.changed;
        },
        resolveSnap: (request) => {
          const zoom = camera.getTransformSnapshot().zoom;
          const profile = getResizeSnapProfile(request.handle);
          return resolveResizeSnap({
            aspectLocked: request.aspectLocked,
            bypass: request.snapBypassed,
            candidates: createSceneSnapCandidates(model, {
              activeAxes: profile.activeAxes,
              excludedIds: [request.capture.elementId],
              movingAnchors: profile.movingAnchors,
              movingBounds: request.raw.worldBounds,
              rawDelta: createWorldVector(0, 0),
              zoom,
            }),
            capture: request.capture,
            currentWorldPoint: request.currentWorldPoint,
            handle: request.handle,
            previousLocks: request.previousLocks,
            raw: request.raw,
            startWorldPoint: request.startWorldPoint,
            zoom,
          });
        },
      },
      createBrowserAnimationFrameScheduler(),
    );
    const selectionInteraction = new SelectionInteraction(
      selection,
      {
        listSelectableIds: () => model.listSelectableItemIds(),
        queryHitStack: (point) => model.queryHitStack(point).map((item) => item.id),
        queryResizeHandle: (elementId, point) => {
          const item = model.getItem(elementId);
          return item === undefined || item.kind !== 'object' || item.locked
            ? undefined
            : hitTestResizeHandle(
                point,
                worldRectToViewport(item.bounds, camera.getTransformSnapshot()),
              );
        },
        querySelectionRegion: (bounds, mode) => model.querySelectionRegion(bounds, mode),
      },
      moveInteraction,
      resizeInteraction,
    );
    const deleteSelectionSource: SelectionDeleteSource = {
      commit(commands) {
        const result = session.dispatchTransaction(commands, {
          label: commands.length === 1 ? 'Delete element' : 'Delete elements',
        });
        return result?.ok === true && result.changed ? result.history.document : undefined;
      },
    };
    const deleteSelection = (): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      if (currentDocument === undefined) {
        return false;
      }
      return deleteSelectedElements(
        currentDocument,
        selection,
        model.listItemIds(),
        deleteSelectionSource,
      );
    };
    const duplicateSelectionSource: SelectionDuplicateSource = {
      commit(commands) {
        const result = session.dispatchTransaction(commands, {
          label: commands.length === 1 ? 'Duplicate element' : 'Duplicate elements',
        });
        return result?.ok === true && result.changed ? result.history.document : undefined;
      },
    };
    const duplicateSelection = (): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      if (currentDocument === undefined) {
        return false;
      }
      return duplicateSelectedElements(
        currentDocument,
        selection,
        model.listItemIds(),
        allocateEditorElementId,
        duplicateSelectionSource,
      );
    };
    const copySelection = (): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      return currentDocument === undefined
        ? false
        : copySelectedElements(currentDocument, selection, model.listItemIds(), clipboard);
    };
    const cutSelectionSource: SelectionDeleteSource = {
      commit(commands) {
        const result = session.dispatchTransaction(commands, {
          label: commands.length === 1 ? 'Cut element' : 'Cut elements',
        });
        return result?.ok === true && result.changed ? result.history.document : undefined;
      },
    };
    const cutSelection = (): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      return currentDocument === undefined
        ? false
        : cutSelectedElements(
            currentDocument,
            selection,
            model.listItemIds(),
            clipboard,
            cutSelectionSource,
          );
    };
    const pasteSelectionSource: SelectionPasteSource = {
      commit(commands) {
        const result = session.dispatchTransaction(commands, {
          label: commands.length === 1 ? 'Paste element' : 'Paste elements',
        });
        return result?.ok === true && result.changed ? result.history.document : undefined;
      },
    };
    const pasteSelection = (): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      return currentDocument === undefined
        ? false
        : pasteClipboardElements(
            currentDocument,
            selection,
            clipboard,
            allocateEditorElementId,
            pasteSelectionSource,
          );
    };
    const groupingSource: SelectionGroupingSource = {
      commit(commands, label) {
        const result = session.dispatchTransaction(commands, { label });
        return result?.ok === true && result.changed ? result.history.document : undefined;
      },
    };
    const groupSelection = (): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      return currentDocument === undefined
        ? false
        : groupSelectedElements(
            currentDocument,
            selection,
            allocateEditorElementId,
            groupingSource,
          );
    };
    const ungroupSelection = (): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      return currentDocument === undefined
        ? false
        : ungroupSelectedElement(currentDocument, selection, groupingSource);
    };
    const lockingSource: SelectionLockingSource = {
      commit(commands, label) {
        const result = session.dispatchTransaction(commands, { label });
        return result?.ok === true && result.changed ? result.history.document : undefined;
      },
    };
    const lockSelection = (): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      return currentDocument === undefined
        ? false
        : lockSelectedElements(currentDocument, selection, model.listItemIds(), lockingSource);
    };
    const unlockAll = (): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      const activeBoardId = currentDocument?.boardIds[0];
      return currentDocument === undefined || activeBoardId === undefined
        ? false
        : unlockAllBoardElements(currentDocument, activeBoardId, lockingSource);
    };
    const layeringSource: SelectionLayeringSource = {
      commit(commands, label) {
        const result = session.dispatchTransaction(commands, { label });
        return result?.ok === true && result.changed ? result.history.document : undefined;
      },
    };
    const layerSelection = (action: SelectionLayerAction): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      return currentDocument === undefined
        ? false
        : layerSelectedElements(currentDocument, selection, action, layeringSource);
    };
    return Object.freeze({
      bringSelectionForward: () => layerSelection(SELECTION_LAYER_ACTIONS.bringForward),
      bringSelectionToFront: () => layerSelection(SELECTION_LAYER_ACTIONS.bringToFront),
      copySelection,
      cutSelection,
      deleteSelection,
      duplicateSelection,
      groupSelection,
      keyboardNudgeInteraction,
      lockSelection,
      model,
      moveInteraction,
      resizeInteraction,
      sendSelectionBackward: () => layerSelection(SELECTION_LAYER_ACTIONS.sendBackward),
      sendSelectionToBack: () => layerSelection(SELECTION_LAYER_ACTIONS.sendToBack),
      selection,
      selectionInteraction,
      pasteSelection,
      ungroupSelection,
      unlockAll,
    });
  });
  const firstBoardId = view.history?.document.boardIds[0];
  const document = view.history?.document;
  const hasRenderableElements = useMemo(
    () => document !== undefined && countRenderableBoardElements(document, firstBoardId) > 0,
    [document, firstBoardId],
  );
  const boardBounds = useMemo(
    () =>
      document === undefined ? undefined : getRenderableBoardWorldBounds(document, firstBoardId),
    [document, firstBoardId],
  );
  const firstBoardNote =
    firstBoardId === undefined
      ? undefined
      : view.history?.document.boardsById[firstBoardId]?.note.text;
  useEffect(
    () =>
      editor.model.subscribe(() => {
        editor.keyboardNudgeInteraction.cancel();
        editor.selectionInteraction.cancelPress();
        editor.selection.reconcile(new Set(editor.model.listSelectableItemIds()));
      }),
    [editor],
  );
  useEffect(() => {
    if (document === undefined) {
      editor.keyboardNudgeInteraction.cancel();
      editor.selectionInteraction.cancelPress();
      editor.selection.clear();
    }
  }, [document, editor]);
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
            {...(document === undefined
              ? {}
              : {
                  interactionChildren: (
                    <>
                      <SnapGuideOverlay
                        camera={camera}
                        moveInteraction={editor.moveInteraction}
                        resizeInteraction={editor.resizeInteraction}
                      />
                      <SelectionOverlay
                        camera={camera}
                        keyboardNudgeInteraction={editor.keyboardNudgeInteraction}
                        model={editor.model}
                        moveInteraction={editor.moveInteraction}
                        resizeInteraction={editor.resizeInteraction}
                        selection={editor.selection}
                      />
                      <MarqueeOverlay interaction={editor.selectionInteraction} />
                    </>
                  ),
                  keyboardNudgeInteraction: editor.keyboardNudgeInteraction,
                  onBringSelectionForward: editor.bringSelectionForward,
                  onBringSelectionToFront: editor.bringSelectionToFront,
                  onCopySelection: editor.copySelection,
                  onCutSelection: editor.cutSelection,
                  onDeleteSelection: editor.deleteSelection,
                  onDuplicateSelection: editor.duplicateSelection,
                  onGroupSelection: editor.groupSelection,
                  onLockSelection: editor.lockSelection,
                  onPasteSelection: editor.pasteSelection,
                  onSendSelectionBackward: editor.sendSelectionBackward,
                  onSendSelectionToBack: editor.sendSelectionToBack,
                  onUngroupSelection: editor.ungroupSelection,
                  onUnlockAll: editor.unlockAll,
                  selection: editor.selection,
                  selectionInteraction: editor.selectionInteraction,
                  shortcutPlatform: platform,
                })}
            {...(!hasRenderableElements ? { domChildren: <ViewportEmptyState /> } : {})}
            {...(document !== undefined
              ? {
                  worldChildren: (
                    <DocumentScene
                      activeBoardId={firstBoardId}
                      camera={camera}
                      document={document}
                      keyboardNudgeInteraction={editor.keyboardNudgeInteraction}
                      model={editor.model}
                      moveInteraction={editor.moveInteraction}
                      resizeInteraction={editor.resizeInteraction}
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
      viewportControls={
        <ViewportZoomControls
          boardBounds={boardBounds}
          camera={camera}
          platform={platform}
          sceneModel={editor.model}
          selection={editor.selection}
        />
      }
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

  if (isViewportPerformanceProbeRequested(window.location.search)) {
    return (
      <ViewportPerformanceFixture quickAddShortcut={quickAddShortcut} runtimeLabel={runtimeLabel} />
    );
  }

  if (visualFixture !== undefined) {
    return (
      <VisualConformanceFixture
        fixture={visualFixture}
        platform={platform}
        quickAddShortcut={quickAddShortcut}
        runtimeLabel={runtimeLabel}
      />
    );
  }

  return (
    <ProjectWorkspace
      platform={platform}
      quickAddShortcut={quickAddShortcut}
      runtimeLabel={runtimeLabel}
    />
  );
};
