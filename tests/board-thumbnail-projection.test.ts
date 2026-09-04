// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createCustomIconReference,
  CONTROL_TYPES,
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  createInitialControlRowState,
  getControlSpec,
  parseProjectDocument,
} from '../src/domain';
import {
  BOARD_THUMBNAIL_POLICY,
  createBoardThumbnailProjection,
} from '../src/renderer/projects/board-thumbnail-projection';
import { createBoardPresentationProjection } from '../src/renderer/projects/board-presentation-projection';
import { DESIGN_TOKENS } from '../src/shared/design-tokens';
import {
  createEmptyElementRowDataInput,
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  getFixtureControlProperties,
} from './fixtures/project-document';

describe('board thumbnail projection', () => {
  it('uses canonical nested world geometry and registry-backed scene paths', () => {
    const parsed = parseProjectDocument(createValidProjectDocumentInput());
    if (!parsed.ok) {
      throw new Error('Thumbnail projection fixture is invalid.');
    }
    const projection = createBoardThumbnailProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board);
    if (projection === undefined) {
      throw new Error('Expected an active board projection.');
    }

    expect(projection.items.map((item) => item.id)).toEqual([DOCUMENT_FIXTURE_IDS.child]);
    expect(projection.items[0]?.bounds).toEqual({ x: -4, y: 36.5, width: 120, height: 48 });
    expect(projection.items[0]?.outlinePath).not.toBe('');
    expect(projection.viewBox.width).toBeGreaterThan(120);
    expect(projection.omittedItemCount).toBe(0);
  });

  it('keeps empty boards at a stable 4:3 frame and excludes inactive trash targets', () => {
    const input = createValidProjectDocumentInput();
    input.boardIds = [];
    input.trashedBoardIds = [DOCUMENT_FIXTURE_IDS.board];
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) {
      throw new Error('Trashed thumbnail fixture is invalid.');
    }
    expect(
      createBoardThumbnailProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board),
    ).toBeUndefined();

    input.boardIds = [DOCUMENT_FIXTURE_IDS.board];
    input.trashedBoardIds = [];
    input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds = [];
    input.elementsById = {};
    input.assetsById = {};
    const empty = parseProjectDocument(input);
    if (!empty.ok) {
      throw new Error('Empty thumbnail fixture is invalid.');
    }
    expect(createBoardThumbnailProjection(empty.value, DOCUMENT_FIXTURE_IDS.board)).toMatchObject({
      items: [],
      viewBox: { x: 0, y: 0, width: 4, height: 3 },
    });
  });

  it('carries the registry-backed icon projection into navigator thumbnails', () => {
    const input = createValidProjectDocumentInput();
    const button = getControlSpec(CONTROL_TYPES.button);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (button === undefined || child === undefined) {
      throw new Error('Thumbnail icon fixture is incomplete.');
    }
    child.controlType = button.type;
    child.controlVersion = button.fileVersion;
    child.properties = { ...button.defaultProperties, iconId: 'arrow-right', text: 'Continue' };
    child.assetIds = [];
    input.assetsById = {};
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) {
      throw new Error('Thumbnail icon fixture is invalid.');
    }

    expect(
      createBoardThumbnailProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board)?.items[0]?.icon,
    ).toMatchObject({ definition: { id: 'arrow-right' }, kind: 'catalog' });
  });

  it('carries a project-image icon reference into the shared thumbnail projection', () => {
    const input = createValidProjectDocumentInput();
    const button = getControlSpec(CONTROL_TYPES.button);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (button === undefined || child === undefined) {
      throw new Error('Custom thumbnail icon fixture is incomplete.');
    }
    child.controlType = button.type;
    child.controlVersion = button.fileVersion;
    child.properties = {
      ...button.defaultProperties,
      iconId: createCustomIconReference(DOCUMENT_FIXTURE_IDS.asset),
      text: 'Continue',
    };
    child.assetIds = [DOCUMENT_FIXTURE_IDS.asset];
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) throw new Error('Custom thumbnail icon fixture is invalid.');

    expect(
      createBoardThumbnailProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board)?.items[0]?.icon,
    ).toMatchObject({ assetId: DOCUMENT_FIXTURE_IDS.asset, kind: 'asset' });
  });

  it('keeps Search Box preset geometry identical in navigator and presentation projection', () => {
    const input = createValidProjectDocumentInput();
    const searchBox = getControlSpec(CONTROL_TYPES.searchBox);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (searchBox === undefined || child === undefined) {
      throw new Error('Search Box cross-surface fixture is incomplete.');
    }
    child.controlType = searchBox.type;
    child.controlVersion = searchBox.fileVersion;
    child.properties = {
      ...searchBox.defaultProperties,
      microphoneIcon: true,
      shape: 'rectangular',
    };
    child.assetIds = [];
    input.assetsById = {};
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) throw new Error('Search Box cross-surface fixture is invalid.');

    const thumbnail = createBoardThumbnailProjection(
      parsed.value,
      DOCUMENT_FIXTURE_IDS.board,
    )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);
    const presentation = createBoardPresentationProjection(
      parsed.value,
      DOCUMENT_FIXTURE_IDS.board,
    )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);

    expect(thumbnail).toMatchObject({ visualKind: 'search-box' });
    expect(presentation).toMatchObject({
      accessibleName: 'search',
      role: 'textbox',
      visualKind: 'search-box',
    });
    expect(presentation?.outlinePath).toBe(thumbnail?.outlinePath);
    expect(presentation?.markPath).toBe(thumbnail?.markPath);
  });

  it('keeps Tooltip bubble and text geometry identical in navigator and presentation', () => {
    const input = createValidProjectDocumentInput();
    const tooltip = getControlSpec(CONTROL_TYPES.tooltip);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (tooltip === undefined || child === undefined) {
      throw new Error('Tooltip cross-surface fixture is incomplete.');
    }
    child.controlType = tooltip.type;
    child.controlVersion = tooltip.fileVersion;
    child.frame = { x: 16, y: 24, ...tooltip.defaultSize };
    child.properties = {
      ...tooltip.defaultProperties,
      bold: true,
      direction: 'NW',
      text: 'More details',
    };
    child.assetIds = [];
    input.assetsById = {};
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) throw new Error('Tooltip cross-surface fixture is invalid.');
    const textMeasurementService = {
      measure: ({ fontSize, text }: { fontSize: number; text: string }) => ({
        baselineOffsets: [fontSize],
        height: fontSize * 1.2,
        lineCount: 1,
        lineHeight: fontSize * 1.2,
        lines: [text],
        width: text.length * fontSize * 0.5,
      }),
    };

    const thumbnail = createBoardThumbnailProjection(
      parsed.value,
      DOCUMENT_FIXTURE_IDS.board,
      textMeasurementService,
    )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);
    const presentation = createBoardPresentationProjection(
      parsed.value,
      DOCUMENT_FIXTURE_IDS.board,
      textMeasurementService,
    )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);

    expect(thumbnail).toMatchObject({
      hasFill: false,
      hasOutline: false,
      markFillColor: '#FFFFFF',
      markStrokeColor: '#202428',
      visualKind: 'tooltip',
    });
    expect(thumbnail?.markPath).toContain('Z');
    expect(presentation).toMatchObject({
      accessibleName: 'More details',
      hasFill: false,
      hasOutline: false,
      markFillColor: thumbnail?.markFillColor,
      markPath: thumbnail?.markPath,
      markStrokeColor: thumbnail?.markStrokeColor,
      role: 'img',
      textLayout: thumbnail?.textLayout,
      visualKind: 'tooltip',
    });
  });

  it('keeps edited Callout shape, text, and accessibility identical across surfaces', () => {
    const input = createValidProjectDocumentInput();
    const callout = getControlSpec(CONTROL_TYPES.callout);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (callout === undefined || child === undefined) {
      throw new Error('Callout cross-surface fixture is incomplete.');
    }
    child.controlType = callout.type;
    child.controlVersion = callout.fileVersion;
    child.frame = { x: 16, y: 24, width: 112, height: 56.4 };
    child.properties = {
      ...callout.defaultProperties,
      bold: true,
      color: '#ffcc00',
      opacity: 0.55,
      text: 'Review this\nflow',
    };
    child.assetIds = [];
    input.assetsById = {};
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) throw new Error('Callout cross-surface fixture is invalid.');
    const textMeasurementService = {
      measure: ({ fontSize, text }: { fontSize: number; text: string }) => {
        const lines = text.split('\n');
        const lineHeight = fontSize * 1.4;
        return {
          baselineOffsets: lines.map((_, index) => fontSize + index * lineHeight),
          height: lines.length * lineHeight,
          lineCount: lines.length,
          lineHeight,
          lines,
          width: 80,
        };
      },
    };

    const thumbnail = createBoardThumbnailProjection(
      parsed.value,
      DOCUMENT_FIXTURE_IDS.board,
      textMeasurementService,
    )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);
    const presentation = createBoardPresentationProjection(
      parsed.value,
      DOCUMENT_FIXTURE_IDS.board,
      textMeasurementService,
    )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);

    expect(thumbnail).toMatchObject({
      fillColor: '#ffcc00',
      hasFill: true,
      hasOutline: true,
      opacity: 0.55,
      visualKind: 'callout',
    });
    expect(thumbnail?.outlinePath).toContain('C');
    expect(presentation).toMatchObject({
      accessibleName: 'Review this\nflow',
      fillColor: thumbnail?.fillColor,
      hasFill: thumbnail?.hasFill,
      hasOutline: thumbnail?.hasOutline,
      opacity: thumbnail?.opacity,
      outlinePath: thumbnail?.outlinePath,
      role: 'img',
      textLayout: thumbnail?.textLayout,
      visualKind: thumbnail?.visualKind,
    });
  });

  it('keeps selected Radio Button geometry and enum-backed accessibility identical across surfaces', () => {
    const input = createValidProjectDocumentInput();
    const radio = getControlSpec(CONTROL_TYPES.radioButton);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (radio === undefined || child === undefined) {
      throw new Error('Radio Button cross-surface fixture is incomplete.');
    }
    child.controlType = radio.type;
    child.controlVersion = radio.fileVersion;
    child.frame = { x: 16, y: 24, width: 121, height: 23 };
    child.properties = {
      ...radio.defaultProperties,
      bold: true,
      iconId: 'star',
      state: 'selected',
      text: 'Preferred option',
    };
    child.link = { kind: 'external', url: 'https://example.com/preferred' };
    child.assetIds = [];
    input.assetsById = {};
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) throw new Error('Radio Button cross-surface fixture is invalid.');
    const textMeasurementService = {
      measure: ({ fontSize, text }: { fontSize: number; text: string }) => ({
        baselineOffsets: [fontSize],
        height: fontSize * 1.2,
        lineCount: 1,
        lineHeight: fontSize * 1.2,
        lines: [text],
        width: text.length * fontSize * 0.5,
      }),
    };

    const thumbnail = createBoardThumbnailProjection(
      parsed.value,
      DOCUMENT_FIXTURE_IDS.board,
      textMeasurementService,
    )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);
    const presentation = createBoardPresentationProjection(
      parsed.value,
      DOCUMENT_FIXTURE_IDS.board,
      textMeasurementService,
    )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);

    expect(thumbnail).toMatchObject({
      hasFill: true,
      hasOutline: true,
      icon: { id: 'star', x: 22 },
      markFillColor: DESIGN_TOKENS.color.ink,
      visualKind: 'radio-button',
    });
    expect(thumbnail?.markPath).not.toBe('');
    expect(presentation).toMatchObject({
      accessibleName: 'Preferred option',
      checked: true,
      icon: thumbnail?.icon,
      link: { kind: 'external', url: 'https://example.com/preferred' },
      markPath: thumbnail?.markPath,
      role: 'radio',
      textLayout: thumbnail?.textLayout,
      visualKind: 'radio-button',
    });
  });

  it('keeps edited Date Chooser body, calendar, and accessibility identical across surfaces', () => {
    const input = createValidProjectDocumentInput();
    const chooser = getControlSpec(CONTROL_TYPES.dateChooser);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (chooser === undefined || child === undefined) {
      throw new Error('Date Chooser cross-surface fixture is incomplete.');
    }
    child.controlType = chooser.type;
    child.controlVersion = chooser.fileVersion;
    child.frame = { x: 16, y: 24, width: 106, height: 25 };
    child.properties = {
      ...chooser.defaultProperties,
      borderColor: '#445566',
      italic: true,
      state: 'disabled',
      text: '20/01/2010',
    };
    child.assetIds = [];
    input.assetsById = {};
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) throw new Error('Date Chooser cross-surface fixture is invalid.');
    const textMeasurementService = {
      measure: ({ fontSize, text }: { fontSize: number; text: string }) => ({
        baselineOffsets: [fontSize],
        height: fontSize * 1.2,
        lineCount: 1,
        lineHeight: fontSize * 1.2,
        lines: [text],
        width: text.length * fontSize * 0.5,
      }),
    };

    const thumbnail = createBoardThumbnailProjection(
      parsed.value,
      DOCUMENT_FIXTURE_IDS.board,
      textMeasurementService,
    )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);
    const presentation = createBoardPresentationProjection(
      parsed.value,
      DOCUMENT_FIXTURE_IDS.board,
      textMeasurementService,
    )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);

    expect(thumbnail).toMatchObject({
      disabled: true,
      hasFill: true,
      hasOutline: true,
      opacity: 0.45,
      primitiveBounds: { height: 21, width: 73 },
      strokeColor: '#445566',
      visualKind: 'input',
    });
    expect(thumbnail?.markPath).not.toBe('');
    expect(presentation).toMatchObject({
      accessibleName: '20/01/2010',
      markPath: thumbnail?.markPath,
      role: 'textbox',
      strokeColor: thumbnail?.strokeColor,
      textLayout: thumbnail?.textLayout,
      visualKind: 'input',
    });
  });

  it('keeps edited Num. Stepper text, buttons, and accessibility identical across surfaces', () => {
    const input = createValidProjectDocumentInput();
    const stepper = getControlSpec(CONTROL_TYPES.numericStepper);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (stepper === undefined || child === undefined) {
      throw new Error('Num. Stepper cross-surface fixture is incomplete.');
    }
    child.controlType = stepper.type;
    child.controlVersion = stepper.fileVersion;
    child.frame = { x: 16, y: 24, width: 66, height: 24 };
    child.properties = {
      ...stepper.defaultProperties,
      bold: true,
      borderColor: '#445566',
      state: 'disabled',
      text: '12:35',
    };
    child.assetIds = [];
    input.assetsById = {};
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) throw new Error('Num. Stepper cross-surface fixture is invalid.');
    const textMeasurementService = {
      measure: ({ fontSize, text }: { fontSize: number; text: string }) => ({
        baselineOffsets: [fontSize],
        height: fontSize * 1.2,
        lineCount: 1,
        lineHeight: fontSize * 1.2,
        lines: [text],
        width: text.length * fontSize * 0.5,
      }),
    };

    const thumbnail = createBoardThumbnailProjection(
      parsed.value,
      DOCUMENT_FIXTURE_IDS.board,
      textMeasurementService,
    )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);
    const presentation = createBoardPresentationProjection(
      parsed.value,
      DOCUMENT_FIXTURE_IDS.board,
      textMeasurementService,
    )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);

    expect(thumbnail).toMatchObject({
      disabled: true,
      hasFill: true,
      hasOutline: true,
      opacity: 0.45,
      primitiveBounds: { height: 24, width: 51 },
      strokeColor: '#445566',
      visualKind: 'input',
    });
    expect(thumbnail?.markPath).not.toBe('');
    expect(presentation).toMatchObject({
      accessibleName: '12:35',
      markPath: thumbnail?.markPath,
      role: 'textbox',
      strokeColor: thumbnail?.strokeColor,
      textLayout: thumbnail?.textLayout,
      visualKind: 'input',
    });
  });

  it('keeps styled disabled Text Area geometry and accessibility identical across surfaces', () => {
    const input = createValidProjectDocumentInput();
    const textArea = getControlSpec(CONTROL_TYPES.textArea);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (textArea === undefined || child === undefined) {
      throw new Error('Text Area cross-surface fixture is incomplete.');
    }
    child.controlType = textArea.type;
    child.controlVersion = textArea.fileVersion;
    child.frame = { x: 16, y: 24, width: 200, height: 140 };
    child.link = { kind: 'external', url: 'https://example.com/details' };
    child.properties = {
      ...textArea.defaultProperties,
      bold: true,
      borderColor: '#112233',
      color: '#445566',
      italic: true,
      opacity: 0.6,
      scrollbar: true,
      state: 'disabled',
      text: 'First line\nSecond line',
      textColor: '#778899',
      underline: true,
    };
    child.assetIds = [];
    input.assetsById = {};
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) throw new Error('Text Area cross-surface fixture is invalid.');

    const thumbnail = createBoardThumbnailProjection(
      parsed.value,
      DOCUMENT_FIXTURE_IDS.board,
    )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);
    const presentation = createBoardPresentationProjection(
      parsed.value,
      DOCUMENT_FIXTURE_IDS.board,
    )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);

    expect(thumbnail).toMatchObject({
      borderVisible: true,
      disabled: true,
      fillColor: '#445566',
      strokeColor: '#112233',
      visualKind: 'input',
    });
    expect(thumbnail?.opacity).toBeCloseTo(0.27);
    expect(thumbnail?.markPath).not.toBe('');
    expect(presentation).toMatchObject({
      accessibleName: 'First line\nSecond line',
      disabled: true,
      fillColor: thumbnail?.fillColor,
      markPath: thumbnail?.markPath,
      opacity: thumbnail?.opacity,
      outlinePath: thumbnail?.outlinePath,
      role: 'textbox',
      strokeColor: thumbnail?.strokeColor,
      textLayout: thumbnail?.textLayout,
    });
    expect(parsed.value.elementsById[DOCUMENT_FIXTURE_IDS.child]?.link).toEqual({
      kind: 'external',
      url: 'https://example.com/details',
    });
  });

  it.each([
    ['Subtitle', CONTROL_TYPES.textSubtitle],
    ['Title', CONTROL_TYPES.textTitle],
  ] as const)(
    'keeps styled Text %s geometry identical across thumbnail and presentation',
    (_, type) => {
      const input = createValidProjectDocumentInput();
      const definition = getControlSpec(type);
      const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
      if (definition === undefined || child === undefined) {
        throw new Error('Heading cross-surface fixture is incomplete.');
      }
      child.controlType = definition.type;
      child.controlVersion = definition.fileVersion;
      child.frame = { x: 16, y: 24, ...definition.defaultSize };
      child.link = { kind: 'external', url: 'https://example.com/heading' };
      child.properties = {
        ...definition.defaultProperties,
        bold: true,
        italic: true,
        text: `Styled ${definition.palette?.label ?? 'heading'}`,
        textAlignment: 'end',
        textColor: '#336699',
        underline: true,
      };
      child.assetIds = [];
      input.assetsById = {};
      const parsed = parseProjectDocument(input);
      if (!parsed.ok) throw new Error('Heading cross-surface fixture is invalid.');

      const thumbnail = createBoardThumbnailProjection(
        parsed.value,
        DOCUMENT_FIXTURE_IDS.board,
      )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);
      const presentation = createBoardPresentationProjection(
        parsed.value,
        DOCUMENT_FIXTURE_IDS.board,
      )?.items.find((item) => item.id === DOCUMENT_FIXTURE_IDS.child);

      expect(thumbnail).toMatchObject({
        fillColor: undefined,
        visualKind: 'text',
      });
      expect(presentation).toMatchObject({
        accessibleName: child.properties.text,
        fillColor: thumbnail?.fillColor,
        outlinePath: thumbnail?.outlinePath,
        role: 'img',
        strokeColor: thumbnail?.strokeColor,
        textLayout: thumbnail?.textLayout,
        visualKind: 'text',
      });
      expect(presentation?.link).toEqual(child.link);
    },
  );

  it('bounds SVG complexity while retaining the topmost canonical controls', () => {
    const input = createValidProjectDocumentInput();
    const definition = getControlSpec(FOUNDATION_CONTROL_TYPES.rectangle);
    if (definition === undefined) {
      throw new Error('Rectangle definition is missing.');
    }
    input.elementsById = {};
    input.assetsById = {};
    const ids = Array.from(
      { length: BOARD_THUMBNAIL_POLICY.maximumRenderedElements + 5 },
      (_, index) => ElementIdSchema.parse(`element_thumb${String(index).padStart(6, '0')}`),
    );
    input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds = ids;
    ids.forEach((id, index) => {
      input.elementsById[id] = {
        id,
        controlType: definition.type,
        controlVersion: definition.fileVersion,
        frame: { x: index * 2, y: index, width: 20, height: 10 },
        locked: false,
        properties: getFixtureControlProperties(definition.type),
        childIds: [],
        assetIds: [],
        link: null,
        rowData: createEmptyElementRowDataInput(),
      };
    });
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) {
      throw new Error('Dense thumbnail fixture is invalid.');
    }
    const projection = createBoardThumbnailProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board);
    if (projection === undefined) {
      throw new Error('Dense thumbnail projection is missing.');
    }
    expect(projection.items).toHaveLength(BOARD_THUMBNAIL_POLICY.maximumRenderedElements);
    expect(projection.omittedItemCount).toBe(5);
    expect(projection.items[0]?.id).toBe(ids[5]);
    expect(projection.items.at(-1)?.id).toBe(ids.at(-1));
  });

  it('carries registry-owned scene and text styles without surface-specific interpretation', () => {
    const input = createValidProjectDocumentInput();
    const rectangle = getControlSpec(CONTROL_TYPES.rectangle);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (rectangle === undefined || child === undefined)
      throw new Error('Style fixture is incomplete.');
    child.properties = {
      ...rectangle.defaultProperties,
      borderColor: '#112233',
      borderMode: 'visual-1',
      color: '#445566',
      opacity: 0.35,
    };
    child.assetIds = [];
    input.assetsById = {};
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) throw new Error('Style projection fixture is invalid.');
    expect(
      createBoardThumbnailProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board)?.items[0],
    ).toMatchObject({
      borderVisible: false,
      fillColor: '#445566',
      hasOutline: false,
      opacity: 0.35,
      strokeColor: '#112233',
    });
  });

  it('carries stable selected-row geometry through the shared board-thumbnail projection', () => {
    const input = createValidProjectDocumentInput();
    const buttonBar = getControlSpec(CONTROL_TYPES.buttonBar);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (buttonBar === undefined || child === undefined)
      throw new Error('Row fixture is incomplete.');
    const initial = createInitialControlRowState(
      buttonBar,
      DOCUMENT_FIXTURE_IDS.child,
      buttonBar.defaultProperties,
    );
    if (initial === undefined) throw new Error('Button Bar row state is invalid.');
    child.controlType = buttonBar.type;
    child.controlVersion = buttonBar.fileVersion;
    child.properties = structuredClone(initial.properties) as typeof child.properties;
    child.rowData = structuredClone(initial.rowData) as unknown as typeof child.rowData;
    child.assetIds = [];
    input.assetsById = {};
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) throw new Error('Selected-row thumbnail fixture is invalid.');

    expect(
      createBoardThumbnailProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board, {
        measure: ({ fontSize, text }) => ({
          baselineOffsets: [fontSize],
          height: fontSize * 1.2,
          lineCount: 1,
          lineHeight: fontSize * 1.2,
          lines: [text],
          width: text.length * fontSize * 0.5,
        }),
      })?.items[0]?.selectedRow,
    ).toMatchObject({ id: initial.rowData.bindings[0]?.id, appearance: 'fill' });
  });

  it('carries stacked marker and disabled-row geometry through navigator thumbnails', () => {
    const input = createValidProjectDocumentInput();
    const group = getControlSpec(CONTROL_TYPES.checkboxGroup);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (group === undefined || child === undefined)
      throw new Error('Marker fixture is incomplete.');
    const initial = createInitialControlRowState(
      group,
      DOCUMENT_FIXTURE_IDS.child,
      group.defaultProperties,
    );
    if (initial === undefined) throw new Error('Checkbox Group row state is invalid.');
    child.controlType = group.type;
    child.controlVersion = group.fileVersion;
    child.frame = { x: 0, y: 0, width: 155, height: 149 };
    child.properties = structuredClone(initial.properties) as typeof child.properties;
    child.rowData = structuredClone(initial.rowData) as unknown as typeof child.rowData;
    child.assetIds = [];
    input.assetsById = {};
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) throw new Error('Marker thumbnail fixture is invalid.');
    const item = createBoardThumbnailProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board, {
      measure: ({ fontSize, text }) => ({
        baselineOffsets: [fontSize],
        height: fontSize * 1.2,
        lineCount: 1,
        lineHeight: fontSize * 1.2,
        lines: [text],
        width: text.length * fontSize * 0.5,
      }),
    })?.items[0];

    expect(item?.rows).toHaveLength(7);
    expect(item?.rows[1]?.marker?.strokePath).toContain('L');
    expect(item?.rows[3]?.disabled).toBe(true);
    expect(item?.textLayout?.lines[3]?.opacity).toBe(0.48);
  });

  it('carries Tree Pane hierarchy adornments and selection through navigator thumbnails', () => {
    const input = createValidProjectDocumentInput();
    const treePane = getControlSpec(CONTROL_TYPES.treePane);
    const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
    if (treePane === undefined || child === undefined) {
      throw new Error('Tree Pane thumbnail fixture is incomplete.');
    }
    const initial = createInitialControlRowState(
      treePane,
      DOCUMENT_FIXTURE_IDS.child,
      treePane.defaultProperties,
    );
    if (initial === undefined) throw new Error('Tree Pane row state is invalid.');
    const selectedRowId = initial.rowData.bindings[2]?.id;
    if (selectedRowId === undefined) throw new Error('Tree Pane selected row is missing.');
    child.controlType = treePane.type;
    child.controlVersion = treePane.fileVersion;
    child.frame = { x: 0, y: 0, width: 300, height: 285 };
    child.properties = {
      ...structuredClone(initial.properties),
      selectedRowId,
    };
    child.rowData = structuredClone(initial.rowData) as unknown as typeof child.rowData;
    child.assetIds = [];
    input.assetsById = {};
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) throw new Error('Tree Pane thumbnail fixture is invalid.');
    const item = createBoardThumbnailProjection(parsed.value, DOCUMENT_FIXTURE_IDS.board, {
      measure: ({ fontSize, text }) => ({
        baselineOffsets: text.split('\n').map((_, index) => fontSize * (index + 1)),
        height: text.split('\n').length * fontSize * 1.2,
        lineCount: text.split('\n').length,
        lineHeight: fontSize * 1.2,
        lines: text.split('\n'),
        width: Math.max(...text.split('\n').map((line) => line.length * fontSize * 0.5)),
      }),
    })?.items[0];

    expect(item?.rows).toHaveLength(initial.rowData.bindings.length);
    expect(item?.rows[0]?.adornment?.fillPath).not.toBe('');
    expect(item?.rows[1]?.adornment?.fillPath).not.toBe('');
    expect(item?.rows[2]?.adornment?.strokePath).not.toBe('');
    expect(item?.selectedRow).toMatchObject({ id: selectedRowId, appearance: 'fill' });
  });
});
