import type { ZodIssue } from 'zod';

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly (number | string)[];
}

export interface ValidationIssueSummary {
  readonly issues: readonly ValidationIssue[];
  readonly omittedIssueCount: number;
}

const normalizeIssuePath = (path: readonly PropertyKey[]): readonly (number | string)[] =>
  path.map((segment) =>
    typeof segment === 'symbol' ? (segment.description ?? segment.toString()) : segment,
  );

export const summarizeValidationIssues = (
  source: readonly ZodIssue[],
  limit: number,
): ValidationIssueSummary => {
  const issues = source.slice(0, limit).map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: normalizeIssuePath(issue.path),
  }));

  return {
    issues,
    omittedIssueCount: source.length - issues.length,
  };
};
