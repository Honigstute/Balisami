import type { z } from 'zod';

import { addProjectDocumentInvariantIssues } from './invariants';
import { ProjectDocumentShapeSchema } from './schema';

export const MAX_DOCUMENT_VALIDATION_ISSUES = 50;

export const ProjectDocumentSchema = ProjectDocumentShapeSchema.superRefine(
  addProjectDocumentInvariantIssues,
);

export type ProjectDocument = z.infer<typeof ProjectDocumentSchema>;

export interface DocumentValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly (number | string)[];
}

export type ProjectDocumentParseResult =
  | { readonly ok: true; readonly value: ProjectDocument }
  | {
      readonly ok: false;
      readonly issues: readonly DocumentValidationIssue[];
      readonly omittedIssueCount: number;
    };

const normalizeIssuePath = (path: readonly PropertyKey[]): readonly (number | string)[] =>
  path.map((segment) =>
    typeof segment === 'symbol' ? (segment.description ?? segment.toString()) : segment,
  );

export const parseProjectDocument = (input: unknown): ProjectDocumentParseResult => {
  const result = ProjectDocumentSchema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  const issues = result.error.issues.slice(0, MAX_DOCUMENT_VALIDATION_ISSUES).map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: normalizeIssuePath(issue.path),
  }));

  return {
    ok: false,
    issues,
    omittedIssueCount: result.error.issues.length - issues.length,
  };
};
