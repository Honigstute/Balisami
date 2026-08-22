import {
  migrateProjectDocumentV1ToV2,
  migrateProjectDocumentV2ToV3,
  type ProjectDocumentMigrationResult,
} from '../../domain';

import { PROJECT_FILE_FORMAT_VERSION } from './manifest';

export interface ProjectFileMigrationStep {
  readonly fromVersion: number;
  readonly migrateDocument: (input: unknown) => ProjectDocumentMigrationResult<unknown>;
  readonly toVersion: number;
}

export interface ProjectFileVersionError {
  readonly code: 'invalid-manifest' | 'newer-version' | 'unsupported-version';
  readonly message: string;
  readonly foundVersion?: number;
}

export type ProjectFileVersionRouteResult =
  | {
      readonly ok: true;
      readonly sourceVersion: number;
      readonly targetVersion: typeof PROJECT_FILE_FORMAT_VERSION;
      readonly steps: readonly ProjectFileMigrationStep[];
    }
  | { readonly ok: false; readonly error: ProjectFileVersionError };

/**
 * Released file migrations are complete, sequential, and pure. A source file is
 * never accepted merely because its JSON happens to resemble the current shape.
 */
const PROJECT_FILE_MIGRATION_STEPS: readonly ProjectFileMigrationStep[] = Object.freeze([
  Object.freeze({
    fromVersion: 1,
    migrateDocument: migrateProjectDocumentV1ToV2,
    toVersion: 2,
  }),
  Object.freeze({
    fromVersion: 2,
    migrateDocument: migrateProjectDocumentV2ToV3,
    toVersion: 3,
  }),
]);

export const routeProjectFileVersion = (version: unknown): ProjectFileVersionRouteResult => {
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
    return {
      ok: false,
      error: {
        code: 'invalid-manifest',
        message: 'Project file manifest is missing a valid non-negative integer format version.',
      },
    };
  }
  if (version > PROJECT_FILE_FORMAT_VERSION) {
    return {
      ok: false,
      error: {
        code: 'newer-version',
        message: `This project was created by a newer file format version (${String(version)}).`,
        foundVersion: version,
      },
    };
  }

  const steps: ProjectFileMigrationStep[] = [];
  let currentVersion = version;
  while (currentVersion < PROJECT_FILE_FORMAT_VERSION) {
    const step = PROJECT_FILE_MIGRATION_STEPS.find(
      (candidate) => candidate.fromVersion === currentVersion,
    );
    if (step === undefined || step.toVersion !== currentVersion + 1) {
      return {
        ok: false,
        error: {
          code: 'unsupported-version',
          message: `Project file format version ${String(version)} has no complete migration path.`,
          foundVersion: version,
        },
      };
    }
    steps.push(step);
    currentVersion = step.toVersion;
  }

  return {
    ok: true,
    sourceVersion: version,
    targetVersion: PROJECT_FILE_FORMAT_VERSION,
    steps: Object.freeze(steps),
  };
};
