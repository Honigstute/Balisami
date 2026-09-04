// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  CONTROL_TYPES,
  ElementIdSchema,
  createElementRowId,
  createInitialControlRowState,
  getControlSpec,
  type ElementProperties,
} from '../src/domain';
import { createControlRowSceneProjections } from '../src/renderer/controls/control-row-scene-projection';
import { createAccordionLayout } from '../src/renderer/controls/control-accordion-scene';
import { createControlSceneProjection } from '../src/renderer/controls/control-scene-projection';
import type { ControlSceneTextLayout } from '../src/renderer/controls/control-scene-text-layout';
import {
  createControlTextMeasurementService,
  type ControlTextMeasurementService,
} from '../src/renderer/controls/control-text-measurement';
import { createWorldRect } from '../src/renderer/editor/viewport-transform';
import { DESIGN_TOKENS } from '../src/shared/design-tokens';

const ELEMENT_ID = ElementIdSchema.parse('element_rowscene01');

const createMeasurementService = () => {
  const width = (text: string): number =>
    [...text].reduce((total, character) => total + (character === 'W' ? 11 : 3), 0);
  const measure = vi.fn((request: Parameters<ControlTextMeasurementService['measure']>[0]) => ({
    baselineOffsets: [10],
    height: 16,
    lineCount: 1,
    lineHeight: 16,
    lines: [request.text],
    width: width(request.text),
  }));
  return Object.freeze({ measure, width });
};

const createRealMeasurementService = () =>
  createControlTextMeasurementService({
    font: '',
    measureText: (text) => ({
      actualBoundingBoxAscent: 9,
      actualBoundingBoxDescent: 3,
      width: [...text].reduce((width, character) => width + (character === 'W' ? 11 : 5), 0),
    }),
    textBaseline: 'top',
  });

const createLayout = (
  source: string,
  textAnchor: ControlSceneTextLayout['textAnchor'],
  x: number,
  width: number,
): ControlSceneTextLayout =>
  Object.freeze({
    color: undefined,
    fontSize: 17,
    fontStyle: 'italic',
    fontWeight: 'bold',
    lines: Object.freeze([Object.freeze({ baselineY: 20, text: source, x })]),
    textAnchor,
    textDecoration: 'none',
    width,
  });

