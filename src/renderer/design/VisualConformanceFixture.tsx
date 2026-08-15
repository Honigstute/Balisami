import { useState } from 'react';

import {
  BoardIdSchema,
  DOCUMENT_COMMAND_TYPES,
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  dispatchDocumentCommand,
  parseProjectDocument,
  ProjectIdSchema,
  type ProjectDocument,
} from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import type { VisualFixtureName } from '../../shared/visual-fixture';
import { DocumentScene } from '../editor/DocumentScene';
import { DocumentSceneModel } from '../editor/document-scene-model';
import { KeyboardNudgeInteraction } from '../editor/keyboard-nudge-interaction';
import { MarqueeOverlay } from '../editor/MarqueeOverlay';
import { captureMoveTargets } from '../editor/move-geometry';
import { MoveInteraction } from '../editor/move-interaction';
import { captureResizeTarget } from '../editor/resize-geometry';
import { ResizeInteraction } from '../editor/resize-interaction';
import { getResizeSnapProfile, resolveResizeSnap } from '../editor/resize-snapping';
import { createSceneSnapCandidates } from '../editor/scene-snap-candidates';
import {
  planSelectionArrangement,
  SELECTION_ARRANGEMENT_ACTIONS,
} from '../editor/selection-arrangement';
import { SelectionInteraction } from '../editor/selection-interaction';
import { SelectionOverlay } from '../editor/SelectionOverlay';
import { SelectionStore } from '../editor/selection-store';
import { resolveSnap } from '../editor/snap-engine';
import { SnapGuideOverlay } from '../editor/SnapGuideOverlay';
import { TextEditOverlay } from '../editor/TextEditOverlay';
import { createTextEditViewportRoute, TextEditInteraction } from '../editor/text-edit-interaction';
import { ViewportScene } from '../editor/ViewportScene';
import { ViewportZoomControls } from '../editor/ViewportZoomControls';
import { createBrowserAnimationFrameScheduler } from '../editor/viewport-camera-store';
import { useViewportCameraStore } from '../editor/use-viewport-camera-store';
import {
  createViewportPoint,
  createWorldPoint,
  createWorldRect,
  createWorldVector,
} from '../editor/viewport-transform';
import { AppShell } from '../shell/AppShell';
import { AppButton } from './AppButton';
import { AppScroller } from './AppEmptyState';
import { AppInput } from './AppInput';
import { AppModal, AppModalActions, AppModalHeading } from './AppModal';
import { AppNoticeCenter } from './AppNoticeCenter';
import { AppPopover } from './AppPopover';
import { AppSegmentedControl } from './AppSegmentedControl';
import { AppSelect } from './AppSelect';
import { AppSlider } from './AppSlider';
import { AppSwatch } from './AppSwatch';
import { AppTooltip } from './AppTooltip';
import { NoticeCenterStore } from './notice-center';

interface VisualConformanceFixtureProps {
  readonly fixture: VisualFixtureName;
  readonly platform: 'darwin' | 'win32';
  readonly quickAddShortcut: string;
  readonly runtimeLabel: string;
}

