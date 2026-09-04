import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import projectWorkflowProbeContract from '../../../project-workflow-probe-contract.json';
import recoveryProbeContract from '../../../recovery-probe-contract.json';
import {
  AssetIdSchema,
  BoardIdSchema,
  ComponentIdSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  getControlPaletteEntry,
  getControlSpec,
  getControlAccessibleName,
  selectBoardPresentationId,
  selectRedoLabel,
  selectUndoLabel,
  type BoardId,
  type ComponentId,
  type ControlTypeId,
  type ElementId,
  type WorldRect,
} from '../../domain';
import { getRequestedVisualFixture } from '../../shared/visual-fixture';
import { isM11PerformanceProbeRequested } from '../../shared/m11-performance';
import { isViewportPerformanceProbeRequested } from '../../shared/viewport-performance';
import {
  PROJECT_WORKFLOW_ALPHA_BUTTON_TEXT,
  PROJECT_WORKFLOW_ALPHA_LAYOUT,
} from '../../shared/project-workflow-alpha';
import { VisualConformanceFixture } from '../design/VisualConformanceFixture';
import { NoticeCenterStore } from '../design/notice-center';
import { ControlInspector, ControlInspectorTitle } from '../controls/ControlInspector';
import { calculateControlAutoSizeFrame } from '../controls/control-auto-size';
import { planControlIconUpdates } from '../controls/control-icon-update';
import { planComponentOverrideUpdate } from '../controls/component-override-update';
import { planComponentCreationFromGroup } from '../controls/component-creation';
import { planComponentDefinitionUpdateFromInstance } from '../controls/component-definition-update';
import { planComponentDetachment } from '../controls/component-detachment';
import { planComponentDuplicate } from '../controls/component-duplicate';
import { createComponentInstanceInsertionCommand } from '../controls/component-insertion';
import { ControlShelf } from '../controls/ControlShelf';
import { QuickAdd } from '../controls/QuickAdd';
import {
  listControlLibraryCategories,
  type ControlLibraryCategory,
} from '../controls/control-library-query';
import { getBrowserControlTextMeasurementService } from '../controls/control-text-measurement';
import { createControlInsertionCommand } from '../controls/control-insertion';
import { WireframeNavigator } from '../controls/WireframeNavigator';
import { ViewportPerformanceFixture } from '../editor/ViewportPerformanceFixture';
import { M11PerformanceFixture } from '../editor/M11PerformanceFixture';
import { AppShell } from '../shell/AppShell';
import { ProjectDecisionDialog } from '../projects/ProjectDecisionDialog';
import { PresentationView } from '../projects/PresentationView';
import { ProjectHome } from '../projects/ProjectHome';
import { useProjectAssetUrls } from '../projects/project-asset-urls';
import {
  calculateImportedImageFrame,
  createBrowserImageDecodeService,
  prepareImageImport,
} from '../projects/image-import';
import { BoardTrashDialog } from '../projects/BoardTrashDialog';
import { BoardAlternateDiscardDialog } from '../projects/BoardAlternateDiscardDialog';
import { BoardNoteEditor } from '../projects/BoardNoteEditor';
import { ActiveBoardStore } from '../projects/active-board-store';
import { createBoardCreationCommand } from '../projects/board-creation';
import { planBoardAlternateClone } from '../projects/board-alternate';
import {
  planBoardAlternateDiscard,
  planBoardAlternateMerge,
  planBoardAlternatePromote,
} from '../projects/board-alternate-lifecycle';
import { planBoardDuplicate } from '../projects/board-duplicate';
import {
  createBoardRestoreCommand,
  createBoardTrashCommand,
  selectBoardAfterTrash,
} from '../projects/board-trash';
import {
  BoardThumbnailStore,
  createBrowserBoardThumbnailScheduler,
} from '../projects/board-thumbnail-store';
import { useProjectSession } from '../projects/use-project-session';
import { DocumentScene } from '../editor/DocumentScene';
import { ControlDrawOverlay } from '../editor/ControlDrawOverlay';
import { ControlDrawInteraction } from '../editor/control-draw-interaction';
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
  createWorldPoint,
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

const allocateEditorAssetId = () => {
  const result = AssetIdSchema.safeParse(
    `asset_${globalThis.crypto.randomUUID().replaceAll('-', '').toLowerCase()}`,
  );
  return result.success ? result.data : undefined;
};

const allocateEditorBoardId = () => {
  const result = BoardIdSchema.safeParse(
    `board_${globalThis.crypto.randomUUID().replaceAll('-', '').toLowerCase()}`,
  );
  return result.success ? result.data : undefined;
};

