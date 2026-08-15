/** Native filesystem access remains owned by the main process. */
export {
  MAX_PROJECT_ARCHIVE_BYTES,
  decodeProjectFileArchive,
  encodeProjectFileArchive,
  type DecodeProjectFileArchiveResult,
  type EncodeProjectFileArchiveResult,
  type ProjectArchiveError,
  type ProjectArchiveErrorCode,
  type ProjectFileOperationError,
} from './project-file/archive';
export {
  MAX_PROJECT_ASSET_BYTES,
  MAX_PROJECT_DOCUMENT_BYTES,
  MAX_PROJECT_FILE_ENTRY_COUNT,
  MAX_PROJECT_FILE_TOTAL_BYTES,
  MAX_PROJECT_MANIFEST_BYTES,
  decodeProjectFileEnvelope,
  encodeProjectFileEnvelope,
  type DecodeProjectFileResult,
  type DecodedProjectFile,
  type EncodeProjectFileResult,
  type ProjectFileCodecError,
  type ProjectFileCodecErrorCode,
  type ProjectFileEntry,
  type ProjectFileEnvelope,
} from './project-file/codec';
export {
  MAX_PROJECT_JSON_DEPTH,
  MAX_PROJECT_JSON_VALUES,
  decodeBoundedJson,
  encodeCanonicalJson,
  validateJsonComplexity,
  type DecodeJsonResult,
  type JsonComplexityError,
  type JsonComplexityErrorCode,
  type JsonComplexityResult,
} from './project-file/canonical-json';
export { sha256Bytes } from './project-file/digest';
export {
  PROJECT_FILE_ENTRY_PATHS,
  PROJECT_FILE_FORMAT_ID,
  PROJECT_FILE_FORMAT_VERSION,
  PROJECT_FILE_MANIFEST_V1,
  PROJECT_FILE_MANIFEST_V2,
  ProjectFileManifestV1Schema,
  ProjectFileManifestV2Schema,
  getProjectAssetEntryPath,
  isProjectAssetEntryPath,
  type ProjectFileManifestV1,
  type ProjectFileManifestV2,
} from './project-file/manifest';
export {
  routeProjectFileVersion,
  type ProjectFileMigrationStep,
  type ProjectFileVersionError,
  type ProjectFileVersionRouteResult,
} from './project-file/version-routing';
