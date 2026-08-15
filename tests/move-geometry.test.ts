// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { parseProjectDocument } from '../src/domain';
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

    const start = createWorldPoint(10, -5);
    expect(resolveMoveDelta(start, createWorldPoint(16, 1), false)).toMatchObject({ x: 6, y: 6 });
    expect(resolveMoveDelta(start, createWorldPoint(16, 1), true)).toMatchObject({ x: 6, y: 0 });
    expect(resolveMoveDelta(start, createWorldPoint(12, 8), true)).toMatchObject({ x: 0, y: 13 });
  });
});
