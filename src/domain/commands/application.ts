import type { ProjectDocument } from '../document/validation';
import type { DocumentCommand } from './schema';

export type CommandSemanticFailureCode = 'conflict' | 'not-found' | 'out-of-range';

export interface CommandApplicationFailure {
  readonly ok: false;
  readonly code: CommandSemanticFailureCode;
  readonly message: string;
}

export interface CommandApplicationUnchanged {
  readonly ok: true;
  readonly changed: false;
  readonly label: string;
}

export interface CommandApplicationChanged {
  readonly ok: true;
  readonly changed: true;
  readonly candidate: ProjectDocument;
  readonly inverse: DocumentCommand;
  readonly label: string;
}

export type CommandApplication =
  CommandApplicationChanged | CommandApplicationFailure | CommandApplicationUnchanged;
