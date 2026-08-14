import { z } from 'zod';

import { ProjectIdSchema } from '../../domain';
import { MAX_PROJECT_ARCHIVE_BYTES } from '../../persistence';

export const RECOVERY_FORMAT_ID = 'wireframe-recovery' as const;
export const RECOVERY_FORMAT_VERSION = 1 as const;
export const MAX_RECOVERY_POINTER_BYTES = 64 * 1_024;
export const MAX_RECOVERY_SOURCE_FILE_PATH_LENGTH = 32_768;

export const RecoveryPointerV1Schema = z
  .strictObject({
    format: z.literal(RECOVERY_FORMAT_ID),
    formatVersion: z.literal(RECOVERY_FORMAT_VERSION),
    projectId: ProjectIdSchema,
    stateId: z.number().int().nonnegative().safe(),
    capturedAtEpochMs: z.number().int().nonnegative().safe(),
    archiveSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    archiveByteLength: z.number().int().nonnegative().max(MAX_PROJECT_ARCHIVE_BYTES),
    sourceFilePath: z.string().max(MAX_RECOVERY_SOURCE_FILE_PATH_LENGTH).nullable(),
  })
  .readonly();

export type RecoveryPointerV1 = z.infer<typeof RecoveryPointerV1Schema>;
