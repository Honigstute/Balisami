import { CONTROL_TEXT_POLICY } from '../../shared/control-text';
import { ElementRowIdSchema, type ElementId, type ElementRowId } from '../document/ids';
import {
  ELEMENT_ROW_DATA_VERSION,
  MAX_ELEMENT_ROW_BINDINGS,
  type ElementProperties,
  type ElementLink,
  type ElementNode,
  type ElementRowData,
} from '../document/schema';
import type { ControlDefinition, ControlRowsDefinition } from './control-definition';

/** Individual parsed labels stay bounded even when the owning text property is multiline. */
export const MAX_CONTROL_ROW_LABEL_LENGTH = Math.min(2_048, CONTROL_TEXT_POLICY.maximumLength);

export interface ParsedControlRow {
  readonly label: string;
}

export interface ControlRowEdit {
  readonly generation: number;
  readonly id: ElementRowId;
  readonly label: string;
  readonly link: ElementLink | null;
}

export interface ControlRowsUpdate {
  readonly properties: ElementProperties;
  readonly rowData: ElementRowData;
}

const freezeRowData = (bindings: ElementRowData['bindings'], nextId: number): ElementRowData =>
  Object.freeze({
    version: ELEMENT_ROW_DATA_VERSION,
    nextId,
    bindings: Object.freeze(bindings),
  });

export const parseControlRows = (
  rows: ControlRowsDefinition,
  properties: ElementProperties,
): readonly ParsedControlRow[] | undefined => {
  const source = properties[rows.property];
  if (typeof source !== 'string') return undefined;
  const labels = source.split(rows.separator).map((part) => part.trim());
  if (
    labels.length < rows.minimum ||
    labels.length > rows.maximum ||
    labels.length > MAX_ELEMENT_ROW_BINDINGS ||
    labels.some((label) => label.length === 0 || label.length > MAX_CONTROL_ROW_LABEL_LENGTH)
  ) {
    return undefined;
  }
  return Object.freeze(labels.map((label) => Object.freeze({ label })));
};

const hashStableText = (value: string): string => {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
};

/**
 * Allocates a stable, replayable ID from explicit command state. It never uses
 * array order as ongoing identity: the ordinal is only a collision nonce for a
 * row that does not yet exist.
 */
export const createElementRowId = (elementId: ElementId, generation: number): ElementRowId =>
  ElementRowIdSchema.parse(
    `row_${hashStableText(`${elementId}:${String(generation)}`)}_${generation.toString(36).padStart(3, '0')}`,
  );

export const createInitialElementRowData = (
  definition: ControlDefinition,
  elementId: ElementId,
  properties: ElementProperties,
): ElementRowData | undefined => {
  if (definition.rows === null) return freezeRowData([], 0);
  const parsed = parseControlRows(definition.rows, properties);
  if (parsed === undefined) return undefined;
  const bindings = parsed.map((_row, index) => {
    return Object.freeze({
      generation: index,
      id: createElementRowId(elementId, index),
      link: null,
    });
  });
  return freezeRowData(bindings, bindings.length);
};

/** Re-keys copied row identities for the new owning element without resetting generations. */
export const rekeyElementRowData = (
  rowData: ElementRowData,
  targetElementId: ElementId,
): ElementRowData =>
  freezeRowData(
    rowData.bindings.map((binding) =>
      Object.freeze({
        ...binding,
        id: createElementRowId(targetElementId, binding.generation),
      }),
    ),
    rowData.nextId,
  );

export const createControlRowEdits = (
  definition: ControlDefinition,
  element: ElementNode,
): readonly ControlRowEdit[] | undefined => {
  if (definition.rows === null) return undefined;
  const parsed = parseControlRows(definition.rows, element.properties);
  if (parsed === undefined || parsed.length !== element.rowData.bindings.length) return undefined;
  return Object.freeze(
    parsed.map((row, index) => {
      const binding = element.rowData.bindings[index]!;
      return Object.freeze({ ...binding, label: row.label });
    }),
  );
};

/**
 * Validates one explicit ordered editor payload. Existing identities must be
 * carried verbatim; new identities must consume never-before-used generations
 * below the command-supplied nextId watermark.
 */
export const createControlRowsUpdate = (
  definition: ControlDefinition,
  element: ElementNode,
  edits: readonly ControlRowEdit[],
  nextId: number,
): ControlRowsUpdate | undefined => {
  const rows = definition.rows;
  if (
    rows === null ||
    edits.length < rows.minimum ||
    edits.length > rows.maximum ||
    !Number.isSafeInteger(nextId) ||
    nextId < element.rowData.nextId ||
    new Set(edits.map((edit) => edit.id)).size !== edits.length ||
    new Set(edits.map((edit) => edit.generation)).size !== edits.length ||
    edits.some(
      (edit) =>
        edit.label.trim().length === 0 ||
        edit.label.length > MAX_CONTROL_ROW_LABEL_LENGTH ||
        edit.generation >= nextId ||
        edit.id !== createElementRowId(element.id, edit.generation),
    )
  ) {
    return undefined;
  }
  const existingById = new Map(
    element.rowData.bindings.map((binding) => [binding.id, binding] as const),
  );
  for (const edit of edits) {
    const existing = existingById.get(edit.id);
    if (
      existing !== undefined &&
      (existing.generation !== edit.generation || edit.generation >= element.rowData.nextId)
    ) {
      return undefined;
    }
    if (existing === undefined && edit.generation < element.rowData.nextId) return undefined;
  }
  const properties = Object.freeze({
    ...element.properties,
    [rows.property]: edits.map((edit) => edit.label.trim()).join(` ${rows.separator} `),
  });
  if (parseControlRows(rows, properties)?.length !== edits.length) return undefined;
  return Object.freeze({
    properties,
    rowData: freezeRowData(
      edits.map((edit) =>
        Object.freeze({
          generation: edit.generation,
          id: edit.id,
          link: rows.links ? edit.link : null,
        }),
      ),
      nextId,
    ),
  });
};

export const appendControlRowEdit = (
  element: ElementNode,
  edits: readonly ControlRowEdit[],
  label: string,
): Readonly<{ edits: readonly ControlRowEdit[]; nextId: number }> | undefined => {
  if (element.rowData.nextId >= Number.MAX_SAFE_INTEGER) return undefined;
  const generation = element.rowData.nextId;
  return Object.freeze({
    edits: Object.freeze([
      ...edits,
      Object.freeze({
        generation,
        id: createElementRowId(element.id, generation),
        label,
        link: null,
      }),
    ]),
    nextId: generation + 1,
  });
};