const createSceneFixtureDocument = (): {
  readonly boardId: ReturnType<typeof BoardIdSchema.parse>;
  readonly document: ProjectDocument;
  readonly duplicateId: ReturnType<typeof ElementIdSchema.parse>;
  readonly groupId: ReturnType<typeof ElementIdSchema.parse>;
  readonly selectedId: ReturnType<typeof ElementIdSchema.parse>;
} => {
  const projectId = ProjectIdSchema.parse('project_visualscene');
  const boardId = BoardIdSchema.parse('board_visualscene');
  const outerId = ElementIdSchema.parse('element_visualouter');
  const groupId = ElementIdSchema.parse('element_visualgroup');
  const titleId = ElementIdSchema.parse('element_visualtitle');
  const fieldId = ElementIdSchema.parse('element_visualfield');
  const buttonId = ElementIdSchema.parse('element_visualbutton');
  const duplicateId = ElementIdSchema.parse('element_visualduplicate');
  const sideId = ElementIdSchema.parse('element_visualsidecard');
  const result = parseProjectDocument({
    schemaVersion: 1,
    id: projectId,
    name: 'Scene visual fixture',
    boardIds: [boardId],
    boardsById: {
      [boardId]: {
        id: boardId,
        name: 'Scene',
        note: { text: '' },
        childIds: [outerId, groupId],
      },
    },
    elementsById: {
      [outerId]: {
        id: outerId,
        controlType: FOUNDATION_CONTROL_TYPES.rectangle,
        frame: { x: 160, y: 100, width: 520, height: 380 },
        locked: false,
        properties: {},
        childIds: [],
        assetIds: [],
        link: null,
      },
      [groupId]: {
        id: groupId,
        controlType: FOUNDATION_CONTROL_TYPES.group,
        frame: { x: 160, y: 100, width: 520, height: 380 },
        locked: false,
        properties: {},
        childIds: [titleId, fieldId, buttonId, sideId],
        assetIds: [],
        link: null,
      },
      [titleId]: {
        id: titleId,
        controlType: FOUNDATION_CONTROL_TYPES.rectangle,
        frame: { x: 28, y: 28, width: 280, height: 28 },
        locked: false,
        properties: {},
        childIds: [],
        assetIds: [],
        link: null,
      },
      [fieldId]: {
        id: fieldId,
        controlType: FOUNDATION_CONTROL_TYPES.rectangle,
        frame: { x: 28, y: 96, width: 300, height: 48 },
        locked: false,
        properties: {},
        childIds: [],
        assetIds: [],
        link: null,
      },
      [buttonId]: {
        id: buttonId,
        controlType: FOUNDATION_CONTROL_TYPES.rectangle,
        frame: { x: 28, y: 172, width: 128, height: 44 },
        locked: false,
        properties: {},
        childIds: [],
        assetIds: [],
        link: null,
      },
      [sideId]: {
        id: sideId,
        controlType: FOUNDATION_CONTROL_TYPES.rectangle,
        frame: { x: 372, y: 28, width: 112, height: 304 },
        locked: false,
        properties: {},
        childIds: [],
        assetIds: [],
        link: null,
      },
    },
    assetsById: {},
  });
  if (!result.ok) {
    throw new Error('The deterministic scene visual fixture is invalid.');
  }
  return Object.freeze({
    boardId,
    document: result.value,
    duplicateId,
    groupId,
    selectedId: buttonId,
  });
};

const createGroupSelectionFixtureDocument = (
  fixture: ReturnType<typeof createSceneFixtureDocument>,
): ProjectDocument => {
  const board = fixture.document.boardsById[fixture.boardId];
  const group = fixture.document.elementsById[fixture.groupId];
  const outerId = board?.childIds.find((elementId) => elementId !== fixture.groupId);
  const [titleId, fieldId, buttonId, sideId] = group?.childIds ?? [];
  if (
    outerId === undefined ||
    titleId === undefined ||
    fieldId === undefined ||
    buttonId === undefined ||
    sideId === undefined
  ) {
    throw new Error('The deterministic group-selection visual fixture is incomplete.');
  }

  const targets = [
    { elementId: outerId, frame: { x: 40, y: 50, width: 360, height: 240 } },
    { elementId: fixture.groupId, frame: { x: 40, y: 50, width: 360, height: 240 } },
    { elementId: titleId, frame: { x: 0, y: 0, width: 260, height: 28 } },
    { elementId: fieldId, frame: { x: 0, y: 60, width: 280, height: 48 } },
    { elementId: buttonId, frame: { x: 0, y: 132, width: 128, height: 44 } },
    { elementId: sideId, frame: { x: 300, y: 0, width: 60, height: 240 } },
  ] as const;
  let document = fixture.document;
  for (const target of targets) {
    const result = dispatchDocumentCommand(document, {
      type: DOCUMENT_COMMAND_TYPES.setElementFrame,
      ...target,
    });
    if (!result.ok || !result.changed) {
      throw new Error('The deterministic group-selection visual fixture could not be created.');
    }
    document = result.document;
  }
  return document;
};

