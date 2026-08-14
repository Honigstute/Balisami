import { createHash } from 'node:crypto';

/** The single byte-level SHA-256 implementation for archives and assets. */
export const sha256Bytes = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');
