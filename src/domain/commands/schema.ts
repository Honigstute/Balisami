import { z } from 'zod';

import { FOUNDATION_CONTROL_TYPES } from '../controls/control-spec';
import { BoardIdSchema, ElementIdSchema } from '../document/ids';
import { ElementOwnerSchema } from '../document/owner';
import {
  BoardNoteSchema,
  BoardSchema,
  DocumentTitleSchema,
  ElementLinkSchema,
  ElementNodeSchema,
  ElementPropertiesSchema,
  WorldRectSchema,
} from '../document/schema';

export const DOCUMENT_COMMAND_TYPES = Object.freeze({
  createBoard: 'board.create',
  deleteBoard: 'board.delete',
  restoreBoard: 'board.restore',
  reorderBoard: 'board.reorder',
  renameBoard: 'board.rename',
  setBoardNote: 'board.set-note',
  trashBoard: 'board.trash',
  createElement: 'element.create',
  deleteElement: 'element.delete',
  groupElements: 'element.group',
  reorderElement: 'element.reorder',
  reorderElementSiblings: 'element.reorder-siblings',
  setElementFrame: 'element.set-frame',
  setElementLink: 'element.set-link',
  setElementLocked: 'element.set-locked',
  setElementProperties: 'element.set-properties',
  ungroupElement: 'element.ungroup',
});

const EmptyBoardSchema = BoardSchema.refine((board) => board.childIds.length === 0, {
  message: 'A board.create command can only introduce an empty board.',
  path: ['childIds'],
}).refine((board) => board.alternateIds.length === 0 && board.selectedAlternateId === null, {
  message: 'A board.create command cannot introduce alternate-version state.',
  path: ['alternateIds'],
});

const EmptyElementSchema = ElementNodeSchema.refine((element) => element.childIds.length === 0, {
  message: 'An element.create command can only introduce an element without children.',
  path: ['childIds'],
});

const GroupElementSchema = ElementNodeSchema.superRefine((element, context) => {
  if (element.controlType !== FOUNDATION_CONTROL_TYPES.group) {
    context.addIssue({
      code: 'custom',
      message: `An element.group command requires control type '${FOUNDATION_CONTROL_TYPES.group}'.`,
      path: ['controlType'],
    });
  }
  if (element.childIds.length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'An element.group command requires at least one child.',
      path: ['childIds'],
    });
  }
  if (new Set(element.childIds).size !== element.childIds.length) {
    context.addIssue({
      code: 'custom',
      message: 'A group cannot list the same child more than once.',
      path: ['childIds'],
    });
  }
});

const UniqueElementIdsSchema = z
  .array(ElementIdSchema)
  .refine((elementIds) => new Set(elementIds).size === elementIds.length, {
    message: 'Element IDs must be unique.',
  })
  .readonly();

const ChildFrameEntrySchema = z
  .strictObject({
    elementId: ElementIdSchema,
    frame: WorldRectSchema,
  })
  .readonly();

const ChildFrameEntriesSchema = z
  .array(ChildFrameEntrySchema)
  .refine((entries) => new Set(entries.map((entry) => entry.elementId)).size === entries.length, {
    message: 'Child frame element IDs must be unique.',
  })
  .readonly();

export const CreateBoardCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.createBoard),
    board: EmptyBoardSchema,
    index: z.number().int().nonnegative(),
  })
  .readonly();

export const DeleteBoardCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.deleteBoard),
    boardId: BoardIdSchema,
  })
  .readonly();

export const TrashBoardCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.trashBoard),
    boardId: BoardIdSchema,
    toIndex: z.number().int().nonnegative(),
  })
  .readonly();

export const RestoreBoardCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.restoreBoard),
    boardId: BoardIdSchema,
    toIndex: z.number().int().nonnegative(),
  })
  .readonly();

export const ReorderBoardCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.reorderBoard),
    boardId: BoardIdSchema,
    toIndex: z.number().int().nonnegative(),
  })
  .readonly();

export const RenameBoardCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.renameBoard),
    boardId: BoardIdSchema,
    name: DocumentTitleSchema,
  })
  .readonly();

export const SetBoardNoteCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.setBoardNote),
    boardId: BoardIdSchema,
    note: BoardNoteSchema,
  })
  .readonly();

export const CreateElementCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.createElement),
    element: EmptyElementSchema,
    owner: ElementOwnerSchema,
    index: z.number().int().nonnegative(),
  })
  .readonly();

export const DeleteElementCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.deleteElement),
    elementId: ElementIdSchema,
  })
  .readonly();

