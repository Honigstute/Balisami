import path from 'node:path';

/** Structural path guard only; callers still decide whether the target must be a file or directory. */
export const isValidAbsoluteNonRootPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  !value.includes('\0') &&
  path.isAbsolute(value) &&
  value !== path.parse(value).root;

/** Semantic alias used for application-owned recovery and metadata directories. */
export const isValidApplicationDataRoot = isValidAbsoluteNonRootPath;
