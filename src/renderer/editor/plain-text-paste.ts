import {
  CONTROL_TYPES,
  CreateElementCommandSchema,
  type BoardId,
  type CreateElementCommand,
  type ElementId,
  type ProjectDocument,
} from '../../domain';
import { DESKTOP_CLIPBOARD_LIMITS } from '../../shared/desktop-api';
import { createControlInsertionCommand } from '../controls/control-insertion';
import type { WorldPoint } from './viewport-transform';

/** Normalizes operating-system line endings while rejecting empty or oversized text. */
export const normalizePlainTextClipboardValue = (value: unknown): string | undefined => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > DESKTOP_CLIPBOARD_LIMITS.textCharacters
  ) {
    return undefined;
  }
  const normalized = value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\n', ' ')
    .trim();
  return normalized.length === 0 ? undefined : normalized;
};

/** Creates one registry-backed Text Label at the active viewport center. */
export const createPlainTextPasteCommand = (
  document: ProjectDocument,
  boardId: BoardId,
  elementId: ElementId,
  center: WorldPoint,
  clipboardText: unknown,
): CreateElementCommand | undefined => {
  const text = normalizePlainTextClipboardValue(clipboardText);
  if (text === undefined) return undefined;
  const insertion = createControlInsertionCommand({
    boardId,
    center,
    controlType: CONTROL_TYPES.textLabel,
    document,
    elementId,
    placement: 'exact',
  });
  if (insertion === undefined) return undefined;
  const parsed = CreateElementCommandSchema.safeParse({
    ...insertion,
    element: {
      ...insertion.element,
      properties: { ...insertion.element.properties, text },
    },
  });
  return parsed.success ? parsed.data : undefined;
};
