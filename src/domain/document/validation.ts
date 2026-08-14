import type { z } from 'zod';

import { summarizeValidationIssues, type ValidationIssue } from '../validation/issues';
import { addProjectDocumentInvariantIssues } from './invariants';
import { ProjectDocumentShapeSchema } from './schema';

export const MAX_DOCUMENT_VALIDATION_ISSUES = 50;

export const ProjectDocumentSchema = ProjectDocumentShapeSchema.superRefine(
  addProjectDocumentInvariantIssues,
);

export type ProjectDocument = z.infer<typeof ProjectDocumentSchema>;

export type DocumentValidationIssue = ValidationIssue;

export type ProjectDocumentParseResult =
  | { readonly ok: true; readonly value: ProjectDocument }
  | {
      readonly ok: false;
      readonly issues: readonly DocumentValidationIssue[];
      readonly omittedIssueCount: number;
    };

export const parseProjectDocument = (input: unknown): ProjectDocumentParseResult => {
  const result = ProjectDocumentSchema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  const summary = summarizeValidationIssues(result.error.issues, MAX_DOCUMENT_VALIDATION_ISSUES);

  return {
    ok: false,
    ...summary,
  };
};
