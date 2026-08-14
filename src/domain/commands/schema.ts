import { z } from 'zod';

import { BoardIdSchema } from '../document/ids';
import { BoardNoteSchema, BoardSchema, DocumentTitleSchema } from '../document/schema';

export const DOCUMENT_COMMAND_TYPES = Object.freeze({
  createBoard: 'board.create',
  deleteBoard: 'board.delete',
  reorderBoard: 'board.reorder',
  renameBoard: 'board.rename',
  setBoardNote: 'board.set-note',
});

const EmptyBoardSchema = BoardSchema.refine((board) => board.childIds.length === 0, {
  message: 'A board.create command can only introduce an empty board.',
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

export const DocumentCommandSchema = z.discriminatedUnion('type', [
  CreateBoardCommandSchema,
  DeleteBoardCommandSchema,
  ReorderBoardCommandSchema,
  RenameBoardCommandSchema,
  SetBoardNoteCommandSchema,
]);

export type CreateBoardCommand = z.infer<typeof CreateBoardCommandSchema>;
export type DeleteBoardCommand = z.infer<typeof DeleteBoardCommandSchema>;
export type ReorderBoardCommand = z.infer<typeof ReorderBoardCommandSchema>;
export type RenameBoardCommand = z.infer<typeof RenameBoardCommandSchema>;
export type SetBoardNoteCommand = z.infer<typeof SetBoardNoteCommandSchema>;
export type DocumentCommand = z.infer<typeof DocumentCommandSchema>;