const allocateEditorComponentId = () => {
  const result = ComponentIdSchema.safeParse(
    `component_${globalThis.crypto.randomUUID().replaceAll('-', '').toLowerCase()}`,
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
  const controlCategories = useMemo(() => listControlLibraryCategories(), []);
  const [activeControlCategory, setActiveControlCategory] = useState<ControlLibraryCategory>('All');
  const selectControlCategory = useCallback(
    (category: string): void => {
      const registeredCategory = controlCategories.find((candidate) => candidate === category);
      if (registeredCategory !== undefined) {
        setActiveControlCategory(registeredCategory);
      }
    },
    [controlCategories],
  );
  const query = new URLSearchParams(window.location.search);
  const packagedProbeEnabled =
    query.get(projectWorkflowProbeContract.queryKey) === projectWorkflowProbeContract.queryValue;
  const packagedRecoveryRestore =
    query.get(recoveryProbeContract.rendererQueryKey) === recoveryProbeContract.rendererQueryValue;
  const project = useProjectSession(window.balsamicDesktop, {
    ...(packagedRecoveryRestore ? { packagedRecoveryRestore: true } : {}),
  });
  const { session, view } = project;
  const [pendingAlternateDiscard, setPendingAlternateDiscard] = useState<
    Readonly<{ alternateId: BoardId; canonicalBoardId: BoardId }> | undefined
  >();
  const [pendingTrashBoardId, setPendingTrashBoardId] = useState<BoardId>();
  const [presentingBoardId, setPresentingBoardId] = useState<BoardId>();
  const [noticeStore] = useState(() => new NoticeCenterStore());
  const packagedProbeStarted = useRef(false);
  const packagedProbeProjectStarted = useRef(false);
  const [editor] = useState(() => {
    const clipboard = new SelectionClipboardStore();
    const activeBoard = new ActiveBoardStore();
    const model = new DocumentSceneModel();
    const selection = new SelectionStore();
    const thumbnails = new BoardThumbnailStore({
      scheduler: createBrowserBoardThumbnailScheduler(),
    });
    const imageDecoder = createBrowserImageDecodeService();
    const commitControlInsertion = (
      controlType: ControlTypeId,
      input: Readonly<{
        center: WorldPoint;
        frame?: WorldRect;
        placement?: 'cascade' | 'exact';
        presetId?: string;
        verb: 'Draw' | 'Insert';
      }>,
    ) => {
      const currentDocument = session.getSnapshot().history?.document;
      const canonicalBoardId = activeBoard.getSnapshot() ?? currentDocument?.boardIds[0];
      const boardId =
        currentDocument === undefined || canonicalBoardId === undefined
          ? undefined
          : selectBoardPresentationId(currentDocument, canonicalBoardId);
      const elementId = allocateEditorElementId();
      if (currentDocument === undefined || boardId === undefined || elementId === undefined) {
        return undefined;
      }
      const command = createControlInsertionCommand({
        boardId,
        center: input.center,
        controlType,
        document: currentDocument,
        elementId,
        ...(input.presetId === undefined ? {} : { presetId: input.presetId }),
        ...(input.frame === undefined ? {} : { frame: input.frame }),
        ...(input.placement === undefined ? {} : { placement: input.placement }),
      });
      if (command === undefined) {
        return undefined;
      }
      const result = session.dispatch(command, {
        label: `${input.verb} ${getControlPaletteEntry(controlType, input.presetId ?? null)?.label ?? 'control'}`,
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
    const insertControlAtFrame = (controlType: ControlTypeId, frame: WorldRect) =>
      commitControlInsertion(controlType, {
        center: createWorldPoint(frame.x + frame.width / 2, frame.y + frame.height / 2),
        frame,
        placement: 'exact',
        verb: 'Draw',
      });
    const insertControl = (
      controlType: ControlTypeId,
      requestedCenter?: WorldPoint,
      presetId?: string,
    ) => {
      const viewport = camera.getViewportSnapshot();
      const center =
        requestedCenter ??
        viewportPointToWorld(
          createViewportPoint(viewport.width / 2, viewport.height / 2),
          camera.getTransformSnapshot(),
        );
      return commitControlInsertion(controlType, {
        center,
        ...(presetId === undefined ? {} : { presetId }),
        ...(requestedCenter === undefined ? {} : { placement: 'exact' }),
        verb: 'Insert',
      });
    };
    const insertComponent = (componentId: ComponentId, requestedCenter?: WorldPoint): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      const canonicalBoardId = activeBoard.getSnapshot() ?? currentDocument?.boardIds[0];
      const boardId =
        currentDocument === undefined || canonicalBoardId === undefined
          ? undefined
          : selectBoardPresentationId(currentDocument, canonicalBoardId);
      const elementId = allocateEditorElementId();
      const viewport = camera.getViewportSnapshot();
      const center =
        requestedCenter ??
        viewportPointToWorld(
          createViewportPoint(viewport.width / 2, viewport.height / 2),
          camera.getTransformSnapshot(),
        );
      if (currentDocument === undefined || boardId === undefined || elementId === undefined) {
        return false;
      }
      const command = createComponentInstanceInsertionCommand(
        currentDocument,
        boardId,
        componentId,
        elementId,
        center,
      );
      if (command === undefined) return false;
      const result = session.dispatch(command, { label: 'Insert component' });
      if (result?.ok !== true || !result.changed) return false;
      selection.selectOnly(elementId);
      return true;
    };
    const importImage = async (file: File, center: WorldPoint): Promise<void> => {
      const assetId = allocateEditorAssetId();
      if (assetId === undefined) {
        noticeStore.report({
          key: 'image-import:id',
          message: 'Retry the import. No project data changed.',
          title: 'The image could not be identified',
          tone: 'danger',
        });
        return;
      }
      const prepared = await prepareImageImport(file, assetId, imageDecoder);
      if (!prepared.ok) {
        noticeStore.report({
          key: `image-import:${prepared.code}`,
          message: prepared.message,
          title: 'The image was not imported',
          tone: 'danger',
        });
        return;
      }
      const currentDocument = session.getSnapshot().history?.document;
      const canonicalBoardId = activeBoard.getSnapshot() ?? currentDocument?.boardIds[0];
      const boardId =
        currentDocument === undefined || canonicalBoardId === undefined
          ? undefined
          : selectBoardPresentationId(currentDocument, canonicalBoardId);
      const elementId = allocateEditorElementId();
      if (currentDocument === undefined || boardId === undefined || elementId === undefined) {
        noticeStore.report({
          key: 'image-import:project',
          message: 'Open a writable board and retry the import.',
          title: 'The image was not imported',
          tone: 'danger',
        });
        return;
      }
      const insertion = createControlInsertionCommand({
        assetIds: [assetId],
        boardId,
        center,
        controlType: CONTROL_TYPES.imagePlaceholder,
        document: currentDocument,
        elementId,
        frame: calculateImportedImageFrame(center, prepared.value.dimensions),
        placement: 'exact',
      });
      if (insertion === undefined) {
        noticeStore.report({
          key: 'image-import:placement',
          message: 'Retry the import at another canvas position.',
          title: 'The image could not be placed',
          tone: 'danger',
        });
        return;
      }
      const committed = await session.dispatchTransactionWithAssets(
        [{ type: DOCUMENT_COMMAND_TYPES.createAsset, asset: prepared.value.asset }, insertion],
        { [assetId]: prepared.value.bytes },
        { label: 'Import image' },
      );
      if (committed?.ok !== true || !committed.changed) {
        const message =
          committed !== undefined && !committed.ok
            ? committed.error.message
            : 'The project changed. Retry the import.';
        noticeStore.report({
          key: 'image-import:commit',
          message,
          title: 'The image was not imported',
          tone: 'danger',
        });
        return;
      }
      selection.selectOnly(elementId);
    };
    const drawInteraction = new ControlDrawInteraction({
      commit: (controlType, frame) => insertControlAtFrame(controlType, frame) !== undefined,
    });
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
        const deletedElementCount = commands.filter(
          (command) => command.type === DOCUMENT_COMMAND_TYPES.deleteElement,
        ).length;
        const result = session.dispatchTransaction(commands, {
          label: deletedElementCount === 1 ? 'Delete element' : 'Delete elements',
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
    const createComponentFromSelection = (sourceGroupId: ElementId, name: string): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      const selected = selection.getSnapshot();
      const componentId = allocateEditorComponentId();
      const instanceId = allocateEditorElementId();
      if (
        currentDocument === undefined ||
        selected.selectedIds.length !== 1 ||
        selected.primaryId !== sourceGroupId ||
        componentId === undefined ||
        instanceId === undefined
      ) {
        return false;
      }
      const plan = planComponentCreationFromGroup(
        currentDocument,
        sourceGroupId,
        componentId,
        instanceId,
        name,
        () => allocateEditorElementId(),
      );
      if (plan === undefined) return false;
      const result = session.dispatchTransaction(plan.commands, {
        label: `Create component “${name.trim()}”`,
      });
      if (result?.ok !== true || !result.changed) return false;
      selection.selectOnly(plan.instanceId);
      return true;
    };
    const detachComponent = (instanceId: ElementId): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      const selected = selection.getSnapshot();
      if (
        currentDocument === undefined ||
        selected.selectedIds.length !== 1 ||
        selected.primaryId !== instanceId
      ) {
        return false;
      }
      const plan = planComponentDetachment(currentDocument, instanceId, () =>
        allocateEditorElementId(),
      );
      if (plan === undefined) return false;
      const result = session.dispatchTransaction(plan.commands, {
        label: 'Break apart component',
      });
      if (result?.ok !== true || !result.changed) return false;
      selection.selectOnly(plan.detachedRootId);
      return true;
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
      const canonicalBoardId = activeBoard.getSnapshot() ?? currentDocument?.boardIds[0];
      const presentationBoardId =
        currentDocument === undefined || canonicalBoardId === undefined
          ? undefined
          : selectBoardPresentationId(currentDocument, canonicalBoardId);
      return currentDocument === undefined || presentationBoardId === undefined
        ? false
        : unlockAllBoardElements(currentDocument, presentationBoardId, lockingSource);
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
    return Object.freeze({
      arrangeSelection,
      activeBoard,
      bringSelectionForward: () => layerSelection(SELECTION_LAYER_ACTIONS.bringForward),
      bringSelectionToFront: () => layerSelection(SELECTION_LAYER_ACTIONS.bringToFront),
      copySelection,
      createComponentFromSelection,
      cutSelection,
      deleteSelection,
      detachComponent,
      drawInteraction,
      duplicateSelection,
      groupSelection,
      importImage,
      insertControl,
      insertComponent,
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
      thumbnails,
      pasteSelection,
      ungroupSelection,
      unlockAll,
    });
  });
  const document = view.history?.document;
  const assetUrls = useProjectAssetUrls(session, document);
  const assetsById = document?.assetsById;
  const projectImageIcons = useMemo(
    () =>
      Object.freeze(
        Object.values(assetsById ?? {}).flatMap((asset) => {
          const url = assetUrls[asset.id];
          if (!asset.mediaType.startsWith('image/') || url === undefined) return [];
          return [
            Object.freeze({
              assetId: asset.id,
              label: asset.originalName ?? 'Project image',
              url,
            }),
          ];
        }),
      ),
    [assetUrls, assetsById],
  );
  const selectedBoardId = useSyncExternalStore(
    editor.activeBoard.subscribe,
    editor.activeBoard.getSnapshot,
    editor.activeBoard.getSnapshot,
  );
  const activeBoardId =
    selectedBoardId !== undefined && document?.boardIds.includes(selectedBoardId)
      ? selectedBoardId
      : document?.boardIds[0];
  const presentationBoardId =
    document === undefined || activeBoardId === undefined
      ? undefined
      : selectBoardPresentationId(document, activeBoardId);
  const hasRenderableElements = useMemo(
    () => document !== undefined && countRenderableBoardElements(document, presentationBoardId) > 0,
    [document, presentationBoardId],
  );
  const boardBounds = useMemo(
    () =>
      document === undefined
        ? undefined
        : getRenderableBoardWorldBounds(document, presentationBoardId),
    [document, presentationBoardId],
  );
  const activeBoardNote =
    presentationBoardId === undefined
      ? undefined
      : view.history?.document.boardsById[presentationBoardId]?.note.text;
  const activeBoard =
    activeBoardId === undefined ? undefined : view.history?.document.boardsById[activeBoardId];
  const activeVersionBoard =
    presentationBoardId === undefined
      ? undefined
      : view.history?.document.boardsById[presentationBoardId];
  const activeBoardTitle =
    activeBoard === undefined
      ? undefined
      : activeVersionBoard !== undefined && activeVersionBoard.id !== activeBoard.id
        ? `${activeBoard.name} · ${activeVersionBoard.name}`
        : activeBoard.name;
  const resetElementInteraction = useCallback((): void => {
    editor.keyboardNudgeInteraction.cancel();
    editor.selectionInteraction.cancelPress();
    editor.textEditInteraction.cancel();
    editor.selection.clear();
  }, [editor]);
  const renameComponent = useCallback(
    (componentId: ComponentId, name: string): boolean => {
      const result = session.dispatch(
        {
          type: DOCUMENT_COMMAND_TYPES.renameComponent,
          componentId,
          name,
        },
        { label: `Rename component “${name}”` },
      );
      return result?.ok === true;
    },
    [session],
  );
  const reorderComponent = useCallback(
    (componentId: ComponentId, toIndex: number): boolean => {
      const result = session.dispatch(
        { type: DOCUMENT_COMMAND_TYPES.reorderComponent, componentId, toIndex },
        { label: 'Reorder component' },
      );
      return result?.ok === true && result.changed;
    },
    [session],
  );
  const duplicateComponent = useCallback(
    (componentId: ComponentId): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      const newComponentId = allocateEditorComponentId();
      const command =
        currentDocument === undefined || newComponentId === undefined
          ? undefined
          : planComponentDuplicate(currentDocument, componentId, newComponentId, () =>
              allocateEditorElementId(),
            );
      if (command === undefined) return false;
      const result = session.dispatch(command, {
        label: `Duplicate component “${command.component.name}”`,
      });
      return result?.ok === true && result.changed;
    },
    [session],
  );
  const deleteComponent = useCallback(
    (componentId: ComponentId): boolean => {
      const result = session.dispatch(
        { type: DOCUMENT_COMMAND_TYPES.deleteComponent, componentId },
        { label: 'Delete component definition' },
      );
      return result?.ok === true && result.changed;
    },
    [session],
  );
  const selectActiveBoard = useCallback(
    (boardId: NonNullable<typeof activeBoardId>): void => {
      if (!editor.activeBoard.select(boardId)) {
        return;
      }
      resetElementInteraction();
    },
    [editor.activeBoard, resetElementInteraction],
  );
  const startPresentation = useCallback((): void => {
    if (activeBoardId === undefined) {
      return;
    }
    resetElementInteraction();
    setPresentingBoardId(activeBoardId);
  }, [activeBoardId, resetElementInteraction]);
  const createBoard = useCallback((): boolean => {
    const currentDocument = session.getSnapshot().history?.document;
    const boardId = allocateEditorBoardId();
    if (currentDocument === undefined || boardId === undefined) {
      return false;
    }
    const command = createBoardCreationCommand(currentDocument, boardId);
    if (command === undefined) {
      return false;
    }
    const result = session.dispatch(command);
    if (
      result?.ok !== true ||
      !result.changed ||
      result.history.document.boardsById[boardId] === undefined
    ) {
      return false;
    }
    selectActiveBoard(boardId);
    return true;
  }, [selectActiveBoard, session]);
  const renameBoard = useCallback(
    (boardId: NonNullable<typeof activeBoardId>, name: string): boolean => {
      const result = session.dispatch({
        type: DOCUMENT_COMMAND_TYPES.renameBoard,
        boardId,
        name,
      });
      return result?.ok === true;
    },
    [session],
  );
  const setBoardNote = useCallback(
    (boardId: BoardId, text: string): boolean => {
      const result = session.dispatch({
        type: DOCUMENT_COMMAND_TYPES.setBoardNote,
        boardId,
        note: { text },
      });
      return result?.ok === true;
    },
    [session],
  );
  const reorderBoard = useCallback(
    (boardId: NonNullable<typeof activeBoardId>, toIndex: number): boolean => {
      const result = session.dispatch({
        type: DOCUMENT_COMMAND_TYPES.reorderBoard,
        boardId,
        toIndex,
      });
      return result?.ok === true;
    },
    [session],
  );
  const duplicateBoard = useCallback(
    (sourceBoardId: NonNullable<typeof activeBoardId>): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      const cloneBoardId = allocateEditorBoardId();
      if (currentDocument === undefined || cloneBoardId === undefined) {
        return false;
      }
      const plan = planBoardDuplicate(currentDocument, sourceBoardId, cloneBoardId, () =>
        allocateEditorElementId(),
      );
      if (plan === undefined) {
        return false;
      }
      const result = session.dispatchTransaction(plan.commands, { label: 'Duplicate board' });
      if (
        result?.ok !== true ||
        !result.changed ||
        result.history.document.boardsById[cloneBoardId] === undefined
      ) {
        return false;
      }
      selectActiveBoard(cloneBoardId);
      return true;
    },
    [selectActiveBoard, session],
  );
  const cloneBoardAlternate = useCallback(
    (canonicalBoardId: BoardId, mode: 'create' | 'duplicate'): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      const alternateBoardId = allocateEditorBoardId();
      if (currentDocument === undefined || alternateBoardId === undefined) {
        return false;
      }
      const plan = planBoardAlternateClone(
        currentDocument,
        canonicalBoardId,
        alternateBoardId,
        () => allocateEditorElementId(),
        mode,
      );
      if (plan === undefined) {
        return false;
      }
      const result = session.dispatchTransaction(plan.commands, {
        label: mode === 'create' ? 'Create alternate' : 'Duplicate board version',
      });
      if (
        result?.ok !== true ||
        !result.changed ||
        result.history.document.boardsById[alternateBoardId] === undefined
      ) {
        return false;
      }
      resetElementInteraction();
      return true;
    },
    [resetElementInteraction, session],
  );
  const selectBoardVersion = useCallback(
    (canonicalBoardId: BoardId, alternateId: BoardId | null): boolean => {
      const result = session.dispatch({
        type: DOCUMENT_COMMAND_TYPES.selectBoardVersion,
        canonicalBoardId,
        alternateId,
      });
      if (result?.ok !== true) {
        return false;
      }
      if (result.changed) {
        resetElementInteraction();
      }
      return true;
    },
    [resetElementInteraction, session],
  );
  const promoteBoardAlternate = useCallback(
    (canonicalBoardId: BoardId, alternateId: BoardId): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      const formerOfficialId = allocateEditorBoardId();
      if (currentDocument === undefined || formerOfficialId === undefined) {
        return false;
      }
      const plan = planBoardAlternatePromote(
        currentDocument,
        canonicalBoardId,
        alternateId,
        formerOfficialId,
        () => allocateEditorElementId(),
      );
      if (plan === undefined) {
        return false;
      }
      const result = session.dispatchTransaction(plan.commands, { label: 'Promote alternate' });
      if (result?.ok !== true || !result.changed) {
        return false;
      }
      resetElementInteraction();
      return true;
    },
    [resetElementInteraction, session],
  );
  const mergeBoardAlternate = useCallback(
    (canonicalBoardId: BoardId, alternateId: BoardId): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      if (currentDocument === undefined) {
        return false;
      }
      const plan = planBoardAlternateMerge(currentDocument, canonicalBoardId, alternateId, () =>
        allocateEditorElementId(),
      );
      if (plan === undefined) {
        return false;
      }
      const result = session.dispatchTransaction(plan.commands, {
        label: 'Merge alternate into Official',
      });
      if (result?.ok !== true || !result.changed) {
        return false;
      }
      resetElementInteraction();
      return true;
    },
    [resetElementInteraction, session],
  );
  const requestAlternateDiscard = useCallback(
    (canonicalBoardId: BoardId, alternateId: BoardId): void => {
      const currentDocument = session.getSnapshot().history?.document;
      if (
        currentDocument !== undefined &&
        planBoardAlternateDiscard(currentDocument, canonicalBoardId, alternateId) !== undefined
      ) {
        setPendingAlternateDiscard(Object.freeze({ alternateId, canonicalBoardId }));
      }
    },
    [session],
  );
  const confirmAlternateDiscard = useCallback((): boolean => {
    if (pendingAlternateDiscard === undefined) {
      return false;
    }
    const currentDocument = session.getSnapshot().history?.document;
    const plan =
      currentDocument === undefined
        ? undefined
        : planBoardAlternateDiscard(
            currentDocument,
            pendingAlternateDiscard.canonicalBoardId,
            pendingAlternateDiscard.alternateId,
          );
    if (plan === undefined) {
      setPendingAlternateDiscard(undefined);
      return false;
    }
    const result = session.dispatchTransaction(plan.commands, { label: 'Discard alternate' });
    if (result?.ok !== true || !result.changed) {
      return false;
    }
    setPendingAlternateDiscard(undefined);
    resetElementInteraction();
    return true;
  }, [pendingAlternateDiscard, resetElementInteraction, session]);
  const requestTrashBoard = useCallback(
    (boardId: BoardId): void => {
      const currentDocument = session.getSnapshot().history?.document;
      if (
        currentDocument !== undefined &&
        createBoardTrashCommand(currentDocument, boardId) !== undefined
      ) {
        setPendingTrashBoardId(boardId);
      }
    },
    [session],
  );
  const confirmTrashBoard = useCallback((): boolean => {
    if (pendingTrashBoardId === undefined) {
      return false;
    }
    const currentDocument = session.getSnapshot().history?.document;
    if (currentDocument === undefined) {
      setPendingTrashBoardId(undefined);
      return false;
    }
    const command = createBoardTrashCommand(currentDocument, pendingTrashBoardId);
    const replacementBoardId = selectBoardAfterTrash(currentDocument, pendingTrashBoardId);
    if (command === undefined || replacementBoardId === undefined) {
      setPendingTrashBoardId(undefined);
      return false;
    }
    const wasActive = editor.activeBoard.getSnapshot() === pendingTrashBoardId;
    const result = session.dispatch(command);
    if (result?.ok !== true || !result.changed) {
      return false;
    }
    setPendingTrashBoardId(undefined);
    if (wasActive) {
      selectActiveBoard(replacementBoardId);
    }
    return true;
  }, [editor, pendingTrashBoardId, selectActiveBoard, session]);
  const restoreBoard = useCallback(
    (boardId: BoardId): boolean => {
      const currentDocument = session.getSnapshot().history?.document;
      if (currentDocument === undefined) {
        return false;
      }
      const command = createBoardRestoreCommand(currentDocument, boardId);
      if (command === undefined) {
        return false;
      }
      const result = session.dispatch(command);
      if (result?.ok !== true || !result.changed) {
        return false;
      }
      selectActiveBoard(boardId);
      return true;
    },
    [selectActiveBoard, session],
  );
  useEffect(() => {
    editor.activeBoard.reconcile(document?.boardIds ?? []);
  }, [document, editor]);
  useEffect(() => {
    if (document !== undefined) {
      editor.thumbnails.generate(document);
    }
  }, [document, editor]);
  useEffect(() => {
    let disposed = false;
    void getBrowserControlTextMeasurementService()
      .then((service) => {
        if (!disposed) {
          editor.thumbnails.setTextMeasurementService(service);
        }
      })
      .catch(() => {
        // Renderer readiness owns the actionable font error. Geometry-only previews stay usable.
      });
    return () => {
      disposed = true;
    };
  }, [editor]);
  useEffect(() => () => editor.thumbnails.dispose(), [editor]);
  useEffect(() => {
    if (
      pendingTrashBoardId !== undefined &&
      (view.dialog !== undefined || !document?.boardIds.includes(pendingTrashBoardId))
    ) {
      setPendingTrashBoardId(undefined);
    }
  }, [document, pendingTrashBoardId, view.dialog]);
  useEffect(() => {
    if (
      pendingAlternateDiscard !== undefined &&
      (view.dialog !== undefined ||
        document?.boardsById[pendingAlternateDiscard.canonicalBoardId]?.selectedAlternateId !==
          pendingAlternateDiscard.alternateId)
    ) {
      setPendingAlternateDiscard(undefined);
    }
  }, [document, pendingAlternateDiscard, view.dialog]);
  useEffect(() => {
    if (
      presentingBoardId !== undefined &&
      (view.dialog !== undefined || !document?.boardIds.includes(presentingBoardId))
    ) {
      setPresentingBoardId(undefined);
    }
  }, [document, presentingBoardId, view.dialog]);
  useEffect(() => {
    if (
      packagedProbeProjectStarted.current ||
      !packagedProbeEnabled ||
      view.startup?.status !== 'ready' ||
      view.dialog !== undefined
    ) {
      return;
    }
    packagedProbeProjectStarted.current = true;
    void session.startNewProject();
  }, [packagedProbeEnabled, session, view.dialog, view.startup]);
  useEffect(() => {
    if (
      packagedProbeStarted.current ||
      !packagedProbeEnabled ||
      !view.isReady ||
      view.history === undefined ||
      activeBoardId === undefined ||
      presentationBoardId === undefined
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
    const alphaButton = session.getSnapshot().history?.document.elementsById[buttonId];
    if (alphaButton === undefined) {
      throw new Error('The packaged alpha probe could not read its inserted button.');
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
          // Property commands replace the complete strict control payload.
          // Keep this native acceptance probe schema-agnostic as controls evolve.
          properties: {
            ...alphaButton.properties,
            iconId: null,
            text: PROJECT_WORKFLOW_ALPHA_BUTTON_TEXT,
          },
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
      boardId: presentationBoardId,
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
  }, [
    activeBoardId,
    camera,
    editor,
    packagedProbeEnabled,
    presentationBoardId,
    session,
    view.history,
    view.isReady,
  ]);
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
  const projectDecisionOverlay =
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
        {...(view.startup?.status !== 'ready' || view.startup.problem === undefined
          ? {}
          : { problem: view.startup.problem })}
      />
    );
  const pendingTrashBoard =
    pendingTrashBoardId === undefined ? undefined : document?.boardsById[pendingTrashBoardId];
  const boardTrashOverlay =
    pendingTrashBoard === undefined ? undefined : (
      <BoardTrashDialog
        board={pendingTrashBoard}
        onCancel={() => setPendingTrashBoardId(undefined)}
        onConfirm={() => {
          confirmTrashBoard();
        }}
      />
    );
  const pendingDiscardAlternate =
    pendingAlternateDiscard === undefined
      ? undefined
      : document?.boardsById[pendingAlternateDiscard.alternateId];
  const alternateDiscardOverlay =
    pendingDiscardAlternate === undefined ? undefined : (
      <BoardAlternateDiscardDialog
        alternate={pendingDiscardAlternate}
        onCancel={() => setPendingAlternateDiscard(undefined)}
        onConfirm={() => {
          confirmAlternateDiscard();
        }}
      />
    );
  const presentationOverlay =
    presentingBoardId === undefined || document === undefined ? undefined : (
      <PresentationView
        assetUrls={assetUrls}
        document={document}
        initialBoardId={presentingBoardId}
        onExit={() => setPresentingBoardId(undefined)}
        onOpenExternal={async (url) => {
          try {
            const result = await window.balsamicDesktop.openExternalUrl({ url });
            return result.accepted;
          } catch {
            return false;
          }
        }}
      />
    );

  if (document === undefined) {
    return (
      <ProjectHome
        busy={view.isTransitioning}
        onNewProject={() => void session.startNewProject()}
        onOpenProject={() => void session.openProject()}
        onOpenRecent={(recentProjectId) => void session.openRecentProject(recentProjectId)}
        {...(projectDecisionOverlay === undefined ? {} : { overlay: projectDecisionOverlay })}
        {...(view.dialog !== undefined ||
        view.startup?.status !== 'ready' ||
        view.startup.problem === undefined
          ? {}
          : { problem: view.startup.problem })}
        {...(view.startup?.status === 'ready'
          ? { recentProjects: view.startup.recentProjects }
          : {})}
      />
    );
  }

  return (
    <AppShell
      controlCategoryNavigation={{
        activeCategory: activeControlCategory,
        categories: controlCategories,
        onSelectCategory: selectControlCategory,
      }}
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
          <ControlInspectorTitle
            document={document}
            emptyTitle={activeBoardTitle}
            selection={editor.selection}
          />
        )
      }
      navigatorControls={{ onCreateBoard: createBoard }}
      noticeStore={noticeStore}
      presentationControls={{ onPresent: startPresentation }}
      projectName={view.displayName}
      projectOverlay={
        projectDecisionOverlay ??
        boardTrashOverlay ??
        alternateDiscardOverlay ??
        presentationOverlay
      }
      {...(packagedRecoveryRestore
        ? {
            projectProbeState: {
              attributeName: recoveryProbeContract.rendererStateAttribute,
              value: JSON.stringify({
                isDirty: view.isDirty,
                isReady: view.isReady,
                note: activeBoardNote,
                source: view.source,
              }),
            },
          }
        : {})}
      quickAddShortcut={quickAddShortcut}
      quickAdd={
        <QuickAdd
          onInsert={(controlType, presetId) =>
            editor.insertControl(controlType, undefined, presetId) !== undefined
          }
          shortcutLabel={quickAddShortcut}
        />
      }
      regionContent={{
        canvas: (
          <ViewportScene
            camera={camera}
            drawInteraction={editor.drawInteraction}
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
                      <ControlDrawOverlay camera={camera} interaction={editor.drawInteraction} />
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
                  onImportImageAt: (file: File, point: WorldPoint) => {
                    void editor.importImage(file, point);
                  },
                  onInsertControlAt: (
                    controlType: ControlTypeId,
                    point: WorldPoint,
                    presetId?: string,
                  ) => editor.insertControl(controlType, point, presetId) !== undefined,
                  onInsertComponentAt: editor.insertComponent,
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
                      activeBoardId={presentationBoardId}
                      assetUrls={assetUrls}
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
                  customIcons={projectImageIcons}
                  document={document}
                  emptyContent={
                    activeVersionBoard === undefined ? undefined : (
                      <BoardNoteEditor board={activeVersionBoard} onCommit={setBoardNote} />
                    )
                  }
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
                  onCreateComponent={editor.createComponentFromSelection}
                  onDetachComponent={editor.detachComponent}
                  onSetFrames={(updates) => {
                    const result = session.dispatchTransaction(
                      updates.map(({ elementId, frame }) => ({
                        type: DOCUMENT_COMMAND_TYPES.setElementFrame,
                        elementId,
                        frame,
                      })),
                      {
                        coalesceKey: `inspector-frame:${String(editor.selection.getSnapshot().revision)}`,
                        label: updates.length === 1 ? 'Edit geometry' : 'Edit control geometry',
                      },
                    );
                    return result?.ok === true && result.changed;
                  }}
                  onSetIcons={(updates) => {
                    const currentDocument = session.getSnapshot().history?.document;
                    const commands =
                      currentDocument === undefined
                        ? undefined
                        : planControlIconUpdates(currentDocument, updates);
                    if (commands === undefined) return false;
                    const result = session.dispatchTransaction(commands, {
                      label: updates.length === 1 ? 'Change icon' : 'Change control icons',
                    });
                    return result?.ok === true && result.changed;
                  }}
                  onSetComponentOverride={(update) => {
                    const currentDocument = session.getSnapshot().history?.document;
                    const commands =
                      currentDocument === undefined
                        ? undefined
                        : planComponentOverrideUpdate(currentDocument, update);
                    if (commands === undefined) return false;
                    const result = session.dispatchTransaction(commands, {
                      label:
                        update.reset === true
                          ? 'Reset component override'
                          : 'Edit component override',
                    });
                    return result?.ok === true && result.changed;
                  }}
                  onRenameComponent={renameComponent}
                  onSetLinks={(updates) => {
                    const result = session.dispatchTransaction(
                      updates.map(({ elementId, link }) => ({
                        type: DOCUMENT_COMMAND_TYPES.setElementLink,
                        elementId,
                        link,
                      })),
                      {
                        label: updates.length === 1 ? 'Edit link' : 'Edit control links',
                      },
                    );
                    return result?.ok === true;
                  }}
                  onSetProperties={(updates) => {
                    const result = session.dispatchTransaction(
                      updates.map(({ elementId, properties, rowData }) => ({
                        type: DOCUMENT_COMMAND_TYPES.setElementProperties,
                        elementId,
                        properties,
                        ...(rowData === undefined ? {} : { rowData }),
                      })),
                      {
                        coalesceKey: `inspector-properties:${String(editor.selection.getSnapshot().revision)}`,
                        label: updates.length === 1 ? 'Edit properties' : 'Edit control properties',
                      },
                    );
                    return result?.ok === true && result.changed;
                  }}
                  onUpdateComponentDefinition={(instanceId) => {
                    const currentDocument = session.getSnapshot().history?.document;
                    const commands =
                      currentDocument === undefined
                        ? undefined
                        : planComponentDefinitionUpdateFromInstance(currentDocument, instanceId);
                    if (commands === undefined) return false;
                    const result = session.dispatchTransaction(commands, {
                      label: 'Update component definition',
                    });
                    return result?.ok === true && result.changed;
                  }}
                  selection={editor.selection}
                />
              ),
              navigator: (
                <WireframeNavigator
                  activeBoardId={activeBoardId}
                  assetUrls={assetUrls}
                  document={document}
                  onCreateAlternate={(boardId) => cloneBoardAlternate(boardId, 'create')}
                  onDuplicateBoard={duplicateBoard}
                  onDuplicateAlternate={(boardId) => cloneBoardAlternate(boardId, 'duplicate')}
                  onMergeAlternate={mergeBoardAlternate}
                  onPromoteAlternate={promoteBoardAlternate}
                  onRenameBoard={renameBoard}
                  onRenameAlternate={renameBoard}
                  onRequestDiscardAlternate={requestAlternateDiscard}
                  onRequestTrashBoard={requestTrashBoard}
                  onReorderBoard={reorderBoard}
                  onRestoreBoard={restoreBoard}
                  onSelectBoard={selectActiveBoard}
                  onSelectVersion={selectBoardVersion}
                  shortcutPlatform={platform}
                  thumbnailStore={editor.thumbnails}
                />
              ),
              shelf: (
                <ControlShelf
                  assetUrls={assetUrls}
                  category={activeControlCategory}
                  components={document.componentIds.flatMap((componentId) => {
                    const component = document.componentsById[componentId];
                    return component === undefined ? [] : [component];
                  })}
                  projectDocument={document}
                  onDeleteComponent={deleteComponent}
                  onDuplicateComponent={duplicateComponent}
                  onImportImage={(file) => {
                    const viewport = camera.getViewportSnapshot();
                    const center = viewportPointToWorld(
                      createViewportPoint(viewport.width / 2, viewport.height / 2),
                      camera.getTransformSnapshot(),
                    );
                    void editor.importImage(file, center);
                  }}
                  onInsert={(controlType, presetId) =>
                    editor.insertControl(controlType, undefined, presetId) !== undefined
                  }
                  onInsertComponent={editor.insertComponent}
                  onRenameComponent={renameComponent}
                  onReorderComponent={reorderComponent}
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
      <ProjectHome
        busy
        onNewProject={() => undefined}
        onOpenProject={() => undefined}
        onOpenRecent={() => undefined}
      />
    );
  }

  if (runtime.status === 'unavailable' || readinessFailed) {
    return (
      <ProjectHome
        busy
        onNewProject={() => undefined}
        onOpenProject={() => undefined}
        onOpenRecent={() => undefined}
        problem={{
          code: 'unexpected-native-failure',
          message: 'Restart the app to reconnect to the desktop project service.',
          title: 'Desktop bridge unavailable',
        }}
        recentProjects={[]}
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

  if (isM11PerformanceProbeRequested(window.location.search)) {
    return (
      <M11PerformanceFixture quickAddShortcut={quickAddShortcut} runtimeLabel={runtimeLabel} />
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
