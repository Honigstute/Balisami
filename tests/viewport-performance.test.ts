// @vitest-environment node

import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  parseProjectDocument,
  ProjectIdSchema,
  type ElementId,
} from '../src/domain';
import { DocumentSceneModel } from '../src/renderer/editor/document-scene-model';
import { WorldSpatialIndex } from '../src/renderer/editor/spatial-index';
import { createWorldPoint, createWorldRect } from '../src/renderer/editor/viewport-transform';
import { createEditorSpatialFixture } from './fixtures/editor-spatial-fixture';

const percentile95 = (samples: readonly number[]): number => {
  const ordered = [...samples].sort((first, second) => first - second);
  return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
};

const createHitTestFixture = (elementCount: number) => {
  const projectId = ProjectIdSchema.parse('project_hitperformance');
  const boardId = BoardIdSchema.parse('board_hitperformance');
  const childIds: ElementId[] = [];
  const elementsById: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const columnCount = 100;
  for (let index = 0; index < elementCount; index += 1) {
    const id = ElementIdSchema.parse(`element_hit${String(index).padStart(6, '0')}`);
    childIds.push(id);
    elementsById[id] = {
      id,
      controlType: FOUNDATION_CONTROL_TYPES.rectangle,
      frame: {
        x: (index % columnCount) * 20,
        y: Math.floor(index / columnCount) * 20,
        width: 12,
        height: 12,
      },
      locked: false,
      properties: {},
      childIds: [],
      assetIds: [],
      link: null,
    };
  }
  const parsed = parseProjectDocument({
    schemaVersion: 1,
    id: projectId,
    name: 'Hit-test performance fixture',
    boardIds: [boardId],
    boardsById: {
      [boardId]: { id: boardId, name: 'Dense board', note: { text: '' }, childIds },
    },
    elementsById,
    assetsById: {},
  });
  if (!parsed.ok) {
    throw new Error('Hit-test performance fixture is invalid.');
  }
  return Object.freeze({ boardId, document: parsed.value });
};

describe('viewport algorithm performance fixtures', () => {
  it('keeps 1,000-element visible-range query work inside one frame budget', () => {
    const index = new WorldSpatialIndex<string>();
    index.rebuild(createEditorSpatialFixture(1_000));
    const durations: number[] = [];

    for (let frame = 0; frame < 600; frame += 1) {
      const start = performance.now();
      index.query(createWorldRect(frame * 4 - 400, frame * 2 - 300, 1_200, 800));
      durations.push(performance.now() - start);
    }

    expect(percentile95(durations)).toBeLessThanOrEqual(16.7);
  });

  it('keeps a 5,000-element exact point query below the hit-test budget', () => {
    const index = new WorldSpatialIndex<string>();
    index.rebuild(createEditorSpatialFixture(5_000));
    const durations: number[] = [];

    for (let sample = 0; sample < 250; sample += 1) {
      const start = performance.now();
      index.queryPoint(createWorldPoint(sample * 13 - 400, sample * 7 - 300));
      durations.push(performance.now() - start);
    }

    expect(percentile95(durations)).toBeLessThanOrEqual(20);
  });

  it('keeps canonical topmost hit resolution below budget on a 5,000-element scene', () => {
    const fixture = createHitTestFixture(5_000);
    const model = new DocumentSceneModel();
    model.reconcile(fixture.document, fixture.boardId);
    const durations: number[] = [];

    for (let sample = 0; sample < 500; sample += 1) {
      const index = (sample * 37) % 5_000;
      const start = performance.now();
      const hit = model.hitTestTopmost(
        createWorldPoint((index % 100) * 20 + 5, Math.floor(index / 100) * 20 + 5),
      );
      durations.push(performance.now() - start);
      expect(hit).toBeDefined();
    }

    expect(percentile95(durations)).toBeLessThanOrEqual(20);
  });
});