describe('canonical parsed-row scene projection', () => {
  it.each([
    ['start', 30],
    ['middle', 100],
    ['end', 150],
  ] as const)('measures proportional prefixes and separators for %s alignment', (textAnchor, x) => {
    const definition = getControlSpec(CONTROL_TYPES.breadcrumbs);
    if (definition === undefined) throw new Error('Breadcrumbs definition is missing.');
    const source = 'Wide › i › Mid';
    const service = createMeasurementService();
    const properties: ElementProperties = Object.freeze({
      ...definition.defaultProperties,
      bold: true,
      italic: true,
      items: source,
    });
    const rowData = Object.freeze({
      version: 1 as const,
      nextId: 3,
      bindings: Object.freeze(
        [0, 1, 2].map((generation) =>
          Object.freeze({
            generation,
            id: createElementRowId(ELEMENT_ID, generation),
            link: null,
          }),
        ),
      ),
    });
    const sourceWidth = service.width(source);
    const expectedLeft =
      textAnchor === 'middle' ? x - sourceWidth / 2 : textAnchor === 'end' ? x - sourceWidth : x;
    const result = createControlRowSceneProjections(
      definition,
      properties,
      rowData,
      createLayout(source, textAnchor, x, sourceWidth),
      service,
      createWorldRect(10, 12, 200, 28),
    );

    expect(result.map((row) => [row.label, row.bounds.x, row.bounds.width])).toEqual([
      ['Wide', expectedLeft, service.width('Wide')],
      ['i', expectedLeft + service.width('Wide › '), service.width('i')],
      ['Mid', expectedLeft + service.width('Wide › i › '), service.width('Mid')],
    ]);
    expect(service.measure).toHaveBeenCalledWith(
      expect.objectContaining({ fontSize: 17, fontStyle: 'italic', fontWeight: 'bold' }),
    );
  });

  it('returns no invented row geometry without canonical text measurement', () => {
    const definition = getControlSpec(CONTROL_TYPES.breadcrumbs);
    if (definition === undefined) throw new Error('Breadcrumbs definition is missing.');
    expect(
      createControlRowSceneProjections(
        definition,
        definition.defaultProperties,
        Object.freeze({ version: 1, nextId: 0, bindings: Object.freeze([]) }),
        undefined,
        undefined,
        createWorldRect(0, 0, 200, 28),
      ),
    ).toEqual([]);
  });

  it('projects selected segments and dividers from one canonical measured row collection', () => {
    const definition = getControlSpec(CONTROL_TYPES.buttonBar);
    if (definition === undefined) throw new Error('Button Bar definition is missing.');
    const initial = createInitialControlRowState(
      definition,
      ELEMENT_ID,
      definition.defaultProperties,
    );
    if (initial === undefined) throw new Error('Button Bar row state is invalid.');
    const service = createMeasurementService();
    const bounds = createWorldRect(10, 20, 180, 28);
    const projection = createControlSceneProjection({
      bounds,
      definition,
      identity: ELEMENT_ID,
      properties: initial.properties,
      rowData: initial.rowData,
      textMeasurementService: service,
    });

    expect(projection.rows).toHaveLength(3);
    expect(projection.selectedRow).toMatchObject({
      appearance: 'fill',
      bounds: projection.rows[0]?.bounds,
      id: initial.properties.selectedRowId,
    });
    expect(projection.rows[0]?.bounds.x).toBe(bounds.x);
    const lastRow = projection.rows.at(-1);
    expect(lastRow).toBeDefined();
    expect((lastRow?.bounds.x ?? 0) + (lastRow?.bounds.width ?? 0)).toBe(bounds.x + bounds.width);
    expect(projection.rowSeparatorPath.split('M ')).toHaveLength(3);
    expect(projection.textLayout?.lines.map((line) => line.text)).toEqual(['One', 'Two', 'Three']);
    expect(service.measure.mock.calls.flatMap(([request]) => request.text)).not.toContain('|');
    expect(Object.isFrozen(projection.rows)).toBe(true);
  });

  it('projects stacked markers and derives every baseline from its resized row cell', () => {
    const definition = getControlSpec(CONTROL_TYPES.checkboxGroup);
    if (definition === undefined) throw new Error('Checkbox Group definition is missing.');
    const initial = createInitialControlRowState(
      definition,
      ELEMENT_ID,
      definition.defaultProperties,
    );
    if (initial === undefined) throw new Error('Checkbox Group row state is invalid.');
    const bounds = createWorldRect(10, 20, 240, 350);
    const projection = createControlSceneProjection({
      bounds,
      definition,
      identity: ELEMENT_ID,
      properties: initial.properties,
      rowData: initial.rowData,
      textMeasurementService: createRealMeasurementService(),
    });

    expect(projection.rows).toHaveLength(7);
    expect(projection.rows.map((row) => row.marker === null)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(projection.rows.map(({ disabled }) => disabled)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
      false,
    ]);
    for (const [index, row] of projection.rows.entries()) {
      expect(row.baselineY).toBeGreaterThan(row.bounds.y);
      expect(row.baselineY).toBeLessThan(row.bounds.y + row.bounds.height);
      expect(projection.textLayout?.lines[index]?.baselineY).toBe(row.baselineY);
    }
    expect(
      projection.rows
        .slice(1)
        .map((row, index) => row.baselineY - projection.rows[index]!.baselineY),
    ).toEqual([50, 50, 50, 50, 50, 50]);
    expect(projection.textLayout?.lines.map(({ opacity }) => opacity ?? 1)).toEqual([
      1, 1, 1, 0.48, 0.48, 0.48, 1,
    ]);
  });

  it('keeps dense maximum-row marker geometry finite at the minimum frame height', () => {
    const definition = getControlSpec(CONTROL_TYPES.radioButtonGroup);
    if (definition === undefined) throw new Error('Radio Button Group definition is missing.');
    if (definition.rows === null) throw new Error('Radio Button Group rows are missing.');
    const items = Array.from(
      { length: definition.rows.maximum },
      (_, index) => `( ) Row ${String(index + 1)}`,
    ).join('\n');
    const properties = Object.freeze({ ...definition.defaultProperties, items });
    const initial = createInitialControlRowState(definition, ELEMENT_ID, properties);
    if (initial === undefined) throw new Error('Dense Radio Button Group row state is invalid.');
    const projection = createControlSceneProjection({
      bounds: createWorldRect(0, 0, definition.minimumSize.width, definition.minimumSize.height),
      definition,
      identity: ELEMENT_ID,
      properties: initial.properties,
      rowData: initial.rowData,
      textMeasurementService: createRealMeasurementService(),
    });

    expect(projection.rows).toHaveLength(definition.rows.maximum);
    for (const row of projection.rows) {
      expect(row.bounds.height).toBeGreaterThanOrEqual(0);
      expect(row.marker?.strokePath).not.toMatch(/NaN|Infinity|A -/u);
      for (const value of row.marker?.strokePath.match(/-?\d+(?:\.\d+)?/gu) ?? []) {
        expect(Number.isFinite(Number(value))).toBe(true);
      }
    }
  });

  it('projects Tree Pane hierarchy, syntax adornments, selection, and disabled state once', () => {
    const definition = getControlSpec(CONTROL_TYPES.treePane);
    if (definition === undefined) throw new Error('Tree Pane definition is missing.');
    const properties = Object.freeze({
      ...definition.defaultProperties,
      items: [
        'f Closed',
        'F Open',
        '- File',
        '[+] Plus',
        '[-] Minus',
        '[x] Checked',
        '[ ] Unchecked',
        '> Closed disclosure',
        'v Open disclosure',
        '.._ Custom slot',
      ].join('\n'),
      state: 'disabled',
    });
    const initial = createInitialControlRowState(definition, ELEMENT_ID, properties);
    if (initial === undefined) throw new Error('Tree Pane row state is invalid.');
    const selectedId = initial.rowData.bindings[2]?.id;
    if (selectedId === undefined) throw new Error('Tree Pane selected row is missing.');
    const projection = createControlSceneProjection({
      bounds: createWorldRect(10, 20, 300, 300),
      definition,
      identity: ELEMENT_ID,
      properties: Object.freeze({ ...initial.properties, selectedRowId: selectedId }),
      rowData: initial.rowData,
      textMeasurementService: createRealMeasurementService(),
    });

    expect(projection.disabled).toBe(true);
    expect(projection.opacity).toBe(0.45);
    expect(projection.selectedRow?.id).toBe(selectedId);
    expect(projection.rows).toHaveLength(10);
    expect(projection.rows.map((row) => row.adornment?.strokePath.length ?? 0)).toEqual([
      0,
      0,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      0,
      0,
      0,
    ]);
    expect(projection.rows.map((row) => row.adornment?.fillPath.length ?? 0)).toEqual([
      expect.any(Number),
      expect.any(Number),
      0,
      0,
      0,
      0,
      0,
      expect.any(Number),
      expect.any(Number),
      0,
    ]);
    expect(projection.rows[9]!.labelX - projection.rows[0]!.labelX).toBe(40);
    expect(projection.textLayout?.lines.map((line) => line.text)).toEqual([
      'Closed',
      'Open',
      'File',
      'Plus',
      'Minus',
      'Checked',
      'Unchecked',
      'Closed disclosure',
      'Open disclosure',
      'Custom slot',
    ]);
  });

  it('projects measured horizontal tabs, selected seam state, alignment, and border mode', () => {
    const definition = getControlSpec(CONTROL_TYPES.tabBar);
    if (definition === undefined) throw new Error('Tab Bar definition is missing.');
    const initial = createInitialControlRowState(
      definition,
      ELEMENT_ID,
      definition.defaultProperties,
    );
    if (initial === undefined) throw new Error('Tab Bar row state is invalid.');
    const selectedRowId = initial.rowData.bindings[1]?.id;
    if (selectedRowId === undefined) throw new Error('Tab Bar selection fixture is incomplete.');
    const bounds = createWorldRect(10, 20, 254, 100);
    const service = createMeasurementService();
    const top = createControlSceneProjection({
      bounds,
      definition,
      identity: ELEMENT_ID,
      properties: Object.freeze({ ...initial.properties, selectedRowId }),
      rowData: initial.rowData,
      textMeasurementService: service,
    });

    expect(top.rows.map((row) => row.label)).toEqual(['One', 'Two', 'Three', 'Four']);
    expect(top.rows[0]?.bounds.x).toBe(bounds.x);
    expect(top.rows.map((row) => row.bounds.width)).toEqual([25, 25, 31, 28]);
    expect(top.primitiveBounds).toEqual({ height: 72, width: 254, x: 10, y: 48 });
    expect(top.fillColor).toBe(DESIGN_TOKENS.color.panel);
    expect(top.fillPath.match(/M /gu)).toHaveLength(5);
    expect(top.rowSeparatorPath).toBe('');
    expect(top.selectedRow).toMatchObject({
      color: DESIGN_TOKENS.color.canvas,
      fillOpacity: 1,
      id: selectedRowId,
    });
    expect(top.outlinePath).not.toBe('');

    const bottom = createControlSceneProjection({
      bounds,
      definition,
      identity: ELEMENT_ID,
      properties: Object.freeze({
        ...initial.properties,
        showBorder: false,
        tabsAlignment: 'center',
        tabsPosition: 'bottom',
      }),
      rowData: initial.rowData,
      textMeasurementService: service,
    });
    expect(bottom.rows[0]?.bounds.x).toBe(82.5);
    expect(bottom.rows[0]?.bounds.y).toBe(91);
    expect(bottom.primitiveBounds).toEqual({ height: 72, width: 254, x: 10, y: 20 });
    expect(bottom.fillPath.match(/M /gu)).toHaveLength(4);
    expect(bottom.outlinePath).not.toBe(top.outlinePath);
  });

  it('projects vertical tabs on either side without stretching rows through the pane', () => {
    const definition = getControlSpec(CONTROL_TYPES.verticalTabs);
    if (definition === undefined) throw new Error('V.Tabs definition is missing.');
    const initial = createInitialControlRowState(
      definition,
      ELEMENT_ID,
      definition.defaultProperties,
    );
    if (initial === undefined) throw new Error('V.Tabs row state is invalid.');
    const selectedRowId = initial.rowData.bindings[2]?.id;
    if (selectedRowId === undefined) throw new Error('V.Tabs selection fixture is incomplete.');
    const bounds = createWorldRect(10, 20, 200, 194);
    const service = createMeasurementService();
    const left = createControlSceneProjection({
      bounds,
      definition,
      identity: ELEMENT_ID,
      properties: Object.freeze({ ...initial.properties, selectedRowId }),
      rowData: initial.rowData,
      textMeasurementService: service,
    });

    expect(left.rows.map((row) => row.label)).toEqual([
      'First Tab',
      'Second Tab',
      'Third Tab',
      'Fourth Tab',
    ]);
    expect(left.rows.map((row) => row.bounds.height)).toEqual([29, 29, 29, 29]);
    expect(left.rows[0]?.bounds).toEqual({ height: 29, width: 81, x: 10, y: 20 });
    expect(left.primitiveBounds).toEqual({ height: 194, width: 120, x: 90, y: 20 });
    expect(left.selectedRow).toMatchObject({ fillOpacity: 1, id: selectedRowId });
    expect(left.textLayout?.textAnchor).toBe('start');

    const right = createControlSceneProjection({
      bounds,
      definition,
      identity: ELEMENT_ID,
      properties: Object.freeze({ ...initial.properties, tabsPosition: 'right' }),
      rowData: initial.rowData,
      textMeasurementService: service,
    });
    expect(right.rows[0]?.bounds.x).toBe(129);
    expect(right.primitiveBounds).toEqual({ height: 194, width: 120, x: 10, y: 20 });
    expect(right.outlinePath).not.toBe(left.outlinePath);
  });

  it('projects Accordion headers, open pane, child selection, and dense geometry once', () => {
    const definition = getControlSpec(CONTROL_TYPES.accordion);
    if (definition === undefined) throw new Error('Accordion definition is missing.');
    const properties = Object.freeze({
      ...definition.defaultProperties,
      items: 'Parent\n- First child\n- Second child\nOther',
      scrollbar: true,
    });
    const initial = createInitialControlRowState(definition, ELEMENT_ID, properties);
    if (initial === undefined) throw new Error('Accordion row state is invalid.');
    const childId = initial.rowData.bindings[2]?.id;
    if (childId === undefined) throw new Error('Accordion child selection is missing.');
    const projection = createControlSceneProjection({
      bounds: createWorldRect(0, 0, 150, 186),
      definition,
      identity: ELEMENT_ID,
      properties: Object.freeze({ ...initial.properties, selectedRowId: childId }),
      rowData: initial.rowData,
      textMeasurementService: createRealMeasurementService(),
    });

    expect(projection.rows.map((row) => [row.label, row.bounds.y, row.bounds.height])).toEqual([
      ['Parent', 0, 27],
      ['First child', 27, 27],
      ['Second child', 54, 27],
      ['Other', 159, 27],
    ]);
    expect(projection.rows[1]?.labelX).toBe(DESIGN_TOKENS.space[2] + 16);
    expect(
      createAccordionLayout(
        [
          { adornment: null, depth: 0, disabled: false, label: 'Parent', marker: null },
          { adornment: null, depth: 1, disabled: false, label: 'First child', marker: null },
          { adornment: null, depth: 1, disabled: false, label: 'Second child', marker: null },
          { adornment: null, depth: 0, disabled: false, label: 'Other', marker: null },
        ],
        initial.rowData,
        childId,
        createWorldRect(0, 0, 150, 186),
      ).paneBounds,
    ).toEqual({ height: 132, width: 150, x: 0, y: 27 });
    expect(projection.selectedRow?.id).toBe(childId);
    expect(projection.markPath).toContain('M 0 0 H 150 V 27 H 0 Z');
    expect(projection.outlinePath).not.toMatch(/NaN|Infinity/u);

    const dense = createControlSceneProjection({
      bounds: createWorldRect(0, 0, 80, 27),
      definition,
      identity: `${ELEMENT_ID}:dense`,
      properties: initial.properties,
      rowData: initial.rowData,
      textMeasurementService: createRealMeasurementService(),
    });
    expect(dense.rows).toHaveLength(4);
    expect(dense.rows.every((row) => row.bounds.height === 6.75)).toBe(true);
    expect(dense.outlinePath).not.toMatch(/NaN|Infinity/u);
  });

  it('keeps dense deep Tree Pane adornment geometry finite at minimum height', () => {
    const definition = getControlSpec(CONTROL_TYPES.treePane);
    if (definition === undefined || definition.rows === null) {
      throw new Error('Tree Pane definition is missing.');
    }
    const properties = Object.freeze({
      ...definition.defaultProperties,
      items: Array.from(
        { length: definition.rows.maximum },
        (_, index) => `${'.'.repeat(32)}f Row ${String(index + 1)}`,
      ).join('\n'),
    });
    const initial = createInitialControlRowState(definition, ELEMENT_ID, properties);
    if (initial === undefined) throw new Error('Dense Tree Pane row state is invalid.');
    const projection = createControlSceneProjection({
      bounds: createWorldRect(0, 0, definition.minimumSize.width, definition.minimumSize.height),
      definition,
      identity: ELEMENT_ID,
      properties: initial.properties,
      rowData: initial.rowData,
      textMeasurementService: createRealMeasurementService(),
    });

    expect(projection.rows).toHaveLength(definition.rows.maximum);
    for (const row of projection.rows) {
      expect(row.bounds.height).toBeGreaterThanOrEqual(0);
      expect(row.labelX).toBeGreaterThanOrEqual(row.bounds.x);
      expect(row.adornment?.fillPath).not.toMatch(/NaN|Infinity|A -/u);
    }
  });
});
