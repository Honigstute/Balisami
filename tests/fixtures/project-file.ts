import { parseProjectDocument, type ProjectDocument } from '../../src/domain';
import {
  createValidProjectDocumentInput,
  DOCUMENT_FIXTURE_IDS,
  type ProjectDocumentInputFixture,
} from './project-document';

export const PROJECT_FILE_FIXTURE_ASSET_BYTES = new TextEncoder().encode('abc');
export const PROJECT_FILE_FIXTURE_ASSET_SHA_256 =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

export const parseProjectFileFixture = (input: ProjectDocumentInputFixture): ProjectDocument => {
  const result = parseProjectDocument(input);
  if (!result.ok) {
    throw new Error(`Project file fixture is invalid: ${JSON.stringify(result.issues)}`);
  }
  return result.value;
};

export const createAssetFreeProjectDocument = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const child = input.elementsById[DOCUMENT_FIXTURE_IDS.child];
  if (child === undefined) {
    throw new Error('Project file fixture child is missing.');
  }
  child.assetIds = [];
  input.assetsById = {};
  return parseProjectFileFixture(input);
};

export const createProjectDocumentWithAsset = (): ProjectDocument => {
  const input = createValidProjectDocumentInput();
  const reference = input.assetsById[DOCUMENT_FIXTURE_IDS.asset];
  if (reference === undefined) {
    throw new Error('Project file fixture asset is missing.');
  }
  reference.sha256 = PROJECT_FILE_FIXTURE_ASSET_SHA_256;
  reference.byteLength = PROJECT_FILE_FIXTURE_ASSET_BYTES.byteLength;
  return parseProjectFileFixture(input);
};
