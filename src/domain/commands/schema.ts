import { z } from 'zod';

import { BoardIdSchema, ElementIdSchema } from '../document/ids';
import { ElementOwnerSchema } from '../document/owner';
import {
  BoardNoteSchema,
  BoardSchema,
  DocumentTitleSchema,
  ElementNodeSchema,
  ElementPropertiesSchema,
  WorldRectSchema,
} from '../document/schema';

export const DOCUMENT_COMMAND_TYPES = Object.freeze({
  createBoard: 'board.create',
  deleteBoard: 'board.delete',
  reorderBoard: 'board.reorder',
  renameBoard: 'board.rename',
  setBoardNote: 'board.set-note',
  createElement: 'element.create',
  deleteElement: 'element.delete',
  reorderElement: 'element.reorder',
  setElementFrame: 'element.set-frame',
  setElementProperties: 'element.set-properties',
});

const EmptyBoardSchema = BoardSchema.refine((board) => board.childIds.length === 0, {
  message: 'A board.create command can only introduce an empty board.',
  path: ['childIds'],
});

const EmptyElementSchema = ElementNodeSchema.refine((element) => element.childIds.length === 0, {
  message: 'An element.create command can only introduce an element without children.',
  path: ['childIds'],
});

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

export const ReorderElementCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.reorderElement),
    elementId: ElementIdSchema,
    toIndex: z.number().int().nonnegative(),
  })
  .readonly();

export const SetElementFrameCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.setElementFrame),
    elementId: ElementIdSchema,
    frame: WorldRectSchema,
  })
  .readonly();

export const SetElementPropertiesCommandSchema = z
  .strictObject({
    type: z.literal(DOCUMENT_COMMAND_TYPES.setElementProperties),
    elementId: ElementIdSchema,
    properties: ElementPropertiesSchema,
  })
  .readonly();

const BOARD_COMMAND_SCHEMAS = [
  CreateBoardCommandSchema,
  DeleteBoardCommandSchema,
  ReorderBoardCommandSchema,
  RenameBoardCommandSchema,
  SetBoardNoteCommandSchema,
] as const;

const ELEMENT_COMMAND_SCHEMAS = [
  CreateElementCommandSchema,
  DeleteElementCommandSchema,
  ReorderElementCommandSchema,
  SetElementFrameCommandSchema,
  SetElementPropertiesCommandSchema,
] as const;

export const BoardCommandSchema = z.discriminatedUnion('type', BOARD_COMMAND_SCHEMAS);

export const ElementCommandSchema = z.discriminatedUnion('type', ELEMENT_COMMAND_SCHEMAS);

export const DocumentCommandSchema = z.discriminatedUnion('type', [
  ...BOARD_COMMAND_SCHEMAS,
  ...ELEMENT_COMMAND_SCHEMAS,
]);

export type CreateBoardCommand = z.infer<typeof CreateBoardCommandSchema>;
export type DeleteBoardCommand = z.infer<typeof DeleteBoardCommandSchema>;
export type ReorderBoardCommand = z.infer<typeof ReorderBoardCommandSchema>;
export type RenameBoardCommand = z.infer<typeof RenameBoardCommandSchema>;
export type SetBoardNoteCommand = z.infer<typeof SetBoardNoteCommandSchema>;
export type CreateElementCommand = z.infer<typeof CreateElementCommandSchema>;
export type DeleteElementCommand = z.infer<typeof DeleteElementCommandSchema>;
export type ReorderElementCommand = z.infer<typeof ReorderElementCommandSchema>;
export type SetElementFrameCommand = z.infer<typeof SetElementFrameCommandSchema>;
export type SetElementPropertiesCommand = z.infer<typeof SetElementPropertiesCommandSchema>;
export type BoardCommand = z.infer<typeof BoardCommandSchema>;
export type ElementCommand = z.infer<typeof ElementCommandSchema>;
export type DocumentCommand = z.infer<typeof DocumentCommandSchema>;
