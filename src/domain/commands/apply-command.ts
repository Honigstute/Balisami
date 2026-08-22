import type { ProjectDocument } from '../document/validation';
import type { CommandApplication } from './application';
import { applyBoardCommand } from './board-commands';
import { applyElementCommand } from './element-commands';
import { DOCUMENT_COMMAND_TYPES, type DocumentCommand } from './schema';

const assertNever = (command: never): never => {
  throw new Error(`Unhandled document command: ${JSON.stringify(command)}`);
};

export const applyDocumentCommand = (
  document: ProjectDocument,
  command: DocumentCommand,
): CommandApplication => {
  switch (command.type) {
    case DOCUMENT_COMMAND_TYPES.createBoard:
    case DOCUMENT_COMMAND_TYPES.deleteBoard:
    case DOCUMENT_COMMAND_TYPES.restoreBoard:
    case DOCUMENT_COMMAND_TYPES.reorderBoard:
    case DOCUMENT_COMMAND_TYPES.renameBoard:
    case DOCUMENT_COMMAND_TYPES.setBoardNote:
    case DOCUMENT_COMMAND_TYPES.trashBoard:
      return applyBoardCommand(document, command);
    case DOCUMENT_COMMAND_TYPES.createElement:
    case DOCUMENT_COMMAND_TYPES.deleteElement:
    case DOCUMENT_COMMAND_TYPES.groupElements:
    case DOCUMENT_COMMAND_TYPES.reorderElement:
    case DOCUMENT_COMMAND_TYPES.reorderElementSiblings:
    case DOCUMENT_COMMAND_TYPES.setElementFrame:
    case DOCUMENT_COMMAND_TYPES.setElementLink:
    case DOCUMENT_COMMAND_TYPES.setElementLocked:
    case DOCUMENT_COMMAND_TYPES.setElementProperties:
    case DOCUMENT_COMMAND_TYPES.ungroupElement:
      return applyElementCommand(document, command);
    default:
      return assertNever(command);
  }
};
