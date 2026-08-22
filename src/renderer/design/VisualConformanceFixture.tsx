import { useEffect, useState } from 'react';

import {
  AssetIdSchema,
  BoardIdSchema,
  ComponentIdSchema,
  CONTROL_TYPES,
  DOCUMENT_COMMAND_TYPES,
  EMPTY_ELEMENT_ROW_DATA,
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  PROJECT_DOCUMENT_SCHEMA_VERSION,
  createCustomIconReference,
  createInitialControlRowState,
  dispatchDocumentCommand,
  getControlSpec,
  parseProjectDocument,
  ProjectIdSchema,
  type ProjectDocument,
  type ControlTypeId,
} from '../../domain';
import { DESIGN_TOKENS } from '../../shared/design-tokens';
import type { VisualFixtureName } from '../../shared/visual-fixture';
import {
  PROJECT_WORKFLOW_ALPHA_BUTTON_TEXT,
  PROJECT_WORKFLOW_ALPHA_LAYOUT,
} from '../../shared/project-workflow-alpha';
import { ControlInspector } from '../controls/ControlInspector';
import { listControlLibraryCategories } from '../controls/control-library-query';
import { ControlShelf } from '../controls/ControlShelf';
import { WireframeNavigator } from '../controls/WireframeNavigator';
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
import {
  BoardThumbnailStore,
  createBrowserBoardThumbnailScheduler,
} from '../projects/board-thumbnail-store';
import { PresentationView } from '../projects/PresentationView';
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

const REGISTRY_IMAGE_ASSET_ID = AssetIdSchema.parse('asset_registryimage');
const REGISTRY_SEARCH_BOX_ID = ElementIdSchema.parse('element_registrysearchbox');
const REGISTRY_SEARCH_BOX_ALTERNATE_ID = ElementIdSchema.parse(
  'element_registrysearchboxalternate',
);
const REGISTRY_TEXT_AREA_ID = ElementIdSchema.parse('element_registrytextarea');
const REGISTRY_TEXT_SUBTITLE_ID = ElementIdSchema.parse('element_registrytextsubtitle');
const REGISTRY_TEXT_TITLE_ID = ElementIdSchema.parse('element_registrytexttitle');
const REGISTRY_IMAGE_COLOR = DESIGN_TOKENS.color.accent;
const REGISTRY_IMAGE_DATA_URL = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="18" fill="${REGISTRY_IMAGE_COLOR}" fill-opacity=".2"/><circle cx="42" cy="40" r="17" fill="${REGISTRY_IMAGE_COLOR}" fill-opacity=".72"/><path d="M12 108 49 68l21 19 18-24 20 45Z" fill="${REGISTRY_IMAGE_COLOR}" fill-opacity=".9"/></svg>`,
)}`;

interface VisualConformanceFixtureProps {
  readonly fixture: VisualFixtureName;
  readonly platform: 'darwin' | 'win32';
  readonly quickAddShortcut: string;
  readonly runtimeLabel: string;
}

const requireControlVersion = (type: ControlTypeId): number => {
  const definition = getControlSpec(type);
  if (definition === undefined) {
    throw new Error(`Visual fixture control '${type}' is not registered.`);
  }
  return definition.fileVersion;
};

