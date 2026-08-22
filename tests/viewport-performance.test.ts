// @vitest-environment node

import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  ElementIdSchema,
  FOUNDATION_CONTROL_TYPES,
  PROJECT_DOCUMENT_SCHEMA_VERSION,
  parseProjectDocument,
  ProjectIdSchema,
  type ElementId,
} from '../src/domain';
import { DocumentSceneModel } from '../src/renderer/editor/document-scene-model';
import {
  resolveResizeFrame,
  type ResizeTargetCapture,
} from '../src/renderer/editor/resize-geometry';
import { getResizeSnapProfile, resolveResizeSnap } from '../src/renderer/editor/resize-snapping';
import { createSceneSnapCandidates } from '../src/renderer/editor/scene-snap-candidates';
import { resolveSnap } from '../src/renderer/editor/snap-engine';
import { WorldSpatialIndex } from '../src/renderer/editor/spatial-index';
import {
  createViewportZoom,
  createWorldPoint,
  createWorldRect,
  createWorldVector,
} from '../src/renderer/editor/viewport-transform';
import { createEditorSpatialFixture } from './fixtures/editor-spatial-fixture';
import { getFixtureControlVersion } from './fixtures/project-document';

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
      controlVersion: getFixtureControlVersion(FOUNDATION_CONTROL_TYPES.rectangle),
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
    schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
    id: projectId,
    name: 'Hit-test performance fixture',
    boardIds: [boardId],
    componentIds: [],
    trashedBoardIds: [],
    boardsById: {
      [boardId]: {
        id: boardId,
        name: 'Dense board',
        note: { text: '' },
        childIds,
        alternateIds: [],
        selectedAlternateId: null,
      },
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

  it('keeps canonical marquee-region resolution below budget on a 5,000-element scene', () => {
    const fixture = createHitTestFixture(5_000);
    const model = new DocumentSceneModel();
    model.reconcile(fixture.document, fixture.boardId);
    const durations: number[] = [];

    for (let sample = 0; sample < 250; sample += 1) {
      const start = performance.now();
      model.querySelectionRegion(
        createWorldRect((sample % 50) * 20, (sample % 20) * 20, 400, 300),
        sample % 2 === 0 ? 'contained' : 'intersecting',
      );
      durations.push(performance.now() - start);
    }

    expect(percentile95(durations)).toBeLessThanOrEqual(20);
  });

  it('keeps indexed snap candidate query and deterministic resolution below budget', () => {
    const fixture = createHitTestFixture(5_000);
    const model = new DocumentSceneModel();
    model.reconcile(fixture.document, fixture.boardId);
    const zoom = createViewportZoom(1);
    const movingBounds = createWorldRect(980, 480, 12, 12);
    const durations: number[] = [];

    const runSnapFrame = (sample: number): number => {
      const rawDelta = createWorldVector((sample % 20) - 10, (sample % 12) - 6);
      const start = performance.now();
      const candidates = createSceneSnapCandidates(model, {
        equalGapOwner: { kind: 'board', boardId: fixture.boardId },
        excludedIds: [ElementIdSchema.parse('element_hit002449')],
        movingBounds,
        rawDelta,
        zoom,
      });
      resolveSnap({
        activeAxes: { x: true, y: true },
        bypass: false,
        candidates,
        movingBounds,
        rawDelta,
        zoom,
      });
      return performance.now() - start;
    };

    // Measure steady-state pointer work after the JS engine has compiled the
    // interaction path. Packaged input latency separately protects startup and
    // first-frame responsiveness; including JIT compilation here made the
    // source microbenchmark host-scheduling-sensitive on Windows CI.
    for (let sample = 0; sample < 20; sample += 1) {
      runSnapFrame(sample);
    }
    for (let sample = 0; sample < 100; sample += 1) {
      durations.push(runSnapFrame(sample));
    }

    expect(percentile95(durations)).toBeLessThanOrEqual(20);
  });

  it('keeps one-edge resize snapping below the same 5,000-element budget', () => {
    const fixture = createHitTestFixture(5_000);
    const model = new DocumentSceneModel();
    model.reconcile(fixture.document, fixture.boardId);
    const zoom = createViewportZoom(1);
    const movingId = ElementIdSchema.parse('element_hit002449');
    const capture: ResizeTargetCapture = Object.freeze({
      elementId: movingId,
      frame: Object.freeze({ x: 980, y: 480, width: 12, height: 12 }),
      worldBounds: createWorldRect(980, 480, 12, 12),
    });
    const startWorldPoint = createWorldPoint(992, 486);
    const profile = getResizeSnapProfile('east');
    const durations: number[] = [];

    for (let sample = 0; sample < 100; sample += 1) {
      const currentWorldPoint = createWorldPoint(992 + (sample % 20) - 10, 486);
      const raw = resolveResizeFrame(capture, 'east', startWorldPoint, currentWorldPoint, false);
      const start = performance.now();
      const candidates = createSceneSnapCandidates(model, {
        activeAxes: profile.activeAxes,
        excludedIds: [movingId],
        movingAnchors: profile.movingAnchors,
        movingBounds: raw.worldBounds,
        rawDelta: createWorldVector(0, 0),
        zoom,
      });
      resolveResizeSnap({
        aspectLocked: false,
        bypass: false,
        candidates,
        capture,
        currentWorldPoint,
        handle: 'east',
        previousLocks: {},
        raw,
        startWorldPoint,
        zoom,
      });
      durations.push(performance.now() - start);
    }

    expect(percentile95(durations)).toBeLessThanOrEqual(20);
  });
});
