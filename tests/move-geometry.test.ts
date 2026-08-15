// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { ElementIdSchema, FOUNDATION_CONTROL_TYPES, parseProjectDocument } from '../src/domain';
import {
  captureMoveTargets,
  createMoveCommands,
  resolveMoveDelta,
} from '../src/renderer/editor/move-geometry';
import { createWorldPoint, createWorldVector } from '../src/renderer/editor/viewport-transform';
import { createValidProjectDocumentInput, DOCUMENT_FIXTURE_IDS } from './fixtures/project-document';

const parseFixture = () => {
  const result = parseProjectDocument(createValidProjectDocumentInput());
  if (!result.ok) {
    throw new Error('Move geometry fixture is invalid.');
  }
  return result.value;
};

describe('move geometry', () => {
  it('captures immutable local roots once and does not double-move selected descendants', () => {
    const document = parseFixture();
    const capture = captureMoveTargets(document, [
      DOCUMENT_FIXTURE_IDS.group,
      DOCUMENT_FIXTURE_IDS.child,
      DOCUMENT_FIXTURE_IDS.child,
    ]);

    expect(capture).toEqual({
      affectedIds: [DOCUMENT_FIXTURE_IDS.group, DOCUMENT_FIXTURE_IDS.child],
      sharedOwner: { boardId: DOCUMENT_FIXTURE_IDS.board, kind: 'board' },
      targets: [
        {
          frame: { x: -20, y: 12.5, width: 320, height: 180 },
          id: DOCUMENT_FIXTURE_IDS.group,
        },
      ],
      worldBounds: { x: -20, y: 12.5, width: 320, height: 180 },
    });
    expect(Object.isFrozen(capture)).toBe(true);
    expect(Object.isFrozen(capture?.targets[0]?.frame)).toBe(true);

    const commands = createMoveCommands(capture!, createWorldVector(15.25, -4.5));
    expect(commands).toEqual([
      {
        type: 'element.set-frame',
        elementId: DOCUMENT_FIXTURE_IDS.group,
        frame: { x: -4.75, y: 8, width: 320, height: 180 },
      },
    ]);
    expect(document.elementsById[DOCUMENT_FIXTURE_IDS.child]?.frame).toEqual({
      x: 16,
      y: 24,
      width: 120,
      height: 48,
    });
  });

  it('excludes locked roots and resolves Shift axis locking from the original world delta', () => {
    const input = createValidProjectDocumentInput();
    input.elementsById[DOCUMENT_FIXTURE_IDS.child]!.locked = true;
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) {
      throw new Error('Locked move fixture is invalid.');
    }
    expect(captureMoveTargets(parsed.value, [DOCUMENT_FIXTURE_IDS.child])).toBeUndefined();

    const ancestorInput = createValidProjectDocumentInput();
    ancestorInput.elementsById[DOCUMENT_FIXTURE_IDS.group]!.locked = true;
    const ancestorParsed = parseProjectDocument(ancestorInput);
    if (!ancestorParsed.ok) {
      throw new Error('Ancestor-lock move fixture is invalid.');
    }
    expect(captureMoveTargets(ancestorParsed.value, [DOCUMENT_FIXTURE_IDS.child])).toBeUndefined();

    const start = createWorldPoint(10, -5);
    expect(resolveMoveDelta(start, createWorldPoint(16, 1), false)).toMatchObject({ x: 6, y: 6 });
    expect(resolveMoveDelta(start, createWorldPoint(16, 1), true)).toMatchObject({ x: 6, y: 0 });
    expect(resolveMoveDelta(start, createWorldPoint(12, 8), true)).toMatchObject({ x: 0, y: 13 });
  });

  it('omits sibling-scoped layout metadata for a valid cross-owner move', () => {
    const input = createValidProjectDocumentInput();
    const rootId = ElementIdSchema.parse('element_crossowner');
    input.elementsById[rootId] = {
      id: rootId,
      controlType: FOUNDATION_CONTROL_TYPES.rectangle,
      frame: { x: 400, y: 100, width: 80, height: 40 },
      locked: false,
      properties: {},
      childIds: [],
      assetIds: [],
      link: null,
    };
    input.boardsById[DOCUMENT_FIXTURE_IDS.board]!.childIds.push(rootId);
    const parsed = parseProjectDocument(input);
    if (!parsed.ok) {
      throw new Error('Cross-owner move fixture is invalid.');
    }

    const capture = captureMoveTargets(parsed.value, [DOCUMENT_FIXTURE_IDS.child, rootId]);

    expect(capture?.targets.map((target) => target.id)).toEqual([
      DOCUMENT_FIXTURE_IDS.child,
      rootId,
    ]);
    expect(capture?.sharedOwner).toBeUndefined();
  });
});
