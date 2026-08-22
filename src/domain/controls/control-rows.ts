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
/** Bounds syntax-owned hierarchy so loaded source cannot project unbounded geometry. */
export const MAX_CONTROL_ROW_DEPTH = 32;

export interface ParsedControlRow {
  readonly adornment:
    | 'checkbox-checked'
    | 'checkbox-unchecked'
    | 'disclosure-closed'
    | 'disclosure-open'
    | 'file'
    | 'folder-closed'
    | 'folder-open'
    | 'minus'
    | 'plus'
    | 'spacer'
    | null;
  readonly depth: number;
  readonly disabled: boolean;
  readonly label: string;
  readonly marker: 'indeterminate' | 'selected' | 'unchecked' | null;
}

export interface ControlRowEdit {
  readonly adornment: ParsedControlRow['adornment'];
  readonly depth: number;
  readonly disabled: boolean;
  readonly generation: number;
  readonly id: ElementRowId;
  readonly label: string;
  readonly link: ElementLink | null;
  readonly marker: ParsedControlRow['marker'];
}

export interface ControlRowsUpdate {
  readonly properties: ElementProperties;
  readonly rowData: ElementRowData;
}

export type ControlRowState = ControlRowsUpdate;

const freezeRowData = (bindings: ElementRowData['bindings'], nextId: number): ElementRowData =>
  Object.freeze({
    version: ELEMENT_ROW_DATA_VERSION,
    nextId,
    bindings: Object.freeze(bindings),
  });

const parseMarkerToken = (
  kind: NonNullable<ControlRowsDefinition['marker']>['kind'],
  token: string,
): ParsedControlRow['marker'] | undefined => {
  const normalized = token.trim().toLowerCase();
  if (normalized.length === 0) return 'unchecked';
  if (normalized === '-') return 'indeterminate';
  if (kind === 'checkbox' && normalized === 'x') return 'selected';
  if (kind === 'radio' && normalized === 'o') return 'selected';
  return undefined;
};

const TREE_ADORNMENT_BY_TOKEN = Object.freeze({
  F: 'folder-open',
  '[ ]': 'checkbox-unchecked',
  '[+]': 'plus',
  '[-]': 'minus',
  '[x]': 'checkbox-checked',
  _: 'spacer',
  f: 'folder-closed',
  '-': 'file',
  '>': 'disclosure-closed',
  v: 'disclosure-open',
} as const);

const TREE_TOKEN_BY_ADORNMENT: Readonly<
  Record<Exclude<ParsedControlRow['adornment'], null>, string>
> = Object.freeze({
  'checkbox-checked': '[x]',
  'checkbox-unchecked': '[ ]',
  'disclosure-closed': '>',
  'disclosure-open': 'v',
  file: '-',
  'folder-closed': 'f',
  'folder-open': 'F',
  minus: '[-]',
  plus: '[+]',
  spacer: '_',
});

const parseTreeRowSource = (source: string): ParsedControlRow | undefined => {
  if (source.length > 0 && /^\s$/u.test(source[0]!) && source[0] !== ' ') return undefined;
  const indentationUnit = source[0] === '.' || source[0] === ' ' ? source[0] : undefined;
  let depth = 0;
  while (indentationUnit !== undefined && source[depth] === indentationUnit) depth += 1;
  // Public examples use either dots (`..f Child`) or spaces (`  f Child`)
  // as one unit per level. Mixing both is ambiguous and would over-indent.
  if (
    depth > MAX_CONTROL_ROW_DEPTH ||
    source[depth] === '.' ||
    source[depth] === ' ' ||
    (source[depth] !== undefined && /^\s$/u.test(source[depth]!))
  ) {
    return undefined;
  }
  let remaining = source.slice(depth);
  let adornment: ParsedControlRow['adornment'] = null;
  for (const token of ['[ ]', '[+]', '[-]', '[x]', 'F', 'f', '-', '>', 'v', '_'] as const) {
    if (remaining.startsWith(`${token} `)) {
      adornment = TREE_ADORNMENT_BY_TOKEN[token];
      remaining = remaining.slice(token.length + 1);
      break;
    }
  }
  const label = remaining.trim();
  if (label.length === 0 || label.length > MAX_CONTROL_ROW_LABEL_LENGTH) return undefined;
  return Object.freeze({ adornment, depth, disabled: false, label, marker: null });
};