const createAlignedSelectionFixtureDocument = (
  fixture: ReturnType<typeof createSceneFixtureDocument>,
): ProjectDocument => {
  const group = fixture.document.elementsById[fixture.groupId];
  const [titleId, fieldId, buttonId] = group?.childIds ?? [];
  if (titleId === undefined || fieldId === undefined || buttonId === undefined) {
    throw new Error('The deterministic alignment visual fixture is incomplete.');
  }
  const plan = planSelectionArrangement(
    fixture.document,
    [buttonId, titleId, fieldId],
    buttonId,
    SELECTION_ARRANGEMENT_ACTIONS.alignRight,
  );
  if (plan === undefined || plan.commands.length !== 2) {
    throw new Error('The deterministic alignment visual fixture could not be planned.');
  }
  let document = fixture.document;
  for (const command of plan.commands) {
    const result = dispatchDocumentCommand(document, command);
    if (!result.ok || !result.changed) {
      throw new Error('The deterministic alignment visual fixture could not be created.');
    }
    document = result.document;
  }
  return document;
};

type SceneFixtureState =
  | 'alignSelection'
  | 'delete'
  | 'duplicate'
  | 'groupSelection'
  | 'marquee'
  | 'move'
  | 'nudge'
  | 'paste'
  | 'plain'
  | 'resize'
  | 'selection'
  | 'smartGuides'
  | 'textEdit';

