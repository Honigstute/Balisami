// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  BoardIdSchema,
  CONTROL_TYPES,
  ElementIdSchema,
  createEmptyProjectDocument,
  ProjectIdSchema,
} from '../src/domain';
import {
  createPlainTextPasteCommand,
  normalizePlainTextClipboardValue,
} from '../src/renderer/editor/plain-text-paste';
import { createWorldPoint } from '../src/renderer/editor/viewport-transform';
import { DESKTOP_CLIPBOARD_LIMITS } from '../src/shared/desktop-api';

const BOARD_ID = BoardIdSchema.parse('board_plaintext_target');
const ELEMENT_ID = ElementIdSchema.parse('element_plaintext_target');

describe('plain-text clipboard fallback', () => {
  it('normalizes bounded text into one exact registry-backed Text Label command', () => {
    const created = createEmptyProjectDocument({
      boardId: BOARD_ID,
      projectId: ProjectIdSchema.parse('project_plaintext_target'),
    });
    if (!created.ok) throw new Error('Plain-text target fixture is invalid.');

    const command = createPlainTextPasteCommand(
      created.value,
      BOARD_ID,
      ELEMENT_ID,
      createWorldPoint(320, 180),
      '  First line\r\nSecond line  ',
    );

    expect(command).toMatchObject({
      element: {
        controlType: CONTROL_TYPES.textLabel,
        frame: { height: 36, width: 160, x: 240, y: 162 },
        properties: { text: 'First line Second line' },
      },
      index: 0,
      owner: { boardId: BOARD_ID, kind: 'board' },
    });
  });

  it('rejects empty, whitespace-only, oversized, and unavailable-target input', () => {
    expect(normalizePlainTextClipboardValue('')).toBeUndefined();
    expect(normalizePlainTextClipboardValue(' \r\n ')).toBeUndefined();
    expect(
      normalizePlainTextClipboardValue('x'.repeat(DESKTOP_CLIPBOARD_LIMITS.textCharacters + 1)),
    ).toBeUndefined();
    expect(normalizePlainTextClipboardValue(undefined)).toBeUndefined();

    const created = createEmptyProjectDocument({
      boardId: BOARD_ID,
      projectId: ProjectIdSchema.parse('project_plaintext_invalid'),
    });
    if (!created.ok) throw new Error('Plain-text rejection fixture is invalid.');
    expect(
      createPlainTextPasteCommand(
        created.value,
        BoardIdSchema.parse('board_plaintext_missing'),
        ELEMENT_ID,
        createWorldPoint(0, 0),
        'Text',
      ),
    ).toBeUndefined();
  });
});