/** Parses one row using only the definition-owned marker grammar. */
export const parseControlRowSource = (
  rows: ControlRowsDefinition,
  source: string,
): ParsedControlRow | undefined => {
  if (rows.adornment?.kind === 'tree') return parseTreeRowSource(source);
  let remaining = source.trim();
  let marker: ParsedControlRow['marker'] = null;
  if (rows.marker !== null) {
    const expression = rows.marker.kind === 'checkbox' ? /^\[([^\]]*)\]\s*/ : /^\(([^)]*)\)\s*/;
    const foreignExpression = rows.marker.kind === 'checkbox' ? /^\([^)]*\)\s*/ : /^\[[^\]]*\]\s*/;
    if (foreignExpression.test(remaining)) return undefined;
    const match = expression.exec(remaining);
    if (match !== null) {
      const parsedMarker = parseMarkerToken(rows.marker.kind, match[1] ?? '');
      if (parsedMarker === undefined) return undefined;
      marker = parsedMarker;
      remaining = remaining.slice(match[0].length).trim();
    }
  }
  const disabled =
    rows.marker !== null &&
    remaining.length > 2 &&
    remaining.startsWith('-') &&
    remaining.endsWith('-');
  if (disabled) remaining = remaining.slice(1, -1).trim();
  // Disabled notation applies to the label after its marker. Rejecting a marker
  // inside the disabled wrapper keeps logical marker identity unambiguous.
  if (
    disabled &&
    marker === null &&
    (rows.marker?.kind === 'checkbox' ? /^\[[^\]]*\]\s*/ : /^\([^)]*\)\s*/).test(remaining)
  ) {
    return undefined;
  }
  if (remaining.length === 0 || remaining.length > MAX_CONTROL_ROW_LABEL_LENGTH) return undefined;
  return Object.freeze({ adornment: null, depth: 0, disabled, label: remaining, marker });
};

/** Canonicalizes marker syntax while keeping the visible label free of delimiters. */
export const formatControlRowSource = (
  rows: ControlRowsDefinition,
  row: Pick<ParsedControlRow, 'adornment' | 'depth' | 'disabled' | 'label' | 'marker'>,
): string => {
  if (rows.adornment?.kind === 'tree') {
    const token = row.adornment === null ? '' : `${TREE_TOKEN_BY_ADORNMENT[row.adornment]} `;
    return `${'.'.repeat(row.depth)}${token}${row.label.trim()}`;
  }
  const prefix =
    rows.marker === null || row.marker === null
      ? ''
      : rows.marker.kind === 'checkbox'
        ? row.marker === 'unchecked'
          ? '[ ] '
          : row.marker === 'selected'
            ? '[x] '
            : '[-] '
        : row.marker === 'unchecked'
          ? '( ) '
          : row.marker === 'selected'
            ? '(o) '
            : '(-) ';
  const label = row.disabled ? `-${row.label.trim()}-` : row.label.trim();
  return `${prefix}${label}`;
};

