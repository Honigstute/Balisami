import { useEffect, useMemo, useRef, useState } from 'react';

import projectWorkflowProbeContract from '../../../project-workflow-probe-contract.json';
import recoveryProbeContract from '../../../recovery-probe-contract.json';
import {
  DOCUMENT_COMMAND_TYPES,
  CONTROL_TYPES,
  ElementIdSchema,
  getControlSpec,
  getControlAccessibleName,
  selectRedoLabel,
  selectUndoLabel,
  type ControlTypeId,
  type ElementProperties,
  type WorldRect,
} from '../../domain';
import { getRequestedVisualFixture } from '../../shared/visual-fixture';
import { isViewportPerformanceProbeRequested } from '../../shared/viewport-performance';
import {
  PROJECT_WORKFLOW_ALPHA_BUTTON_TEXT,
  PROJECT_WORKFLOW_ALPHA_LAYOUT,
} from '../../shared/project-workflow-alpha';
import { VisualConformanceFixture } from '../design/VisualConformanceFixture';
import { ControlInspector, ControlInspectorTitle } from '../controls/ControlInspector';
import { calculateControlAutoSizeFrame } from '../controls/control-auto-size';
import { ControlShelf } from '../controls/ControlShelf';
import { getBrowserControlTextMeasurementService } from '../controls/control-text-measurement';
import { createControlInsertionCommand } from '../controls/control-insertion';
import { WireframeNavigator } from '../controls/WireframeNavigator';
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
  arrangeSelectedElements,
  type SelectionArrangementAction,
  type SelectionArrangementSource,
} from '../editor/selection-arrangement';
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
import { TextEditOverlay } from '../editor/TextEditOverlay';
import { createTextEditViewportRoute, TextEditInteraction } from '../editor/text-edit-interaction';
import { ViewportEmptyState, ViewportScene } from '../editor/ViewportScene';
import { useViewportCameraStore } from '../editor/use-viewport-camera-store';
import { ViewportZoomControls } from '../editor/ViewportZoomControls';
import { createBrowserAnimationFrameScheduler } from '../editor/viewport-camera-store';
import {
  createViewportPoint,
  createWorldVector,
  viewportPointToWorld,
  worldRectToViewport,
  type WorldPoint,
} from '../editor/viewport-transform';
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
    ...(packagedRecoveryRestore ? { packagedRecoveryRestore: true } : {}),
  });
  const { session, view } = project;
  const packagedProbeStarted = useRef(false);
  const [editor] = useState(() => {
    const clipboard = new SelectionClipboardStore();
    const model = new DocumentSceneModel();
    const selection = new SelectionStore();
    const textEditInteraction = new TextEditInteraction({
      capture: (elementId) => {
        const currentDocument = session.getSnapshot().history?.document;
        const element = currentDocument?.elementsById[elementId];
        const item = model.getItem(elementId);
        const spec = element === undefined ? undefined : getControlSpec(element.controlType);
        const text = spec?.capabilities.text === null ? undefined : spec?.capabilities.text;
        const value = text === undefined ? undefined : element?.properties[text.property];
        if (
          element === undefined ||
          item === undefined ||
          spec === undefined ||
          text === undefined ||
          typeof value !== 'string'
        ) {
          return undefined;
        }
        return Object.freeze({
          accessibleLabel: `Edit ${getControlAccessibleName(spec, element.properties)} text`,
          elementId,
          fontSizeWorldUnits: text.fontSize,
          mode: text.mode,
          text: value,
          worldBounds: item.bounds,
        });
      },
      commit: (target, text) => {
        const currentDocument = session.getSnapshot().history?.document;
        const element = currentDocument?.elementsById[target.elementId];
        const spec = element === undefined ? undefined : getControlSpec(element.controlType);
        if (
          element === undefined ||
          spec?.capabilities.text === null ||
          spec?.capabilities.text === undefined
        ) {
          return false;
        }
        const result = session.dispatch(
          {
            type: DOCUMENT_COMMAND_TYPES.setElementProperties,
            elementId: element.id,
            properties: Object.freeze({
              ...element.properties,
              [spec.capabilities.text.property]: text,
            }),
          },
          { label: 'Edit text' },
        );
        return result?.ok === true && result.changed;
      },
    });
    const textEdit = createTextEditViewportRoute({
      interaction: textEditInteraction,
      queryPointerTarget: (point) => model.hitTestTopmost(point)?.id,
      selection,
    });
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
              ...(capture.sharedOwner === undefined ? {} : { equalGapOwner: capture.sharedOwner }),
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
    const arrangementSource: SelectionArrangementSource = {
      commit(commands, label) {
        const result = session.dispatchTransaction(commands, { label });
        return result?.ok === true && result.changed ? result.history.document : undefined;
      },
    };
    const arrangeSelection = (action: SelectionArrangementAction): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      return currentDocument === undefined
        ? false
        : arrangeSelectedElements(currentDocument, selection, action, arrangementSource);
    };
    const insertControl = (controlType: ControlTypeId, requestedCenter?: WorldPoint) => {
      const currentDocument = session.getSnapshot().history?.document;
      const boardId = currentDocument?.boardIds[0];
      const elementId = allocateEditorElementId();
      if (currentDocument === undefined || boardId === undefined || elementId === undefined) {
        return undefined;
      }
      const viewport = camera.getViewportSnapshot();
      const center =
        requestedCenter ??
        viewportPointToWorld(
          createViewportPoint(viewport.width / 2, viewport.height / 2),
          camera.getTransformSnapshot(),
        );
      const command = createControlInsertionCommand({
        boardId,
        center,
        controlType,
        document: currentDocument,
        elementId,
        ...(requestedCenter === undefined ? {} : { placement: 'exact' }),
      });
      if (command === undefined) {
        return undefined;
      }
      const result = session.dispatch(command, {
        label: `Insert ${getControlSpec(controlType)?.palette?.label ?? 'control'}`,
      });
      if (
        result?.ok !== true ||
        !result.changed ||
        result.history.document.elementsById[elementId] === undefined
      ) {
        return undefined;
      }
      selection.selectOnly(elementId);
      return elementId;
    };
    return Object.freeze({
      arrangeSelection,
      bringSelectionForward: () => layerSelection(SELECTION_LAYER_ACTIONS.bringForward),
      bringSelectionToFront: () => layerSelection(SELECTION_LAYER_ACTIONS.bringToFront),
      copySelection,
      cutSelection,
      deleteSelection,
      duplicateSelection,
      groupSelection,
      insertControl,
      keyboardNudgeInteraction,
      lockSelection,
      model,
      moveInteraction,
      resizeInteraction,
      sendSelectionBackward: () => layerSelection(SELECTION_LAYER_ACTIONS.sendBackward),
      sendSelectionToBack: () => layerSelection(SELECTION_LAYER_ACTIONS.sendToBack),
      selection,
      selectionInteraction,
      textEdit,
      textEditInteraction,
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
  useEffect(() => {
    if (
      packagedProbeStarted.current ||
      !packagedProbeEnabled ||
      !view.isReady ||
      view.history === undefined ||
      firstBoardId === undefined
    ) {
      return;
    }
    packagedProbeStarted.current = true;
    camera.flushPending();
    const insertedIds = [
      CONTROL_TYPES.rectangle,
      CONTROL_TYPES.textLabel,
      CONTROL_TYPES.button,
      CONTROL_TYPES.textInput,
    ].map((controlType) => editor.insertControl(controlType));
    const [cardId, titleId, buttonId, inputId] = insertedIds;
    if (
      cardId === undefined ||
      titleId === undefined ||
      buttonId === undefined ||
      inputId === undefined
    ) {
      throw new Error('The packaged alpha probe could not insert all representative controls.');
    }
    const edited = session.dispatchTransaction(
      [
        {
          type: DOCUMENT_COMMAND_TYPES.setElementFrame,
          elementId: cardId,
          frame: PROJECT_WORKFLOW_ALPHA_LAYOUT.rectangle,
        },
        {
          type: DOCUMENT_COMMAND_TYPES.setElementFrame,
          elementId: titleId,
          frame: PROJECT_WORKFLOW_ALPHA_LAYOUT.textLabel,
        },
        {
          type: DOCUMENT_COMMAND_TYPES.setElementFrame,
          elementId: inputId,
          frame: PROJECT_WORKFLOW_ALPHA_LAYOUT.textInput,
        },
        {
          type: DOCUMENT_COMMAND_TYPES.setElementFrame,
          elementId: buttonId,
          frame: PROJECT_WORKFLOW_ALPHA_LAYOUT.button,
        },
        {
          type: DOCUMENT_COMMAND_TYPES.setElementProperties,
          elementId: buttonId,
          properties: { text: PROJECT_WORKFLOW_ALPHA_BUTTON_TEXT },
        },
      ],
      { label: 'Edit alpha button' },
    );
    if (edited?.ok !== true || !edited.changed || !session.undo() || !session.redo()) {
      throw new Error('The packaged alpha probe could not verify button editing and history.');
    }
    editor.selection.selectOnly(buttonId);
    const noted = session.dispatch({
      type: DOCUMENT_COMMAND_TYPES.setBoardNote,
      boardId: firstBoardId,
      note: { text: projectWorkflowProbeContract.note },
    });
    if (noted?.ok !== true || !noted.changed) {
      throw new Error('The packaged alpha probe could not prepare its saved project.');
    }
    void session.save().then(async () => {
      const savedView = session.getSnapshot();
      if (savedView.isDirty || savedView.isSaving || savedView.statusTone === 'problem') {
        throw new Error('The packaged alpha probe did not finish saving cleanly.');
      }
      // The session can be clean before React's status/project labels cross a
      // paint boundary. The main process captures only after this explicit UI
      // presentation barrier, so native artifacts never record stale chrome.
      await waitForRendererPresentation();
      globalThis.document.documentElement.setAttribute(
        projectWorkflowProbeContract.readyAttribute,
        'true',
      );
    });
  }, [camera, editor, firstBoardId, packagedProbeEnabled, session, view.history, view.isReady]);
  useEffect(
    () =>
      editor.model.subscribe(() => {
        editor.keyboardNudgeInteraction.cancel();
        editor.selectionInteraction.cancelPress();
        editor.selection.reconcile(new Set(editor.model.listSelectableItemIds()));
        const snapshot = editor.selection.getSnapshot();
        editor.textEditInteraction.reconcileTarget(
          snapshot.selectedIds.length === 1 ? snapshot.primaryId : undefined,
        );
      }),
    [editor],
  );
  useEffect(() => {
    if (document === undefined) {
      editor.keyboardNudgeInteraction.cancel();
      editor.selectionInteraction.cancelPress();
      editor.selection.clear();
      editor.textEditInteraction.cancel();
    }
  }, [document, editor]);
  useEffect(
    () =>
      editor.selection.subscribe(() => {
        const snapshot = editor.selection.getSnapshot();
        editor.textEditInteraction.reconcileTarget(
          snapshot.selectedIds.length === 1 ? snapshot.primaryId : undefined,
        );
      }),
    [editor],
  );
  return (
    <AppShell
      historyControls={{
        canRedo: (view.history?.redoEntries.length ?? 0) > 0,
        canUndo: (view.history?.undoEntries.length ?? 0) > 0,
        onRedo: () => session.redo(),
        onUndo: () => session.undo(),
        ...(view.history === undefined || selectRedoLabel(view.history) === undefined
          ? {}
          : { redoLabel: `Redo ${selectRedoLabel(view.history) as string}` }),
        ...(view.history === undefined || selectUndoLabel(view.history) === undefined
          ? {}
          : { undoLabel: `Undo ${selectUndoLabel(view.history) as string}` }),
      }}
      inspectorTitle={
        document === undefined ? undefined : (
          <ControlInspectorTitle document={document} selection={editor.selection} />
        )
      }
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
                  onAlignSelection: editor.arrangeSelection,
                  onBringSelectionForward: editor.bringSelectionForward,
                  onBringSelectionToFront: editor.bringSelectionToFront,
                  onCopySelection: editor.copySelection,
                  onCutSelection: editor.cutSelection,
                  onDeleteSelection: editor.deleteSelection,
                  onDuplicateSelection: editor.duplicateSelection,
                  onGroupSelection: editor.groupSelection,
                  onInsertControlAt: (controlType: ControlTypeId, point: WorldPoint) =>
                    editor.insertControl(controlType, point) !== undefined,
                  onLockSelection: editor.lockSelection,
                  onPasteSelection: editor.pasteSelection,
                  onSendSelectionBackward: editor.sendSelectionBackward,
                  onSendSelectionToBack: editor.sendSelectionToBack,
                  onUngroupSelection: editor.ungroupSelection,
                  onUnlockAll: editor.unlockAll,
                  selection: editor.selection,
                  selectionInteraction: editor.selectionInteraction,
                  shortcutPlatform: platform,
                  textEdit: editor.textEdit,
                })}
            domChildren={
              <>
                {!hasRenderableElements ? <ViewportEmptyState /> : null}
                {document === undefined ? null : (
                  <TextEditOverlay
                    camera={camera}
                    interaction={editor.textEditInteraction}
                    platform={platform}
                  />
                )}
              </>
            }
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
        ...(document === undefined
          ? {}
          : {
              inspector: (
                <ControlInspector
                  document={document}
                  onAutoSize={async (elementId) => {
                    const measurementService = await getBrowserControlTextMeasurementService();
                    const currentDocument = session.getSnapshot().history?.document;
                    const element = currentDocument?.elementsById[elementId];
                    if (element === undefined) {
                      return false;
                    }
                    const frame = calculateControlAutoSizeFrame(element, measurementService);
                    if (frame === undefined) {
                      return false;
                    }
                    const result = session.dispatch(
                      {
                        type: DOCUMENT_COMMAND_TYPES.setElementFrame,
                        elementId,
                        frame,
                      },
                      { label: 'Auto-size control' },
                    );
                    // Already-canonical geometry is a successful semantic no-op and adds no history.
                    return result?.ok === true;
                  }}
                  onSetFrame={(elementId, frame: WorldRect) => {
                    const result = session.dispatch(
                      {
                        type: DOCUMENT_COMMAND_TYPES.setElementFrame,
                        elementId,
                        frame,
                      },
                      { coalesceKey: `inspector-frame:${elementId}`, label: 'Edit geometry' },
                    );
                    return result?.ok === true && result.changed;
                  }}
                  onSetProperties={(elementId, properties: ElementProperties) => {
                    const result = session.dispatch(
                      {
                        type: DOCUMENT_COMMAND_TYPES.setElementProperties,
                        elementId,
                        properties,
                      },
                      {
                        coalesceKey: `inspector-properties:${elementId}`,
                        label: 'Edit properties',
                      },
                    );
                    return result?.ok === true && result.changed;
                  }}
                  selection={editor.selection}
                />
              ),
              navigator: <WireframeNavigator activeBoardId={firstBoardId} document={document} />,
              shelf: (
                <ControlShelf
                  onInsert={(controlType) => editor.insertControl(controlType) !== undefined}
                />
              ),
            }),
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