const requireControlProperties = (
  type: ControlTypeId,
  overrides: Readonly<Record<string, boolean | null | number | string>> = {},
) => {
  const definition = getControlSpec(type);
  if (definition === undefined) {
    throw new Error(`Visual fixture control '${type}' is not registered.`);
  }
  return { ...definition.defaultProperties, ...overrides };
};

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
    schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
    id: projectId,
    name: 'Scene visual fixture',
    boardIds: [boardId],
    componentIds: [],
    trashedBoardIds: [],
    boardsById: {
      [boardId]: {
        id: boardId,
        name: 'Scene',
        note: { text: '' },
        childIds: [outerId, groupId],
        alternateIds: [],
        selectedAlternateId: null,
      },
    },
    componentsById: {},
    elementsById: {
      [outerId]: {
        id: outerId,
        controlType: FOUNDATION_CONTROL_TYPES.rectangle,
        controlVersion: requireControlVersion(FOUNDATION_CONTROL_TYPES.rectangle),
        frame: { x: 160, y: 100, width: 520, height: 380 },
        locked: false,
        properties: requireControlProperties(FOUNDATION_CONTROL_TYPES.rectangle),
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
      [groupId]: {
        id: groupId,
        controlType: FOUNDATION_CONTROL_TYPES.group,
        controlVersion: requireControlVersion(FOUNDATION_CONTROL_TYPES.group),
        frame: { x: 160, y: 100, width: 520, height: 380 },
        locked: false,
        properties: {},
        childIds: [titleId, fieldId, buttonId, sideId],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
      [titleId]: {
        id: titleId,
        controlType: CONTROL_TYPES.textLabel,
        controlVersion: requireControlVersion(CONTROL_TYPES.textLabel),
        frame: { x: 28, y: 28, width: 280, height: 28 },
        locked: false,
        properties: { text: 'Account settings' },
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
      [fieldId]: {
        id: fieldId,
        controlType: CONTROL_TYPES.textInput,
        controlVersion: requireControlVersion(CONTROL_TYPES.textInput),
        frame: { x: 28, y: 96, width: 300, height: 48 },
        locked: false,
        properties: requireControlProperties(CONTROL_TYPES.textInput, {
          text: 'Email address',
        }),
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
      [buttonId]: {
        id: buttonId,
        controlType: CONTROL_TYPES.button,
        controlVersion: requireControlVersion(CONTROL_TYPES.button),
        frame: { x: 28, y: 172, width: 128, height: 44 },
        locked: false,
        properties: requireControlProperties(CONTROL_TYPES.button, {
          iconId: 'arrow-right',
          text: 'Continue',
        }),
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
      [sideId]: {
        id: sideId,
        controlType: FOUNDATION_CONTROL_TYPES.rectangle,
        controlVersion: requireControlVersion(FOUNDATION_CONTROL_TYPES.rectangle),
        frame: { x: 372, y: 28, width: 112, height: 304 },
        locked: false,
        properties: requireControlProperties(FOUNDATION_CONTROL_TYPES.rectangle),
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
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

const createComponentFixtureDocument = (): {
  readonly boardId: ReturnType<typeof BoardIdSchema.parse>;
  readonly componentId: ReturnType<typeof ComponentIdSchema.parse>;
  readonly document: ProjectDocument;
  readonly selectedId: ReturnType<typeof ElementIdSchema.parse>;
} => {
  const projectId = ProjectIdSchema.parse('project_visualcomponent');
  const boardId = BoardIdSchema.parse('board_visualcomponent');
  const componentId = ComponentIdSchema.parse('component_visualcard');
  const rootId = ElementIdSchema.parse('element_visualcomproot');
  const titleId = ElementIdSchema.parse('element_visualcomptitle');
  const buttonId = ElementIdSchema.parse('element_visualcompbutton');
  const selectedId = ElementIdSchema.parse('element_visualcompinst1');
  const secondInstanceId = ElementIdSchema.parse('element_visualcompinst2');
  const result = parseProjectDocument({
    schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
    id: projectId,
    name: 'Component visual fixture',
    boardIds: [boardId],
    componentIds: [componentId],
    trashedBoardIds: [],
    boardsById: {
      [boardId]: {
        id: boardId,
        name: 'Components',
        note: { text: '' },
        childIds: [selectedId, secondInstanceId],
        alternateIds: [],
        selectedAlternateId: null,
      },
    },
    componentsById: {
      [componentId]: { id: componentId, name: 'Reusable Card', rootElementId: rootId },
    },
    elementsById: {
      [rootId]: {
        id: rootId,
        controlType: CONTROL_TYPES.group,
        controlVersion: requireControlVersion(CONTROL_TYPES.group),
        frame: { x: 0, y: 0, width: 300, height: 160 },
        locked: false,
        properties: {},
        childIds: [titleId, buttonId],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
      [titleId]: {
        id: titleId,
        controlType: CONTROL_TYPES.textLabel,
        controlVersion: requireControlVersion(CONTROL_TYPES.textLabel),
        frame: { x: 24, y: 24, width: 220, height: 28 },
        locked: false,
        properties: { text: 'Definition title' },
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
      [buttonId]: {
        id: buttonId,
        controlType: CONTROL_TYPES.button,
        controlVersion: requireControlVersion(CONTROL_TYPES.button),
        frame: { x: 24, y: 88, width: 150, height: 44 },
        locked: false,
        properties: requireControlProperties(CONTROL_TYPES.button, {
          iconId: 'arrow-right',
          text: 'Definition action',
        }),
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
      [selectedId]: {
        id: selectedId,
        controlType: CONTROL_TYPES.componentInstance,
        controlVersion: requireControlVersion(CONTROL_TYPES.componentInstance),
        frame: { x: 70, y: 90, width: 300, height: 160 },
        locked: false,
        properties: {
          componentId,
          overrides: { [buttonId]: { text: 'Instance action' } },
        },
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
      [secondInstanceId]: {
        id: secondInstanceId,
        controlType: CONTROL_TYPES.componentInstance,
        controlVersion: requireControlVersion(CONTROL_TYPES.componentInstance),
        frame: { x: 410, y: 90, width: 300, height: 160 },
        locked: false,
        properties: { componentId, overrides: {} },
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
    },
    assetsById: {},
  });
  if (!result.ok) {
    throw new Error('The deterministic component visual fixture is invalid.');
  }
  return Object.freeze({ boardId, componentId, document: result.value, selectedId });
};

const createAlphaFixtureDocument = (): ReturnType<typeof createSceneFixtureDocument> => {
  const projectId = ProjectIdSchema.parse('project_visualalpha');
  const boardId = BoardIdSchema.parse('board_visualalpha');
  const rectangleId = ElementIdSchema.parse('element_alpharectangle');
  const titleId = ElementIdSchema.parse('element_alphatitle');
  const buttonId = ElementIdSchema.parse('element_alphabutton');
  const inputId = ElementIdSchema.parse('element_alphainput');
  const result = parseProjectDocument({
    schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
    id: projectId,
    name: 'Alpha visual fixture',
    boardIds: [boardId],
    componentIds: [],
    trashedBoardIds: [],
    boardsById: {
      [boardId]: {
        id: boardId,
        name: 'Scene',
        note: { text: '' },
        childIds: [rectangleId, titleId, buttonId, inputId],
        alternateIds: [],
        selectedAlternateId: null,
      },
    },
    componentsById: {},
    elementsById: {
      [rectangleId]: {
        id: rectangleId,
        controlType: CONTROL_TYPES.rectangle,
        controlVersion: requireControlVersion(CONTROL_TYPES.rectangle),
        frame: PROJECT_WORKFLOW_ALPHA_LAYOUT.rectangle,
        locked: false,
        properties: requireControlProperties(CONTROL_TYPES.rectangle),
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
      [titleId]: {
        id: titleId,
        controlType: CONTROL_TYPES.textLabel,
        controlVersion: requireControlVersion(CONTROL_TYPES.textLabel),
        frame: PROJECT_WORKFLOW_ALPHA_LAYOUT.textLabel,
        locked: false,
        properties: { text: 'Account settings' },
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
      [buttonId]: {
        id: buttonId,
        controlType: CONTROL_TYPES.button,
        controlVersion: requireControlVersion(CONTROL_TYPES.button),
        frame: PROJECT_WORKFLOW_ALPHA_LAYOUT.button,
        locked: false,
        properties: requireControlProperties(CONTROL_TYPES.button, {
          iconId: 'arrow-right',
          text: PROJECT_WORKFLOW_ALPHA_BUTTON_TEXT,
        }),
        childIds: [],
        assetIds: [],
        link: { kind: 'board', boardId },
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
      [inputId]: {
        id: inputId,
        controlType: CONTROL_TYPES.textInput,
        controlVersion: requireControlVersion(CONTROL_TYPES.textInput),
        frame: PROJECT_WORKFLOW_ALPHA_LAYOUT.textInput,
        locked: false,
        properties: requireControlProperties(CONTROL_TYPES.textInput, {
          text: 'Email address',
        }),
        childIds: [],
        assetIds: [],
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
      },
    },
    assetsById: {},
  });
  if (!result.ok) {
    throw new Error('The deterministic alpha visual fixture is invalid.');
  }
  return Object.freeze({
    boardId,
    document: result.value,
    duplicateId: ElementIdSchema.parse('element_alphaduplicate'),
    groupId: ElementIdSchema.parse('element_alphagroup'),
    selectedId: buttonId,
  });
};

const createPresentationFixtureDocument = (): Readonly<{
  boardId: ReturnType<typeof BoardIdSchema.parse>;
  document: ProjectDocument;
}> => {
  const fixture = createAlphaFixtureDocument();
  const canonical = fixture.document.boardsById[fixture.boardId];
  const linkedElement = fixture.document.elementsById[fixture.selectedId];
  const alternateId = BoardIdSchema.parse('board_visualpresentalt');
  const detailsId = BoardIdSchema.parse('board_visualpresentdetails');
  if (canonical === undefined || linkedElement === undefined) {
    throw new Error('The presentation visual fixture source is incomplete.');
  }
  const result = parseProjectDocument({
    ...fixture.document,
    boardIds: [fixture.boardId, detailsId],
    boardsById: {
      [fixture.boardId]: {
        ...canonical,
        name: 'Account flow',
        childIds: [],
        alternateIds: [alternateId],
        selectedAlternateId: alternateId,
      },
      [alternateId]: {
        id: alternateId,
        name: 'Client direction',
        note: { text: '' },
        childIds: canonical.childIds,
        alternateIds: [],
        selectedAlternateId: null,
      },
      [detailsId]: {
        id: detailsId,
        name: 'Confirmation',
        note: { text: '' },
        childIds: [],
        alternateIds: [],
        selectedAlternateId: null,
      },
    },
    componentsById: {},
    elementsById: {
      ...fixture.document.elementsById,
      [fixture.selectedId]: {
        ...linkedElement,
        link: { kind: 'board', boardId: detailsId },
      },
    },
  });
  if (!result.ok) {
    throw new Error('The deterministic presentation visual fixture is invalid.');
  }
  return Object.freeze({ boardId: fixture.boardId, document: result.value });
};

const createRegistryControlFixtureDocument = (): ReturnType<typeof createSceneFixtureDocument> => {
  const fixture = createAlphaFixtureDocument();
  const breadcrumbsId = ElementIdSchema.parse('element_registrybreadcrumbs');
  const buttonBarId = ElementIdSchema.parse('element_registrybuttonbar');
  const treePaneId = ElementIdSchema.parse('element_registrytreepane');
  const checkboxId = ElementIdSchema.parse('element_registrycheckbox');
  const browserId = ElementIdSchema.parse('element_registrybrowser');
  const imageId = ElementIdSchema.parse('element_registryimage');
  const arrowId = ElementIdSchema.parse('element_registryarrow');
  const playbackId = ElementIdSchema.parse('element_registryplayback');
  const videoPlayerId = ElementIdSchema.parse('element_registryvideoplayer');
  const volumeSliderId = ElementIdSchema.parse('element_registryvolumeslider');
  const webcamId = ElementIdSchema.parse('element_registrywebcam');
  const breadcrumbsDefinition = getControlSpec(CONTROL_TYPES.breadcrumbs);
  const breadcrumbsProperties = requireControlProperties(CONTROL_TYPES.breadcrumbs);
  const initialBreadcrumbRows =
    breadcrumbsDefinition === undefined
      ? undefined
      : createInitialControlRowState(breadcrumbsDefinition, breadcrumbsId, breadcrumbsProperties)
          ?.rowData;
  if (initialBreadcrumbRows === undefined) {
    throw new Error('The deterministic Breadcrumbs row fixture is invalid.');
  }
  const buttonBarDefinition = getControlSpec(CONTROL_TYPES.buttonBar);
  const buttonBarInitial =
    buttonBarDefinition === undefined
      ? undefined
      : createInitialControlRowState(
          buttonBarDefinition,
          buttonBarId,
          requireControlProperties(CONTROL_TYPES.buttonBar),
        );
  if (buttonBarInitial === undefined) {
    throw new Error('The deterministic Button Bar row fixture is invalid.');
  }
  const treePaneDefinition = getControlSpec(CONTROL_TYPES.treePane);
  const treePaneInitial =
    treePaneDefinition === undefined
      ? undefined
      : createInitialControlRowState(
          treePaneDefinition,
          treePaneId,
          requireControlProperties(CONTROL_TYPES.treePane),
        );
  if (treePaneInitial === undefined) {
    throw new Error('The deterministic Tree Pane row fixture is invalid.');
  }
  const buttonBarRowData = Object.freeze({
    ...buttonBarInitial.rowData,
    bindings: Object.freeze(
      buttonBarInitial.rowData.bindings.map((binding, index) =>
        Object.freeze({
          ...binding,
          link:
            index === 0
              ? Object.freeze({ kind: 'external' as const, url: 'https://example.com/one' })
              : null,
        }),
      ),
    ),
  });
  const breadcrumbsRowData = Object.freeze({
    ...initialBreadcrumbRows,
    bindings: Object.freeze(
      initialBreadcrumbRows.bindings.map((binding, index) =>
        Object.freeze({
          ...binding,
          link:
            index === 0
              ? Object.freeze({
                  kind: 'external' as const,
                  url: 'https://example.com/home',
                })
              : null,
        }),
      ),
    ),
  });
  const treePaneRowData = Object.freeze({
    ...treePaneInitial.rowData,
    bindings: Object.freeze(
      treePaneInitial.rowData.bindings.map((binding, index) =>
        Object.freeze({
          ...binding,
          link:
            index === 8
              ? Object.freeze({
                  kind: 'external' as const,
                  url: 'https://example.com/tree-file',
                })
              : null,
        }),
      ),
    ),
  });
  let document = fixture.document;
  const commands = [
    {
      type: DOCUMENT_COMMAND_TYPES.createAsset,
      asset: {
        id: REGISTRY_IMAGE_ASSET_ID,
        sha256: 'c'.repeat(64),
        mediaType: 'image/svg+xml',
        byteLength: 1,
        originalName: 'registry-image.svg',
      },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.browser,
        controlVersion: requireControlVersion(CONTROL_TYPES.browser),
        frame: { x: 390, y: 50, width: 160, height: 220 },
        id: browserId,
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
        locked: false,
        properties: { borderMode: 'visual-1', color: 'default', scrollbar: true },
      },
      index: fixture.document.boardsById[fixture.boardId]?.childIds.length ?? 0,
      owner: { boardId: fixture.boardId, kind: 'board' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.buttonBar,
        controlVersion: requireControlVersion(CONTROL_TYPES.buttonBar),
        frame: { x: 76, y: 268, width: 240, height: 32 },
        id: buttonBarId,
        link: null,
        rowData: buttonBarRowData,
        locked: false,
        properties: buttonBarInitial.properties,
      },
      index: (fixture.document.boardsById[fixture.boardId]?.childIds.length ?? 0) + 1,
      owner: { boardId: fixture.boardId, kind: 'board' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [REGISTRY_IMAGE_ASSET_ID],
        childIds: [],
        controlType: CONTROL_TYPES.imagePlaceholder,
        controlVersion: requireControlVersion(CONTROL_TYPES.imagePlaceholder),
        frame: { x: 12, y: 64, width: 56, height: 56 },
        id: imageId,
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
        locked: false,
        properties: requireControlProperties(CONTROL_TYPES.imagePlaceholder, {
          showBorder: true,
        }),
      },
      index: 0,
      owner: { elementId: browserId, kind: 'element' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.arrow,
        controlVersion: requireControlVersion(CONTROL_TYPES.arrow),
        frame: { x: 82, y: 72, width: 64, height: 72 },
        id: arrowId,
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
        locked: false,
        properties: {
          color: 'default',
          endArrow: true,
          labelPosition: 0.5,
          opacity: 1,
          routing: 'visual-2',
          startArrow: true,
          strokeStyle: 'dashed',
          text: 'Flow',
        },
      },
      index: 1,
      owner: { elementId: browserId, kind: 'element' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.breadcrumbs,
        controlVersion: requireControlVersion(CONTROL_TYPES.breadcrumbs),
        frame: { x: 76, y: 300, width: 240, height: 28 },
        id: breadcrumbsId,
        link: null,
        rowData: breadcrumbsRowData,
        locked: false,
        properties: breadcrumbsProperties,
      },
      index: (fixture.document.boardsById[fixture.boardId]?.childIds.length ?? 0) + 2,
      owner: { boardId: fixture.boardId, kind: 'board' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.checkbox,
        controlVersion: requireControlVersion(CONTROL_TYPES.checkbox),
        frame: { x: 76, y: 340, width: 180, height: 32 },
        id: checkboxId,
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
        locked: false,
        properties: requireControlProperties(CONTROL_TYPES.checkbox, {
          checked: true,
          text: 'Remember me',
        }),
      },
      index: (fixture.document.boardsById[fixture.boardId]?.childIds.length ?? 0) + 2,
      owner: { boardId: fixture.boardId, kind: 'board' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.playback,
        controlVersion: requireControlVersion(CONTROL_TYPES.playback),
        frame: { x: 76, y: 360, width: 110, height: 36 },
        id: playbackId,
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
        locked: false,
        properties: {},
      },
      index: (fixture.document.boardsById[fixture.boardId]?.childIds.length ?? 0) + 3,
      owner: { boardId: fixture.boardId, kind: 'board' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.videoPlayer,
        controlVersion: requireControlVersion(CONTROL_TYPES.videoPlayer),
        frame: { x: 202, y: 372, width: 144, height: 96 },
        id: videoPlayerId,
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
        locked: false,
        properties: {},
      },
      index: (fixture.document.boardsById[fixture.boardId]?.childIds.length ?? 0) + 4,
      owner: { boardId: fixture.boardId, kind: 'board' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.volumeSlider,
        controlVersion: requireControlVersion(CONTROL_TYPES.volumeSlider),
        frame: { x: 76, y: 420, width: 96, height: 20 },
        id: volumeSliderId,
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
        locked: false,
        properties: {},
      },
      index: (fixture.document.boardsById[fixture.boardId]?.childIds.length ?? 0) + 5,
      owner: { boardId: fixture.boardId, kind: 'board' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.webcam,
        controlVersion: requireControlVersion(CONTROL_TYPES.webcam),
        frame: { x: 274, y: 286, width: 96, height: 72 },
        id: webcamId,
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
        locked: false,
        properties: {},
      },
      index: (fixture.document.boardsById[fixture.boardId]?.childIds.length ?? 0) + 6,
      owner: { boardId: fixture.boardId, kind: 'board' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.treePane,
        controlVersion: requireControlVersion(CONTROL_TYPES.treePane),
        frame: { x: 330, y: 286, width: 255, height: 181 },
        id: treePaneId,
        link: null,
        rowData: treePaneRowData,
        locked: false,
        properties: {
          ...treePaneInitial.properties,
          selectedRowId: treePaneInitial.rowData.bindings[8]?.id ?? null,
        },
      },
      index: (fixture.document.boardsById[fixture.boardId]?.childIds.length ?? 0) + 7,
      owner: { boardId: fixture.boardId, kind: 'board' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.searchBox,
        controlVersion: requireControlVersion(CONTROL_TYPES.searchBox),
        frame: { x: 76, y: 226, width: 120, height: 25 },
        id: REGISTRY_SEARCH_BOX_ID,
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
        locked: false,
        properties: requireControlProperties(CONTROL_TYPES.searchBox),
      },
      index: (fixture.document.boardsById[fixture.boardId]?.childIds.length ?? 0) + 8,
      owner: { boardId: fixture.boardId, kind: 'board' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.searchBox,
        controlVersion: requireControlVersion(CONTROL_TYPES.searchBox),
        frame: { x: 214, y: 226, width: 120, height: 25 },
        id: REGISTRY_SEARCH_BOX_ALTERNATE_ID,
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
        locked: false,
        properties: requireControlProperties(CONTROL_TYPES.searchBox, {
          microphoneIcon: true,
          shape: 'rectangular',
        }),
      },
      index: (fixture.document.boardsById[fixture.boardId]?.childIds.length ?? 0) + 9,
      owner: { boardId: fixture.boardId, kind: 'board' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.textArea,
        controlVersion: requireControlVersion(CONTROL_TYPES.textArea),
        frame: { x: 590, y: 226, width: 200, height: 140 },
        id: REGISTRY_TEXT_AREA_ID,
        link: { kind: 'external', url: 'https://example.com/notes' },
        rowData: EMPTY_ELEMENT_ROW_DATA,
        locked: false,
        properties: requireControlProperties(CONTROL_TYPES.textArea, {
          bold: true,
          opacity: 0.82,
          scrollbar: true,
          text: 'First line\nSecond line',
        }),
      },
      index: (fixture.document.boardsById[fixture.boardId]?.childIds.length ?? 0) + 10,
      owner: { boardId: fixture.boardId, kind: 'board' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.textSubtitle,
        controlVersion: requireControlVersion(CONTROL_TYPES.textSubtitle),
        frame: { x: 590, y: 384, width: 102, height: 28 },
        id: REGISTRY_TEXT_SUBTITLE_ID,
        link: null,
        rowData: EMPTY_ELEMENT_ROW_DATA,
        locked: false,
        properties: requireControlProperties(CONTROL_TYPES.textSubtitle),
      },
      index: (fixture.document.boardsById[fixture.boardId]?.childIds.length ?? 0) + 11,
      owner: { boardId: fixture.boardId, kind: 'board' },
    },
    {
      type: DOCUMENT_COMMAND_TYPES.createElement,
      element: {
        assetIds: [],
        childIds: [],
        controlType: CONTROL_TYPES.textTitle,
        controlVersion: requireControlVersion(CONTROL_TYPES.textTitle),
        frame: { x: 590, y: 424, width: 182, height: 44 },
        id: REGISTRY_TEXT_TITLE_ID,
        link: { kind: 'external', url: 'https://example.com/title' },
        rowData: EMPTY_ELEMENT_ROW_DATA,
        locked: false,
        properties: requireControlProperties(CONTROL_TYPES.textTitle, {
          textColor: DESIGN_TOKENS.color.accent,
        }),
      },
      index: (fixture.document.boardsById[fixture.boardId]?.childIds.length ?? 0) + 12,
      owner: { boardId: fixture.boardId, kind: 'board' },
    },
  ] as const;
  for (const command of commands) {
    const result = dispatchDocumentCommand(document, command);
    if (!result.ok || !result.changed) {
      throw new Error('The deterministic registry-control fixture is invalid.');
    }
    document = result.document;
  }
  return Object.freeze({ ...fixture, document, selectedId: treePaneId });
};

const createSearchBoxFixtureDocument = (): ReturnType<typeof createSceneFixtureDocument> =>
  Object.freeze({
    ...createRegistryControlFixtureDocument(),
    selectedId: REGISTRY_SEARCH_BOX_ALTERNATE_ID,
  });

const createTextAreaFixtureDocument = (): ReturnType<typeof createSceneFixtureDocument> =>
  Object.freeze({
    ...createRegistryControlFixtureDocument(),
    selectedId: REGISTRY_TEXT_AREA_ID,
  });

const createTextHeadingsFixtureDocument = (): ReturnType<typeof createSceneFixtureDocument> =>
  Object.freeze({
    ...createRegistryControlFixtureDocument(),
    selectedId: REGISTRY_TEXT_TITLE_ID,
  });

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
  | 'alpha'
  | 'alignSelection'
  | 'customIcon'
  | 'delete'
  | 'duplicate'
  | 'equalGaps'
  | 'groupSelection'
  | 'marquee'
  | 'move'
  | 'nudge'
  | 'paste'
  | 'plain'
  | 'registryControl'
  | 'searchBox'
  | 'textArea'
  | 'textHeadings'
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
  // The representative Browser sits beside the alpha controls. A fixed
  // session-only zoom keeps it and both children visible inside the minimum
  // native canvas without changing document geometry or shell tracks.
  const isRegistryFixture =
    state === 'registryControl' ||
    state === 'searchBox' ||
    state === 'textArea' ||
    state === 'textHeadings';
  const camera = useViewportCameraStore(isRegistryFixture ? 0.8 : 1);
  const [fixture] = useState(() =>
    state === 'alpha' || state === 'customIcon'
      ? createAlphaFixtureDocument()
      : isRegistryFixture
        ? state === 'searchBox'
          ? createSearchBoxFixtureDocument()
          : state === 'textArea'
            ? createTextAreaFixtureDocument()
            : state === 'textHeadings'
              ? createTextHeadingsFixtureDocument()
              : createRegistryControlFixtureDocument()
        : createSceneFixtureDocument(),
  );
  const [document] = useState(() => {
    if (state === 'customIcon') {
      const withAsset = dispatchDocumentCommand(fixture.document, {
        type: DOCUMENT_COMMAND_TYPES.createAsset,
        asset: {
          id: REGISTRY_IMAGE_ASSET_ID,
          sha256: 'c'.repeat(64),
          mediaType: 'image/svg+xml',
          byteLength: REGISTRY_IMAGE_DATA_URL.length,
          originalName: 'Imported brand mark',
        },
      });
      if (!withAsset.ok || !withAsset.changed) {
        throw new Error('The custom-icon visual fixture asset could not be created.');
      }
      const withOwnership = dispatchDocumentCommand(withAsset.document, {
        type: DOCUMENT_COMMAND_TYPES.setElementAssets,
        elementId: fixture.selectedId,
        assetIds: [REGISTRY_IMAGE_ASSET_ID],
      });
      if (!withOwnership.ok || !withOwnership.changed) {
        throw new Error('The custom-icon visual fixture ownership could not be created.');
      }
      const element = withOwnership.document.elementsById[fixture.selectedId];
      const withIcon =
        element === undefined
          ? undefined
          : dispatchDocumentCommand(withOwnership.document, {
              type: DOCUMENT_COMMAND_TYPES.setElementProperties,
              elementId: element.id,
              properties: {
                ...element.properties,
                iconId: createCustomIconReference(REGISTRY_IMAGE_ASSET_ID),
              },
            });
      if (withIcon === undefined || !withIcon.ok || !withIcon.changed) {
        throw new Error('The custom-icon visual fixture property could not be created.');
      }
      return withIcon.document;
    }
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
      state === 'alpha' ||
      state === 'customIcon' ||
      state === 'move' ||
      state === 'smartGuides' ||
      state === 'equalGaps' ||
      state === 'nudge' ||
      state === 'resize' ||
      state === 'groupSelection' ||
      state === 'duplicate' ||
      state === 'paste' ||
      state === 'textEdit' ||
      isRegistryFixture
    ) {
      selection.selectOnly(selectedId);
    }
    const moveInteraction = new MoveInteraction(
      {
        capture: (ids) => captureMoveTargets(document, ids),
        commit: () => false,
        ...(state === 'smartGuides' || state === 'equalGaps'
          ? {
              resolveSnap: ({ activeAxes, capture, previousLocks, rawDelta, snapBypassed }) => {
                const zoom = camera.getTransformSnapshot().zoom;
                return resolveSnap({
                  activeAxes,
                  bypass: snapBypassed,
                  candidates: createSceneSnapCandidates(model, {
                    activeAxes,
                    ...(capture.sharedOwner === undefined
                      ? {}
                      : { equalGapOwner: capture.sharedOwner }),
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
    if (state === 'move' || state === 'smartGuides' || state === 'equalGaps') {
      moveInteraction.begin({
        pointerId: 2,
        snapBypassed: false,
        shiftKey: false,
        startWorldPoint: createWorldPoint(0, 0),
        targetIds: [fixture.selectedId],
        worldPoint:
          state === 'smartGuides'
            ? createWorldPoint(0, -30)
            : state === 'equalGaps'
              ? createWorldPoint(0, 12)
              : createWorldPoint(120, 60),
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
      state === 'alpha' ||
      state === 'customIcon' ||
      state === 'move' ||
      state === 'smartGuides' ||
      state === 'equalGaps' ||
      state === 'nudge' ||
      state === 'resize' ||
      state === 'alignSelection' ||
      state === 'groupSelection' ||
      state === 'duplicate' ||
      state === 'paste' ||
      state === 'textEdit' ||
      isRegistryFixture
        ? {
            interactionChildren: (
              <>
                {state === 'smartGuides' || state === 'equalGaps' || state === 'resize' ? (
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
                  {...(state === 'move' || state === 'smartGuides' || state === 'equalGaps'
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
          {...(isRegistryFixture || state === 'customIcon'
            ? { assetUrls: { [REGISTRY_IMAGE_ASSET_ID]: REGISTRY_IMAGE_DATA_URL } }
            : {})}
          camera={camera}
          document={document}
          {...(state === 'nudge'
            ? { keyboardNudgeInteraction: editor.keyboardNudgeInteraction }
            : {})}
          model={editor.model}
          {...(state === 'move' || state === 'smartGuides' || state === 'equalGaps'
            ? { moveInteraction: editor.moveInteraction }
            : {})}
          {...(state === 'resize' ? { resizeInteraction: editor.resizeInteraction } : {})}
        />
      }
    />
  );
};

const ComponentCanvasFixture = () => {
  const camera = useViewportCameraStore(0.85);
  const [fixture] = useState(createComponentFixtureDocument);
  const [editor] = useState(() => {
    const model = new DocumentSceneModel();
    model.reconcile(fixture.document, fixture.boardId);
    const selection = new SelectionStore();
    selection.selectOnly(fixture.selectedId);
    return Object.freeze({ model, selection });
  });
  return (
    <ViewportScene
      camera={camera}
      interactionChildren={
        <SelectionOverlay camera={camera} model={editor.model} selection={editor.selection} />
      }
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

const ComponentInspectorFixture = () => {
  const [fixture] = useState(createComponentFixtureDocument);
  const [selection] = useState(() => {
    const store = new SelectionStore();
    store.selectOnly(fixture.selectedId);
    return store;
  });
  return (
    <ControlInspector
      document={fixture.document}
      onAutoSize={() => Promise.resolve(false)}
      onSetFrames={() => false}
      onSetProperties={() => false}
      selection={selection}
    />
  );
};

const ComponentShelfFixture = () => {
  const [fixture] = useState(createComponentFixtureDocument);
  const component = fixture.document.componentsById[fixture.componentId];
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('[aria-label="Manage Reusable Card"]')?.click();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);
  if (component === undefined) throw new Error('The component shelf fixture is incomplete.');
  return (
    <ControlShelf
      category="Components"
      components={[component]}
      onDeleteComponent={() => false}
      onDuplicateComponent={() => false}
      onInsert={() => false}
      onInsertComponent={() => false}
      onRenameComponent={() => false}
      onReorderComponent={() => false}
      projectDocument={fixture.document}
    />
  );
};

const ComponentNavigatorFixture = () => {
  const [fixture] = useState(createComponentFixtureDocument);
  const [thumbnailStore] = useState(
    () => new BoardThumbnailStore({ scheduler: createBrowserBoardThumbnailScheduler() }),
  );
  useEffect(() => {
    thumbnailStore.generate(fixture.document);
    return () => thumbnailStore.dispose();
  }, [fixture.document, thumbnailStore]);
  return (
    <WireframeNavigator
      activeBoardId={fixture.boardId}
      document={fixture.document}
      onCreateAlternate={() => true}
      onDuplicateBoard={() => true}
      onDuplicateAlternate={() => true}
      onMergeAlternate={() => true}
      onPromoteAlternate={() => true}
      onRenameAlternate={() => true}
      onRenameBoard={() => true}
      onRequestTrashBoard={() => undefined}
      onReorderBoard={() => true}
      onRequestDiscardAlternate={() => undefined}
      onRestoreBoard={() => true}
      onSelectBoard={() => undefined}
      onSelectVersion={() => true}
      shortcutPlatform="darwin"
      thumbnailStore={thumbnailStore}
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

const AlphaInspectorFixture = ({
  showProjectImage = false,
}: {
  readonly showProjectImage?: boolean;
}) => {
  const [fixture] = useState(createAlphaFixtureDocument);
  const [selection] = useState(() => {
    const store = new SelectionStore();
    store.selectOnly(fixture.selectedId);
    return store;
  });
  return (
    <ControlInspector
      customIcons={
        showProjectImage
          ? [
              {
                assetId: REGISTRY_IMAGE_ASSET_ID,
                label: 'Imported brand mark',
                url: REGISTRY_IMAGE_DATA_URL,
              },
            ]
          : []
      }
      document={fixture.document}
      onAutoSize={() => Promise.resolve(false)}
      onSetFrames={() => false}
      onSetProperties={() => false}
      selection={selection}
    />
  );
};

const IconPickerInspectorFixture = () => {
  useEffect(() => {
    queueMicrotask(() => {
      const trigger = globalThis.document.querySelector<HTMLButtonElement>(
        '.app-icon-popover__trigger',
      );
      trigger?.click();
    });
  }, []);
  return <AlphaInspectorFixture showProjectImage />;
};

const RegistryControlInspectorFixture = () => {
  const [fixture] = useState(createRegistryControlFixtureDocument);
  const [selection] = useState(() => {
    const store = new SelectionStore();
    store.selectOnly(fixture.selectedId);
    return store;
  });
  return (
    <ControlInspector
      document={fixture.document}
      onAutoSize={() => Promise.resolve(false)}
      onSetFrames={() => false}
      onSetProperties={() => false}
      selection={selection}
    />
  );
};

const SearchBoxInspectorFixture = () => {
  const [fixture] = useState(createSearchBoxFixtureDocument);
  const [selection] = useState(() => {
    const store = new SelectionStore();
    store.selectOnly(fixture.selectedId);
    return store;
  });
  return (
    <ControlInspector
      document={fixture.document}
      onAutoSize={() => Promise.resolve(false)}
      onSetFrames={() => false}
      onSetLinks={() => false}
      onSetProperties={() => false}
      selection={selection}
    />
  );
};

const TextAreaInspectorFixture = () => {
  const [fixture] = useState(createTextAreaFixtureDocument);
  const [selection] = useState(() => {
    const store = new SelectionStore();
    store.selectOnly(fixture.selectedId);
    return store;
  });
  return (
    <ControlInspector
      document={fixture.document}
      onAutoSize={() => Promise.resolve(false)}
      onSetFrames={() => false}
      onSetLinks={() => false}
      onSetProperties={() => false}
      selection={selection}
    />
  );
};

const TextHeadingsInspectorFixture = () => {
  const [fixture] = useState(createTextHeadingsFixtureDocument);
  const [selection] = useState(() => {
    const store = new SelectionStore();
    store.selectOnly(fixture.selectedId);
    return store;
  });
  return (
    <ControlInspector
      document={fixture.document}
      onAutoSize={() => Promise.resolve(false)}
      onSetFrames={() => false}
      onSetLinks={() => false}
      onSetProperties={() => false}
      selection={selection}
    />
  );
};

const AlphaNavigatorFixture = () => {
  const [fixture] = useState(createAlphaFixtureDocument);
  const [thumbnailStore] = useState(
    () => new BoardThumbnailStore({ scheduler: createBrowserBoardThumbnailScheduler() }),
  );
  useEffect(() => {
    thumbnailStore.generate(fixture.document);
    return () => thumbnailStore.dispose();
  }, [fixture.document, thumbnailStore]);
  return (
    <WireframeNavigator
      activeBoardId={fixture.boardId}
      document={fixture.document}
      onCreateAlternate={() => true}
      onDuplicateBoard={() => true}
      onDuplicateAlternate={() => true}
      onMergeAlternate={() => true}
      onPromoteAlternate={() => true}
      onRenameAlternate={() => true}
      onRenameBoard={() => true}
      onRequestTrashBoard={() => undefined}
      onReorderBoard={() => true}
      onRequestDiscardAlternate={() => undefined}
      onRestoreBoard={() => true}
      onSelectBoard={() => undefined}
      onSelectVersion={() => true}
      shortcutPlatform="darwin"
      thumbnailStore={thumbnailStore}
    />
  );
};

export const VisualConformanceFixture = ({
  fixture,
  platform,
  quickAddShortcut,
  runtimeLabel,
}: VisualConformanceFixtureProps) => {
  const presentationFixture =
    fixture === 'presentation' ? createPresentationFixtureDocument() : undefined;
  const regionContent =
    fixture === 'scene'
      ? { canvas: <SceneFixture /> }
      : fixture === 'selection'
        ? { canvas: <SceneFixture state="selection" /> }
        : fixture === 'move'
          ? { canvas: <SceneFixture state="move" /> }
          : fixture === 'smartGuides'
            ? { canvas: <SceneFixture state="smartGuides" /> }
            : fixture === 'equalGaps'
              ? { canvas: <SceneFixture state="equalGaps" /> }
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
                                : fixture === 'mvpAlpha'
                                  ? {
                                      canvas: <SceneFixture state="alpha" />,
                                      inspector: <AlphaInspectorFixture />,
                                      navigator: <AlphaNavigatorFixture />,
                                      shelf: <ControlShelf onInsert={() => false} />,
                                    }
                                  : fixture === 'iconPicker'
                                    ? {
                                        canvas: <SceneFixture state="customIcon" />,
                                        inspector: <IconPickerInspectorFixture />,
                                        shelf: <ControlShelf onInsert={() => false} />,
                                      }
                                    : fixture === 'components'
                                      ? {
                                          canvas: <ComponentCanvasFixture />,
                                          inspector: <ComponentInspectorFixture />,
                                          navigator: <ComponentNavigatorFixture />,
                                          shelf: <ComponentShelfFixture />,
                                        }
                                      : fixture === 'registryControl'
                                        ? {
                                            canvas: <SceneFixture state="registryControl" />,
                                            inspector: <RegistryControlInspectorFixture />,
                                            shelf: <ControlShelf onInsert={() => false} />,
                                          }
                                        : fixture === 'searchBox'
                                          ? {
                                              canvas: <SceneFixture state="searchBox" />,
                                              inspector: <SearchBoxInspectorFixture />,
                                              shelf: (
                                                <ControlShelf
                                                  category="Forms"
                                                  onInsert={() => false}
                                                />
                                              ),
                                            }
                                          : fixture === 'textArea'
                                            ? {
                                                canvas: <SceneFixture state="textArea" />,
                                                inspector: <TextAreaInspectorFixture />,
                                                shelf: (
                                                  <ControlShelf
                                                    category="Forms"
                                                    onInsert={() => false}
                                                  />
                                                ),
                                              }
                                            : fixture === 'textHeadings'
                                              ? {
                                                  canvas: <SceneFixture state="textHeadings" />,
                                                  inspector: <TextHeadingsInspectorFixture />,
                                                  shelf: (
                                                    <ControlShelf
                                                      category="Text"
                                                      onInsert={() => false}
                                                    />
                                                  ),
                                                }
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
    ) : presentationFixture === undefined ? undefined : (
      <PresentationView
        document={presentationFixture.document}
        initialBoardId={presentationFixture.boardId}
        onExit={() => undefined}
        onOpenExternal={() => Promise.resolve(true)}
      />
    );
  const viewportControls =
    fixture === 'viewportZoom' ? (
      <ViewportZoomFixture platform={platform} />
    ) : fixture === 'viewportSelectionZoom' ? (
      <ViewportZoomFixture platform={platform} withSelection />
    ) : undefined;
  const inspectorControlType =
    fixture === 'mvpAlpha' || fixture === 'iconPicker'
      ? CONTROL_TYPES.button
      : fixture === 'registryControl'
        ? CONTROL_TYPES.treePane
        : fixture === 'searchBox'
          ? CONTROL_TYPES.searchBox
          : fixture === 'textArea'
            ? CONTROL_TYPES.textArea
            : fixture === 'textHeadings'
              ? CONTROL_TYPES.textTitle
              : undefined;
  const inspectorTitle =
    fixture === 'components'
      ? 'Reusable Card'
      : inspectorControlType === undefined
        ? undefined
        : getControlSpec(inspectorControlType)?.palette?.label;

  return (
    <AppShell
      {...(fixture === 'components'
        ? {
            controlCategoryNavigation: {
              activeCategory: 'Components',
              categories: listControlLibraryCategories(),
              onSelectCategory: () => undefined,
            },
          }
        : {})}
      {...(inspectorTitle === undefined ? {} : { inspectorTitle })}
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