export const GroupElementsCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.groupElements),
    group: GroupElementSchema,
    childFrames: ChildFrameEntriesSchema,
    owner: ElementOwnerSchema,
    toIndex: z.number().int().nonnegative(),
  })
  .superRefine((command, context) => {
    if (
      command.childFrames.length !== command.group.childIds.length ||
      command.childFrames.some((entry, index) => entry.elementId !== command.group.childIds[index])
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Group child frames must follow the complete canonical group child order.',
        path: ['childFrames'],
      });
    }
  })
  .readonly();

export const ReorderElementCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.reorderElement),
    elementId: ElementIdSchema,
    toIndex: z.number().int().nonnegative(),
  })
  .readonly();

export const ReorderElementSiblingsCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.reorderElementSiblings),
    owner: ElementOwnerSchema,
    childIds: UniqueElementIdsSchema,
  })
  .readonly();

export const SetElementFrameCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.setElementFrame),
    elementId: ElementIdSchema,
    frame: WorldRectSchema,
  })
  .readonly();

export const SetElementLinkCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.setElementLink),
    elementId: ElementIdSchema,
    link: ElementLinkSchema.nullable(),
  })
  .readonly();

export const SetElementLockedCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.setElementLocked),
    elementId: ElementIdSchema,
    locked: z.boolean(),
  })
  .readonly();

export const SetElementPropertiesCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.setElementProperties),
    elementId: ElementIdSchema,
    properties: ElementPropertiesSchema,
  })
  .readonly();

export const UngroupElementCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.ungroupElement),
    childFrames: ChildFrameEntriesSchema,
    groupId: ElementIdSchema,
    ownerChildIds: UniqueElementIdsSchema,
  })
  .readonly();

const BOARD_COMMAND_SCHEMAS = [
  CreateBoardCommandSchema,
  DeleteBoardCommandSchema,
  RestoreBoardCommandSchema,
  ReorderBoardCommandSchema,
  RenameBoardCommandSchema,
  SetBoardNoteCommandSchema,
  TrashBoardCommandSchema,
] as const;

const ELEMENT_COMMAND_SCHEMAS = [
  CreateElementCommandSchema,
  DeleteElementCommandSchema,
  GroupElementsCommandSchema,
  ReorderElementCommandSchema,
  ReorderElementSiblingsCommandSchema,
  SetElementFrameCommandSchema,
  SetElementLinkCommandSchema,
  SetElementLockedCommandSchema,
  SetElementPropertiesCommandSchema,
  UngroupElementCommandSchema,
] as const;

export const BoardCommandSchema = z.discriminatedUnion('type', BOARD_COMMAND_SCHEMAS);

export const ElementCommandSchema = z.discriminatedUnion('type', ELEMENT_COMMAND_SCHEMAS);

export const DocumentCommandSchema = z.discriminatedUnion('type', [
  ...BOARD_COMMAND_SCHEMAS,
  ...ELEMENT_COMMAND_SCHEMAS,
]);

export type CreateBoardCommand = z.infer<typeof CreateBoardCommandSchema>;
export type DeleteBoardCommand = z.infer<typeof DeleteBoardCommandSchema>;
export type RestoreBoardCommand = z.infer<typeof RestoreBoardCommandSchema>;
export type ReorderBoardCommand = z.infer<typeof ReorderBoardCommandSchema>;
export type RenameBoardCommand = z.infer<typeof RenameBoardCommandSchema>;
export type SetBoardNoteCommand = z.infer<typeof SetBoardNoteCommandSchema>;
export type TrashBoardCommand = z.infer<typeof TrashBoardCommandSchema>;
export type CreateElementCommand = z.infer<typeof CreateElementCommandSchema>;
export type DeleteElementCommand = z.infer<typeof DeleteElementCommandSchema>;
export type GroupElementsCommand = z.infer<typeof GroupElementsCommandSchema>;
export type ReorderElementCommand = z.infer<typeof ReorderElementCommandSchema>;
export type ReorderElementSiblingsCommand = z.infer<typeof ReorderElementSiblingsCommandSchema>;
export type SetElementFrameCommand = z.infer<typeof SetElementFrameCommandSchema>;
export type SetElementLinkCommand = z.infer<typeof SetElementLinkCommandSchema>;
export type SetElementLockedCommand = z.infer<typeof SetElementLockedCommandSchema>;
export type SetElementPropertiesCommand = z.infer<typeof SetElementPropertiesCommandSchema>;
export type UngroupElementCommand = z.infer<typeof UngroupElementCommandSchema>;
export type BoardCommand = z.infer<typeof BoardCommandSchema>;
export type ElementCommand = z.infer<typeof ElementCommandSchema>;
export type DocumentCommand = z.infer<typeof DocumentCommandSchema>;