const SceneFixture = ({
  platform = 'win32',
  state = 'plain',
}: {
  readonly platform?: 'darwin' | 'win32';
  readonly state?: SceneFixtureState;
}) => {
  const camera = useViewportCameraStore();
  const [fixture] = useState(createSceneFixtureDocument);
  const [document] = useState(() => {
    if (state === 'alignSelection') {
      return createAlignedSelectionFixtureDocument(fixture);
    }
    if (state === 'groupSelection') {
      return createGroupSelectionFixtureDocument(fixture);
    }
    if (state === 'delete') {
      const result = dispatchDocumentCommand(fixture.document, {
        type: DOCUMENT_COMMAND_TYPES.deleteElement,
        elementId: fixture.selectedId,
      });
      if (!result.ok || !result.changed) {
        throw new Error('The deterministic delete visual fixture could not be created.');
      }
      return result.document;
    }
    if (state === 'duplicate' || state === 'paste') {
      const source = fixture.document.elementsById[fixture.selectedId];
      if (source === undefined) {
        throw new Error('The deterministic inserted-element source is missing.');
      }
      const result = dispatchDocumentCommand(fixture.document, {
        type: DOCUMENT_COMMAND_TYPES.createElement,
        element: {
          ...source,
          id: fixture.duplicateId,
          frame: { x: 38, y: 182, width: 128, height: 44 },
          childIds: [],
        },
        owner: { kind: 'element', elementId: fixture.groupId },
        index: 3,
      });
      if (!result.ok || !result.changed) {
        throw new Error('The deterministic inserted-element visual fixture could not be created.');
      }
      return result.document;
    }
    return fixture.document;
  });
  const [editor] = useState(() => {
    const model = new DocumentSceneModel();
    model.reconcile(document, fixture.boardId);
    const selection = new SelectionStore();
    const alignmentIds = document.elementsById[fixture.groupId]?.childIds.slice(0, 3) ?? [];
    const selectedId =
      state === 'duplicate' || state === 'paste'
        ? fixture.duplicateId
        : state === 'groupSelection'
          ? fixture.groupId
          : fixture.selectedId;
    if (state === 'alignSelection') {
      const primaryId = alignmentIds[2];
      if (alignmentIds.length !== 3 || primaryId === undefined) {
        throw new Error('The deterministic alignment selection could not be restored.');
      }
      selection.replace(alignmentIds, primaryId);
    } else if (
      state === 'selection' ||
      state === 'move' ||
      state === 'smartGuides' ||
      state === 'nudge' ||
      state === 'resize' ||
      state === 'groupSelection' ||
      state === 'duplicate' ||
      state === 'paste' ||
      state === 'textEdit'
    ) {
      selection.selectOnly(selectedId);
    }
    const moveInteraction = new MoveInteraction(
      {
        capture: (ids) => captureMoveTargets(document, ids),
        commit: () => false,
        ...(state === 'smartGuides'
          ? {
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
            }
          : {}),
      },
      createBrowserAnimationFrameScheduler(),
    );
    const keyboardNudgeInteraction = new KeyboardNudgeInteraction(
      {
        capture: (ids) => captureMoveTargets(document, ids),
        commit: () => false,
      },
      createBrowserAnimationFrameScheduler(),
    );
    const resizeInteraction = new ResizeInteraction(
      {
        capture: (id) => captureResizeTarget(document, id),
        commit: () => false,
        ...(state === 'resize'
          ? {
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
            }
          : {}),
      },
      createBrowserAnimationFrameScheduler(),
    );
    const interaction = new SelectionInteraction(selection, {
      listSelectableIds: () => model.listSelectableItemIds(),
      queryHitStack: (point) => model.queryHitStack(point).map((item) => item.id),
      querySelectionRegion: (bounds, mode) => model.querySelectionRegion(bounds, mode),
    });
    const textEditInteraction = new TextEditInteraction({
      capture: (elementId) => {
        const item = model.getItem(elementId);
        return item === undefined
          ? undefined
          : {
              accessibleLabel: 'Edit button label',
              elementId,
              fontSizeWorldUnits: 16,
              mode: 'single-line',
              text: 'Edit this label',
              worldBounds: item.bounds,
            };
      },
      commit: () => false,
    });
    const textEdit = createTextEditViewportRoute({
      interaction: textEditInteraction,
      queryPointerTarget: (point) => model.queryHitStack(point)[0]?.id,
      selection,
    });
    if (state === 'marquee') {
      // Keep both endpoints inside the minimum packaged viewport. This fixture
      // is evidence for the marquee itself, not merely for its mounted DOM.
      interaction.beginPress({
        altKey: false,
        pointerId: 1,
        shiftKey: false,
        viewportPoint: createViewportPoint(440, 60),
        worldPoint: createWorldPoint(440, 60),
      });
      interaction.updatePress(1, {
        shiftKey: false,
        viewportPoint: createViewportPoint(260, 360),
        worldPoint: createWorldPoint(260, 360),
      });
    }
    if (state === 'move' || state === 'smartGuides') {
      moveInteraction.begin({
        pointerId: 2,
        snapBypassed: false,
        shiftKey: false,
        startWorldPoint: createWorldPoint(0, 0),
        targetIds: [fixture.selectedId],
        worldPoint: state === 'smartGuides' ? createWorldPoint(0, -30) : createWorldPoint(120, 60),
      });
    }
    if (state === 'resize') {
      resizeInteraction.begin({
        elementId: fixture.selectedId,
        handle: 'southEast',
        pointerId: 3,
        snapBypassed: false,
        shiftKey: false,
        startWorldPoint: createWorldPoint(316, 316),
        // Both targets stay inside the minimum Windows canvas: field center X
        // and side-card bottom Y. Artifact review must see both guide spans.
        worldPoint: createWorldPoint(336, 430),
      });
    }
    if (state === 'nudge') {
      keyboardNudgeInteraction.begin([fixture.selectedId], 'ArrowRight', true);
      for (let index = 1; index < 6; index += 1) {
        keyboardNudgeInteraction.step('ArrowRight', true);
      }
      for (let index = 0; index < 3; index += 1) {
        keyboardNudgeInteraction.step('ArrowDown', true);
      }
      keyboardNudgeInteraction.flushPending();
    }
    if (state === 'textEdit' && !textEdit.beginFromSelection()) {
      throw new Error('The deterministic text-edit visual fixture could not be created.');
    }
    return Object.freeze({
      interaction,
      keyboardNudgeInteraction,
      model,
      moveInteraction,
      resizeInteraction,
      selection,
      textEdit,
      textEditInteraction,
    });
  });
  return (
    <ViewportScene
      camera={camera}
      {...(state === 'selection' ||
      state === 'move' ||
      state === 'smartGuides' ||
      state === 'nudge' ||
      state === 'resize' ||
      state === 'alignSelection' ||
      state === 'groupSelection' ||
      state === 'duplicate' ||
      state === 'paste' ||
      state === 'textEdit'
        ? {
            interactionChildren: (
              <>
                {state === 'smartGuides' || state === 'resize' ? (
                  <SnapGuideOverlay
                    camera={camera}
                    moveInteraction={editor.moveInteraction}
                    {...(state === 'resize' ? { resizeInteraction: editor.resizeInteraction } : {})}
                  />
                ) : null}
                <SelectionOverlay
                  camera={camera}
                  {...(state === 'nudge'
                    ? { keyboardNudgeInteraction: editor.keyboardNudgeInteraction }
                    : {})}
                  model={editor.model}
                  {...(state === 'move' || state === 'smartGuides'
                    ? { moveInteraction: editor.moveInteraction }
                    : {})}
                  {...(state === 'resize' ? { resizeInteraction: editor.resizeInteraction } : {})}
                  selection={editor.selection}
                />
              </>
            ),
          }
        : state === 'marquee'
          ? { interactionChildren: <MarqueeOverlay interaction={editor.interaction} /> }
          : {})}
      {...(state === 'textEdit'
        ? {
            domChildren: (
              <TextEditOverlay
                camera={camera}
                interaction={editor.textEditInteraction}
                platform={platform}
              />
            ),
            textEdit: editor.textEdit,
          }
        : {})}
      worldChildren={
        <DocumentScene
          activeBoardId={fixture.boardId}
          camera={camera}
          document={document}
          {...(state === 'nudge'
            ? { keyboardNudgeInteraction: editor.keyboardNudgeInteraction }
            : {})}
          model={editor.model}
          {...(state === 'move' || state === 'smartGuides'
            ? { moveInteraction: editor.moveInteraction }
            : {})}
          {...(state === 'resize' ? { resizeInteraction: editor.resizeInteraction } : {})}
        />
      }
    />
  );
};

