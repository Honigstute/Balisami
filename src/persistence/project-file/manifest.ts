import { z } from 'zod';

export const PROJECT_FILE_FORMAT_ID = 'wireframe-project' as const;
export const PROJECT_FILE_FORMAT_VERSION = 2 as const;

export const PROJECT_FILE_ENTRY_PATHS = Object.freeze({
  assetDirectory: 'assets/sha256/',
  document: 'project.json',
  manifest: 'manifest.json',
} as const);

const ProjectFileManifestBaseSchema = z.strictObject({
  format: z.literal(PROJECT_FILE_FORMAT_ID),
  documentEntry: z.literal(PROJECT_FILE_ENTRY_PATHS.document),
  assetDirectory: z.literal(PROJECT_FILE_ENTRY_PATHS.assetDirectory),
});

export const ProjectFileManifestV1Schema = ProjectFileManifestBaseSchema.extend({
  formatVersion: z.literal(1),
}).readonly();

export const ProjectFileManifestV2Schema = ProjectFileManifestBaseSchema.extend({
  formatVersion: z.literal(PROJECT_FILE_FORMAT_VERSION),
}).readonly();

export type ProjectFileManifestV1 = z.infer<typeof ProjectFileManifestV1Schema>;
export type ProjectFileManifestV2 = z.infer<typeof ProjectFileManifestV2Schema>;

export const PROJECT_FILE_MANIFEST_V1: ProjectFileManifestV1 = ProjectFileManifestV1Schema.parse({
  format: PROJECT_FILE_FORMAT_ID,
  formatVersion: 1,
  documentEntry: PROJECT_FILE_ENTRY_PATHS.document,
  assetDirectory: PROJECT_FILE_ENTRY_PATHS.assetDirectory,
});

export const PROJECT_FILE_MANIFEST_V2: ProjectFileManifestV2 = ProjectFileManifestV2Schema.parse({
  format: PROJECT_FILE_FORMAT_ID,
  formatVersion: PROJECT_FILE_FORMAT_VERSION,
  documentEntry: PROJECT_FILE_ENTRY_PATHS.document,
  assetDirectory: PROJECT_FILE_ENTRY_PATHS.assetDirectory,
});

const SHA_256_PATTERN = /^[a-f0-9]{64}$/u;

export const getProjectAssetEntryPath = (sha256: string): string | undefined =>
  SHA_256_PATTERN.test(sha256) ? `${PROJECT_FILE_ENTRY_PATHS.assetDirectory}${sha256}` : undefined;

export const isProjectAssetEntryPath = (path: string): boolean => {
  if (!path.startsWith(PROJECT_FILE_ENTRY_PATHS.assetDirectory)) {
    return false;
  }
  return SHA_256_PATTERN.test(path.slice(PROJECT_FILE_ENTRY_PATHS.assetDirectory.length));
};
