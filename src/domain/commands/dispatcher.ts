import { parseProjectDocument, type ProjectDocument } from '../document/validation';
import { summarizeValidationIssues, type ValidationIssue } from '../validation/issues';
import { applyBoardCommand, type CommandSemanticFailureCode } from './board-commands';
import { DocumentCommandSchema, type DocumentCommand } from './schema';

export const MAX_COMMAND_VALIDATION_ISSUES = 10;

export type DocumentCommandFailureCode =
  CommandSemanticFailureCode | 'document-invalid' | 'invalid-command';

export interface DocumentCommandError {
  readonly code: DocumentCommandFailureCode;
  readonly issues: readonly ValidationIssue[];
  readonly message: string;
  readonly omittedIssueCount: number;
}

interface DocumentCommandFailure {
  readonly ok: false;
  readonly document: ProjectDocument;
  readonly error: DocumentCommandError;
}

interface DocumentCommandUnchanged {
  readonly ok: true;
  readonly changed: false;
  readonly command: DocumentCommand;
  readonly document: ProjectDocument;
  readonly label: string;
}

interface DocumentCommandApplied {
  readonly ok: true;
  readonly changed: true;
  readonly command: DocumentCommand;
  readonly document: ProjectDocument;
  readonly inverse: DocumentCommand;
  readonly label: string;
}

export type DocumentCommandResult =
  DocumentCommandApplied | DocumentCommandFailure | DocumentCommandUnchanged;

const failure = (
  document: ProjectDocument,
  code: DocumentCommandFailureCode,
  message: string,
  issues: readonly ValidationIssue[] = [],
  omittedIssueCount = 0,
): DocumentCommandFailure => ({
  ok: false,
  document,
  error: { code, message, issues, omittedIssueCount },
});

export const dispatchDocumentCommand = (
  document: ProjectDocument,
  input: unknown,
): DocumentCommandResult => {
  const commandResult = DocumentCommandSchema.safeParse(input);
  if (!commandResult.success) {
    const summary = summarizeValidationIssues(
      commandResult.error.issues,
      MAX_COMMAND_VALIDATION_ISSUES,
    );
    return failure(
      document,
      'invalid-command',
      'The document command is invalid.',
      summary.issues,
      summary.omittedIssueCount,
    );
  }

  const command = commandResult.data;
  const application = applyBoardCommand(document, command);
  if (!application.ok) {
    return failure(document, application.code, application.message);
  }
  if (!application.changed) {
    return {
      ok: true,
      changed: false,
      command,
      document,
      label: application.label,
    };
  }

  const candidateResult = parseProjectDocument(application.candidate);
  if (!candidateResult.ok) {
    return failure(
      document,
      'document-invalid',
      'The command would violate project document invariants.',
      candidateResult.issues,
      candidateResult.omittedIssueCount,
    );
  }

  const inverseResult = DocumentCommandSchema.safeParse(application.inverse);
  if (!inverseResult.success) {
    const summary = summarizeValidationIssues(
      inverseResult.error.issues,
      MAX_COMMAND_VALIDATION_ISSUES,
    );
    return failure(
      document,
      'document-invalid',
      'The command produced an invalid inverse.',
      summary.issues,
      summary.omittedIssueCount,
    );
  }

  return {
    ok: true,
    changed: true,
    command,
    document: application.candidate,
    inverse: inverseResult.data,
    label: application.label,
  };
};
