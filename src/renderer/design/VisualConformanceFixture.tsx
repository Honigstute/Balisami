import { useState } from 'react';

import {
  BoardIdSchema,
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  parseProjectDocument,
  ProjectIdSchema,
  type ProjectDocument,
} from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import type { VisualFixtureName } from '../../shared/visual-fixture';
import { DocumentScene } from '../editor/DocumentScene';
import { DocumentSceneModel } from '../editor/document-scene-model';
import { SelectionOverlay } from '../editor/SelectionOverlay';
import { SelectionStore } from '../editor/selection-store';
import { ViewportScene } from '../editor/ViewportScene';
import { ViewportZoomControls } from '../editor/ViewportZoomControls';
import { useViewportCameraStore } from '../editor/use-viewport-camera-store';
import { createWorldRect } from '../editor/viewport-transform';
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
  readonly selectedId: ReturnType<typeof ElementIdSchema.parse>;
} => {
  const projectId = ProjectIdSchema.parse('project_visualscene');
  const boardId = BoardIdSchema.parse('board_visualscene');
  const outerId = ElementIdSchema.parse('element_visualouter');
  const groupId = ElementIdSchema.parse('element_visualgroup');
  const titleId = ElementIdSchema.parse('element_visualtitle');
  const fieldId = ElementIdSchema.parse('element_visualfield');
  const buttonId = ElementIdSchema.parse('element_visualbutton');
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
  return Object.freeze({ boardId, document: result.value, selectedId: buttonId });
};

const SceneFixture = ({ selected = false }: { readonly selected?: boolean }) => {
  const camera = useViewportCameraStore();
  const [fixture] = useState(createSceneFixtureDocument);
  const [editor] = useState(() => {
    const model = new DocumentSceneModel();
    model.reconcile(fixture.document, fixture.boardId);
    const selection = new SelectionStore();
    if (selected) {
      selection.selectOnly(fixture.selectedId);
    }
    return Object.freeze({ model, selection });
  });
  return (
    <ViewportScene
      camera={camera}
      {...(selected
        ? {
            interactionChildren: (
              <SelectionOverlay camera={camera} model={editor.model} selection={editor.selection} />
            ),
          }
        : {})}
      worldChildren={
        <DocumentScene
          activeBoardId={fixture.boardId}
          camera={camera}
          document={fixture.document}
          model={editor.model}
        />
      }
    />
  );
};

const ViewportZoomFixture = ({ platform }: { readonly platform: 'darwin' | 'win32' }) => {
  const camera = useViewportCameraStore();
  const [boardBounds] = useState(() => createWorldRect(0, 0, 1_200, 800));
  return (
    <ViewportZoomControls
      boardBounds={boardBounds}
      camera={camera}
      defaultMenuOpen
      platform={platform}
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
        ? { canvas: <SceneFixture selected /> }
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
    fixture === 'viewportZoom' ? <ViewportZoomFixture platform={platform} /> : undefined;

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