const ViewportZoomFixture = ({
  platform,
  withSelection = false,
}: {
  readonly platform: 'darwin' | 'win32';
  readonly withSelection?: boolean;
}) => {
  const camera = useViewportCameraStore();
  const [boardBounds] = useState(() => createWorldRect(0, 0, 1_200, 800));
  const [fixture] = useState(createSceneFixtureDocument);
  const [editor] = useState(() => {
    const model = new DocumentSceneModel();
    model.reconcile(fixture.document, fixture.boardId);
    const selection = new SelectionStore();
    if (withSelection) {
      selection.selectOnly(fixture.selectedId);
    }
    return Object.freeze({ model, selection });
  });
  return (
    <ViewportZoomControls
      boardBounds={boardBounds}
      camera={camera}
      defaultMenuOpen
      platform={platform}
      {...(withSelection ? { sceneModel: editor.model, selection: editor.selection } : {})}
    />
  );
};

const ControlStates = () => {
  const [point, setPoint] = useState('left');
  return (
    <AppScroller>
      <div className="visual-control-fixture">
        <h3>Control states</h3>
        <AppInput hint="World units" kind="number" label="X" readOnly value={1141} />
        <AppInput
          kind="number"
          label="Width"
          readOnly
          validation="Use a positive width."
          value={0}
        />
        <AppInput label="Shared text" mixed readOnly value="" />
        <AppSelect
          defaultValue="normal"
          label="State"
          options={[
            { label: 'Normal', value: 'normal' },
            { label: 'Disabled', value: 'disabled' },
          ]}
        />
        <AppSegmentedControl
          label="Point"
          onChange={setPoint}
          options={[
            { label: 'Left', value: 'left' },
            { label: 'None', value: 'none' },
            { label: 'Right', value: 'right' },
          ]}
          value={point}
        />
        <AppSlider label="Opacity" max={100} min={0} output="64%" readOnly value={64} />
        <div className="visual-control-fixture__swatches">
          <span>Color</span>
          <AppSwatch
            color={DESIGN_TOKENS.color.accent}
            label="Selection color"
            onClick={() => undefined}
          />
          <AppSwatch
            color={DESIGN_TOKENS.color.canvas}
            disabled
            label="Disabled color"
            onClick={() => undefined}
          />
        </div>
        <AppInput disabled label="Disabled field" readOnly value="Unavailable" />
      </div>
    </AppScroller>
  );
};

const FeedbackOverlay = () => {
  const [store] = useState(() => {
    const noticeStore = new NoticeCenterStore();
    noticeStore.report(
      {
        key: 'fixture:failure',
        message: 'The rest of the editor remains available and stable.',
        title: 'Canvas was isolated',
        tone: 'danger',
      },
      0,
    );
    return noticeStore;
  });
  return <AppNoticeCenter store={store} />;
};

const StaticRegionFailure = () => (
  <div className="region-failure" role="status">
    <strong>Canvas unavailable</strong>
    <AppButton>Retry</AppButton>
  </div>
);

