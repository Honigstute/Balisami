/**
 * Byte limits shared by renderer-side import staging and native persistence.
 * Keeping them platform-free prevents an accepted import from becoming an
 * unsavable project only after it crosses the preload boundary.
 */
export const MAX_PROJECT_FILE_ENTRY_COUNT = 10_002;
export const MAX_PROJECT_MANIFEST_BYTES = 64 * 1_024;
export const MAX_PROJECT_DOCUMENT_BYTES = 32 * 1_024 * 1_024;
export const MAX_PROJECT_ASSET_BYTES = 64 * 1_024 * 1_024;
export const MAX_PROJECT_FILE_TOTAL_BYTES = 256 * 1_024 * 1_024;
