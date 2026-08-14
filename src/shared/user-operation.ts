export const USER_OPERATION_PROBLEM_CODES = Object.freeze([
  'close-failed',
  'invalid-dialog-response',
  'open-failed',
  'operation-in-progress',
  'recent-project-not-found',
  'recovery-failed',
  'save-failed',
  'unexpected-native-failure',
] as const);

export type UserOperationProblemCode = (typeof USER_OPERATION_PROBLEM_CODES)[number];

export interface UserOperationProblem {
  /** Stable deduplication key; raw native error text never crosses this contract. */
  readonly code: UserOperationProblemCode;
  readonly title: string;
  readonly message: string;
}

export const USER_OPERATION_WARNING_CODES = Object.freeze([
  'recent-files-update-failed',
  'recovery-cleanup-failed',
  'save-cleanup-failed',
] as const);

export type UserOperationWarningCode = (typeof USER_OPERATION_WARNING_CODES)[number];

export interface UserOperationWarning {
  readonly code: UserOperationWarningCode;
  readonly message: string;
}

export type UserOperationResult<Value> =
  | {
      readonly status: 'completed';
      readonly value: Value;
      readonly warnings: readonly UserOperationWarning[];
    }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly problem: UserOperationProblem };

export interface RecentProjectSummary {
  readonly displayName: string;
  readonly id: string;
  readonly lastOpenedAtEpochMs: number;
}
