import type { ProjectDocument } from '../document/validation';
import type { CommandApplication } from './application';
import { applyAssetCommand } from './asset-commands';
import { applyBoardCommand } from './board-commands';
import { applyComponentCommand } from './component-commands';
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
    case DOCUMENT_COMMAND_TYPES.createAsset:
    case DOCUMENT_COMMAND_TYPES.deleteAsset:
      return applyAssetCommand(document, command);
    case DOCUMENT_COMMAND_TYPES.createBoard:
    case DOCUMENT_COMMAND_TYPES.createAlternate:
    case DOCUMENT_COMMAND_TYPES.deleteBoard:
    case DOCUMENT_COMMAND_TYPES.deleteAlternate:
    case DOCUMENT_COMMAND_TYPES.restoreBoard:
    case DOCUMENT_COMMAND_TYPES.reorderBoard:
    case DOCUMENT_COMMAND_TYPES.renameBoard:
    case DOCUMENT_COMMAND_TYPES.setBoardNote:
    case DOCUMENT_COMMAND_TYPES.selectBoardVersion:
    case DOCUMENT_COMMAND_TYPES.trashBoard:
      return applyBoardCommand(document, command);
    case DOCUMENT_COMMAND_TYPES.createComponent:
    case DOCUMENT_COMMAND_TYPES.convertGroupToComponent:
    case DOCUMENT_COMMAND_TYPES.detachComponentInstance:
    case DOCUMENT_COMMAND_TYPES.deleteComponent:
    case DOCUMENT_COMMAND_TYPES.renameComponent:
    case DOCUMENT_COMMAND_TYPES.reorderComponent:
    case DOCUMENT_COMMAND_TYPES.restoreComponentInstance:
    case DOCUMENT_COMMAND_TYPES.restoreGroupFromComponent:
      return applyComponentCommand(document, command);
    case DOCUMENT_COMMAND_TYPES.createElement:
    case DOCUMENT_COMMAND_TYPES.deleteElement:
    case DOCUMENT_COMMAND_TYPES.groupElements:
    case DOCUMENT_COMMAND_TYPES.reorderElement:
    case DOCUMENT_COMMAND_TYPES.reorderElementSiblings:
    case DOCUMENT_COMMAND_TYPES.setElementFrame:
    case DOCUMENT_COMMAND_TYPES.setElementAssets:
    case DOCUMENT_COMMAND_TYPES.setElementLink:
    case DOCUMENT_COMMAND_TYPES.setElementLocked:
    case DOCUMENT_COMMAND_TYPES.setElementProperties:
    case DOCUMENT_COMMAND_TYPES.ungroupElement:
      return applyElementCommand(document, command);
    default:
      return assertNever(command);
  }
};
