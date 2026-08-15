// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { parseProjectDocument } from '../src/domain';
import { DocumentSceneModel } from '../src/renderer/editor/document-scene-model';
import { createSceneSnapCandidates } from '../src/renderer/editor/scene-snap-candidates';
import {
  createViewportZoom,
  createWorldRect,
  createWorldVector,
} from '../src/renderer/editor/viewport-transform';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

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
  it('turns nearby canonical scene items into six immutable object candidates each', () => {
    const candidates = createSceneSnapCandidates(createModel(), {
      excludedIds: [],
      movingBounds: createWorldRect(200, 100, 100, 50),
      rawDelta: createWorldVector(-100, 0),
      zoom: createViewportZoom(4),
    });

    expect(candidates).toHaveLength(6);
    expect(candidates.map((candidate) => candidate.sourceId)).toEqual(
      Array.from({ length: 6 }, () => DOCUMENT_FIXTURE_IDS.child),
    );
    expect(candidates.map((candidate) => candidate.sourceOrder)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(Object.isFrozen(candidates)).toBe(true);
    expect(candidates.every(Object.isFrozen)).toBe(true);
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
});
