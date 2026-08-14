export type UserOperationProblemCode =
  | 'close-failed'
  | 'invalid-dialog-response'
  | 'open-failed'
  | 'operation-in-progress'
  | 'recent-project-not-found'
  | 'save-failed'
  | 'unexpected-native-failure';

export interface UserOperationProblem {
  /** Stable deduplication key; raw native error text never crosses this contract. */
  readonly code: UserOperationProblemCode;
  readonly title: string;
  readonly message: string;
}

export type UserOperationWarningCode =
  'recent-files-update-failed' | 'recovery-cleanup-failed' | 'save-cleanup-failed';

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
