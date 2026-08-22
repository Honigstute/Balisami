// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  CONTROL_TYPES,
  ElementIdSchema,
  createElementRowId,
  getControlSpec,
  type ElementProperties,
} from '../src/domain';
import { createControlRowSceneProjections } from '../src/renderer/controls/control-row-scene-projection';
import type { ControlSceneTextLayout } from '../src/renderer/controls/control-scene-text-layout';
import type { ControlTextMeasurementService } from '../src/renderer/controls/control-text-measurement';
import { createWorldRect } from '../src/renderer/editor/viewport-transform';

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
});