const TooltipFixture = () => (
  <div className="visual-overlay-fixture visual-overlay-fixture--tooltip">
    <AppTooltip content="Full control name stays outside shell layout" defaultOpen>
      {(triggerProps) => <AppButton {...triggerProps}>Hover or focus</AppButton>}
    </AppTooltip>
  </div>
);

const PopoverFixture = () => {
  const [open, setOpen] = useState(true);
  return (
    <div className="visual-overlay-fixture">
      <AppPopover
        label="Color options"
        onOpenChange={setOpen}
        open={open}
        trigger={(triggerProps) => <AppButton {...triggerProps}>Choose color</AppButton>}
      >
        <div className="visual-popover-content">
          <strong>Color options</strong>
          <AppSwatch
            color={DESIGN_TOKENS.color.accent}
            label="Draft blue"
            onClick={() => undefined}
          />
          <AppSwatch
            color={DESIGN_TOKENS.color.canvas}
            label="Canvas white"
            onClick={() => undefined}
          />
        </div>
      </AppPopover>
    </div>
  );
};

const ModalFixture = () => (
  <AppModal describedBy="visual-modal-copy" labelledBy="visual-modal-title">
    <AppModalHeading
      description="The modal overlays the fixed shell and traps focus without moving any region."
      descriptionId="visual-modal-copy"
      eyebrow="Visual fixture"
      title="Confirm a stable decision"
      titleId="visual-modal-title"
    />
    <AppModalActions>
      <AppButton>Cancel</AppButton>
      <AppButton initialFocus tone="primary">
        Continue
      </AppButton>
    </AppModalActions>
  </AppModal>
);

export const VisualConformanceFixture = ({
  fixture,
  platform,
  quickAddShortcut,
  runtimeLabel,
}: VisualConformanceFixtureProps) => {
  const regionContent =
    fixture === 'scene'
      ? { canvas: <SceneFixture /> }
      : fixture === 'selection'
        ? { canvas: <SceneFixture state="selection" /> }
        : fixture === 'move'
          ? { canvas: <SceneFixture state="move" /> }
          : fixture === 'smartGuides'
            ? { canvas: <SceneFixture state="smartGuides" /> }
            : fixture === 'resize'
              ? { canvas: <SceneFixture state="resize" /> }
              : fixture === 'groupSelection'
                ? { canvas: <SceneFixture state="groupSelection" /> }
                : fixture === 'alignSelection'
                  ? { canvas: <SceneFixture state="alignSelection" /> }
                  : fixture === 'delete'
                    ? { canvas: <SceneFixture state="delete" /> }
                    : fixture === 'duplicate'
                      ? { canvas: <SceneFixture state="duplicate" /> }
                      : fixture === 'paste'
                        ? { canvas: <SceneFixture state="paste" /> }
                        : fixture === 'textEdit'
                          ? { canvas: <SceneFixture platform={platform} state="textEdit" /> }
                          : fixture === 'nudge'
                            ? { canvas: <SceneFixture state="nudge" /> }
                            : fixture === 'marquee'
                              ? { canvas: <SceneFixture state="marquee" /> }
                              : fixture === 'controls'
                                ? { inspector: <ControlStates /> }
                                : fixture === 'feedback'
                                  ? { canvas: <StaticRegionFailure /> }
                                  : fixture === 'tooltip'
                                    ? { canvas: <TooltipFixture /> }
                                    : fixture === 'popover'
                                      ? { canvas: <PopoverFixture /> }
                                      : undefined;
  const projectOverlay =
    fixture === 'feedback' ? (
      <FeedbackOverlay />
    ) : fixture === 'modal' ? (
      <ModalFixture />
    ) : undefined;
  const viewportControls =
    fixture === 'viewportZoom' ? (
      <ViewportZoomFixture platform={platform} />
    ) : fixture === 'viewportSelectionZoom' ? (
      <ViewportZoomFixture platform={platform} withSelection />
    ) : undefined;

  return (
    <AppShell
      projectName={`Visual · ${fixture}`}
      projectOverlay={projectOverlay}
      quickAddShortcut={quickAddShortcut}
      {...(regionContent === undefined ? {} : { regionContent })}
      statusLabel={`Visual fixture · ${fixture}`}
      statusScope={runtimeLabel}
      statusTone="quiet"
      usePersistedLayout={false}
      {...(viewportControls === undefined ? {} : { viewportControls })}
    />
  );
};
