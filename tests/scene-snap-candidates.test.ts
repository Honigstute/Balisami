// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { ElementIdSchema, FOUNDATION_CONTROL_TYPES, parseProjectDocument } from '../src/domain';
import { DocumentSceneModel } from '../src/renderer/editor/document-scene-model';
import { createSceneSnapCandidates } from '../src/renderer/editor/scene-snap-candidates';
import {
  createViewportZoom,
  createWorldRect,
  createWorldVector,
} from '../src/renderer/editor/viewport-transform';
import {
  createEmptyElementRowDataInput,
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  getFixtureControlProperties,
  getFixtureControlVersion,
} from './fixtures/project-document';

const createModel = (): DocumentSceneModel => {
  const result = parseProjectDocument(createValidProjectDocumentInput());
  if (!result.ok) {
    throw new Error('Scene snap fixture failed validation.');
  }
  const model = new DocumentSceneModel();
  model.reconcile(result.value, DOCUMENT_FIXTURE_IDS.board);
  return model;
};

describe('scene snap candidate adapter', () => {
  it('turns nearby canonical scene items into immutable typed candidates', () => {
    const candidates = createSceneSnapCandidates(createModel(), {
      excludedIds: [],
      movingBounds: createWorldRect(-4, 36.5, 120, 48),
      rawDelta: createWorldVector(0, 0),
      zoom: createViewportZoom(1),
    });

    expect(candidates).toHaveLength(6);
    expect(candidates.map((candidate) => candidate.sourceId)).toEqual(
      Array.from({ length: 6 }, () => DOCUMENT_FIXTURE_IDS.child),
    );
    expect(candidates.map((candidate) => candidate.sourceOrder)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(candidates.every((candidate) => candidate.kind === 'object')).toBe(true);
    expect(Object.isFrozen(candidates)).toBe(true);
    expect(candidates.every(Object.isFrozen)).toBe(true);
  });

  it('exposes group bounds through the same resolver vocabulary as container candidates', () => {
    const candidates = createSceneSnapCandidates(createModel(), {
      activeAxes: { x: true, y: false },
      excludedIds: [DOCUMENT_FIXTURE_IDS.child],
      movingAnchors: { x: ['start'], y: [] },
      movingBounds: createWorldRect(-20, 200, 40, 40),
      rawDelta: createWorldVector(0, 0),
      zoom: createViewportZoom(1),
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        axis: 'x',
        kind: 'container',
        position: -20,
        sourceId: DOCUMENT_FIXTURE_IDS.group,
      }),
    ]);
  });

  it('does not offer any selected root or descendant as its own snap source', () => {
    const candidates = createSceneSnapCandidates(createModel(), {
      excludedIds: [DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child],
      movingBounds: createWorldRect(-20, 30, 120, 48),
      rawDelta: createWorldVector(0, 0),
      zoom: createViewportZoom(1),
    });

    expect(candidates).toEqual([]);
  });

  it('filters indexed work to one exposed resize edge', () => {
    const candidates = createSceneSnapCandidates(createModel(), {
      activeAxes: { x: true, y: false },
      excludedIds: [],
      movingAnchors: { x: ['start'], y: [] },
      movingBounds: createWorldRect(-4, 36.5, 120, 48),
      rawDelta: createWorldVector(0, 0),
      zoom: createViewportZoom(1),
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        axis: 'x',
        position: -4,
        sourceId: DOCUMENT_FIXTURE_IDS.child,
      }),
    ]);
  });

  it('adds equal-gap relations only between siblings of the moved roots shared owner', () => {
    const input = createValidProjectDocumentInput();
    const beforeId = ElementIdSchema.parse('element_gapbefore01');
    const movingId = ElementIdSchema.parse('element_gapmoving01');
    const afterId = ElementIdSchema.parse('element_gapafter001');
    const createRectangle = (id: typeof beforeId, x: number) => ({
      id,
      controlType: FOUNDATION_CONTROL_TYPES.rectangle,
      controlVersion: getFixtureControlVersion(FOUNDATION_CONTROL_TYPES.rectangle),
      frame: { x, y: 300, width: id === movingId ? 20 : 40, height: 20 },
      locked: false,
      properties: { ...getFixtureControlProperties(FOUNDATION_CONTROL_TYPES.rectangle) },
      childIds: [],
      assetIds: [],
      link: null,
      rowData: createEmptyElementRowDataInput(),
    });
    input.elementsById[beforeId] = createRectangle(beforeId, 0);
    input.elementsById[movingId] = createRectangle(movingId, 58);
    input.elementsById[afterId] = createRectangle(afterId, 100);
    input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds.unshift(beforeId, movingId, afterId);
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) {
      throw new Error('Equal-gap scene fixture failed validation.');
    }
    const model = new DocumentSceneModel();
    model.reconcile(parsed.value, DOCUMENT_FIXTURE_IDS.board);

    const candidates = createSceneSnapCandidates(model, {
      activeAxes: { x: true, y: false },
      equalGapOwner: { kind: 'board', boardId: DOCUMENT_FIXTURE_IDS.board },
      excludedIds: [movingId],
      movingBounds: createWorldRect(58, 300, 20, 20),
      rawDelta: createWorldVector(0, 0),
      zoom: createViewportZoom(1),
    });

    const equalGapCandidates = candidates.filter((candidate) => candidate.kind === 'equalGap');
    expect(equalGapCandidates).toEqual([
      expect.objectContaining({
        axis: 'x',
        gap: 20,
        kind: 'equalGap',
        position: 60,
        requiredMovingAnchor: 'start',
      }),
    ]);
    expect(equalGapCandidates[0]?.sourceId).toContain(beforeId);
    expect(equalGapCandidates[0]?.sourceId).toContain(afterId);
    expect(equalGapCandidates[0]?.sourceId).not.toContain(DOCUMENT_FIXTURE_IDS.child);
  });
});