export const parseControlRows = (
  rows: ControlRowsDefinition,
  properties: ElementProperties,
): readonly ParsedControlRow[] | undefined => {
  const source = properties[rows.property];
  if (typeof source !== 'string') return undefined;
  // Tree indentation is syntax, so only non-hierarchical row families trim
  // each source line before parsing.
  const sources = source
    .split(rows.separator)
    .map((part) => (rows.adornment?.kind === 'tree' ? part.trimEnd() : part.trim()));
  if (
    sources.length < rows.minimum ||
    sources.length > rows.maximum ||
    sources.length > MAX_ELEMENT_ROW_BINDINGS ||
    sources.some(
      (rowSource) => rowSource.length === 0 || rowSource.length > MAX_CONTROL_ROW_LABEL_LENGTH,
    )
  ) {
    return undefined;
  }
  const parsed = sources.map((rowSource) => parseControlRowSource(rows, rowSource));
  return parsed.some((row) => row === undefined)
    ? undefined
    : Object.freeze(parsed as readonly ParsedControlRow[]);
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

export const createInitialControlRowState = (
  definition: ControlDefinition,
  elementId: ElementId,
  properties: ElementProperties,
): ControlRowState | undefined => {
  if (definition.rows === null) {
    return Object.freeze({ properties, rowData: freezeRowData([], 0) });
  }
  const parsed = parseControlRows(definition.rows, properties);
  if (parsed === undefined) return undefined;
  const bindings = parsed.map((_row, index) => {
    return Object.freeze({
      generation: index,
      id: createElementRowId(elementId, index),
      link: null,
    });
  });
  const rowData = freezeRowData(bindings, bindings.length);
  const selection = definition.rows.selection;
  return Object.freeze({
    properties:
      selection === null
        ? properties
        : Object.freeze({
            ...properties,
            [selection.property]: selection.default === 'first' ? (bindings[0]?.id ?? null) : null,
          }),
    rowData,
  });
};

/** Re-keys copied row identities for the new owning element without resetting generations. */
const rekeyElementRowData = (rowData: ElementRowData, targetElementId: ElementId): ElementRowData =>
  freezeRowData(
    rowData.bindings.map((binding) =>
      Object.freeze({
        ...binding,
        id: createElementRowId(targetElementId, binding.generation),
      }),
    ),
    rowData.nextId,
  );

/** Re-keys row identity and the optional stable selection as one clone operation. */
export const rekeyControlRowState = (
  definition: ControlDefinition,
  properties: ElementProperties,
  rowData: ElementRowData,
  targetElementId: ElementId,
): ControlRowState | undefined => {
  const nextRowData = rekeyElementRowData(rowData, targetElementId);
  const selection = definition.rows?.selection;
  if (selection === null || selection === undefined) {
    return Object.freeze({ properties, rowData: nextRowData });
  }
  const selectedValue = properties[selection.property];
  if (selectedValue === null && selection.allowNone) {
    return Object.freeze({ properties, rowData: nextRowData });
  }
  const selected = ElementRowIdSchema.safeParse(selectedValue);
  if (!selected.success) return undefined;
  const selectedIndex = rowData.bindings.findIndex((binding) => binding.id === selected.data);
  const nextSelected = nextRowData.bindings[selectedIndex]?.id;
  if (selectedIndex < 0 || nextSelected === undefined) return undefined;
  return Object.freeze({
    properties: Object.freeze({ ...properties, [selection.property]: nextSelected }),
    rowData: nextRowData,
  });
};

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
      return Object.freeze({
        ...binding,
        adornment: row.adornment,
        depth: row.depth,
        disabled: row.disabled,
        label: row.label,
        marker: row.marker,
      });
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
        edit.id !== createElementRowId(element.id, edit.generation) ||
        !Number.isSafeInteger(edit.depth) ||
        edit.depth < 0 ||
        edit.depth > MAX_CONTROL_ROW_DEPTH ||
        (rows.adornment === null && (edit.adornment !== null || edit.depth !== 0)) ||
        (edit.adornment !== null && TREE_TOKEN_BY_ADORNMENT[edit.adornment] === undefined) ||
        (rows.adornment !== null && (edit.marker !== null || edit.disabled)) ||
        (rows.marker === null && (edit.marker !== null || edit.disabled)) ||
        (rows.marker !== null &&
          edit.marker !== null &&
          !['unchecked', 'selected', 'indeterminate'].includes(edit.marker)),
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
  let properties: ElementProperties = Object.freeze({
    ...element.properties,
    [rows.property]: edits
      .map((edit) => formatControlRowSource(rows, edit))
      .join(rows.separator === '\n' ? '\n' : ` ${rows.separator} `),
  });
  const selection = rows.selection;
  if (selection !== null) {
    const selectedValue = element.properties[selection.property];
    if (selectedValue === null && selection.allowNone) {
      properties = Object.freeze({ ...properties, [selection.property]: null });
    } else {
      const selected = ElementRowIdSchema.safeParse(selectedValue);
      if (!selected.success) return undefined;
      const retained = edits.find((edit) => edit.id === selected.data);
      if (retained !== undefined) {
        properties = Object.freeze({ ...properties, [selection.property]: retained.id });
      } else {
        const removedIndex = element.rowData.bindings.findIndex(
          (binding) => binding.id === selected.data,
        );
        if (removedIndex < 0) return undefined;
        // The row now occupying the removed position wins; deleting the last row
        // falls back to its previous neighbor. This is stable across replay.
        const replacement = edits[Math.min(removedIndex, edits.length - 1)]?.id ?? null;
        if (replacement === null && !selection.allowNone) return undefined;
        properties = Object.freeze({ ...properties, [selection.property]: replacement });
      }
    }
  }
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

export const createControlRowSelectionUpdate = (
  definition: ControlDefinition,
  element: ElementNode,
  selectedRowId: ElementRowId | null,
): ControlRowsUpdate | undefined => {
  const selection = definition.rows?.selection;
  if (
    selection === null ||
    selection === undefined ||
    (selectedRowId === null && !selection.allowNone) ||
    (selectedRowId !== null &&
      !element.rowData.bindings.some((binding) => binding.id === selectedRowId))
  ) {
    return undefined;
  }
  return Object.freeze({
    properties: Object.freeze({ ...element.properties, [selection.property]: selectedRowId }),
    rowData: element.rowData,
  });
};

export const appendControlRowEdit = (
  definition: ControlDefinition,
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
        adornment: definition.rows?.adornment?.defaultKind ?? null,
        depth: 0,
        disabled: false,
        generation,
        id: createElementRowId(element.id, generation),
        label,
        link: null,
        marker: definition.rows?.marker?.defaultState ?? null,
      }),
    ]),
    nextId: generation + 1,
  });
};
