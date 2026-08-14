export const MAX_PROJECT_JSON_DEPTH = 64;
export const MAX_PROJECT_JSON_VALUES = 250_000;

export type JsonComplexityErrorCode = 'json-too-deep' | 'json-too-many-values';

export interface JsonComplexityError {
  readonly code: JsonComplexityErrorCode;
  readonly message: string;
}

export type JsonComplexityResult =
  { readonly ok: true } | { readonly ok: false; readonly error: JsonComplexityError };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Uses an explicit stack so hostile JSON depth cannot overflow this check. */
export const validateJsonComplexity = (value: unknown): JsonComplexityResult => {
  const pending: { readonly depth: number; readonly value: unknown }[] = [{ depth: 0, value }];
  let valueCount = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) {
      break;
    }
    valueCount += 1;
    if (valueCount > MAX_PROJECT_JSON_VALUES) {
      return {
        ok: false,
        error: {
          code: 'json-too-many-values',
          message: `JSON may contain at most ${String(MAX_PROJECT_JSON_VALUES)} values.`,
        },
      };
    }
    if (current.depth > MAX_PROJECT_JSON_DEPTH) {
      return {
        ok: false,
        error: {
          code: 'json-too-deep',
          message: `JSON nesting may be at most ${String(MAX_PROJECT_JSON_DEPTH)} levels deep.`,
        },
      };
    }

    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({ depth: current.depth + 1, value: current.value[index] });
      }
    } else if (isObject(current.value)) {
      const values = Object.values(current.value);
      for (let index = values.length - 1; index >= 0; index -= 1) {
        pending.push({ depth: current.depth + 1, value: values[index] });
      }
    }
  }

  return { ok: true };
};

const sortJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (!isObject(value)) {
    return value;
  }

  const sorted: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value).sort()) {
    const property = value[key];
    if (property !== undefined) {
      sorted[key] = sortJsonValue(property);
    }
  }
  return sorted;
};

const textEncoder = new TextEncoder();

export const encodeCanonicalJson = (value: unknown): Uint8Array => {
  const serialized = JSON.stringify(sortJsonValue(value), null, 2);
  if (serialized === undefined) {
    throw new TypeError('Canonical JSON root cannot be undefined.');
  }
  return textEncoder.encode(`${serialized}\n`);
};

export type DecodeJsonResult =
  | { readonly ok: true; readonly value: unknown }
  | {
      readonly ok: false;
      readonly code: 'invalid-utf8' | 'malformed-json' | JsonComplexityErrorCode;
      readonly message: string;
    };

const strictTextDecoder = new TextDecoder('utf-8', { fatal: true });

export const decodeBoundedJson = (bytes: Uint8Array): DecodeJsonResult => {
  let text: string;
  try {
    text = strictTextDecoder.decode(bytes);
  } catch {
    return {
      ok: false,
      code: 'invalid-utf8',
      message: 'JSON entry is not valid UTF-8.',
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      code: 'malformed-json',
      message: 'JSON entry is malformed or truncated.',
    };
  }

  const complexity = validateJsonComplexity(value);
  if (!complexity.ok) {
    return {
      ok: false,
      code: complexity.error.code,
      message: complexity.error.message,
    };
  }
  return { ok: true, value };
};
