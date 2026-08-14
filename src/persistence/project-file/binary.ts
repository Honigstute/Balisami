/** `instanceof` is intentionally avoided because bytes may cross JavaScript realms. */
export const isUint8Array = (value: unknown): value is Uint8Array =>
  ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]';

/** Persistence boundaries copy bytes so callers cannot mutate accepted or returned data indirectly. */
export const copyBytes = (bytes: Uint8Array): Uint8Array => Uint8Array.from(bytes);
