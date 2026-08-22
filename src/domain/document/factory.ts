import { PROJECT_DOCUMENT_SCHEMA_VERSION } from './schema';
import { parseProjectDocument, type ProjectDocumentParseResult } from './validation';

export interface EmptyProjectDocumentInput {
  readonly boardId: unknown;
  readonly boardName?: unknown;
  readonly projectId: unknown;
  readonly projectName?: unknown;
}

/**
 * Creates the minimal valid document through the canonical domain parser.
 * ID generation stays at the application edge so the domain remains pure.
 */
export const createEmptyProjectDocument = (
  input: EmptyProjectDocumentInput,
): ProjectDocumentParseResult => {
  const projectName = input.projectName ?? 'Untitled project';
  const boardName = input.boardName ?? 'Wireframe 1';
  return parseProjectDocument({
    schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
    id: input.projectId,
    name: projectName,
    boardIds: [input.boardId],
    trashedBoardIds: [],
    boardsById: {
      [String(input.boardId)]: {
        id: input.boardId,
        name: boardName,
        note: { text: '' },
        childIds: [],
      },
    },
    elementsById: {},
    assetsById: {},
  });
};
